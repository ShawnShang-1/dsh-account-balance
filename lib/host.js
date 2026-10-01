/**
 * Account overview, host half implementation.
 *
 * The browser half cannot read this itself: the Platform account grant is
 * Host-only (`deepseekAccount.getPlatformSession()` returns the origin, the
 * token and the deployment headers, and is deliberately not Remote-exposed).
 * So the Host reads the Platform summary once per request here and answers the
 * page over one exact prefix route on the composed webserver.
 *
 * The route admits through `ctx.connection.admit`, so it inherits the browser
 * trust fence and the persistent browser session every `/api`-family route
 * uses, and then answers plain JSON. The browser half is the only client.
 *
 * ## Why the raw Platform summary
 *
 * The shipped `deepseekAccount.getBalance()` parses
 * `GET /api/v0/users/get_user_summary` through a `z.object`, which strips every
 * field it does not name — leaving only `normal_wallets` and `bonus_wallets`.
 * The same response also carries the account's cumulative spend:
 *
 *     { "code": 0, "data": { "biz_code": 0, "biz_data": {
 *         "normal_wallets": [ ... ], "bonus_wallets": [ ... ],
 *         "total_costs": [ { "currency": "CNY", "amount": "19.39..." } ] } } }
 *
 * `total_costs` is what this plugin adds, so it reads the summary itself
 * instead of the narrowed service method. The request is byte-for-byte the one
 * `dsh-deepseek-account-platform` issues: same origin, same deployment headers,
 * same `x-dsh-auth-token` grant header, `GET`, no body.
 *
 * Nothing here writes Platform state, and the token never leaves the Host.
 *
 * @module dsh-account-balance/lib/host
 */

/** Route prefix; must match the browser half. */
const CHANNEL = '/dsh-account-balance';

/** The Platform summary endpoint the official account plugin already uses. */
const SUMMARY_PATH = '/api/v0/users/get_user_summary';

/** Accepted request body size, in bytes. The browser half sends `{ client }`. */
const MAX_BODY_BYTES = 65536;

/** How long one completed read is served before the next one hits the Platform. */
const DEFAULT_TTL_MS = 15000;

/** Platform request deadline. */
const DEFAULT_TIMEOUT_MS = 15000;

/** Fallback build version when the page sends no client identity. */
const CLIENT_VERSION = '0.2.0-rc.2';

/**
 * Read one config number with a fallback.
 * @param {unknown} value - configured value.
 * @param {number} fallback - value used when the config is absent or unusable.
 * @param {number} min - smallest accepted value.
 * @returns {number} the effective value.
 */
function numberConfig(value, fallback, min) {
  return typeof value === 'number' && Number.isFinite(value) && value >= min ? Math.trunc(value) : fallback;
}

/**
 * Write one JSON response.
 * @param {object} res - the node response.
 * @param {number} status - HTTP status.
 * @param {unknown} payload - JSON-serializable body.
 * @returns {void}
 */
function send(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(body),
  });
  res.end(body);
}

/**
 * Drain and parse a request body.
 * @param {object} req - the node request.
 * @returns {Promise<object>} the parsed body, or `{}` when empty.
 */
async function readJson(req) {
  const chunks = [];
  let received = 0;
  for await (const chunk of req) {
    received += chunk.length;
    if (received > MAX_BODY_BYTES) throw new Error('request body is too large');
    chunks.push(chunk);
  }
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

/**
 * Normalize the client identity the page sent for one Platform call.
 * @param {unknown} value - the request body's `client` field.
 * @returns {{ version: string, locale: string, timezoneOffsetSeconds: number }} the metadata.
 */
function clientMetadata(value) {
  const source = value !== null && typeof value === 'object' ? value : {};
  return {
    version: typeof source.version === 'string' && source.version !== '' ? source.version : CLIENT_VERSION,
    locale: typeof source.locale === 'string' && source.locale !== '' ? source.locale : 'en',
    timezoneOffsetSeconds:
      typeof source.timezoneOffsetSeconds === 'number' && Number.isFinite(source.timezoneOffsetSeconds)
        ? Math.trunc(source.timezoneOffsetSeconds)
        : 0,
  };
}

/**
 * Project one Platform wallet or cost array into `{ currency, amount }` rows.
 * @param {unknown} rows - the raw Platform array.
 * @param {string} key - the amount field's name (`balance` or `amount`).
 * @returns {Array<{ currency: string, amount: string }>} the sanitized rows.
 */
function amounts(rows, key) {
  if (!Array.isArray(rows)) return [];
  const out = [];
  for (const row of rows) {
    if (row === null || typeof row !== 'object') continue;
    const { currency } = row;
    const amount = row[key];
    if (typeof currency !== 'string' || currency === '') continue;
    if (typeof amount !== 'string' || amount === '') continue;
    out.push({ currency, amount });
  }
  return out;
}

/**
 * Read the Platform summary with the stored grant.
 * @param {object} ctx - host Cordis context.
 * @param {object} client - the client identity to report.
 * @param {number} timeoutMs - Platform request deadline.
 * @returns {Promise<object>} the overview the browser half renders.
 */
async function readSummary(ctx, client, timeoutMs) {
  const signedOut = { signedIn: false, profile: null, wallets: [], costs: [] };
  const session = await ctx.deepseekAccount.getPlatformSession();
  if (session === null) return signedOut;

  const response = await fetch(`${session.origin}${SUMMARY_PATH}`, {
    method: 'GET',
    headers: { ...(session.requestHeaders ?? {}), 'x-dsh-auth-token': session.token },
    signal: AbortSignal.timeout(timeoutMs),
  });
  // 401 is the grant being gone, not a failure to report: the account state the
  // page renders is "signed out" and the launcher falls back to its More row.
  if (response.status === 401) return signedOut;
  if (!response.ok) throw new Error(`the Platform answered HTTP ${response.status}`);

  const envelope = await response.json();
  if (envelope === null || typeof envelope !== 'object') throw new Error('the Platform answered no envelope');
  if (envelope.code !== 0) throw new Error(`the Platform answered code ${String(envelope.code)}`);
  const data = envelope.data;
  if (data === null || typeof data !== 'object') throw new Error('the Platform answered no data');
  if (data.biz_code !== 0) throw new Error(`the Platform answered business code ${String(data.biz_code)}`);
  const summary = data.biz_data !== null && typeof data.biz_data === 'object' ? data.biz_data : {};

  return {
    signedIn: true,
    profile: await readProfile(ctx, client),
    wallets: amounts(summary.normal_wallets, 'balance'),
    costs: amounts(summary.total_costs, 'amount'),
  };
}

/**
 * Read the display profile. It is cosmetic — the trigger falls back to the
 * account mark and the generic signed-in label — so a failure is null rather
 * than an error for the whole overview.
 * @param {object} ctx - host Cordis context.
 * @param {object} client - the client identity to report.
 * @returns {Promise<object|null>} `{ name, contact, avatarUrl }` or null.
 */
async function readProfile(ctx, client) {
  try {
    const result = await ctx.deepseekAccount.getProfile(client);
    if (result === null || result.status !== 'ready') return null;
    return {
      name: result.value.name ?? null,
      contact: result.value.contact ?? null,
      avatarUrl: result.value.avatarUrl ?? null,
    };
  } catch {
    return null;
  }
}

/**
 * Mount the overview route.
 * @param {object} ctx - host Cordis context.
 * @param {object} [config] - this plugin's Loader config.
 * @returns {void}
 */
export function apply(ctx, config) {
  const ttlMs = numberConfig(config?.ttlMs, DEFAULT_TTL_MS, 0);
  const timeoutMs = numberConfig(config?.timeoutMs, DEFAULT_TIMEOUT_MS, 1);

  /** Last completed read: `{ at, value }`. */
  let cache = null;
  /** The read in flight, so concurrent readers share one Platform request. */
  let inflight = null;

  /**
   * Answer one read, reusing a read that is still fresh.
   * @param {object} client - the client identity to report.
   * @param {boolean} force - ignore the cached read.
   * @returns {Promise<object>} the overview.
   */
  function overview(client, force) {
    if (cache !== null && !force && Date.now() - cache.at < ttlMs) return Promise.resolve(cache.value);
    if (inflight === null) {
      inflight = readSummary(ctx, client, timeoutMs)
        .then((value) => {
          cache = { at: Date.now(), value };
          return value;
        })
        .finally(() => {
          inflight = null;
        });
    }
    return inflight;
  }

  const route = {
    kind: 'prefix',
    path: CHANNEL,
    handler: async (req, res) => {
      const admission = ctx.connection.admit(req);
      if ('rejection' in admission) {
        res.writeHead(admission.rejection, { 'content-type': 'text/plain; charset=utf-8' });
        res.end(admission.rejection === 401 ? 'unauthorized' : 'forbidden');
        return;
      }
      if ((req.method ?? 'GET') !== 'POST') {
        res.writeHead(405, { 'content-type': 'text/plain; charset=utf-8', allow: 'POST' });
        res.end('method not allowed');
        return;
      }
      const pathname = new URL(req.url ?? '/', 'http://dsh.internal').pathname;
      const endpoint = pathname === CHANNEL ? '' : pathname.slice(CHANNEL.length + 1);
      try {
        const body = await readJson(req);
        const client = clientMetadata(body?.client);
        if (endpoint === 'overview') return send(res, 200, { ok: true, value: await overview(client, false) });
        if (endpoint === 'refresh') return send(res, 200, { ok: true, value: await overview(client, true) });
        return send(res, 404, { ok: false, error: `unknown endpoint ${JSON.stringify(endpoint)}` });
      } catch (error) {
        return send(res, 500, { ok: false, error: error instanceof Error ? error.message : String(error) });
      }
    },
  };

  ctx.inject(['webServer'], (webCtx) => {
    webCtx.effect(() => webCtx.webServer.register(route), 'account-balance: prefix route');
  });
}

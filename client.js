/**
 * Browser half of dsh-account-balance.
 *
 * Takes over the sidebar's account launcher (`settings.launcher`) and shows,
 * above the shipped rows, what the account currently holds:
 *
 *     余额        ¥4.57
 *     累计消费    ¥19.39
 *     ─────────────────
 *     设置 / 意见反馈 / 退出登录
 *
 * ## Why this shadows a shipped seat
 *
 * The launcher is a `single` slot with no children, so the shipped account menu
 * has no seat to add a row to. The slot registry makes the override explicit:
 * a second registration at the same priority throws, and `entriesOfSlot` keeps
 * the lowest-priority entry, so `priority: -1` takes the seat and `priority: 1`
 * hands it straight back. The trigger markup, geometry and the menu surface are
 * copied from the shipped launcher and the shared Menu primitive, renamed under
 * this plugin's prefix, and only `--dsw-*` tokens are referenced.
 *
 * The rows the shipped menu owns are reproduced here: Settings goes through the
 * launcher's own `openSettings` owner prop, Feedback opens the configured
 * questionnaire, and Sign out / Sign in go through the generated account Remote
 * namespace. The rows' bonuses — the granted-bonus notice card and the two
 * account toasts — stay with the shipped plugin, which keeps its Settings page,
 * onboarding, quota notice and Platform page host regardless of who holds the
 * launcher.
 *
 * The numbers come from this package's Host half over
 * `POST /dsh-account-balance/overview`: the Platform grant is Host-only, so the
 * page cannot read the summary itself.
 *
 * @module dsh-account-balance/client
 */

window.__ModuleLoader__.load({
	id: 'dsh-account-balance',
	factory: (require) => {
		const React = require('react');

		//#region locale
		/** Dictionary namespace owned by this plugin. */
		const NS = 'dsh-account-balance';

		/** Simplified Chinese copy. */
		const zh = {
			balance: '余额',
			spend: '累计消费',
			settings: '设置',
			feedback: '意见反馈',
			signOut: '退出登录',
			signIn: '登录',
			more: '更多',
			signedIn: '已登录',
			openMenu: '账户菜单',
			checking: '查询中…',
			failed: '账户读取失败',
			retry: '重试',
			signOutTitle: '退出登录？',
			signOutRunning: '有正在使用账户凭证的任务在运行，退出会中断它们。',
			signOutIdle: '本地数据会保留，可以随时重新登录。',
			cancel: '取消',
			signOutFailed: '退出登录失败，请重试。',
			signInTitle: '等待浏览器授权…',
			signInHint: '在浏览器中打开下面的链接并完成授权。',
			copyLink: '复制链接',
			copied: '已复制',
			copyFailed: '复制失败',
			openLink: '打开链接',
			signInFailed: '无法启动登录，请重试。',
			signInNoLink: 'Host 没有返回授权链接。'
		};

		/** English copy, checked key-for-key against the Chinese table. */
		const en = {
			balance: 'Balance',
			spend: 'Total spend',
			settings: 'Settings',
			feedback: 'Feedback',
			signOut: 'Sign out',
			signIn: 'Sign in',
			more: 'More',
			signedIn: 'Signed in',
			openMenu: 'Account menu',
			checking: 'Checking…',
			failed: 'Could not read the account',
			retry: 'Retry',
			signOutTitle: 'Sign out?',
			signOutRunning: 'Tasks using the account credential are running; signing out interrupts them.',
			signOutIdle: 'Local data is kept and you can sign in again at any time.',
			cancel: 'Cancel',
			signOutFailed: 'Sign-out failed. Try again.',
			signInTitle: 'Waiting for browser authorization…',
			signInHint: 'Open the link below in your browser and approve.',
			copyLink: 'Copy link',
			copied: 'Copied',
			copyFailed: 'Copy failed',
			openLink: 'Open link',
			signInFailed: 'Could not start sign-in. Try again.',
			signInNoLink: 'The Host returned no authorization link.'
		};
		//#endregion

		//#region styles
		/**
		 * The plugin's one stylesheet. The launcher geometry and the menu surface
		 * are the shipped `AccountMenu.module.css` and the shared `Menu.module.css`
		 * with this plugin's own class prefix; only `--dsw-*` tokens are referenced,
		 * so light, dark and future token renames degrade instead of breaking.
		 */
		const CSS = `
.dsh-ab { position: relative; flex: 1; min-width: 0; }

.dsh-ab-trigger {
  user-select: none;
  box-sizing: border-box;
  border-radius: var(--dsw-radius-md);
  width: 100%;
  height: 44px;
  color: var(--dsw-alias-label-primary);
  font: inherit;
  cursor: pointer;
  background: 0 0;
  border: 0;
  align-items: center;
  gap: 8px;
  padding: 6px;
  font-size: 14px;
  display: flex;
  -webkit-app-region: no-drag;
}
.dsh-ab-trigger[data-collapsed="true"] { box-sizing: border-box; justify-content: center; gap: 0; width: 36px; height: 36px; padding: 0; }
.dsh-ab-trigger[data-signed-out="true"]:not([data-collapsed="true"]) { height: 32px; padding: 6px 2px 6px 6px; line-height: 20px; }
.dsh-ab-trigger:hover { background: var(--dsw-alias-interactive-bg-hover); }
.dsh-ab-trigger:focus-visible { outline: 2px solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary)); outline-offset: -2px; }

.dsh-ab-avatar {
  corner-shape: round;
  background: var(--dsw-alias-bg-skeleton);
  width: 24px;
  height: 24px;
  color: var(--dsw-alias-label-tertiary);
  border-radius: 50%;
  flex: none;
  justify-content: center;
  align-items: center;
  display: flex;
  overflow: hidden;
}
.dsh-ab-avatar img { width: 100%; height: 100%; object-fit: cover; display: block; }
.dsh-ab-label { text-overflow: ellipsis; white-space: nowrap; overflow: hidden; }

.dsh-ab-card {
  position: fixed;
  z-index: 1100;
  box-sizing: border-box;
  padding: 4px;
  display: flex;
  flex-direction: column;
  border: 0;
  border-radius: var(--dsw-radius-lg);
  background: var(--dsw-menu-surface-fill);
  backdrop-filter: var(--dsw-menu-backdrop-filter);
  box-shadow: var(--dsw-elevation-prominent);
  color: var(--dsw-alias-label-primary);
  min-width: 144px;
  font-size: 13px;
  line-height: 20px;
}

.dsh-ab-stats { display: flex; flex-direction: column; gap: 2px; padding: 6px 8px; }
.dsh-ab-stat { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
.dsh-ab-stat-label { color: var(--dsw-alias-label-tertiary); font-size: 11px; line-height: 15px; }
.dsh-ab-stat-value { color: var(--dsw-alias-label-primary); font-size: 13px; line-height: 20px; font-variant-numeric: tabular-nums; }
.dsh-ab-stat-value[data-emphasis="true"] { font-size: 15px; font-weight: 500; }
.dsh-ab-stats[data-state="failed"] .dsh-ab-stat-value { color: var(--dsw-alias-label-tertiary); }

.dsh-ab-separator { height: 0.5px; margin: 3px 2px; background: var(--dsw-alias-border-l2); }

.dsh-ab-item {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  min-height: 34px;
  padding: 6px 8px;
  border: none;
  border-radius: var(--dsw-radius-md);
  background: transparent;
  cursor: pointer;
  font: inherit;
  font-size: 13px;
  line-height: 20px;
  color: var(--dsw-alias-label-primary);
  text-align: left;
}
.dsh-ab-item:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover); }
.dsh-ab-item:focus-visible { background: var(--dsw-alias-interactive-bg-hover); outline: none; }
.dsh-ab-item:disabled { opacity: 0.4; cursor: not-allowed; }
.dsh-ab-item-icon { display: inline-flex; flex: none; width: 14px; height: 14px; align-items: center; justify-content: center; color: var(--dsw-alias-menu-icon); }
.dsh-ab-item-icon svg { width: 14px; height: 14px; }
.dsh-ab-item-label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dsh-ab-shortcut { flex: none; margin-inline-start: auto; color: var(--dsw-alias-label-caption); font-size: 11px; line-height: 16px; }

.dsh-ab-panel { display: flex; flex-direction: column; gap: 8px; padding: 8px; }
.dsh-ab-panel-title { font-size: 13px; line-height: 20px; font-weight: 500; }
.dsh-ab-panel-note { font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-tertiary); }
.dsh-ab-panel-note[data-state="error"] { color: var(--dsw-alias-state-error-primary); }
.dsh-ab-link {
  margin: 0;
  font-family: var(--ds-font-family-code, monospace);
  font-size: 11px;
  line-height: 16px;
  color: var(--dsw-alias-label-secondary);
  word-break: break-all;
  max-height: 48px;
  overflow: hidden;
}
.dsh-ab-actions { display: flex; justify-content: flex-end; gap: 8px; }
.dsh-ab-button {
  border: 0.5px solid var(--dsw-alias-border-l2);
  border-radius: var(--dsw-radius-md);
  background: transparent;
  color: var(--dsw-alias-label-primary);
  font: inherit;
  font-size: 12px;
  line-height: 18px;
  padding: 4px 10px;
  cursor: pointer;
}
.dsh-ab-button:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover); }
.dsh-ab-button:focus-visible { outline: 2px solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary)); outline-offset: 2px; }
.dsh-ab-button:disabled { opacity: 0.4; cursor: not-allowed; }
.dsh-ab-button[data-primary="true"] {
  background: var(--dsw-alias-button-primary-fill);
  border-color: transparent;
  color: var(--dsw-alias-label-primary-foreground);
  font-weight: 500;
}
.dsh-ab-button[data-danger="true"] { color: var(--dsw-alias-state-error-primary); }
`;
		//#endregion

		//#region format
		/**
		 * Harness Client build version reported as `x-client-version` on the
		 * Platform call. The shipped bundles inline it at build time; a
		 * hand-written bundle carries the version it was authored against. It is a
		 * request-header string only.
		 */
		const CLIENT_VERSION = '0.2.0-rc.2';

		/** Currency marks for the wallets and costs the Platform reports. */
		const SYMBOLS = { CNY: '¥', USD: '$' };

		/**
		 * Group the integer digits of a plain decimal string.
		 * @param integer - digits without a sign or separator.
		 * @returns the same digits with thousands separators.
		 */
		function group(integer) {
			return integer.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
		}

		/**
		 * Round a non-negative decimal's digits half-up to cents, carrying into the
		 * integer part. Only the negative branch needs it: positive amounts truncate.
		 * @param integer - the integer digits.
		 * @param fraction - the fraction digits as written.
		 * @returns the integer digits and the two cent digits.
		 */
		function roundToCents(integer, fraction) {
			const digits = fraction.padEnd(3, '0');
			let cents = Number(digits.slice(0, 2));
			if (Number(digits[2]) >= 5) cents += 1;
			let whole = Number(integer);
			if (cents === 100) {
				cents = 0;
				whole += 1;
			}
			return [String(whole), String(cents).padStart(2, '0')];
		}

		/**
		 * Format one amount with the Platform Web display rules: two decimal places,
		 * digit grouping, truncation rather than rounding for positive amounts, a
		 * half-up round for negative ones, and a `<0.01` form for a positive amount
		 * below one cent.
		 * @param amount - the decimal amount string.
		 * @param currency - `CNY` or `USD`.
		 * @returns the display text, e.g. `¥1,234.50`.
		 */
		function formatAmount(amount, currency) {
			const symbol = SYMBOLS[currency] ?? `${currency} `;
			const text = typeof amount === 'string' ? amount.trim() : '';
			if (!/^-?\d+(\.\d+)?$/.test(text)) return text === '' ? `${symbol}0.00` : `${symbol}${text}`;
			const negative = text.startsWith('-');
			const magnitude = negative ? text.slice(1) : text;
			const [intText, fracText = ''] = magnitude.split('.');
			const integer = intText.replace(/^0+(?=\d)/, '');
			const cents = fracText.padEnd(2, '0').slice(0, 2);
			const empty = integer === '0' && (fracText === '' || /^0+$/.test(fracText));
			if (empty) return `${symbol}0.00`;
			const subCent = integer === '0' && cents === '00';
			if (negative) {
				if (subCent) return `-${symbol}0.01`;
				const [whole, rounded] = roundToCents(integer, fracText);
				return `-${symbol}${group(whole)}.${rounded}`;
			}
			if (subCent) return `<${symbol}0.01`;
			return `${symbol}${group(integer)}.${cents}`;
		}

		/**
		 * Render one Platform row list as display text.
		 * @param rows - `{ currency, amount }` rows from the Host.
		 * @returns the joined amounts, or an em dash when there are none.
		 */
		function amountsText(rows) {
			if (!Array.isArray(rows) || rows.length === 0) return '—';
			return rows.map((row) => formatAmount(row.amount, row.currency)).join(' + ');
		}
		//#endregion

		//#region host
		/** Route prefix; must match the Host half. */
		const CHANNEL = '/dsh-account-balance';

		/**
		 * Build the client identity one Platform call carries, sampled as the call
		 * is issued so it reflects the language and zone in effect then.
		 * @param ctx - the client plugin context.
		 * @returns the `AccountClientMetadata` the Host relays.
		 */
		function clientMetadata(ctx) {
			let active;
			try {
				active = ctx.locale.getSnapshot()?.active;
			} catch {
				active = undefined;
			}
			return {
				version: CLIENT_VERSION,
				locale: typeof active === 'string' && active !== '' ? active : 'en',
				timezoneOffsetSeconds: -new Date().getTimezoneOffset() * 60
			};
		}

		/**
		 * Read the account overview from this package's Host half.
		 * @param ctx - the client plugin context.
		 * @param force - bypass the Host's short cache.
		 * @returns the overview the menu renders.
		 * @throws Error when the Host refuses or fails the read.
		 */
		async function fetchOverview(ctx, force) {
			const response = await fetch(`${CHANNEL}/${force === true ? 'refresh' : 'overview'}`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ client: clientMetadata(ctx) })
			});
			if (!response.ok) throw new Error(`HTTP ${response.status}`);
			const payload = await response.json();
			if (payload === null || typeof payload !== 'object' || payload.ok !== true) {
				throw new Error(payload?.error ?? 'the Host returned no overview');
			}
			return payload.value;
		}
		//#endregion

		//#region icons
		/**
		 * One stroke glyph on the shared 16px grid.
		 * @param paths - the SVG child elements.
		 * @returns the SVG element tree.
		 */
		function glyph(paths) {
			return React.createElement('svg', {
				viewBox: '0 0 16 16',
				width: 14,
				height: 14,
				fill: 'none',
				stroke: 'currentColor',
				strokeWidth: 1.2,
				strokeLinecap: 'round',
				strokeLinejoin: 'round',
				'aria-hidden': true,
				focusable: false
			}, paths);
		}

		/** The settings gear. */
		function GearIcon() {
			return glyph([
				React.createElement('circle', { key: 'c', cx: 8, cy: 8, r: 2.1 }),
				React.createElement('path', {
					key: 'p',
					d: 'M8 1.8v1.6M8 12.6v1.6M1.8 8h1.6M12.6 8h1.6M3.6 3.6l1.15 1.15M11.25 11.25l1.15 1.15M12.4 3.6l-1.15 1.15M4.75 11.25 3.6 12.4'
				})
			]);
		}

		/** The feedback paper plane. */
		function SendIcon() {
			return glyph([
				React.createElement('path', { key: 'a', d: 'M14.2 1.8 1.9 6.6l4.6 1.9 1.9 4.6z' }),
				React.createElement('path', { key: 'b', d: 'M14.2 1.8 6.5 8.5' })
			]);
		}

		/** The sign-out arrow leaving a door. */
		function LogoutIcon() {
			return glyph([
				React.createElement('path', { key: 'a', d: 'M9.4 2.4H4.2a1.4 1.4 0 0 0-1.4 1.4v8.4a1.4 1.4 0 0 0 1.4 1.4h5.2' }),
				React.createElement('path', { key: 'b', d: 'M10.4 5.2 13.2 8l-2.8 2.8' }),
				React.createElement('path', { key: 'c', d: 'M13 8H6.4' })
			]);
		}

		/** The account mark used as the avatar fallback and the sign-in row. */
		function UserIcon() {
			return glyph([
				React.createElement('circle', { key: 'a', cx: 8, cy: 5.6, r: 2.5 }),
				React.createElement('path', { key: 'b', d: 'M3.1 13.2a5.1 5.1 0 0 1 9.8 0' })
			]);
		}

		/** The signed-out launcher mark. */
		function EllipsisIcon() {
			return glyph([
				React.createElement('circle', { key: 'a', cx: 3.4, cy: 8, r: 0.9, fill: 'currentColor', stroke: 'none' }),
				React.createElement('circle', { key: 'b', cx: 8, cy: 8, r: 0.9, fill: 'currentColor', stroke: 'none' }),
				React.createElement('circle', { key: 'c', cx: 12.6, cy: 8, r: 0.9, fill: 'currentColor', stroke: 'none' })
			]);
		}
		//#endregion

		//#region plugin
		/** Required services. `remote.account` is the generated account Remote namespace. */
		const inject = ['slots', 'locale', 'remote', 'remote.account'];

		/**
		 * The launcher's priority inside the `settings.launcher` single slot. The
		 * slot keeps its lowest-priority entry, the shipped account menu registers
		 * at 0, so a negative value takes the seat and a positive one gives it back.
		 */
		const LAUNCHER_PRIORITY = -1;

		/** The questionnaire the shipped Feedback row opens. */
		const FEEDBACK_URL = 'https://trtgsjkv6r.feishu.cn/share/base/form/shrcnlCoGElW7MQznGy9r3YYXcg';

		/**
		 * Register the account launcher.
		 * @param ctx - the browser plugin context.
		 * @returns {void}
		 */
		function apply(ctx) {
			const t = ctx.locale.bind(NS);
			ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'account-balance: dictionaries');
			ctx.effect(() => insertStyles(), 'account-balance: stylesheet');

			/**
			 * The account launcher and its menu.
			 * @param props - composed owner and locale props of `settings.launcher`.
			 * @returns the launcher element tree.
			 */
			function AccountLauncher(props) {
				const wide = props.wide !== false;
				const tr = typeof props.t === 'function' ? props.t : t;
				const settingsShortcut = props.settingsShortcut;
				const [overview, setOverview] = React.useState({ status: 'loading', data: null });
				const [avatarFailed, setAvatarFailed] = React.useState(false);
				const [open, setOpen] = React.useState(false);
				const [view, setView] = React.useState('menu');
				const [anchor, setAnchor] = React.useState(null);
				const [busy, setBusy] = React.useState(false);
				const [impact, setImpact] = React.useState(null);
				const [authorizeUrl, setAuthorizeUrl] = React.useState(null);
				const [note, setNote] = React.useState(null);
				const [copied, setCopied] = React.useState(false);
				const host = React.useRef(null);
				const card = React.useRef(null);
				const trigger = React.useRef(null);
				const alive = React.useRef(true);
				const reading = React.useRef(false);

				/**
				 * Read the overview once.
				 * @param force - bypass the Host's short cache.
				 * @returns the overview, or null when the read failed or was skipped.
				 */
				const load = React.useCallback(async (force) => {
					if (reading.current) return null;
					reading.current = true;
					try {
						const value = await fetchOverview(ctx, force === true);
						if (alive.current) setOverview({ status: 'ready', data: value });
						return value;
					} catch {
						// Keep the last good figures: a failed refresh must not flip the
						// launcher back to its signed-out row or blank the amounts.
						if (alive.current) setOverview((current) => ({ status: 'failed', data: current.data }));
						return null;
					} finally {
						reading.current = false;
					}
				}, []);

				// One read on mount, then one whenever the window comes back to the
				// foreground — the moment a person looks at the figure again.
				React.useEffect(() => {
					alive.current = true;
					load(false);
					const refresh = () => {
						if (document.visibilityState !== 'hidden') load(false);
					};
					document.addEventListener('visibilitychange', refresh);
					window.addEventListener('focus', refresh);
					return () => {
						alive.current = false;
						document.removeEventListener('visibilitychange', refresh);
						window.removeEventListener('focus', refresh);
					};
				}, [load]);

				// Settings opening is an entry: the menu belongs behind it.
				React.useEffect(() => {
					if (props.settingsOpen === true) {
						setOpen(false);
						setView('menu');
					}
				}, [props.settingsOpen]);

				// While the card is showing: keep it against the trigger, move focus into
				// it, and close on an outside press or Escape.
				React.useEffect(() => {
					if (!open) return undefined;
					const measure = () => {
						const node = host.current;
						if (node === null) return;
						const box = node.getBoundingClientRect();
						setAnchor({ left: box.left, top: box.top, width: box.width });
					};
					measure();
					const focusFirst = () => {
						const node = card.current;
						const first = node === null ? null : node.querySelector('button:not(:disabled)');
						if (first instanceof HTMLElement) first.focus();
					};
					const frame = requestAnimationFrame(focusFirst);
					const onPointerDown = (event) => {
						const node = host.current;
						if (node !== null && event.target instanceof Node && node.contains(event.target)) return;
						setOpen(false);
					};
					const onKeyDown = (event) => {
						if (event.key !== 'Escape') return;
						setOpen(false);
						setView('menu');
						const node = trigger.current;
						if (node instanceof HTMLElement) node.focus();
					};
					document.addEventListener('pointerdown', onPointerDown, true);
					document.addEventListener('keydown', onKeyDown);
					window.addEventListener('resize', measure);
					return () => {
						cancelAnimationFrame(frame);
						document.removeEventListener('pointerdown', onPointerDown, true);
						document.removeEventListener('keydown', onKeyDown);
						window.removeEventListener('resize', measure);
					};
				}, [open]);

				// While the browser authorization is pending, poll until the grant lands.
				React.useEffect(() => {
					if (view !== 'signin') return undefined;
					let stopped = false;
					const timer = setInterval(() => {
						if (stopped) return;
						load(true).then((value) => {
							if (stopped || value === null || value.signedIn !== true) return;
							setView('menu');
							setAuthorizeUrl(null);
						});
					}, 2500);
					return () => {
						stopped = true;
						clearInterval(timer);
					};
				}, [view, load]);

				const signedIn = overview.data?.signedIn === true;
				const profile = overview.data?.profile ?? null;
				const avatarUrl = typeof profile?.avatarUrl === 'string' && profile.avatarUrl !== '' ? profile.avatarUrl : null;
				const label = overview.status === 'loading' && overview.data === null
					? null
					: signedIn
						? profile?.name ?? profile?.contact ?? tr('signedIn')
						: tr('more');

				const toggle = () => {
					if (open) {
						setOpen(false);
						return;
					}
					setView('menu');
					setNote(null);
					setCopied(false);
					setOpen(true);
					load(false);
				};

				/**
				 * Open the configured feedback questionnaire in the system browser.
				 * @returns {void}
				 */
				const openFeedback = () => {
					const config = globalThis.__DSH_CONTACT_CONFIG__;
					const url = config !== null && typeof config === 'object' && typeof config.contactFormUrl === 'string' && config.contactFormUrl !== ''
						? config.contactFormUrl
						: FEEDBACK_URL;
					window.open(url, '_blank', 'noopener,noreferrer');
				};

				/**
				 * Ask for the sign-out impact, then show the confirmation step.
				 * @returns {Promise<void>} resolved once the step is showing.
				 */
				const requestSignOut = async () => {
					setView('signout');
					setImpact(null);
					try {
						const result = await ctx.remote.account.hasRunningAccountTasks();
						if (alive.current) setImpact(result !== null && result.ok === true ? (result.value === true ? 'running' : 'idle') : 'unknown');
					} catch {
						if (alive.current) setImpact('unknown');
					}
				};

				/**
				 * Sign out and re-read the account.
				 * @returns {Promise<void>} resolved once the Host answered.
				 */
				const signOut = async () => {
					setBusy(true);
					setNote(null);
					try {
						const result = await ctx.remote.account.signOut(clientMetadata(ctx));
						if (result === null || result.ok !== true) throw new Error('refused');
						await load(true);
						if (alive.current) {
							setView('menu');
							setOpen(false);
						}
					} catch {
						if (alive.current) setNote(tr('signOutFailed'));
					} finally {
						if (alive.current) setBusy(false);
					}
				};

				/**
				 * Start a browser sign-in and show its authorization link.
				 * @returns {Promise<void>} resolved once the Host answered.
				 */
				const beginSignIn = async () => {
					setBusy(true);
					setNote(null);
					try {
						const transport = globalThis.__DSH_TRANSPORT__;
						const callbackOrigin = transport !== null && typeof transport === 'object' && typeof transport.streamBaseUrl === 'string'
							? new URL(transport.streamBaseUrl).origin
							: window.location.origin;
						const result = await ctx.remote.account.startSignIn(clientMetadata(ctx), callbackOrigin, 'desktop');
						if (result === null || result.ok !== true) throw new Error('refused');
						const url = result.value?.attempt?.authorizeUrl;
						if (alive.current) {
							setAuthorizeUrl(typeof url === 'string' && url !== '' ? url : null);
							setView('signin');
							if (typeof url !== 'string' || url === '') setNote(tr('signInNoLink'));
						}
					} catch {
						if (alive.current) setNote(tr('signInFailed'));
					} finally {
						if (alive.current) setBusy(false);
					}
				};

				/**
				 * Copy the pending authorization link.
				 * @returns {Promise<void>} resolved once the clipboard answered.
				 */
				const copyLink = async () => {
					try {
						await navigator.clipboard.writeText(authorizeUrl ?? '');
						if (alive.current) {
							setCopied(true);
							window.setTimeout(() => {
								if (alive.current) setCopied(false);
							}, 2000);
						}
					} catch {
						if (alive.current) setNote(tr('copyFailed'));
					}
				};

				/**
				 * Open the pending authorization link in the system browser.
				 * @returns {void}
				 */
				const openLink = () => {
					if (authorizeUrl === null) return;
					window.open(authorizeUrl, '_blank', 'noopener,noreferrer');
				};

				/**
				 * Move focus between the card's buttons with the arrow keys.
				 * @param event - the card's key event.
				 * @returns {void}
				 */
				const onCardKeyDown = (event) => {
					if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
					const node = card.current;
					if (node === null) return;
					const buttons = [...node.querySelectorAll('button:not(:disabled)')].filter((entry) => entry instanceof HTMLElement);
					if (buttons.length === 0) return;
					const index = buttons.indexOf(document.activeElement);
					const step = event.key === 'ArrowDown' ? 1 : -1;
					buttons[index === -1 ? 0 : (index + step + buttons.length) % buttons.length].focus();
					event.preventDefault();
				};

				const triggerChildren = [signedIn
					? React.createElement('span', { key: 'avatar', className: 'dsh-ab-avatar' }, avatarUrl === null || avatarFailed
						? React.createElement(UserIcon)
						: React.createElement('img', {
							src: avatarUrl,
							alt: '',
							onError: () => setAvatarFailed(true)
						}))
					: React.createElement(EllipsisIcon, { key: 'mark' })];
				if (wide && label !== null) {
					triggerChildren.push(React.createElement('span', {
						key: 'label',
						className: 'dsh-ab-label'
					}, label));
				}

				const launcher = React.createElement('button', {
					ref: trigger,
					type: 'button',
					className: 'dsh-ab-trigger',
					'data-collapsed': wide ? 'false' : 'true',
					'data-signed-out': signedIn ? 'false' : 'true',
					'aria-label': tr('openMenu'),
					'aria-haspopup': 'menu',
					'aria-expanded': open,
					onClick: toggle
				}, triggerChildren);

				/**
				 * One `label → value` stat row.
				 * @param key - the React key.
				 * @param name - the row's label.
				 * @param value - the rendered amount.
				 * @param emphasis - whether the value is the menu's headline figure.
				 * @returns the row element tree.
				 */
				const stat = (key, name, value, emphasis) => React.createElement('div', {
					key,
					className: 'dsh-ab-stat'
				}, [
					React.createElement('span', { key: 'name', className: 'dsh-ab-stat-label' }, name),
					React.createElement('span', {
						key: 'value',
						className: 'dsh-ab-stat-value',
						'data-emphasis': emphasis ? 'true' : 'false'
					}, value)
				]);

				/**
				 * One menu row.
				 * @param key - the React key.
				 * @param name - the row's text.
				 * @param Icon - the row's glyph.
				 * @param onSelect - the row's action.
				 * @param trailing - an optional trailing element.
				 * @returns the row element tree.
				 */
				const item = (key, name, Icon, onSelect, trailing) => React.createElement('button', {
					key,
					type: 'button',
					role: 'menuitem',
					className: 'dsh-ab-item',
					onClick: onSelect
				}, [
					React.createElement('span', { key: 'icon', className: 'dsh-ab-item-icon' }, React.createElement(Icon)),
					React.createElement('span', { key: 'label', className: 'dsh-ab-item-label' }, name),
					trailing ?? null
				]);

				/**
				 * One panel button.
				 * @param key - the React key.
				 * @param name - the button's text.
				 * @param onSelect - the button's action.
				 * @param options - `primary`, `danger` or `disabled`.
				 * @returns the button element tree.
				 */
				const button = (key, name, onSelect, options = {}) => React.createElement('button', {
					key,
					type: 'button',
					className: 'dsh-ab-button',
					'data-primary': options.primary === true ? 'true' : 'false',
					'data-danger': options.danger === true ? 'true' : 'false',
					disabled: options.disabled === true,
					onClick: onSelect
				}, name);

				const body = [];
				if (view === 'signout') {
					body.push(React.createElement('div', { key: 'panel', className: 'dsh-ab-panel' }, [
						React.createElement('div', { key: 'title', className: 'dsh-ab-panel-title' }, tr('signOutTitle')),
						React.createElement('div', { key: 'note', className: 'dsh-ab-panel-note' },
							impact === 'running' ? tr('signOutRunning') : impact === null ? tr('checking') : tr('signOutIdle')),
						note === null ? null : React.createElement('div', {
							key: 'error',
							className: 'dsh-ab-panel-note',
							'data-state': 'error'
						}, note),
						React.createElement('div', { key: 'actions', className: 'dsh-ab-actions' }, [
							button('cancel', tr('cancel'), () => {
								setView('menu');
								setNote(null);
							}, { disabled: busy }),
							button('confirm', tr('signOut'), signOut, { primary: true, danger: true, disabled: busy })
						])
					]));
				} else if (view === 'signin') {
					body.push(React.createElement('div', { key: 'panel', className: 'dsh-ab-panel' }, [
						React.createElement('div', { key: 'title', className: 'dsh-ab-panel-title' }, tr('signInTitle')),
						React.createElement('div', { key: 'hint', className: 'dsh-ab-panel-note' }, tr('signInHint')),
						authorizeUrl === null ? null : React.createElement('p', { key: 'link', className: 'dsh-ab-link' }, authorizeUrl),
						note === null ? null : React.createElement('div', {
							key: 'error',
							className: 'dsh-ab-panel-note',
							'data-state': 'error'
						}, note),
						React.createElement('div', { key: 'actions', className: 'dsh-ab-actions' }, [
							button('cancel', tr('cancel'), () => {
								setView('menu');
								setNote(null);
								setAuthorizeUrl(null);
							}),
							button('copy', copied ? tr('copied') : tr('copyLink'), copyLink, { disabled: authorizeUrl === null }),
							button('open', tr('openLink'), openLink, { disabled: authorizeUrl === null })
						])
					]));
				} else {
					const wallets = overview.data?.wallets ?? [];
					const costs = overview.data?.costs ?? [];
					const loading = overview.status === 'loading';
					const failed = overview.status === 'failed';
					body.push(React.createElement('div', {
						key: 'stats',
						className: 'dsh-ab-stats',
						'data-state': failed ? 'failed' : 'ready'
					}, [
						stat('balance', tr('balance'), loading ? '…' : amountsText(wallets), true),
						stat('spend', tr('spend'), loading ? '…' : amountsText(costs), false)
					]));
					body.push(React.createElement('div', { key: 'separator', className: 'dsh-ab-separator' }));
					body.push(item('settings', tr('settings'), GearIcon, () => {
						setOpen(false);
						props.openSettings?.();
					}, settingsShortcut === undefined
						? null
						: React.createElement('span', { key: 'shortcut', className: 'dsh-ab-shortcut' },
							settingsShortcut.aria ?? settingsShortcut.keys?.join('') ?? '')));
					body.push(item('feedback', tr('feedback'), SendIcon, () => {
						setOpen(false);
						openFeedback();
					}));
					if (signedIn) {
						body.push(item('signout', tr('signOut'), LogoutIcon, requestSignOut));
					} else {
						body.push(item('signin', tr('signIn'), UserIcon, beginSignIn));
					}
					if (failed || note !== null) {
						body.push(React.createElement('div', { key: 'separator-2', className: 'dsh-ab-separator' }));
						body.push(React.createElement('div', {
							key: 'note',
							className: 'dsh-ab-panel-note',
							style: { padding: '2px 8px 4px' }
						}, note ?? tr('failed')));
						body.push(item('retry', tr('retry'), GearIcon, () => {
							setNote(null);
							load(true);
						}));
					}
				}

				const cardElement = open
					? React.createElement('div', {
						ref: card,
						className: 'dsh-ab-card',
						role: 'menu',
						'aria-label': tr('openMenu'),
						style: cardStyle(anchor, wide),
						onKeyDown: onCardKeyDown
					}, body)
					: null;

				return React.createElement('div', { ref: host, className: 'dsh-ab' }, launcher, cardElement);
			}

			/**
			 * Insert this plugin's stylesheet once.
			 * @returns the disposer that removes it again.
			 */
			function insertStyles() {
				const marker = `${NS}/styles`;
				if (document.querySelector(`style[data-plugin-css="${marker}"]`) !== null) return () => {};
				const tag = document.createElement('style');
				tag.dataset.plugin = NS;
				tag.dataset.pluginCss = marker;
				tag.textContent = CSS;
				document.head.appendChild(tag);
				return () => {
					tag.remove();
				};
			}

			ctx.slots.inject('settings.launcher', () => ctx.slots.register({
				name: 'settings.launcher',
				priority: LAUNCHER_PRIORITY,
				locale: NS
			}, AccountLauncher), 'account-balance: account launcher');
		}

		/**
		 * Place the card against the launcher without reading any other plugin's
		 * DOM: this plugin's own wrapper is measured and the card is fixed, so it
		 * escapes the sidebar column's `overflow: hidden` in the wide column and in
		 * the 56px rail alike. It opens upward, as the shipped menu does.
		 * @param anchor - the wrapper's viewport box, or null before the first measure.
		 * @param wide - whether the sidebar renders wide content.
		 * @returns the card's inline style.
		 */
		function cardStyle(anchor, wide) {
			if (anchor === null) return { position: 'fixed', left: 8, bottom: 96, width: 240 };
			const width = Math.max(Math.round(anchor.width), wide ? 240 : 232);
			const highest = Math.max(8, window.innerWidth - width - 8);
			const left = Math.max(8, Math.min(Math.round(anchor.left), highest));
			const bottom = Math.max(8, Math.round(window.innerHeight - anchor.top + 4));
			return { position: 'fixed', left, bottom, width };
		}
		//#endregion

		return { inject, apply };
	}
});

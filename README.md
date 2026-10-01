# dsh-account-balance

[English](README.md) | [中文](README.zh.md)

A [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) plugin that puts your DeepSeek account's **recharge balance** and **cumulative Platform spend** into the sidebar account menu — the one that opens when you click the avatar at the bottom left, so you can check your credit without opening the billing site.

![Account balance icon](icon.svg)

```text
click the avatar at the bottom left
┌──────────────────────────┐
│ 余额              ¥4.57  │  ← added by this plugin
│ 累计消费         ¥19.69  │  ← added by this plugin
│ ──────────────────────── │
│  ⚙ 设置              ⌘,  │  ← shipped row, preserved
│  ✈ 意见反馈              │  ← shipped row, preserved
│  → 退出登录              │  ← shipped row, preserved
└──────────────────────────┘
```

The labels follow the UI language; the screenshot text above is the Chinese UI.

## What it does

| State | Launcher and menu |
|---|---|
| Signed in | `余额` (recharge wallets) and `累计消费` (cumulative Platform spend) above the shipped rows |
| Signed out | The shipped "More" row, and the third row becomes `登录` (sign in) |
| Read failed | Keeps the last known amounts and appends an error line with `重试` / Retry |
| Pending sign-in | The menu shows the authorization link with copy / open actions and waits for the grant to land |

The figures are re-read **whenever the menu opens** and whenever the window comes back to the foreground (`visibilitychange` / `focus`). Nothing polls.

Amounts use the same display rules as the Platform Web UI: two decimals, digit grouping, truncation for positive values, half-up rounding for negative ones, and a `<¥0.01` form below one cent. Styling references only `--dsw-*` theme tokens, so light and dark follow the app.

## Where the numbers come from

The shipped `deepseekAccount.getBalance()` parses the Platform response through a `z.object`, which **strips every field it does not name** — leaving only `normal_wallets` and `bonus_wallets`. The same response already carries the cumulative spend:

```json
{ "code": 0, "data": { "biz_code": 0, "biz_data": {
    "normal_wallets": [ { "currency": "CNY", "balance": "4.57…" } ],
    "bonus_wallets":  [ { "currency": "CNY", "balance": "2.03…" } ],
    "total_costs":    [ { "currency": "CNY", "amount": "19.68…" } ] } } }
```

`total_costs` is what this plugin adds. Because the account grant is Host-only — `deepseekAccount.getPlatformSession()` returns the origin, the token and the deployment headers and is deliberately not Remote-exposed — the browser half cannot read the summary itself. So the Host half issues that one request, byte-for-byte the same one `dsh-deepseek-account-platform` issues: same origin, same deployment headers, same `x-dsh-auth-token`, `GET`, no body.

The Host half only reads: it never writes Platform state, and the token never leaves the Host process.

## Requirements

- DeepSeek Harness **Desktop** with a signed-in DeepSeek account (`ui-settings-account` enabled).
- Verified against DSH `0.2.0-rc.2` on macOS.

## Install

### 1. Get the package

```bash
git clone https://github.com/ShawnShang-1/dsh-account-balance.git ~/code/dsh-account-balance
```

### 2. Install it as a profile bundle

Ask the Harness agent to run:

```text
plugin_manager install_bundle  target: /Users/you/code/dsh-account-balance
```

or, with the CLI on the `PATH`:

```bash
dsh plugin --profile "$DSH_PROFILE" add ~/code/dsh-account-balance
```

Either way the package declares both halves — `dsh.bundle.patch` for the Host row and `dsh.client` for the browser bundle — so one install adds both. The install applies live through HMR; if the sidebar does not change, reload the page (`Cmd`/`Ctrl` + `R`).

### 3. Verify

Open the account menu: the two amount rows should sit above `设置 / 意见反馈 / 退出登录`.

To check the Host half without the UI, the route answers `401` when it is mounted and behind the browser trust fence (an unmounted prefix falls through to `405`):

```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST -H 'content-type: application/json' -d '{}' \
  http://127.0.0.1:19387/dsh-account-balance/overview
# 401
```

## Configuration

Edit the plugin's row in your profile `cordis.patch.yml`, or pass the values at install time:

| Field | Default | Meaning |
|---|---|---|
| `ttlMs` | `15000` | How long one read is served from the Host cache before the next read goes to the Platform. `0` reads every time. |
| `timeoutMs` | `15000` | Platform request deadline. |

```yaml
- id: account-balance
  name: './lib/entry.js'
  config:
    ttlMs: 15000
    timeoutMs: 15000
```

## Uninstall, or hand the launcher back

Remove the whole plugin:

```text
plugin_manager remove_bundle dsh-account-balance
```

Or keep the plugin but give the account menu back to the shipped plugin: set `LAUNCHER_PRIORITY` in [`client.js`](client.js) from `-1` to `1` and reload the page.

## How it works

| Half | File | Role |
|---|---|---|
| Host entry | [`lib/entry.js`](lib/entry.js) | The Loader row's stable module. Re-imports `lib/host.js` by file revision, so Host edits take effect on the next activation without restarting the app. The row's specifier points at this file (`./lib/entry.js`) rather than the package name, which is what makes that path possible. |
| Host | [`lib/host.js`](lib/host.js) | Reads the Platform summary with the stored grant and answers the page over one `/dsh-account-balance` prefix route on the composed webserver. The route admits through `ctx.connection.admit`, so it inherits the browser trust fence. Cached for `ttlMs`. |
| Browser | [`client.js`](client.js) | The prebuilt Client bundle. Registers into `settings.launcher` and renders the launcher and its menu. |
| Compat | [`index.js`](index.js) | `export * from './lib/entry.js'`, so importing the package by name still works. |

### Why it takes the seat instead of adding to it

`settings.launcher` is a `single` slot with no declared children, so the shipped account menu has no row this plugin could add itself to. The slot registry makes the override explicit:

- a second registration at the same priority throws (`single slot "…" already has a registration … register at a different priority to shadow it (lowest renders)`);
- `entriesOfSlot` keeps the lowest-priority entry for a `single` slot.

So `priority: -1` takes the seat and `priority: 1` hands it straight back. The trigger geometry and the menu surface are the shipped `AccountMenu.module.css` and the shared `Menu.module.css` rewritten under this plugin's class prefix; no Harness Client package (such as `@deepseek-ai/dsh-client-ui-primitives`) is imported.

### What the shipped plugin still owns

`ui-settings-account` keeps every registration that is independent of the launcher, and none of them are affected:

- **Settings → Account** page (`settings.section`) — login state, balance card, usage and top-up links.
- **Desktop onboarding, top-up and usage page host** (`shell.overlay`).
- **Quota notice** (`shell.quota-notice`).
- **Model sign-in choice** (`settings.models.sign-in`).

Only three notifications live inside the shadowed component: the granted-bonus card, and the credential-expired and model-sign-in-required toasts. Sign-out confirmation is likewise simplified from "query running tasks, then a dialog" to one confirm step inside this menu.

## Known limitations

- **It shadows shipped UI.** The three notifications listed above no longer appear while the plugin is installed. A future DSH release that restructures the launcher will need this plugin updated.
- `CLIENT_VERSION` (`0.2.0-rc.2`) is hard-coded as the `x-client-version` request header. Shipped bundles inline that constant at build time; a hand-written bundle carries the version it was authored against. It is a request-header string only.
- Only the **recharge balance** and **cumulative spend** are shown. `bonus_wallets` (granted credit) is deliberately not displayed.
- `累计消费` is whatever the Platform reports as `total_costs`; if that field's meaning changes, the plugin shows the number the Platform gives.

## License

[MIT](LICENSE)

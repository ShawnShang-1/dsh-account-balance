# dsh-account-balance

[English](README.md) | [中文](README.zh.md)

一个 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 插件：把 DeepSeek 账户的**充值余额**与**累计消费**放进侧边栏左下角的账户菜单——也就是点头像弹出的那一栏，省得每天去充值网站看余额。

![账户余额图标](icon.svg)

```text
点击左下角头像
┌──────────────────────────┐
│ 余额              ¥4.57  │  ← 本插件新增
│ 累计消费         ¥19.69  │  ← 本插件新增
│ ──────────────────────── │
│  ⚙ 设置              ⌘,  │  ← 官方行，保留
│  ✈ 意见反馈              │  ← 官方行，保留
│  → 退出登录              │  ← 官方行，保留
└──────────────────────────┘
```

文案跟随界面语言，上图是中文界面。

## 行为

| 状态 | 头像与菜单 |
|---|---|
| 已登录 | `余额`（充值钱包）与 `累计消费`（平台累计消费金额）显示在官方三行之上 |
| 未登录 | 头像位置显示官方的「更多」行，第三项变成 `登录` |
| 读取失败 | 保留上一次的金额，并追加一行错误提示与 `重试` |
| 等待授权 | 菜单内显示授权链接，可复制 / 打开，并等待授权完成 |

金额的刷新时机是**每次打开菜单**，以及窗口重新回到前台（`visibilitychange` / `focus`）。不轮询。

金额格式与平台 Web 一致：两位小数、千分位、正数截断、负数半进位、正数不足一分显示 `<¥0.01`。样式只引用 `--dsw-*` 主题令牌，明暗主题自动跟随。

## 数据从哪来

官方 `deepseekAccount.getBalance()` 用 `z.object` 解析平台响应，会把**没有声明的字段全部丢掉**，只留下 `normal_wallets` 与 `bonus_wallets`。同一个响应里本来就带着累计消费：

```json
{ "code": 0, "data": { "biz_code": 0, "biz_data": {
    "normal_wallets": [ { "currency": "CNY", "balance": "4.57…" } ],
    "bonus_wallets":  [ { "currency": "CNY", "balance": "2.03…" } ],
    "total_costs":    [ { "currency": "CNY", "amount": "19.68…" } ] } } }
```

`total_costs` 就是本插件新增的部分。账户凭证是 Host 专用的——`deepseekAccount.getPlatformSession()` 返回 origin、token 与部署头，且刻意没有开放成 Remote——所以浏览器半无法自己读这个 summary。于是由 Host 半发这一次请求，与 `dsh-deepseek-account-platform` 发出的请求逐字节相同：同一 origin、同一部署头、同一 `x-dsh-auth-token`、`GET`、无 body。

Host 半只读：不写平台状态，token 不出 Host 进程。

## 环境要求

- DeepSeek Harness **桌面版**，且已登录 DeepSeek 账户（`ui-settings-account` 处于启用状态）。
- 已在 macOS 上的 DSH `0.2.0-rc.2` 验证。

## 安装

### 1. 取回代码

```bash
git clone https://github.com/ShawnShang-1/dsh-account-balance.git ~/code/dsh-account-balance
```

### 2. 作为 profile bundle 安装

让 Harness 里的 agent 执行：

```text
plugin_manager install_bundle  target: /Users/you/code/dsh-account-balance
```

或者用 `PATH` 上的 CLI：

```bash
dsh plugin --profile "$DSH_PROFILE" add ~/code/dsh-account-balance
```

两种方式等价：包里同时声明了 `dsh.bundle.patch`（Host 行）与 `dsh.client`（浏览器 bundle），一次安装即同时具备两半。安装通过 HMR 立即生效；若侧边栏没有变化，刷新页面（`Cmd`/`Ctrl` + `R`）。

### 3. 验证

打开账户菜单，两行金额应当出现在 `设置 / 意见反馈 / 退出登录` 之上。

若只想验证 Host 半：路由已挂载时，未携带浏览器会话 cookie 的请求会得到 `401`；未挂载的前缀则会落到 `405`。

```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST -H 'content-type: application/json' -d '{}' \
  http://127.0.0.1:19387/dsh-account-balance/overview
# 401
```

## 配置

改 profile `cordis.patch.yml` 里本插件的行，或在安装时给出：

| 字段 | 默认 | 含义 |
|---|---|---|
| `ttlMs` | `15000` | 一次读到的结果在 Host 缓存多久；在此之内的重复读取不打平台。`0` 表示每次都读。 |
| `timeoutMs` | `15000` | 单次平台请求超时。 |

```yaml
- id: account-balance
  name: './lib/entry.js'
  config:
    ttlMs: 15000
    timeoutMs: 15000
```

## 卸载，或把菜单交还官方

整体移除：

```text
plugin_manager remove_bundle dsh-account-balance
```

只交还 launcher、保留插件本身：把 [`client.js`](client.js) 里的 `LAUNCHER_PRIORITY` 从 `-1` 改成 `1`，刷新页面即可。

## 实现

| 半边 | 文件 | 作用 |
|---|---|---|
| Host 入口 | [`lib/entry.js`](lib/entry.js) | Loader 行的稳定模块。按文件版本重新导入 `lib/host.js`，因此改完 Host 代码在下一次激活即生效，不需要重启应用。行的 specifier 指向本文件（`./lib/entry.js`）而不是包名，正是为了让这条路径成立。 |
| Host | [`lib/host.js`](lib/host.js) | 用存下的凭证读取平台 summary，经 `/dsh-account-balance` 前缀路由回答页面。路由通过 `ctx.connection.admit` 继承浏览器信任栅栏。默认缓存 `ttlMs`。 |
| Browser | [`client.js`](client.js) | 预构建的 Client bundle。注册进 `settings.launcher`，渲染头像与菜单。 |
| 兼容 | [`index.js`](index.js) | `export * from './lib/entry.js'`，让按包名导入仍然有意义。 |

### 为什么是「接管座位」而不是「追加一行」

`settings.launcher` 是 `single` 槽位且没有声明任何子槽位，官方账户菜单没有可以插入一行的位置。槽位注册表本身把覆盖机制写明了：

- 同优先级二次注册会直接抛错（`single slot "…" already has a registration … register at a different priority to shadow it (lowest renders)`）；
- `entriesOfSlot` 对 `single` 槽位保留排序后的第一条，也就是**优先级最低者渲染**。

所以 `priority: -1` 拿到座位，`priority: 1` 就把它原样交还。触发器的几何与菜单卡片表面，都是把官方 `AccountMenu.module.css` 与共享 `Menu.module.css` 以本插件类前缀重写而来；没有 import 任何 Harness Client 包（如 `@deepseek-ai/dsh-client-ui-primitives`）。

### 官方插件仍然持有的部分

`ui-settings-account` 与 launcher 无关的注册全部不受影响：

- **设置 → 账户页**（`settings.section`）——登录状态、余额卡、充值与用量入口。
- **桌面引导、充值页与用量页宿主**（`shell.overlay`）。
- **配额提醒**（`shell.quota-notice`）。
- **模型登录选择**（`settings.models.sign-in`）。

留在被遮蔽组件里的只有三类通知：赠送金到账卡片，以及凭证过期与「模型需要登录」两个 toast。退出登录确认也从「查询运行中任务 + 对话框」简化成菜单内的一步确认。

## 已知限制

- **遮蔽官方 UI**：安装期间上面那三类通知不再出现；DSH 未来若调整 launcher 结构，本插件需要跟着改。
- `CLIENT_VERSION`（`0.2.0-rc.2`）是写死的 `x-client-version` 请求头。官方 bundle 在构建期内联该常量，手写 bundle 只能带上编写时的版本。它只是一个请求头字符串。
- 只显示**充值余额**与**累计消费**；`bonus_wallets`（赠送余额）按需求不展示。
- `累计消费` 就是平台在 summary 里给出的 `total_costs`；若该字段语义变化，显示的仍是平台给出的数字。

## 许可

[MIT](LICENSE)

# dsh-msgrail · 消息轨道（MsgRail）

**DeepSeek Harness (DSH) 的消息索引轨道插件**：对话区右缘一串品牌色圆点，每条用户消息一个。悬停预览、点击跳转，未加载的历史自动逐页追载。零宿主侵入（`shell.overlay` 纯插件实现，不改动 DSH 布局），完全跟随当前皮肤与主题（`--dsw-*` token + `color-mix`）。

> A message-index rail for DeepSeek Harness: one brand-colored dot per user message at the right edge of the conversation. Hover to preview, click to jump, auto-load older history on demand. Pure-plugin (no host layout patching), fully theme/skin aware.

## 功能 / Features

- **消息索引**：对话右缘垂直圆点列，每条**真实用户消息**一个圆点（自动排除插件注入的上下文 / compaction 节点）
- **悬停预览**：时间 + 文本预览卡，淡入上浮动画；圆点放大高亮
- **点击跳转**：已加载消息即时跳转；未加载的历史自动点「加载更早」逐页追载到目标
- **全量历史**：数据读自会话日志（内存 session 优先 + 持久化兜底），不依赖前端已加载窗口
- **皮肤适配**：颜色全部走 DSH 语义 token（brand-primary / label-* / bg-overlay / border-l1），跟随 DeepSeek 主题与任意皮肤（Pinkie、龙裔等）
- **最新消息常亮**：最新一条圆点更亮更醒目
- **滚动索引**：消息多时圆点列内部滚动，上下两端渐变淡出
- **随包分发友好**：可打进 dsh-desktop 安装包的 `bundle/`，接收方开箱即用

## 要求 / Requirements

- DeepSeek Harness **rc.6+**（`dsh web`）
- 浏览器支持 `color-mix`（Chrome / Edge 111+，Electron 43+）

## 安装 / Install

### 方式一：dsh 插件命令（推荐）

```bash
dsh plugin --profile web add github:<你的用户名>/dsh-msgrail
```

### 方式二：手动

1. 把 `dsh-msgrail` 目录复制到 `~/.dsh/profiles/web/node_modules/@local/dsh-msgrail/`
2. 在 `~/.dsh/profiles/web/cordis.patch.yml` 末尾追加：

```yaml
- insert:
    - id: msgrail
      name: '@local/dsh-msgrail'
```

3. 刷新页面（或重启 `dsh` 服务）

## 使用 / Usage

对话区右缘的圆点列即消息索引（自上而下按时间顺序，全部消息均匀排列）：

| 操作 | 效果 |
|---|---|
| 悬停圆点 | 左侧弹出预览卡（时间 + 文本，3 行省略），圆点放大变亮 |
| 点击圆点 | 跳转到该消息；若目标在未加载的历史中，自动逐页加载并跳转 |
| 滚轮 | 圆点列内部滚动（历史很多时） |
| —— | 最新一条圆点常亮；上下两端圆点渐变淡出 |

## 架构 / Architecture

```
浏览器 (Client)                              Node (Host)
┌───────────────────────┐                  ┌─────────────────────────┐
│ lib/client.js         │  GET /api/       │ lib/index.js            │
│ shell.overlay 注册     │ ─msgrail/messages│ webServer 路由           │
│ 圆点列 + 预览 + 跳转    │ ────────►       │ 会话日志读取：            │
│ fetch 数据 / 轮询刷新   │ ◄────────       │ 内存 session → sessionQuery│
└───────────────────────┘      JSON        │ → 冷会话 30s 缓存         │
                                           └─────────────────────────┘
```

- **Host**（`lib/index.js`）：`webServer` 注册 `GET /api/msgrail/messages?sessionId=…`，返回该会话的真实用户消息（seq / time / id / text）。读取顺序：内存 session（完整事件，最快）→ `sessionQuery.listEvents` + 并发 `readEvent`（持久化兜底）→ 冷会话结果缓存 30 秒。
- **Client**（`lib/client.js`）：通过 `dsh.client` 协议注入 `shell.overlay`，3 秒轮询刷新；跳转利用 ChatView 的官方 DOM 钩子（`data-chat-anchor-key`）定位消息，未渲染的目标走「加载更早」自动追页（200ms 高频轮询 + 可见性确认循环）。

## 已知限制 / Known Limitations

- 跳转到**很老的未加载历史**时，受 DSH 前端分页机制（每次「加载更早」固定 50 条）与**无虚拟滚动**（历史消息全部渲染为 DOM）的限制，需要逐页加载且可能短暂卡顿——这是 DSH 客户端的固有边界，非本插件可绕过。跳转**已加载**的消息则完全即时。
- 圆点列锚定对话区右缘（`data-conversation-scroll` / `data-chat-flow`），窄窗口或超宽布局下位置可能偏右，建议在窗口宽度 > 800px 时使用。

## 与「宿主补丁版 MsgRail」的区别

社区另有一个通过 `patch-layout.mjs` 修改宿主布局实现的消息轨道（chou109/dsh-msgrail）。本插件采用**纯插件路线**：不改任何宿主代码，`shell.overlay` 浮层实现——升级 DSH 无忧、可随安装包分发、接收方零额外步骤。

## License

MIT

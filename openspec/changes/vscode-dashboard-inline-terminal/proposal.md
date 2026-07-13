# Proposal: VSCode Dashboard Inline Terminal — WebView 嵌入式终端面板

## Why

当前 VSCode Dashboard Extension 使用 `window.createTerminal` API 创建独立终端标签页来执行 `claude /openflow:<phase>` 命令。这带来了以下体验问题：

1. **上下文割裂** — 用户点击卡片 Run 按钮后，终端面板在 VSCode 底部弹出，WebView 面板隐藏在编辑器区域顶部。用户需要频繁在两个区域之间切换视觉焦点，无法在同一屏幕内同时看到卡片状态变更和终端执行输出。

2. **终端标签页堆积** — 每次 Run 命令可能创建新的终端标签页，多个需求产生多个终端，导致 VSCode 终端下拉列表杂乱。虽然设计了同名复用策略，但依然存在标签页切换负担。

3. **状态感知延迟** — 终端执行结束后，用户需要手动点击 WebView 刷新按钮才能看到 Gate 状态或阶段变更，缺少执行完毕后的自动状态同步推送。

4. **信息关联弱** — 终端标题仅显示需求名称，用户无法直观地将终端输出与 WebView 中的特定卡片建立视觉关联。

**解决思路**：将终端直接嵌入 WebView 面板下半部分，采用上下分栏布局，上半部分保留卡片列表，下半部分使用 xterm.js 渲染终端。所有命令执行通过 `child_process.spawn` 在 Extension Host 侧完成，输出通过流式消息推送回 WebView。切换卡片时自动切换到对应需求的终端会话。

## What Changes

1. **新增 npm 依赖** — 在 `extensions/vscode-dashboard/package.json` 中新增 `xterm`、`xterm-addon-fit`、`xterm-addon-web-links` 包依赖，用于 WebView 内终端渲染。

2. **新增 `media/terminal.js` 模块** — 封装 xterm.js 实例管理，包括：初始化 Terminal 对象、安装 FitAddon 自适应插件、处理 resize 事件、处理来自 Extension Host 的终端输出流写入、支持清屏和重置操作。

3. **修改 `media/index.html`** — 将页面布局从单区域（卡片列表）改为上下分栏结构：上方 `<div id="cardArea">` 卡片列表区域，下方 `<div id="terminalArea">` 终端容器区域。增加可拖拽分割线 `<div id="divider">` 用于调整上下比例。

4. **修改 `media/style.css`** — 新增分栏布局样式（flex column + 分割线拖拽样式），xterm.js 容器样式适配 VSCode 主题变量，分割线 hover/active 状态样式，终端区域最小高度约束。

5. **修改 `media/script.js`** — 集成 `terminal.js` 模块：点击卡片 Run 按钮时改为发送 `startSession` 消息（而非 `runPhase`），切换卡片时发送 `switchSession` 消息，处理来自 Extension 的 `terminalOutput` 消息写入 xterm，处理 `terminalResize` 消息适配容器尺寸。

6. **修改 `src/panel.ts`** — 更新消息路由协议：新增 `startSession`、`switchSession`、`terminalResize` 消息处理，移除原有 `runPhase` 消息的直接终端创建逻辑。改为调用新的 `sessionManager` 模块。

7. **新增 `src/sessionManager.ts`** — 终端会话管理器：每个需求对应一个 `child_process.spawn` 子进程，管理子进程的创建、销毁、切换。维护 `Map<changeId, ChildProcess>` 映射表。处理进程退出时的清理和状态恢复。

8. **新增 `src/sessionTerminal.ts`** — 终端会话封装：封装 `child_process.spawn` 实例的 stdio 流，通过 `postMessage` 将 stdout/stderr 数据实时推送至 WebView 中的对应 xterm.js 实例。支持发送 resize 信号（`process.stdout.columns/rows`）给子进程。

9. **修改 WebView ↔ Extension 通信协议** — 扩展消息类型表，新增 `startSession`、`switchSession`、`terminalOutput`、`terminalResize`、`sessionEnded`、`sessionError` 等消息类型。移除 `phaseStarted` 消息（被 `sessionStarted` 替代）。

10. **修改 `src/terminalRunner.ts`** — 废弃 `window.createTerminal` 方案，保留文件仅做兼容转接（委托调用 sessionManager），或直接删除该模块将其职责合并至 sessionManager。

11. **在 `package.json` 中新增配置项** — `flowmaster.terminal.fontSize`（终端字号，默认 13）、`flowmaster.terminal.fontFamily`（终端字体，默认 `'Consolas, monospace'`）、`flowmaster.terminal.preserveHistory`（切换需求时是否保留终端历史，默认 `true`）。

## Capabilities

- **flowmaster.session.start** — Start a new terminal session for a given change-demand and execute the OpenFlow phase command via `child_process.spawn`
- **flowmaster.session.switch** — Switch the WebView terminal view to a different demand's session, preserving previous session output in memory
- **flowmaster.session.stop** — Terminate the running session for a given demand (send SIGTERM/SIGKILL to child process)
- **flowmaster.session.resize** — Propagate terminal resize events (columns/rows) from xterm.js to the child process's `process.stdout`
- **flowmaster.session.output** — Stream stdout/stderr output from the child process to the corresponding xterm.js instance in WebView (real-time, line-buffered)
- **flowmaster.session.ended** — Notify WebView when a child process exits (with exit code or signal name)
- **flowmaster.session.error** — Notify WebView when a child process fails to spawn or encounters a runtime error
- **flowmaster.layout.divider.drag** — Enable horizontal drag-to-resize between card area and terminal area within the WebView panel
- **flowmaster.layout.remember** — Persist the divider position ratio across panel open/close cycles via VSCode workspace state

## Impact

| 维度 | 影响 |
|---|---|
| **代码** | 新增 `media/terminal.js`（~80 行）、`src/sessionManager.ts`（~120 行）、`src/sessionTerminal.ts`（~80 行）。修改 `media/index.html`（分栏布局结构）、`media/style.css`（新增终端区域和分割线样式）、`media/script.js`（集成 terminal.js，更新消息处理）、`src/panel.ts`（更新消息路由，新增 5 条消息类型）、`src/terminalRunner.ts`（废弃 `window.createTerminal`，改为委托 sessionManager）。移除或废弃原有基于 `window.createTerminal` 的 Run 逻辑。 |
| **API** | WebView ↔ Extension 消息协议扩展：新增 `startSession`、`switchSession`、`stopSession`、`terminalResize`、`terminalOutput`、`sessionEnded`、`sessionError` 7 种消息类型。移除 `runPhase` 和 `phaseStarted` 消息（向后兼容期保留解析但标记 deprecated）。panel.ts 对外接口新增 `startSession(demandId)`、`switchSession(demandId)`、`stopSession(demandId)`、`resizeSession(rows, cols)` 方法。 |
| **依赖** | **新增运行时依赖：** `xterm`（^5.3.0）、`xterm-addon-fit`（^0.8.0）、`xterm-addon-web-links`（^0.9.0）。均通过 npm 安装，无额外构建工具要求。移除对 VSCode `window.createTerminal` API 的运行时依赖（但仍保留 VSCode API 调用用于其他功能）。 |
| **配置** | `package.json` 中 `contributes.configuration` 新增三项：`flowmaster.terminal.fontSize`（number，默认 13）、`flowmaster.terminal.fontFamily`（string，默认 `'Consolas, monospace'`）、`flowmaster.terminal.preserveHistory`（boolean，默认 true）。移除原有与 `window.createTerminal` 相关的配置项（如果有）。 |

## Open Questions

1. **xterm 输入 vs 只读输出** — xterm.js 渲染的终端是否可以接受用户输入（如 Gate 审核时的交互式确认），还是仅做只读输出显示？如果支持输入，需要建立 WebView → Extension Host → child_process.stdin 的反向管道，引入额外的安全审查。

2. **终端历史保存策略** — 切换需求时，之前的终端输出是否需要完整保留在内存中？如果保留，当 10+ 个需求各产生数千行输出时，WebView 内存占用可能膨胀。是否限制最大保留行数（如每会话 5000 行）？是否需要将历史持久化到磁盘？

3. **多进程生命周期管理** — 当用户关闭 WebView 面板时，所有 `child_process.spawn` 子进程应如何处理？自动 kill 所有子进程，还是允许后台继续运行？如果允许后台运行，重新打开面板时如何恢复会话关联？

4. **`child_process.spawn` 跨平台兼容性** — `spawn('claude', ['/openflow:design', 'change-id'])` 在 Windows 上需要 `.cmd` 或 `.bat` 后缀（`claude.cmd`），在 Linux/macOS 上则不需要。是否需要使用 `cross-spawn` 包处理跨平台差异？`process.stdout.columns/rows` 在 Windows shell 中的行为是否与 Unix 一致？

5. **安全边界与 XSS 防护** — xterm.js 接收的终端输出如果包含恶意构造的 ANSI 转义序列或 HTML 注入，可能导致 WebView 沙箱逃逸或信息泄露。是否需要引入 `xterm-addon-unicode` 或对输出进行 sanitize（过滤危险控制字符）？VSCode WebView 的 `content-security-policy` 是否足够防护？
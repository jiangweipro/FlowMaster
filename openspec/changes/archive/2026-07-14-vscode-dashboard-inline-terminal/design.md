# FlowMaster Dashboard — 内置终端集成设计

## 1. Context

### 背景
FlowMaster Dashboard 是一个 VSCode Extension，通过 WebView 面板展示需求卡片，当前使用 `vscode.window.createTerminal` 创建独立 VSCode 终端来执行 `claude /openflow:<phase> <change-id>` 命令。用户需要在 WebView 面板和系统终端之间来回切换，体验割裂。

### 当前状态
- 项目根目录：`F:/project/FlowMaster/`
- 当前版本：`0.1.2`
- 源码路径：`src/`（6 个模块文件）
- 前端资源：`media/`（style.css + script.js，但 HTML 实际内联在 extension.ts 中）
- 构建：TypeScript (`tsc`)，输出到 `dist/`
- 终端执行：`terminalRunner.ts` 调用 `vscode.window.createTerminal()`，通过 `sendText` 发送命令
- 通信：WebView 通过 `postMessage` / `onDidReceiveMessage` 与 Extension Host 交互

### 现有架构
```
src/
├── extension.ts         # 入口，WebView 管理 + 消息处理（内联 HTML/JS）
├── panel.ts             # WebView 面板类封装（备选入口，含内联 HTML）
├── sidebarProvider.ts   # 侧边栏 WebviewView 提供者
├── stateReader.ts       # YAML 状态读取 (DemandSummary)
├── terminalRunner.ts    # 终端执行（createTerminal + sendText）
└── fileOpener.ts        # 文件打开（code CLI + fallback）
media/
├── style.css            # 全局样式（VSCode 主题变量）
└── script.js            # 前端逻辑（似乎未被 inline HTML 引用）
```

### 约束
- 不得引入前端框架或构建工具链（保持纯 TypeScript 编译 + 内联 JS）
- 必须与现有 OpenFlow skill 兼容（`claude /openflow:<phase> <change-id>` 不变）
- 跨平台兼容（Windows / Linux / macOS）
- VSCode 1.85+ 兼容
- 无额外 npm 构建步骤（仅 `tsc` 编译）
- 现有 `flowmaster.terminalReuse` 配置项在 spawn 模式不再适用，需标记废弃

### 利益相关方
- **用户**：FlowMaster Dashboard 使用者，期望一体化操作体验
- **开发者**：维护该 Extension 的团队
- **OpenFlow 系统**：下游命令调用方，命令接口需保持不变

---

## 2. Goals / Non-Goals

### Goals
1. 在 WebView 面板内实现**上下分栏布局**：上半部分为需求卡片详情，下半部分为内置终端（xterm.js）
2. 用 **child_process.spawn** 替代 `vscode.window.createTerminal`，实现进程级控制
3. 通过 **postMessage 通信协议** 在 WebView 和 Extension Host 之间传输终端输入/输出
4. 支持**可拖拽分割线**，让用户自由调整卡片和终端区域的高度比例
5. 每个需求独立 spawn 进程，切换卡片时自动切换终端会话
6. 终端输出实时显示，支持 ANSI 颜色转义序列
7. 进程退出时自动清理，并在终端区域显示退出状态

### Non-Goals
1. 不引入前端框架（React/Vue/Angular 等）
2. 不引入前端构建工具（Webpack/Vite 等）
3. 不改变现有的 `claude` 命令调用方式
4. 不实现多终端同时显示（同一时刻只显示一个终端会话）
5. 不改变侧边栏（sidebarProvider.ts）的现有行为
6. 不修改 `stateReader.ts` 和 `fileOpener.ts` 的现有逻辑
7. 不实现终端会话持久化（Extension 关闭后不保留历史）

---

## 3. Decisions

### D1: xterm.js 选型

**决策**：在 WebView 内使用 xterm.js 渲染终端。

**理由**：
- xterm.js 是 VSCode 自身使用的终端渲染引擎，与 VSCode 1.85+ 完全兼容
- 支持 ANSI 颜色、Unicode、富文本渲染，满足 `claude` 命令输出展示需求
- 提供 `xterm-addon-fit` 和 `xterm-addon-web-links` 插件，分别解决自适应尺寸和链接点击问题
- 纯前端库，无需 Node.js 原生模块，可在 WebView 中直接运行
- 社区成熟，维护活跃

**备选方案**：
- **`vscode.window.createTerminal`**（当前方案）：体验割裂，无法嵌入 WebView，无法精确控制输出流
- **`<pre>` + 模拟终端**：无法处理 ANSI 转义序列，不具真实终端体验
- **`@xterm/xterm`**（新包名）：xterm.js 5.x 已迁移到 `@xterm/xterm`，但为了兼容性选择 `xterm` 4.x 系列

**安装的依赖**：
```
npm install xterm@4.19.0 xterm-addon-fit@0.7.0 xterm-addon-web-links@0.8.0
```

### D2: spawn 进程管理策略

**决策**：使用 `child_process.spawn` 替代 `vscode.window.createTerminal`。

**理由**：
- `spawn` 提供对子进程的完全控制（stdin/stdout/stderr），可通过流式接口逐行读取输出
- 每个需求独立 spawn 进程，天然进程隔离，互不影响
- 可通过 `process.kill` / `proc.kill()` 精确终止进程
- 可获取进程退出码（exit code），判断执行成功/失败
- 不依赖 VSCode 终端 UI，输出可直接通过 postMessage 传输到 WebView

**备选方案**：
- **`vscode.window.createTerminal`**：输出无法编程式读取，无法嵌入 WebView
- **`exec` / `execSync`**：缓冲区有限，不适合长时间运行命令，无流式输出
- **`child_process.fork`**：仅适用于 Node.js 子进程，不适用 `claude` CLI 命令

**管理策略**：
- 使用 `Map<string, ChildProcess>` 存储 demandId -> ChildProcess 的映射
- 切换卡片时，查找对应进程，重新绑定 stdin/stdout 流
- 进程退出后自动从 Map 中移除
- Extension 关闭时 kill 所有活跃进程

### D3: 分栏布局方案

**决策**：使用纯 CSS Flexbox + 可拖拽分割线（divider）实现上下分栏。

**理由**：
- 零额外依赖
- 纯 CSS Flexbox 布局兼容性好，VSCode 1.85+ 的 WebView 基于 Chromium，完全支持
- 拖拽分割线通过监听 `mousedown` / `mousemove` / `mouseup` 事件实现，逻辑简单
- 拖拽时通过 `flex-basis` 或 `height` 百分比调整上下区域比例
- 分割线区域做 hover 样式提示（cursor: row-resize），提升用户体验

**备选方案**：
- **Split.js 库**：增加一个外部依赖，不必要
- **CSS Grid + `resize` 属性**：不支持拖拽分割线
- **VSCode 原生 split**：无法嵌入 WebView 内部

### D4: 终端切换策略

**决策**：切换需求卡片时，自动销毁当前终端实例，创建（或恢复）目标需求的终端。

**理由**：
- 每个需求有独立的 spawn 进程，切换时需重新绑定 xterm.js 实例
- 销毁旧终端视觉上清晰，避免用户混淆
- 如果进程仍在运行，后台保持运行，切换回来时重新绑定输出流
- 实现简单，状态管理清晰

**具体行为**：
- 切换卡片时，Extension Host 发送 `terminalSwitch` 消息给 WebView
- WebView 销毁当前 xterm.js 实例，清空终端容器
- 如果目标需求有活跃进程，重新创建 xterm 实例并绑定到该进程的 stdout/stderr
- 如果目标需求无活跃进程，显示空白终端（或"点击 Run 启动"占位）

### D5: 依赖与配置管理

**决策**：xterm.js 及其插件通过 npm 安装，编译时产出到 `dist/`，WebView 运行时通过 `localResourceRoots` 加载。

**配置项**：注册以下 VSCode 配置项（均在 `flowmaster.terminal.*` 命名空间下）：
- `fontSize`（number, 默认 14）— 终端字号
- `fontFamily`（string, 默认 `"Consolas, monospace"`）— 终端字体
- `scrollback`（number, 默认 1000）— 滚动缓冲行数
- `splitRatio`（number, 默认 0.6）— 分栏比例

> `defaultShell` 配置项在设计中提出但未实现——当前实现使用 `shell: process.platform === 'win32'` 自动处理跨平台兼容性，不提供用户可配置的 shell 覆盖。

**理由**：
- xterm.js 是纯 JS 库，无需原生模块，可在 WebView 中直接加载
- VSCode WebView 的 `localResourceRoots` 允许从 Extension 目录加载本地资源
- 通过 `webview.asWebviewUri()` 将 `node_modules/xterm/...` 路径转换为 WebView 可访问的 URI
- 避免 CDN 加载（离线场景、安全策略）

**CSP 更新**：
- 当前 CSP: `default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';`
- 需要添加 `font-src 'self'`（xterm.js 需要加载字体文件）
- 需要添加 `style-src 'unsafe-inline' https:;`（如果 xterm 有动态样式注入）

---

## 4. Architecture

### 架构总览（ASCII 图）

```
+---------------------------------------------------------------------+
|  VSCode Extension Host (Node.js)                                     |
|                                                                      |
|  +------------------+    +------------------+    +------------------+ |
|  |  extension.ts    |    |  stateReader.ts  |    |  fileOpener.ts  | |
|  |  (入口/消息路由)  |    |  (YAML 解析)     |    |  (文件打开)      | |
|  +--------+---------+    +------------------+    +------------------+ |
|           |                                                          |
|  +--------v---------+    +------------------+                        |
|  |  ProcessManager  |    |  sidebarProvider  |                       |
|  |  (spawn 管理)    |    |  (侧边栏)         |                       |
|  +--------+---------+    +------------------+                        |
|           |                                                          |
|  +--------v---------+    +------------------+                        |
|  |  TerminalBridge  |    |  panel.ts        |                        |
|  |  (stdin/stdout)  |    |  (WebView 面板)  |                        |
|  +--------+---------+    +--------+---------+                        |
|           |                       |                                  |
|           |   postMessage 协议    |                                  |
|           +---------+-------------+                                  |
|                     |                                                |
+---------------------------------------------------------------------+
                      |
                      | postMessage
                      |
+---------------------------------------------------------------------+
|  VSCode WebView (Chromium)                                           |
|                                                                      |
|  +-------------------------------------------------------------+    |
|  |  上半：需求卡片详情 (原有 HTML 渲染)                          |    |
|  |  可拖拽分割线                                                  |    |
|  |-------------------------------------------------------------|    |
|  |  下半：xterm.js 终端                                         |    |
|  |  - xterm 实例 (Terminal)                                     |    |
|  |  - xterm-addon-fit (自适应)                                  |    |
|  |  - xterm-addon-web-links (链接)                              |    |
|  +-------------------------------------------------------------+    |
|                                                                      |
+---------------------------------------------------------------------+
```

### 模块结构

#### 新增模块

| 文件 | 职责 |
|------|------|
| `src/processManager.ts` | 管理 `child_process.spawn` 生命周期，维护 demandId -> ChildProcess 映射 |
| `src/terminalBridge.ts` | 桥接 ProcessManager 和 WebView 消息通道，转换 stdio 流为 postMessage |
| `src/terminalRunner.ts` | 重构为调用 ProcessManager，保持 `runPhase(demandId, phase)` 接口不变 |

> **注**：xterm.js 核心库（`xterm`、`xterm-addon-fit`、`xterm-addon-web-links`）通过 npm 安装，在 `extension.ts` 的 `getHtml()` 中通过 `webview.asWebviewUri()` 从 `node_modules` 直接加载到 WebView，无需独立模块文件。`media/xterm.js` 和 `media/xterm.css` 由 npm 包提供。`media/script.js` 和 `media/style.css` 中的内联终端代码承担了 xterm 实例管理的职责（原设计中的 `xtermManager.ts` 功能）。

#### 修改模块

| 文件 | 变更内容 |
|------|----------|
| `src/extension.ts` | 移除 `createTerminal` 相关代码，改用 ProcessManager；更新消息处理逻辑；`getHtml()` 中内联 WebView 分栏布局和终端渲染代码 |
| `src/terminalRunner.ts` | 重构为调用 ProcessManager，保持 `runPhase(demandId, phase)` 接口不变 |
| `media/script.js` | 添加 xterm.js 初始化、分栏布局、终端消息处理逻辑 |
| `media/style.css` | 添加分栏布局样式、xterm 容器样式、拖拽分割线样式 |
| `package.json` | 添加 `xterm`、`xterm-addon-fit`、`xterm-addon-web-links` 依赖 |

#### 不变模块

| 文件 | 理由 |
|------|------|
| `src/stateReader.ts` | 状态读取逻辑不变 |
| `src/fileOpener.ts` | 文件打开逻辑不变 |
| `src/sidebarProvider.ts` | 侧边栏逻辑不变 |
| `tsconfig.json` | 编译配置不变 |
| `src/panel.ts` | 未使用，WebView 管理逻辑已合并到 `extension.ts` |

### 消息协议（postMessage）

#### Extension Host -> WebView

| 消息 | Payload | 触发时机 |
|------|---------|----------|
| `stateUpdated` | `{ demand: DemandSummary, noDemands: boolean }` | 状态刷新/切换卡片 |
| `terminalOutput` | `{ demandId: string, data: string }` | 子进程 stdout/stderr 有数据 |
| `terminalExit` | `{ demandId: string, code: number \| null }` | 子进程退出 |
| `terminalError` | `{ demandId: string, error: string }` | 子进程 spawn 失败 |
| `terminalStart` | `{ demandId: string, phase: string }` | 子进程启动成功 |
| `skipPermissionsChanged` | `{ enabled: boolean }` | 设置变更 |

#### WebView -> Extension Host

| 消息 | Payload | 触发时机 |
|------|---------|----------|
| `refreshState` | `{}` | 手动刷新 / 初始加载 |
| `runPhase` | `{ demandId: string, phase: string }` | 点击"执行"按钮 |
| `openFile` | `{ path: string }` | 点击文档链接 |
| `reviewGate` | `{ demandId: string, action: string }` | 审核通过/打回 |
| `terminalInput` | `{ demandId: string, data: string }` | 用户在终端输入 |
| `terminalResize` | `{ demandId: string, cols: number, rows: number }` | 拖拽分割线 / 窗口 resize |
| `toggleSkipPermissions` | `{}` | 切换权限跳过设置 |
| `terminalSwitch` | `{ demandId: string }` | 切换需求卡片 |

---

## 5. Data Flow

### 5.1 点击 Run -> 终端启动 -> 显示输出

```
用户点击"执行"按钮
  │
  ├─> WebView: script.js 发送 { command: 'runPhase', demandId, phase }
  │
  ├─> Extension Host: extension.ts/panel.ts handleMessage
  │     ├─> terminalRunner.runPhase(demandId, phase)
  │     │     └─> processManager.spawn(demandId, command)
  │     │           ├─> child_process.spawn('claude', [args], { cwd, shell: true })
  │     │           ├─> 存储进程到 Map<demandId, ChildProcess>
  │     │           └─> 监听 stdout/stderr 'data' 事件
  │     │
  │     ├─> 发送 { command: 'terminalStart', demandId, phase } 到 WebView
  │     │
  │     └─> stdout/stderr 'data' 事件触发
  │           └─> terminalBridge 发送 { command: 'terminalOutput', data: '...' }
  │                 └─> WebView: xterm.write(data)
  │
  └─> 用户看到终端输出实时显示在 WebView 下半部分
```

### 5.2 切换卡片 -> 切换终端会话

```
用户点击另一个需求卡片
  │
  ├─> WebView: script.js 发送 { command: 'terminalSwitch', demandId: 'new-id' }
  │
  ├─> Extension Host:
  │     ├─> 读取新需求的 state 信息
  │     ├─> 发送 { command: 'stateUpdated', demand: newDemand }
  │     │
  │     └─> 检查 processManager 中 new-id 是否有活跃进程
  │           ├─> 有: 发送 { command: 'terminalStart', demandId: 'new-id', ... }
  │           └─> 无: 发送 { command: 'terminalOutput', data: '终端准备就绪，点击"执行"启动...' }
  │
  ├─> WebView:
  │     ├─> 销毁当前 xterm 实例（terminal.dispose()）
  │     ├─> 清空终端容器 DOM
  │     ├─> 创建新 xterm 实例
  │     ├─> 加载 fit 插件
  │     └─> 写入欢迎消息
  │
  └─> 用户看到新卡片的终端会话
```

### 5.3 拖拽分割线 -> 终端 resize

```
用户拖拽分割线
  │
  ├─> WebView: mousedown -> mousemove -> mouseup
  │     ├─> 计算新高度比例（上半 flex: 比例, 下半 flex: 比例）
  │     ├─> 更新 DOM 元素的 flex-basis
  │     ├─> 调用 fit.fit() 重新计算终端尺寸
  │     ├─> 获取新尺寸: term.cols, term.rows
  │     └─> 发送 { command: 'terminalResize', demandId, cols, rows }
  │
  ├─> Extension Host:
  │     └─> 如果进程是 PTY 模式，调整 pty.resize(cols, rows)
  │
  └─> 终端内容自适应新尺寸
```

### 5.4 进程退出 -> 清理

```
子进程退出（正常/异常）
  │
  ├─> Extension Host: child_process 'close' 事件
  │     ├─> 获取 exit code
  │     ├─> 从 processManager 的 Map 中移除该进程
  │     ├─> 发送 { command: 'terminalExit', demandId, code }
  │     └─> 释放资源
  │
  ├─> WebView:
  │     ├─> xterm.write('\r\n[进程已退出，退出码: ' + code + ']')
  │     ├─> 恢复"执行"按钮为可用状态
  │     └─> 更新卡片状态显示
  │
  └─> 用户看到终端底部显示退出信息
```

### 5.5 用户终端输入 -> 发送到进程

```
用户在 WebView 终端中输入文字后按回车
  │
  ├─> WebView: xterm.onData(data) 事件
  │     ├─> 将输入回显到终端（xterm.write(data)）
  │     └─> 发送 { command: 'terminalInput', demandId, data }
  │
  ├─> Extension Host:
  │     └─> processManager.getProcess(demandId)?.stdin.write(data)
  │
  └─> 子进程接收输入
```

---

## 6. Risks / Trade-offs

### 风险

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|----------|
| xterm.js 资源加载失败 | 低 | 终端不可用 | 添加加载超时检测，fallback 到 `<pre>` 显示纯文本输出 |
| 用户输入的 XSS 注入 | 中 | 安全性 | 所有输出数据通过 `escapeHtml` 或 `TextEncoder` 处理，xterm.js 自身有 XSS 防护 |
| 进程残留（Extension 崩溃） | 低 | 用户需手动 kill | 使用 `process.on('exit')` 和 `context.subscriptions` 确保清理；Extension 激活时扫描残留进程 |
| 大量 ANSI 输出导致性能问题 | 中 | 终端渲染卡顿 | 限制 xterm 缓冲区大小（`cols`/`rows` 配置），实现输出节流（throttle） |
| Windows 兼容性 | 中 | 命令执行失败 | Windows 使用 `shell: true` + `comspec`，路径处理使用 `path.win32` |
| xterm.js 版本与 VSCode 内置冲突 | 低 | 样式冲突 | 在 WebView 的 Shadow DOM 中隔离 xterm 样式，或明确 namespace |

### Trade-offs

| 选择 | 优点 | 缺点 |
|------|------|------|
| 使用 spawn 替代 createTerminal | 精确流控制，可嵌入 WebView | 失去 VSCode 原生终端的特性（分屏、搜索、选择模式等） |
| 每个需求独立进程 | 隔离性好，互不影响 | 内存占用随需求数增加，后台进程管理复杂 |
| 切换卡片时销毁/重建终端 | 实现简单，状态清晰 | 切换时有短暂闪白，终端历史丢失 |
| 纯 CSS 拖拽分割线 | 零依赖 | 相比 Split.js 缺少触摸支持 |

---

## 7. Open Questions

1. **xterm.js 加载方式**：应使用 `node_modules` 直接加载，还是将 xterm.js 拷贝到 `media/` 目录作为 vendor？直接加载需要处理 `asWebviewUri` 路径转换，vendor 方式增加构建步骤。
2. **终端历史保持**：切换卡片时是否保留终端历史？如果保留，需要内存缓存 stdout 数据，增加内存开销。
3. **Windows PTY 支持**：`child_process.spawn` 在 Windows 上是否需要进行 PTY 模拟 (`winpty` / `conpty`)? 目前 `claude` 命令在 Windows 上通过 `shell: true` 运行，可能需要进一步测试。
4. **`claude` 命令路径**：`claude` 在用户 PATH 中，但 Extension Host 的环境变量可能不同于用户终端。是否需要检测 `claude` 路径？
5. **CSP 策略**：xterm.js 的字体和样式可能触发 CSP 限制。需要测试 VSCode WebView 的 CSP 与 xterm.js 的兼容性。
6. **`flowmaster.terminalReuse` 配置**：该配置在 spawn 模式下不再适用。已在 `package.json` 中标记为 `[DEPRECATED]`，说明改为 "terminal sessions are managed per-demand via ProcessManager"。
7. **`panel.ts` 和 `extension.ts` 的关系**：当前两者都有 WebView 管理逻辑，存在重复。实际实现中 WebView 管理逻辑已合并到 `extension.ts` 的 `getHtml()` 方法中，`panel.ts` 不再使用。

---

## 8. Implementation Plan

### Phase 1: 基础设施搭建（预计 1-2 天）

1. 安装 xterm.js 依赖：
   ```bash
   npm install xterm@4.19.0 xterm-addon-fit@0.7.0 xterm-addon-web-links@0.8.0
   ```
2. 创建 `src/processManager.ts`：
   - `spawnProcess(demandId, command, args, cwd)` 方法
   - `killProcess(demandId)` 方法
   - `getProcess(demandId)` 方法
   - `killAll()` 方法（dispose 时调用）
   - 进程退出自动清理
3. 创建 `src/terminalBridge.ts`：
   - 监听 processManager 的 stdout/stderr/exit 事件
   - 转换为 postMessage 格式发送给 WebView
   - 接收 WebView 的 terminalInput 消息，写入 stdin
   - 接收 terminalResize 消息，调整 PTY 尺寸

### Phase 2: WebView 分栏布局（预计 1 天）

4. 更新 `media/style.css`：
   - 添加 `#container` flexbox 上下分栏布局
   - 添加 `#terminal-container` 样式（xterm 容器）
   - 添加拖拽分割线样式（`.splitter`）
   - 拖拽分割线 hover 和 active 状态
5. 更新 `media/script.js`：
   - 添加 xterm.js 初始化代码
   - 添加 `xterm-addon-fit` 和 `xterm-addon-web-links`
   - 添加拖拽分割线逻辑（mousedown/mousemove/mouseup）
   - 添加终端消息处理（terminalOutput, terminalExit, terminalStart）
   - 添加终端输入发送（xterm.onData -> postMessage）
   - 添加终端 resize 处理（fit.fit() + postMessage）

### Phase 3: Extension Host 集成（预计 1 天）

6. 重构 `src/terminalRunner.ts`：
   - 保持 `runPhase(demandId, phase)` 接口不变
   - 内部调用 ProcessManager.spawnProcess
   - 移除 `vscode.window.createTerminal` 调用
7. 更新 `src/extension.ts`：
   - 实例化 ProcessManager 和 TerminalBridge
   - 更新消息处理逻辑，新增 `terminalInput`、`terminalResize`、`terminalSwitch` 处理
   - 更新 CSP 策略以允许 xterm.js 字体加载
   - 移除 `createTerminal` 相关代码
   - 在 `deactivate()` 中调用 `processManager.killAll()`

### Phase 4: 测试与兼容性验证（预计 1 天）

8. 测试覆盖：
   - Windows 上 spawn `claude` 命令的兼容性
   - 长输出（>1000 行）场景下的终端性能
   - 快速切换卡片时终端重建的稳定性
   - 进程异常退出场景
   - Extension 崩溃后进程清理
9. 更新 `package.json` 中的废弃配置项说明
10. 更新 `tsconfig.json`（如有需要）

### 文件变更清单

```
新增：
  src/processManager.ts      # spawn 进程管理
  src/terminalBridge.ts      # 流到消息的桥接
  
修改：
  src/extension.ts           # 集成 ProcessManager，更新消息处理，更新 CSP
  src/terminalRunner.ts      # 重构为调用 ProcessManager
  media/script.js            # 添加 xterm.js 初始化、分栏布局、拖拽分割线
  media/style.css            # 添加分栏布局、终端容器、分割线样式
  package.json               # 添加 xterm 依赖，标记废弃配置项

不变：
  src/stateReader.ts         # 无变更
  src/fileOpener.ts          # 无变更
  src/sidebarProvider.ts     # 无变更
  src/panel.ts               # 无变更（或后续考虑合并）
  tsconfig.json              # 无变更
```
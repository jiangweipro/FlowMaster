# 任务拆分：VSCode Dashboard 内嵌 xterm.js 终端改造

## 1. 任务清单

### Phase 1：基础依赖与核心模块

#### T-1：安装 xterm.js 及插件依赖
- **描述**：在 `extensions/vscode-dashboard/` 目录下安装 `xterm@4.19.0`、`xterm-addon-fit`、`xterm-addon-web-links`。同步更新 `package.json` 和 `package-lock.json`。
- **涉及文件**：`extensions/vscode-dashboard/package.json`
- **验收标准**：
  - `npm ls xterm` 输出 `xterm@4.19.0`
  - `npm ls xterm-addon-fit` 输出正常
  - `npm ls xterm-addon-web-links` 输出正常
  - `package.json` 的 `dependencies` 字段中新增上述三个包及其版本号
- **预估工时**：0.5h

#### T-2：新增 `src/processManager.ts` — 子进程管理
- **描述**：新建文件，实现 `ProcessManager` 类，使用 `child_process.spawn` 管理后台进程。核心职责：
  - `spawn(changeId, command, args, cwd?)` — 启动进程，返回 `ChildProcess`
  - `kill(changeId)` — 终止指定进程
  - `killAll()` — 清理全部进程
  - 内部通过 `Map<changeId, ChildProcess>` 维护多进程映射
  - 进程退出时自动从 Map 中移除
  - 暴露 `stdout`/`stderr` 数据事件的订阅接口（供 terminalBridge 使用）
  - 暴露 `onDidExit(changeId)` 事件
- **涉及文件**：`extensions/vscode-dashboard/src/processManager.ts`（新建）
- **验收标准**：
  - 文件存在且无 TypeScript 编译错误
  - `ProcessManager` 类导出且可实例化
  - `spawn()` 返回 `ChildProcess` 实例
  - `kill()` 调用后进程退出，Map 中对应条目移除
  - `killAll()` 调用后全部进程退出，Map 清空
  - 进程退出时触发 `onDidExit` 回调
- **预估工时**：2h

#### T-3：新增 `src/terminalBridge.ts` — 流到消息桥接
- **描述**：新建文件，实现 `TerminalBridge` 类，将 `ProcessManager` 的进程流转换为 WebView 可消费的消息格式。核心职责：
  - `attach(changeId, process)` — 绑定进程的 stdout/stderr，将数据转为 `{ type: 'terminal:data', changeId, data: string }` 格式并通过回调发送
  - `detach(changeId)` — 解除绑定，停止转发数据
  - `write(changeId, input: string)` — 向进程 stdin 写入输入（支持用户键入）
  - 处理进程退出时发送 `{ type: 'terminal:exit', changeId, code }` 消息
  - 处理窗口大小变化（`resize(cols, rows)` → 发送 `SIGWINCH` 或调整 PTY 尺寸）
- **涉及文件**：`extensions/vscode-dashboard/src/terminalBridge.ts`（新建）
- **验收标准**：
  - 文件存在且无 TypeScript 编译错误
  - `TerminalBridge` 类导出且可实例化
  - `attach()` 后，stdout 数据通过回调正确转发
  - `write()` 向 stdin 写入数据
  - `detach()` 后停止转发
  - 进程退出时发送 exit 消息
- **预估工时**：1.5h

### Phase 2：前端 WebView 改造

#### T-4：修改 `media/index.html` — 分栏布局结构
- **描述**：将当前单页面布局改为上下分栏布局（Flexbox）。结构如下：
  - 顶层容器：`#app-container`（flex-direction: column, height: 100vh）
  - 上栏：`#terminal-panel`（flex-grow，内嵌 xterm 容器）
  - 分割线：`#divider`（可拖拽，高度 4px，cursor: row-resize）
  - 下栏：`#output-panel`（flex-grow，原有内容区域，添加 `overflow: auto`）
  - 引入 xterm.js 的 CSS（`node_modules/xterm/css/xterm.css`）
  - 引入 xterm-addon-fit 的 CSS（如有）
  - 添加 `<div id="terminal-container"></div>` 作为 xterm 挂载点
- **涉及文件**：`extensions/vscode-dashboard/media/index.html`
- **验收标准**：
  - 页面加载后 DOM 中存在 `#terminal-panel`、`#divider`、`#output-panel` 三个元素
  - `#divider` 在 `#terminal-panel` 和 `#output-panel` 之间
  - 布局为上下分栏，无样式冲突
  - xterm.css 正确加载
- **预估工时**：1h

#### T-5：修改 `media/style.css` — 终端和分割线样式
- **描述**：新增以下样式规则：
  - `#app-container`：`display: flex; flex-direction: column; height: 100vh;`
  - `#terminal-panel`：`flex: 1 1 auto; overflow: hidden; background: #1e1e1e;`
  - `#divider`：`height: 4px; background: #333; cursor: row-resize; flex-shrink: 0;`
  - `#divider:hover`：`background: #007acc;`
  - `#output-panel`：`flex: 1 1 auto; overflow: auto;`
  - `#terminal-container`：`height: 100%; width: 100%; padding: 4px;`
  - 覆盖 xterm 默认样式使背景透明或与主题一致
  - 拖拽时的 `user-select: none` 处理
- **涉及文件**：`extensions/vscode-dashboard/media/style.css`
- **验收标准**：
  - 分栏布局正确渲染，上下各占约 50%（初始状态）
  - 分割线可见，鼠标悬停变蓝
  - 分割线可拖拽调整上下栏比例
  - 拖拽时页面不出现文本选中
  - 终端区域背景为深色（#1e1e1e）
- **预估工时**：1h

#### T-6：修改 `media/script.js` — 集成 xterm.js
- **描述**：在前端集成 xterm.js。核心变更：
  - 在模块加载或 DOMContentLoaded 时初始化 `Terminal` 实例
  - 使用 `FitAddon` 自动适配容器大小
  - 绑定 `WebLinksAddon` 支持链接点击
  - 实现 `TerminalBridge` 前端对应：通过 `window.addEventListener('message')` 接收后端数据
  - 收到 `terminal:data` 消息时调用 `term.write(data)`
  - 收到 `terminal:exit` 消息时显示进程退出信息
  - 监听 `term.onData(data)` 通过 `vscode.postMessage({ type: 'terminal:input', changeId, data })` 发送用户输入
  - 实现分割线拖拽逻辑（mousedown/mousemove/mouseup 事件）
  - 拖拽结束后调用 `fitAddon.fit()` 重新适配终端尺寸
  - 切换卡片时调用 `term.reset()` 并重新绑定新进程的数据流
- **涉及文件**：`extensions/vscode-dashboard/media/script.js`
- **验收标准**：
  - 页面加载后终端区域显示 xterm 终端界面（绿色光标，黑色背景）
  - 终端能显示后端发送的字符数据
  - 键盘输入通过 `postMessage` 发送给后端
  - 分割线可拖拽，拖拽后终端自适应
  - 切换卡片时终端内容清空并重新绑定
  - 链接可点击（WebLinksAddon 生效）
- **预估工时**：3h

### Phase 3：后端集成

#### T-7：修改 `src/terminalRunner.ts` — 重构为调用 ProcessManager
- **描述**：重构 `TerminalRunner`，将 `window.createTerminal` 替换为 `ProcessManager` + `TerminalBridge`。核心变更：
  - 移除 `vscode.window.createTerminal` 相关代码
  - 构造函数注入 `ProcessManager` 和 `TerminalBridge` 实例
  - `run(changeId, command, cwd?)` 方法改为调用 `processManager.spawn()` 和 `terminalBridge.attach()`
  - `write(changeId, input)` 委托给 `terminalBridge.write()`
  - `resize(changeId, cols, rows)` 委托给 `terminalBridge.resize()`
  - `kill(changeId)` 委托给 `processManager.kill()`
  - `dispose()` 委托给 `processManager.killAll()`
  - 暴露 `onData(changeId, callback)` 供 extension 注册消息发送
  - 暴露 `onExit(changeId, callback)` 供 extension 通知前端
- **涉及文件**：`extensions/vscode-dashboard/src/terminalRunner.ts`
- **验收标准**：
  - 文件无 TypeScript 编译错误
  - 不再引用 `vscode.window.createTerminal`
  - `run()` 调用后 `ProcessManager` 中新增一条进程记录
  - `write()` 调用后进程 stdin 收到数据
  - `kill()` 调用后进程终止
  - `dispose()` 调用后全部进程清理
- **预估工时**：2h

#### T-8：修改 `src/extension.ts` — 集成 ProcessManager，更新消息路由
- **描述**：在 extension 入口集成新模块。核心变更：
  - 在 `activate()` 中实例化 `ProcessManager` 和 `TerminalBridge`
  - 将 `TerminalRunner` 的构造改为注入上述实例
  - 在 WebView 消息处理中添加 `terminal:input` 分支，调用 `terminalRunner.write()`
  - 在 WebView 消息处理中添加 `terminal:resize` 分支，调用 `terminalRunner.resize()`
  - 注册 `terminalRunner.onData()` 回调，通过 `panel.webview.postMessage()` 转发给前端
  - 注册 `terminalRunner.onExit()` 回调，通知前端进程退出
  - 从配置读取 `fontSize`、`scrollback`、`fontFamily`、`splitRatio` 并传递给前端（通过 `panel.webview.postMessage` 发送初始化配置）
  - 确保 `deactivate()` 中调用 `processManager.killAll()`
  - 添加新配置项到 `package.json` 的 `contributes.configuration` 下
- **涉及文件**：`extensions/vscode-dashboard/src/extension.ts`、`extensions/vscode-dashboard/package.json`
- **验收标准**：
  - 扩展激活时无报错
  - 用户输入在前端和后端之间正确流转
  - 进程退出时前端收到通知
  - 配置项（fontSize 等）生效
  - 扩展停用时所有进程被清理
  - `package.json` 中新增 `flowmaster.terminal.fontSize`、`flowmaster.terminal.scrollback`、`flowmaster.terminal.fontFamily`、`flowmaster.terminal.splitRatio` 配置项描述
- **预估工时**：2.5h

### Phase 4：验证

#### T-9：端到端集成测试
- **描述**：验证完整功能链路。测试场景：
  1. 启动扩展，点击卡片 → 终端的命令在 WebView 中执行，输出显示在 xterm 区域
  2. 键盘输入 → 进程 stdin 接收并响应
  3. 拖拽分割线 → 上下栏比例变化，终端自适应
  4. 切换卡片 → 终端重置，新进程绑定
  5. 关闭扩展 → 所有子进程终止
  6. 修改配置项 → 字体大小/样式/回滚行数生效
  7. 进程退出 → 前端显示退出信息
- **涉及文件**：全部变更文件
- **验收标准**：
  - 上述 7 个测试场景全部通过
  - 无未处理的异常或错误日志
  - 内存无泄漏（反复切换卡片后进程 Map 正确清理）
- **预估工时**：2h

---

## 2. 依赖关系图

```
T-1 (安装 xterm 依赖)
  ├── T-6 (script.js 集成 xterm.js)  ─ 前端需要 xterm 库
  └── T-7 (terminalRunner 重构)       ─ 后端需要 xterm 的类型定义

T-2 (processManager 新建)
  ├── T-3 (terminalBridge 新建)       ─ 桥接依赖进程管理
  └── T-7 (terminalRunner 重构)       ─ Runner 依赖进程管理

T-3 (terminalBridge 新建)
  └── T-7 (terminalRunner 重构)       ─ Runner 依赖桥接

T-4 (index.html 分栏布局) ─────────── T-6 (script.js 集成 xterm)
T-5 (style.css 样式) ──────────────── T-6 (script.js 集成 xterm)

T-7 (terminalRunner 重构) ─────────── T-8 (extension.ts 集成)

T-6 (script.js 集成 xterm) ────────── T-9 (端到端测试)
T-8 (extension.ts 集成) ───────────── T-9 (端到端测试)
```

### 并行执行建议

以下任务可并行执行（无相互依赖）：

| 并行组 | 任务 | 理由 |
|--------|------|------|
| 组 A | T-1, T-2 | 互不依赖的基础工作 |
| 组 B | T-4, T-5 | 前端静态结构，互不依赖 |
| 组 C | T-3, T-6, T-7 | T-3 依赖 T-2，T-6 依赖 T-1/T-4/T-5，T-7 依赖 T-1/T-2/T-3 |
| 组 D | T-8 | 依赖 T-7 |
| 组 E | T-9 | 依赖 T-6/T-8 |

---

## 3. 工作量估算

| 任务 | 预估工时 | 并行组 |
|------|---------|--------|
| T-1：安装 xterm 依赖 | 0.5h | A |
| T-2：processManager 新建 | 2h | A |
| T-3：terminalBridge 新建 | 1.5h | C |
| T-4：index.html 分栏布局 | 1h | B |
| T-5：style.css 样式 | 1h | B |
| T-6：script.js 集成 xterm | 3h | C |
| T-7：terminalRunner 重构 | 2h | C |
| T-8：extension.ts 集成 | 2.5h | D |
| T-9：端到端测试 | 2h | E |
| **合计** | **15.5h** | |

### 关键路径（Critical Path）

T-1 → T-6 → T-9 = 3.5h  
T-2 → T-3 → T-7 → T-8 → T-9 = 10h  
T-4 → T-6 → T-9 = 6h  
T-5 → T-6 → T-9 = 6h  

**关键路径长度：10h**（T-2 → T-3 → T-7 → T-8 → T-9）

### 并行优化后最短工期

若 2 人并行开发：
- 开发者 A：T-1(0.5h) → T-6(3h) → T-9(2h) = 5.5h
- 开发者 B：T-2(2h) → T-3(1.5h) → T-7(2h) → T-8(2.5h) = 8h
- 总工期：**8h**（由开发者 B 的串联路径决定）

若 3 人并行开发：
- 开发者 A：T-1(0.5h) → T-6(3h) → T-9(2h) = 5.5h
- 开发者 B：T-2(2h) → T-3(1.5h) → T-7(2h) → T-8(2.5h) = 8h
- 开发者 C：T-4(1h) → T-5(1h) = 2h（完成后可支援 T-6 或 T-8）
- 总工期：**~7h**（T-8 完成后 T-9 启动，T-6 提前完成）
# 任务拆分文档

## Change: vscode-dashboard
## 项目: FlowMaster — OpenFlow 工作流管理平台

---

## 阶段划分概览

| 阶段 | 名称 | 任务数 | 估算总工时 | 交付标准 |
|---|---|---|---|---|
| 1 | Extension 骨架搭建 | 4 | 12h | VSCode 中可执行 `FlowMaster: Open Dashboard` 命令，弹出空白 WebView 面板 |
| 2 | 状态读取与 WebView 渲染 | 5 | 16h | WebView 中正确渲染 `.workflow/state/*.yaml` 的卡片列表，适配深浅主题 |
| 3 | 交互功能 | 3 | 10h | 点击 Run 按钮能启动终端执行命令，点击文件路径能打开对应文件 |
| 4 | 错误处理与打磨 | 4 | 8h | 所有错误状态有 UI 反馈，无运行时崩溃，安装配置完整 |

**总任务数: 16 | 总估算工时: 46h**

---

## 阶段 1: Extension 骨架搭建

### T-1: 项目初始化 (package.json, tsconfig.json, 构建配置)

| 字段 | 内容 |
|---|---|
| **任务编号** | T-1 |
| **任务名称** | 项目初始化 — package.json / tsconfig.json / .vscode/launch.json |
| **所属模块** | 项目根配置 |
| **估算工时** | 3h |
| **前置依赖** | 无 |
| **验收标准** | 1. `package.json` 包含完整的 Extension manifest（name, publisher, activationEvents, contributes.commands, contributes.views, contributes.configuration）<br>2. `tsconfig.json` 配置正确，target ES2020，strict mode 开启，outDir 为 dist<br>3. `.vscode/launch.json` 配置 Extension Host 调试启动项，可 F5 启动<br>4. `npm run compile` 成功输出 dist/extension.js |
| **关联测试用例** | TC-1: 验证 `npm run compile` 编译无报错 |

### T-2: Extension 入口与激活 (extension.ts)

| 字段 | 内容 |
|---|---|
| **任务编号** | T-2 |
| **任务名称** | 实现 extension.ts — activate / deactivate 与命令注册 |
| **所属模块** | `src/extension.ts` |
| **估算工时** | 3h |
| **前置依赖** | T-1 |
| **验收标准** | 1. `activate` 函数注册 `flowmaster.openDashboard` 命令<br>2. 命令调用 `FlowMasterPanel.createOrShow(context)`<br>3. `deactivate` 函数空实现或清理资源<br>4. 侧边栏 ViewContainer 注册 `flowmaster-sidebar` 并绑定相同命令<br>5. 使用 `vscode.commands.registerCommand` 注册，返回值推入 `context.subscriptions` |
| **关联测试用例** | TC-2: F5 启动后执行 `FlowMaster: Open Dashboard` 命令，WebView 面板出现<br>TC-3: 验证命令在命令面板中可搜索到 |

### T-3: WebView 面板管理 (panel.ts)

| 字段 | 内容 |
|---|---|
| **任务编号** | T-3 |
| **任务名称** | 实现 panel.ts — WebView 面板创建、销毁与消息路由 |
| **所属模块** | `src/panel.ts` |
| **估算工时** | 4h |
| **前置依赖** | T-2 |
| **验收标准** | 1. `createOrShow` 方法创建或复用 `vscode.WebviewPanel`，设置 `viewType: 'flowmasterDashboard'`，标题 "FlowMaster Dashboard"<br>2. `getHtmlForWebview` 方法读取 `media/index.html` 并注入 `nonce` 和 `cspSource`<br>3. `_handleWebviewMessage` 方法采用 `switch` 路由 `refreshState` / `runPhase` / `openFile` 三条消息，分别转发给对应模块<br>4. 面板 `onDidDispose` 时清理模块引用<br>5. 消息返回使用 `webview.postMessage`，消息体遵循 { command: string, payload?: any } 格式 |
| **关联测试用例** | TC-4: 面板关闭后重新打开，状态正确恢复 |

### T-4: WebView panel UI 骨架 — 空面板渲染

| 字段 | 内容 |
|---|---|
| **任务编号** | T-4 |
| **任务名称** | WebView 空面板骨架 — HTML / CSS / JS 加载验证 |
| **所属模块** | `media/index.html`, `media/style.css`, `media/script.js` |
| **估算工时** | 2h |
| **前置依赖** | T-3 |
| **验收标准** | 1. `index.html` 引入 `style.css` 和 `script.js`（相对路径 base64 或 nonce 方式）<br>2. `style.css` 设置 `body` 基础样式（`vscode-variable` 系列）<br>3. `script.js` 定义 `onmessage` 处理来自 Extension 的消息，可正确 log<br>4. 打开面板后显示"FlowMaster Dashboard"标题文字，无 404 资源加载错误 |
| **关联测试用例** | TC-5: 打开 WebView，Developer Tools Console 无报错 |

---

## 阶段 2: 状态读取与 WebView 渲染

### T-5: YAML 状态读取器 (stateReader.ts)

| 字段 | 内容 |
|---|---|
| **任务编号** | T-5 |
| **任务名称** | 实现 stateReader.ts — 读取 `.workflow/state/*.yaml` 解析为结构化 JSON |
| **所属模块** | `src/stateReader.ts` |
| **估算工时** | 4h |
| **前置依赖** | T-2 |
| **验收标准** | 1. 通过 `fs.readFileSync` 或 `fs.promises.readFile` 读取 `.workflow/state/` 下所有 `.yaml` 文件<br>2. 使用 `yaml` npm 包解析 YAML 为 JSON 对象<br>3. 返回结构: `{ demands: Array<{ id, name, phase, currentGate, status }> }`<br>4. 处理 `.workflow/state/` 不存在的场景（返回空数组）<br>5. 处理 YAML 解析失败的场景（跳过坏文件，日志警告）<br>6. 提供 `readAllStates(): DemandState[]` 和 `readState(demandId): DemandState | null` 两个导出函数 |
| **关联测试用例** | TC-6: 存在有效的 `.yaml` 文件时，解析结果字段正确<br>TC-7: 目录不存在时返回空数组而非抛异常<br>TC-8: 单个文件 YAML 格式错误时跳过该文件 |

### T-6: WebView 主页面结构 (media/index.html)

| 字段 | 内容 |
|---|---|
| **任务编号** | T-6 |
| **任务名称** | 实现 media/index.html — WebView 主页面结构 |
| **所属模块** | `media/index.html` |
| **估算工时** | 3h |
| **前置依赖** | T-4, T-5 |
| **验收标准** | 1. 包含 `<div id="app">` 作为渲染容器<br>2. 包含刷新按钮（`<button id="refreshBtn">`）<br>3. 需求卡片容器 `<div id="demandList">`<br>4. 空状态提示区域 `<div id="emptyState">`（默认隐藏）<br>5. 错误提示区域 `<div id="errorState">`（默认隐藏）<br>6. 加载状态提示 `<div id="loadingState">`（默认隐藏）<br>7. 使用 `<meta http-equiv="Content-Security-Policy">` 限制 script-src 和 style-src |
| **关联测试用例** | TC-9: 加载 HTML 时所有容器元素存在 |

### T-7: WebView 样式 (media/style.css)

| 字段 | 内容 |
|---|---|
| **任务编号** | T-7 |
| **任务名称** | 实现 media/style.css — 卡片布局与 VSCode 主题适配 |
| **所属模块** | `media/style.css` |
| **估算工时** | 3h |
| **前置依赖** | T-6 |
| **验收标准** | 1. 卡片（.demand-card）为圆角矩形，带阴影，鼠标悬停有上浮效果<br>2. 每张卡片显示: 需求名称 + 当前阶段 + Gate 状态 + 阶段进度条<br>3. Gate 状态使用色块（green=已通过, yellow=等待中, red=打回）<br>4. 使用 `var(--vscode-*)` CSS 变量适配深浅主题（如 `--vscode-editor-background`, `--vscode-editor-foreground`）<br>5. 卡片布局采用 CSS Grid 或 Flex，响应式排列（窗口缩窄自动折行）<br>6. 刷新按钮、空状态、错误状态、加载状态的样式完整 |
| **关联测试用例** | TC-10: 切换 VSCode 深浅主题后卡片颜色自动适配 |

### T-8: WebView 前端逻辑 (media/script.js)

| 字段 | 内容 |
|---|---|
| **任务编号** | T-8 |
| **任务名称** | 实现 media/script.js — 消息处理与 DOM 渲染 |
| **所属模块** | `media/script.js` |
| **估算工时** | 4h |
| **前置依赖** | T-6, T-7 |
| **验收标准** | 1. `window.addEventListener('message', ...)` 处理 `stateUpdated` 事件: 渲染需求卡片列表<br>2. 渲染函数 `renderDemands(demands)` 遍历需求数组创建 `.demand-card` DOM 元素<br>3. 为每个卡片渲染: 需求名称、阶段标签、Gate 状态指示灯、阶段进度条<br>4. 点击卡片上的"Run"按钮发送 `{ command: 'runPhase', payload: { demandId, phase } }` 消息<br>5. 点击文件路径文本发送 `{ command: 'openFile', payload: { filePath } }` 消息<br>6. 点击刷新按钮发送 `{ command: 'refreshState' }` 消息<br>7. 处理空状态（显示"暂无需求"提示）和处理错误状态（显示错误信息）<br>8. 注册 `onStateUpdated` 回调供扩展调用 |
| **关联测试用例** | TC-11: 接收 `stateUpdated` 消息后正确渲染卡片<br>TC-12: 点击"Run"按钮发送正确格式的消息 |

### T-9: Extension → WebView 数据管道集成

| 字段 | 内容 |
|---|---|
| **任务编号** | T-9 |
| **任务名称** | 打通 Extension→WebView 数据管道: 刷新 → 读取 → 推送 |
| **所属模块** | `src/panel.ts`, `src/stateReader.ts`, `media/script.js` |
| **估算工时** | 2h |
| **前置依赖** | T-5, T-8 |
| **验收标准** | 1. panel.ts 处理 `refreshState` 消息时调用 `stateReader.readAllStates()`，返回结果通过 `postMessage({ command: 'stateUpdated', payload: { demands } })` 推送到 WebView<br>2. WebView 侧 `stateUpdated` 消息触发 `renderDemands`，页面显示需求卡片<br>3. 按 F5 启动后首次打开面板自动触发一次 `refreshState`<br>4. 从空目录到数据目录切换后刷新正常 |
| **关联测试用例** | TC-13: 打开面板后自动加载并展示 `.workflow/state/` 中数据<br>TC-14: 点击刷新按钮重新读取并更新界面 |

---

## 阶段 3: 交互功能

### T-10: 终端执行器 (terminalRunner.ts)

| 字段 | 内容 |
|---|---|
| **任务编号** | T-10 |
| **任务名称** | 实现 terminalRunner.ts — 终端创建与命令执行 |
| **所属模块** | `src/terminalRunner.ts` |
| **估算工时** | 4h |
| **前置依赖** | T-2 |
| **验收标准** | 1. `runPhase(demandId, phase): void` 创建或复用 `vscode.Terminal`，执行 `claude /openflow:{phase}`<br>2. 终端命名规范: `FlowMaster: {demandId}`<br>3. 先 `cd` 到当前工作目录根 (`vscode.workspace.workspaceFolders[0].uri.fsPath`)<br>4. 如果已存在同名终端，调用 `show()` 展示而非创建新终端<br>5. `show()` 使终端面板自动弹出到前台<br>6. 提供 `getTerminal(demandId): Terminal | undefined` 供查询 |
| **关联测试用例** | TC-15: 执行 `runPhase` 后终端面板弹出并执行 `claude /openflow:{phase}`<br>TC-16: 再次为同一需求调用 `runPhase`，复用一个终端 |

### T-11: 文件打开器 (fileOpener.ts)

| 字段 | 内容 |
|---|---|
| **任务编号** | T-11 |
| **任务名称** | 实现 fileOpener.ts — 通过 `code -r` 打开文件 |
| **所属模块** | `src/fileOpener.ts` |
| **估算工时** | 3h |
| **前置依赖** | T-2 |
| **验收标准** | 1. `openFile(filePath: string): Promise<void>` 执行 `code -r {filePath}` 打开文件<br>2. 使用 `vscode.commands.executeCommand('vscode.open', ...)` 为主要方式，`code -r` 为备选<br>3. 错误处理: 如果 `code` CLI 不可用，回退到 `vscode.open` URI 方案<br>4. 文件路径相对于工作区根时自动拼接完整路径<br>5. 文件不存在时弹窗提示 `vscode.window.showErrorMessage` |
| **关联测试用例** | TC-17: 调用 `openFile` 在编辑器中打开目标文件<br>TC-18: 不存在的文件路径弹出错误提示 |

### T-12: 端到端交互闭环

| 字段 | 内容 |
|---|---|
| **任务编号** | T-12 |
| **任务名称** | WebView 端 Run 按钮与文件打开按钮交互逻辑联调 |
| **所属模块** | `src/panel.ts`, `src/terminalRunner.ts`, `src/fileOpener.ts`, `media/script.js` |
| **估算工时** | 3h |
| **前置依赖** | T-9, T-10, T-11 |
| **验收标准** | 1. WebView 中点击"Run"按钮 → panel.ts 收到 `runPhase` 消息 → 调用 `terminalRunner.runPhase()` → 终端弹出执行命令<br>2. WebView 中点击文件路径 → panel.ts 收到 `openFile` 消息 → 调用 `fileOpener.openFile()` → 文件在编辑器中打开<br>3. 操作过程中 WebView 显示加载指示器（禁用 Run 按钮防重复点击）<br>4. Extension 侧操作完成后不主动推送消息（被动） |
| **关联测试用例** | TC-19: 端到端 "点击 Run → 终端执行" 流程验证<br>TC-20: 端到端 "点击文件路径 → 文件打开" 流程验证 |

---

## 阶段 4: 错误处理与打磨

### T-13: 错误处理全覆盖

| 字段 | 内容 |
|---|---|
| **任务编号** | T-13 |
| **任务名称** | 错误处理全覆盖 — 空状态 / 解析失败 / 终端失败 / code CLI 不可用 |
| **所属模块** | 全模块 |
| **估算工时** | 3h |
| **前置依赖** | T-12 |
| **验收标准** | 1. **空状态**: `.workflow/state/` 不存在或无 `.yaml` 文件 → 显示 "暂无需求数据" 空状态界面<br>2. **解析失败**: 单个 YAML 文件格式错误 → 跳过该文件，WebView 中显示 "部分需求解析失败" 提示<br>3. **终端失败**: `window.createTerminal` 返回 undefined → WebView 显示 "终端创建失败" 错误<br>4. **code CLI 不可用**: `vscode.open` 无法打开文件 → 弹窗提示 "文件不存在或无法访问"<br>5. 所有错误使用 `vscode.window.showErrorMessage` 或 WebView 内错误区域展示<br>6. 未捕获异常通过 `process.on('uncaughtException')` 或 try-catch 拦截 |
| **关联测试用例** | TC-21: 空目录打开显示空状态<br>TC-22: 损坏 YAML 文件不影响其他需求展示<br>TC-23: 错误信息在 Extension 侧和 WebView 侧均有显示 |

### T-14: 主题适配完善

| 字段 | 内容 |
|---|---|
| **任务编号** | T-14 |
| **任务名称** | 主题适配完善 — VSCode 深浅主题 + 高对比度主题 |
| **所属模块** | `media/style.css` |
| **估算工时** | 2h |
| **前置依赖** | T-7 |
| **验收标准** | 1. 所有颜色值使用 `var(--vscode-*)` CSS 变量，无硬编码颜色<br>2. 适配以下主题族: Dark+ (默认深色), Light+ (默认浅色), High Contrast<br>3. Gate 状态指示灯色块在 HC 模式下增加边框增强对比度<br>4. 按钮 hover/active 状态符合 VSCode 主题语义<br>5. 在 VSCode 主题市场排名前 10 主题下均无明显视觉问题 |
| **关联测试用例** | TC-24: 在 Dark+/Light+/HC 三种主题下视觉检查无异常 |

### T-15: 配置项与 package.json 完善

| 字段 | 内容 |
|---|---|
| **任务编号** | T-15 |
| **任务名称** | 配置项注册 — contributes.configuration 与 contributes.viewsContainers |
| **所属模块** | `package.json` |
| **估算工时** | 1h |
| **前置依赖** | T-1 |
| **验收标准** | 1. `contributes.configuration` 注册 `flowmaster.statePath`（默认 `.workflow/state`），允许用户自定义状态目录路径<br>2. `contributes.configuration` 注册 `flowmaster.autoRefresh`（布尔，默认 true），控制打开面板是否自动刷新<br>3. `contributes.viewsContainers` 注册侧边栏标签 "FlowMaster"<br>4. `contributes.views` 注册侧边栏视图 "Dashboard"<br>5. 配置变化通过 `vscode.workspace.onDidChangeConfiguration` 监听并通知 WebView |
| **关联测试用例** | TC-25: 修改 `flowmaster.statePath` 配置后刷新面板读取新路径<br>TC-26: 侧边栏视图显示 "FlowMaster" 标签 |

### T-16: 安装与使用说明

| 字段 | 内容 |
|---|---|
| **任务编号** | T-16 |
| **任务名称** | 编写安装与使用说明 |
| **所属模块** | README.md |
| **估算工时** | 2h |
| **前置依赖** | T-15 |
| **验收标准** | 1. README.md 包含: 功能概述、安装步骤、使用说明、配置项说明、常见问题<br>2. 安装步骤涵盖: `npm install` → `npm run compile` → F5 调试 / 打包 vsix<br>3. 使用说明包含: 打开面板方式、界面布局说明、操作指引<br>4. 常见问题包含: 状态目录不存在、终端未执行、文件无法打开等解决方法<br>5. 包含可工作的截图或 GIF 演示 |
| **关联测试用例** | TC-27: 按照 README 步骤操作后 Extension 正常工作 |

---

## 任务依赖关系图

```
T-1 (项目初始化)
 └─ T-2 (extension.ts)
     ├─ T-3 (panel.ts)
     │   └─ T-4 (WebView 骨架)
     │       ├─ T-6 (index.html)
     │       │   └─ T-7 (style.css)
     │       │       └─ T-14 (主题完善)
     │       └─ T-8 (script.js)
     │           └─ T-9 (数据管道集成) ← T-5 (stateReader.ts)
     │               └─ T-12 (端到端交互) ← T-10 (terminalRunner.ts)
     │                                       └─ T-11 (fileOpener.ts)
     │                   └─ T-13 (错误处理)
     │                       └─ T-15 (配置项)
     │                           └─ T-16 (README)
     └─ T-5 (stateReader.ts) ──→ T-9
     └─ T-10 (terminalRunner.ts) ──→ T-12
     └─ T-11 (fileOpener.ts) ──→ T-12
```

---

## 测试用例总览

| 编号 | 名称 | 关联任务 | 类型 |
|---|---|---|---|
| TC-1 | 编译验证 | T-1 | 构建 |
| TC-2 | 命令执行打开面板 | T-2 | 功能 |
| TC-3 | 命令面板可搜索 | T-2 | 功能 |
| TC-4 | 面板关闭后重新打开恢复 | T-3 | 功能 |
| TC-5 | Console 无报错 | T-4 | 稳定性 |
| TC-6 | YAML 解析正确性 | T-5 | 单元 |
| TC-7 | 目录不存在返回空数组 | T-5 | 边界 |
| TC-8 | 损坏 YAML 跳过不崩溃 | T-5 | 边界 |
| TC-9 | HTML 容器元素存在 | T-6 | 功能 |
| TC-10 | 深浅主题颜色适配 | T-7, T-14 | UI |
| TC-11 | stateUpdated 消息渲染卡片 | T-8 | 功能 |
| TC-12 | Run 按钮消息格式 | T-8 | 功能 |
| TC-13 | 面板打开自动加载数据 | T-9 | 集成 |
| TC-14 | 刷新按钮重新加载 | T-9 | 集成 |
| TC-15 | 终端执行命令 | T-10 | 功能 |
| TC-16 | 复用同名终端 | T-10 | 功能 |
| TC-17 | 文件打开 | T-11 | 功能 |
| TC-18 | 不存在文件弹窗 | T-11 | 边界 |
| TC-19 | 端到端 Run 流程 | T-12 | E2E |
| TC-20 | 端到端文件打开流程 | T-12 | E2E |
| TC-21 | 空目录显示空状态 | T-13 | UI |
| TC-22 | 损坏 YAML 不影响其他 | T-13 | 边界 |
| TC-23 | 错误信息多处展示 | T-13 | UI |
| TC-24 | 三主题视觉检查 | T-14 | UI |
| TC-25 | 配置变更生效 | T-15 | 功能 |
| TC-26 | 侧边栏视图显示 | T-15 | UI |
| TC-27 | README 步骤验证 | T-16 | 文档 |

---

## 风险管理

| 风险 | 影响 | 概率 | 缓解措施 |
|---|---|---|---|
| YAML 解析库选择不当（npm 包兼容性问题） | T-5 延误 | 低 | 优先使用 `js-yaml`（成熟稳定），备选 `yaml` |
| VSCode WebView CSP 限制导致资源加载失败 | T-6 延误 | 中 | 使用 `getWebviewOptions` 注入 nonce，严格 CSP 测试 |
| 终端执行 `claude` 命令不在 PATH 中 | T-10 无法使用 | 中 | 增加 PATH 检测，提示用户安装 Claude CLI |
| VSCode 不同版本 API 兼容性 | T-2/T-3 兼容 | 低 | 锁定 `engines.vscode: ^1.85.0`，使用稳定 API |
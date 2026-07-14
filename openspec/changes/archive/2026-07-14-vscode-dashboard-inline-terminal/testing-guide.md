# VSCode Dashboard Inline Terminal — 测试方案文档

---

## 1. 测试范围

本次变更涵盖以下测试域：

| 测试域 | 涉及模块 | 说明 |
|--------|----------|------|
| **分栏布局** | `media/style.css`, `media/script.js` | 上下分栏 Flexbox 布局，默认 60/40 比例 |
| **拖拽分割线** | `media/script.js` | 鼠标拖拽调整上下比例，最小尺寸约束 |
| **xterm.js 终端渲染** | `media/script.js`, `media/xterm.js` | xterm.js 初始化、ANSI/Unicode 支持、主题集成 |
| **进程管理** | `src/processManager.ts` | `child_process.spawn` 生命周期管理，Map 维护 |
| **终端桥接** | `src/terminalBridge.ts` | stdio 流与 postMessage 消息的双向转换 |
| **消息协议** | `src/extension.ts`, `src/terminalBridge.ts`, `media/script.js` | 新增 5 种消息的收发处理 |
| **终端切换** | `src/extension.ts`, `media/script.js` | 切换卡片时切换终端会话，历史缓冲保留 |
| **配置项** | `src/extension.ts`, `package.json` | fontSize、scrollback、fontFamily 等 5 项配置 |
| **依赖集成** | `package.json`, `media/` | xterm、xterm-addon-fit、xterm-addon-web-links |
| **进程清理** | `src/processManager.ts` | 进程退出自动清理、Extension 停用清理 |
| **错误处理** | 全链路 | 4 类错误场景覆盖 |

---

## 2. 测试策略

| 类型 | 覆盖目标 | 工具/方法 | 预估覆盖率 |
|------|----------|-----------|-----------|
| **单元测试 (UT)** | ProcessManager 核心逻辑（spawn、kill、Map 操作）、TerminalBridge 消息格式转换、配置项解析、xtermManager 初始化参数 | Vitest + tsx，mock `child_process` 和 `postMessage` | ~80% 逻辑代码 |
| **集成测试 (IT)** | 消息协议端到端（WebView -> Host -> Process -> WebView）、终端切换数据流、配置项生效、进程退出清理 | Vitest + mock WebView/Host 通道 | ~60% 通信路径 |
| **手动测试 (Manual)** | 分栏布局 UI 渲染、拖拽交互体验、xterm.js 视觉呈现、主题集成效果、多终端切换视觉验证 | VSCode Extension Debugger (F5) + WebView Developer Tools | ~100% UI 层 |

---

## 3. 测试场景清单

### 3.1 分栏布局与拖拽分割线 (Layout)

#### TC-LAYOUT-001: 默认分栏比例
| 字段 | 值 |
|------|-----|
| **前置条件** | WebView 面板首次加载 |
| **测试步骤** | 1. 打开 Dashboard 面板<br>2. 使用 WebView Developer Tools 检查布局 |
| **预期结果** | 上半卡片区域占 60%，下半终端区域占 40%；4px 分割线可见；hover 时 cursor 变为 row-resize |
| **类型** | Manual |

#### TC-LAYOUT-002: 拖拽分割线调整比例
| 字段 | 值 |
|------|-----|
| **前置条件** | 面板已加载，默认 60/40 分栏 |
| **测试步骤** | 1. 鼠标点击分割线<br>2. 向上拖拽 100px<br>3. 释放鼠标 |
| **预期结果** | 上半区域缩小，下半区域增大；`fit.fit()` 被调用；`terminalResize` 消息发送到 Extension Host |
| **类型** | Manual |

#### TC-LAYOUT-003: 拖拽到终端最小尺寸限制
| 字段 | 值 |
|------|-----|
| **前置条件** | 面板已加载 |
| **测试步骤** | 1. 向下拖拽分割线，使终端区域接近 80px<br>2. 继续拖拽试图低于 80px |
| **预期结果** | 分割线在终端区域 80px 处停止，终端不被隐藏或折叠 |
| **类型** | Manual |

#### TC-LAYOUT-004: 拖拽到卡片最小尺寸限制
| 字段 | 值 |
|------|-----|
| **前置条件** | 面板已加载 |
| **测试步骤** | 1. 向上拖拽分割线，使卡片区域接近 100px<br>2. 继续拖拽试图低于 100px |
| **预期结果** | 分割线在卡片区域 100px 处停止，卡片不被隐藏或折叠 |
| **类型** | Manual |

#### TC-LAYOUT-005: 分割线视觉反馈
| 字段 | 值 |
|------|-----|
| **前置条件** | 面板已加载 |
| **测试步骤** | 1. 将鼠标悬停在分割线上<br>2. 点击并按住分割线 |
| **预期结果** | hover 时 cursor 为 row-resize；分割线颜色变化（对比色 hover 状态）；active 时颜色加深 |
| **类型** | Manual |

---

### 3.2 xterm.js 终端渲染 (Terminal)

#### TC-TERM-001: xterm.js 正常初始化
| 字段 | 值 |
|------|-----|
| **前置条件** | 面板已加载，xterm 依赖已正确安装 |
| **测试步骤** | 1. 打开面板<br>2. 检查终端容器 DOM 元素 |
| **预期结果** | 终端区域渲染 xterm.js 实例，显示终端光标，空白终端可用 |
| **类型** | Manual |

#### TC-TERM-002: ANSI 转义序列渲染
| 字段 | 值 |
|------|-----|
| **前置条件** | 面板已打开，Extension Host 已连接 |
| **测试步骤** | 1. 模拟发送含 ANSI 颜色的 `terminalOutput` 消息（如 `\x1b[31mRed text\x1b[0m`）<br>2. 观察终端显示 |
| **预期结果** | 红色文字正确渲染，颜色恢复后正常 |
| **类型** | UT |

#### TC-TERM-003: Unicode 字符支持
| 字段 | 值 |
|------|-----|
| **前置条件** | 面板已打开 |
| **测试步骤** | 1. 模拟发送含 Unicode 字符的 `terminalOutput` 消息（如中文、日文、Emoji） |
| **预期结果** | Unicode 字符正确渲染，无乱码 |
| **类型** | UT |

#### TC-TERM-004: xterm-addon-fit 自适应
| 字段 | 值 |
|------|-----|
| **前置条件** | 面板已打开，终端实例已初始化 |
| **测试步骤** | 1. 调用 `fit.fit()`<br>2. 检查 terminal.cols 和 terminal.rows |
| **预期结果** | cols 和 rows 与容器尺寸匹配，终端内容自适应 |
| **类型** | UT |

#### TC-TERM-005: xterm-addon-web-links 链接点击
| 字段 | 值 |
|------|-----|
| **前置条件** | 面板已打开，xterm 已初始化 |
| **测试步骤** | 1. 模拟发送含 URL 的 `terminalOutput` 消息（如 `https://github.com/user/repo`）<br>2. 鼠标悬停并点击链接 |
| **预期结果** | URL 渲染为可点击链接，点击后通过 `vscode.env.openExternal` 在默认浏览器打开 |
| **类型** | Manual |

#### TC-TERM-006: 终端主题集成 — 暗色主题
| 字段 | 值 |
|------|-----|
| **前置条件** | VSCode 使用暗色主题（如 Dark+），`terminal.background: #1e1e1e` |
| **测试步骤** | 1. 打开面板<br>2. 检查终端背景色和前景色 |
| **预期结果** | 终端背景为 `#1e1e1e`，前景色匹配主题，ANSI 颜色匹配主题调色板 |
| **类型** | Manual |

#### TC-TERM-007: 终端主题集成 — 亮色主题
| 字段 | 值 |
|------|-----|
| **前置条件** | VSCode 使用亮色主题 |
| **测试步骤** | 1. 打开面板<br>2. 检查终端颜色 |
| **预期结果** | 终端颜色跟随亮色主题，可读性良好 |
| **类型** | Manual |

#### TC-TERM-008: 主题变量缺失时回退默认
| 字段 | 值 |
|------|-----|
| **前置条件** | 模拟 CSS 变量不可用场景 |
| **测试步骤** | 1. 清除 `--vscode-terminal-*` CSS 变量<br>2. 初始化 xterm |
| **预期结果** | xterm 使用默认主题，不崩溃 |
| **类型** | UT |

---

### 3.3 进程管理 (ProcessManager)

#### TC-PM-001: 正常 spawn 进程
| 字段 | 值 |
|------|-----|
| **前置条件** | `claude` 命令可用且在 PATH 中 |
| **测试步骤** | 1. 调用 `processManager.spawn("change-1", "claude", ["/openflow:design", "change-1"], "cwd")` |
| **预期结果** | 子进程成功创建，返回 ChildProcess 对象，Map 中存储该进程 |
| **类型** | UT |

#### TC-PM-002: 进程 Map 维护
| 字段 | 值 |
|------|-----|
| **前置条件** | 已为 change-1 和 change-2 各 spawn 一个进程 |
| **测试步骤** | 1. 调用 `processManager.getProcess("change-1")`<br>2. 调用 `processManager.getProcess("change-2")`<br>3. 调用 `processManager.getProcess("nonexistent")` |
| **预期结果** | change-1 和 change-2 返回对应进程对象；nonexistent 返回 null |
| **类型** | UT |

#### TC-PM-003: kill 指定进程
| 字段 | 值 |
|------|-----|
| **前置条件** | change-1 有运行中的进程 |
| **测试步骤** | 1. 调用 `processManager.killProcess("change-1")` |
| **预期结果** | 进程收到 SIGTERM（Windows 上 taskkill）；进程从 Map 中移除 |
| **类型** | UT |

#### TC-PM-004: killAll 清理所有进程
| 字段 | 值 |
|------|-----|
| **前置条件** | 多个进程正在运行 |
| **测试步骤** | 1. 调用 `processManager.killAll()` |
| **预期结果** | 所有子进程被终止；Map 清空 |
| **类型** | UT |

#### TC-PM-005: 进程退出自动清理
| 字段 | 值 |
|------|-----|
| **前置条件** | 子进程正在运行，监听 'close' 事件 |
| **测试步骤** | 1. 模拟子进程退出（exit code 0）<br>2. 检查 Map 状态 |
| **预期结果** | 进程从 Map 中移除；`terminalExit` 消息发送到 WebView |
| **类型** | UT |

#### TC-PM-006: 重复 spawn 同一 change
| 字段 | 值 |
|------|-----|
| **前置条件** | change-1 已有运行中的进程 |
| **测试步骤** | 1. 再次调用 `processManager.spawn("change-1", ...)` |
| **预期结果** | 原进程被 kill；新进程被创建并存储 |
| **类型** | UT |

#### TC-PM-007: Extension 停用时清理
| 字段 | 值 |
|------|-----|
| **前置条件** | Extension 激活，有进程在运行 |
| **测试步骤** | 1. 调用 `processManager.dispose()` 或 Extension deactivate |
| **预期结果** | 所有子进程被 kill；无残留进程 |
| **类型** | UT |

#### TC-PM-008: 跨平台 spawn 兼容性
| 字段 | 值 |
|------|-----|
| **前置条件** | 测试环境为 Windows / Linux / macOS |
| **测试步骤** | 1. 在各平台上 spawn `claude` 命令<br>2. 检查命令执行结果 |
| **预期结果** | Windows 上 `shell: true` 生效；Linux/macOS 上正常运行；`claude` 命令可执行 |
| **类型** | IT |

---

### 3.4 终端桥接 (TerminalBridge)

#### TC-TB-001: stdout 数据转发
| 字段 | 值 |
|------|-----|
| **前置条件** | ProcessManager 返回 mock 子进程 |
| **测试步骤** | 1. 模拟 stdout 流产生数据 `"Hello World\n"` |
| **预期结果** | 发送 `terminalOutput` 消息，payload 包含 `{ changeId, data: "Hello World\n" }` |
| **类型** | UT |

#### TC-TB-002: stderr 数据转发
| 字段 | 值 |
|------|-----|
| **前置条件** | ProcessManager 返回 mock 子进程 |
| **测试步骤** | 1. 模拟 stderr 流产生数据 `"Error: something\n"` |
| **预期结果** | 发送 `terminalOutput` 消息，与 stdout 走相同通道 |
| **类型** | UT |

#### TC-TB-003: 进程退出消息转发
| 字段 | 值 |
|------|-----|
| **前置条件** | 子进程正在运行 |
| **测试步骤** | 1. 模拟子进程退出，code=0<br>2. 模拟子进程退出，code=1 |
| **预期结果** | 发送 `terminalExit` 消息，code 分别为 0 和 1 |
| **类型** | UT |

#### TC-TB-004: 进程启动失败消息转发
| 字段 | 值 |
|------|-----|
| **前置条件** | `spawn` 抛出异常 |
| **测试步骤** | 1. 模拟 `ENOENT` 错误 |
| **预期结果** | 发送 `terminalError` 消息，包含错误描述 |
| **类型** | UT |

#### TC-TB-005: terminalInput 消息转发到 stdin
| 字段 | 值 |
|------|-----|
| **前置条件** | 子进程正在运行，stdin 可写 |
| **测试步骤** | 1. 模拟收到 `terminalInput` 消息 `{ changeId: "c1", data: "ls\n" }` |
| **预期结果** | 子进程的 stdin.write("ls\n") 被调用 |
| **类型** | UT |

#### TC-TB-006: terminalResize 消息转发
| 字段 | 值 |
|------|-----|
| **前置条件** | 子进程正在运行 |
| **测试步骤** | 1. 模拟收到 `terminalResize` 消息 `{ changeId: "c1", cols: 80, rows: 24 }` |
| **预期结果** | 子进程 PTY 尺寸被调整（如适用） |
| **类型** | UT |

---

### 3.5 终端切换 (Terminal Switching)

#### TC-SWITCH-001: 切换卡片切换终端
| 字段 | 值 |
|------|-----|
| **前置条件** | change-A 有活跃终端会话，输出 "Output from A"；change-B 有活跃终端会话，输出 "Output from B" |
| **测试步骤** | 1. 点击卡片 B<br>2. 观察终端区域 |
| **预期结果** | 终端区域清空并显示 "Output from B"（完整历史缓冲） |
| **类型** | Manual |

#### TC-SWITCH-002: 切换回原卡片恢复历史
| 字段 | 值 |
|------|-----|
| **前置条件** | 已完成 TC-SWITCH-001，当前显示卡片 B |
| **测试步骤** | 1. 点击卡片 A<br>2. 观察终端区域 |
| **预期结果** | 终端区域清空并显示 "Output from A" 的完整历史 |
| **类型** | Manual |

#### TC-SWITCH-003: 切换到无活动会话的卡片
| 字段 | 值 |
|------|-----|
| **前置条件** | change-A 有活跃终端；change-C 从未运行过 |
| **测试步骤** | 1. 点击卡片 C |
| **预期结果** | 终端区域显示占位消息 "Click 'Run' to start execution for this demand." |
| **类型** | Manual |

#### TC-SWITCH-004: 切换时后台进程继续运行
| 字段 | 值 |
|------|-----|
| **前置条件** | change-A 进程正在运行 |
| **测试步骤** | 1. 切换到卡片 B<br>2. 等待数秒<br>3. 切换回卡片 A |
| **预期结果** | 切换回卡片 A 时，终端显示在后台累积的完整输出 |
| **类型** | Manual |

#### TC-SWITCH-005: 多终端缓冲区独立
| 字段 | 值 |
|------|-----|
| **前置条件** | change-A 和 change-B 都有运行中的进程 |
| **测试步骤** | 1. 在卡片 A 下查看终端输出<br>2. 切换到卡片 B<br>3. 切回卡片 A |
| **预期结果** | 每次切换，各卡片终端显示其自身的完整输出，互不混淆 |
| **类型** | IT |

---

### 3.6 消息协议 (Message Protocol)

#### TC-MSG-001: terminalOutput 消息接收处理
| 字段 | 值 |
|------|-----|
| **前置条件** | WebView 已初始化，xterm 实例已创建 |
| **测试步骤** | 1. Extension Host 发送 `{ command: "terminalOutput", changeId: "c1", data: "Hello" }` |
| **预期结果** | xterm.write("Hello") 被调用，终端显示该文本 |
| **类型** | UT |

#### TC-MSG-002: terminalExit 消息接收处理
| 字段 | 值 |
|------|-----|
| **前置条件** | 面板已打开，终端正在显示输出 |
| **测试步骤** | 1. Extension Host 发送 `{ command: "terminalExit", changeId: "c1", code: 0 }` |
| **预期结果** | 终端显示 "Process exited with code 0"；Run 按钮重新启用 |
| **类型** | UT |

#### TC-MSG-003: terminalError 消息接收处理
| 字段 | 值 |
|------|-----|
| **前置条件** | 面板已打开 |
| **测试步骤** | 1. Extension Host 发送 `{ command: "terminalError", changeId: "c1", message: "Error msg" }` |
| **预期结果** | 终端红色文字显示错误消息；Run 按钮重新启用 |
| **类型** | UT |

#### TC-MSG-004: terminalResize 消息发送
| 字段 | 值 |
|------|-----|
| **前置条件** | 面板已打开，终端已初始化 |
| **测试步骤** | 1. 拖拽分割线或调整面板大小<br>2. 检查发送的 postMessage |
| **预期结果** | 发送 `{ command: "terminalResize", changeId: "c1", cols: N, rows: M }`，数值正确 |
| **类型** | IT |

#### TC-MSG-005: switchTerminal 消息发送
| 字段 | 值 |
|------|-----|
| **前置条件** | 面板已打开，多张卡片已渲染 |
| **测试步骤** | 1. 点击卡片 B |
| **预期结果** | 发送 `{ command: "switchTerminal", changeId: "c2" }` |
| **类型** | IT |

#### TC-MSG-006: runPhase 消息触发 spawn
| 字段 | 值 |
|------|-----|
| **前置条件** | Extension Host 已启动，ProcessManager 已初始化 |
| **测试步骤** | 1. WebView 发送 `{ command: "runPhase", demandId: "c1", phase: "design" }` |
| **预期结果** | `processManager.spawn("c1", "claude", ["/openflow:design", "c1"], cwd)` 被调用 |
| **类型** | IT |

---

### 3.7 配置项 (Configuration)

#### TC-CONFIG-001: fontSize 配置生效
| 字段 | 值 |
|------|-----|
| **前置条件** | 设置 `flowmaster.terminal.fontSize: 18` |
| **测试步骤** | 1. 打开面板<br>2. 检查终端字体大小 |
| **预期结果** | 终端字号为 18px |
| **类型** | Manual |

#### TC-CONFIG-002: scrollback 配置生效
| 字段 | 值 |
|------|-----|
| **前置条件** | 设置 `flowmaster.terminal.scrollback: 5000` |
| **测试步骤** | 1. 打开面板<br>2. 检查 xterm 初始化参数 |
| **预期结果** | xterm 初始化时 `scrollback: 5000` |
| **类型** | UT |

#### TC-CONFIG-003: fontFamily 配置生效
| 字段 | 值 |
|------|-----|
| **前置条件** | 设置 `flowmaster.terminal.fontFamily: '"Fira Code", monospace'` |
| **测试步骤** | 1. 打开面板<br>2. 检查终端字体 |
| **预期结果** | 终端使用 "Fira Code" 字体渲染 |
| **类型** | Manual |

#### TC-CONFIG-004: splitRatio 配置生效
| 字段 | 值 |
|------|-----|
| **前置条件** | 设置 `flowmaster.terminal.splitRatio: 0.5` |
| **测试步骤** | 1. 打开面板<br>2. 检查上下区域比例 |
| **预期结果** | 上半和下半各占 50% |
| **类型** | Manual |

#### TC-CONFIG-005: 跨平台 Shell 兼容性
| 字段 | 值 |
|------|-----|
| **前置条件** | Windows 环境 |
| **测试步骤** | 1. 点击 Run 按钮<br>2. 检查 spawn 参数 |
| **预期结果** | `spawn` 调用包含 `shell: true`（Windows 上）或 `shell: false`（Unix 上） |
| **类型** | IT |

#### TC-CONFIG-006: 配置缺失时使用默认值
| 字段 | 值 |
|------|-----|
| **前置条件** | 未设置任何 flowmaster.terminal 配置 |
| **测试步骤** | 1. 打开面板<br>2. 检查各配置项 |
| **预期结果** | fontSize=14, scrollback=1000, fontFamily=Consolas, splitRatio=0.6 |
| **类型** | UT |

---

### 3.8 进程退出与清理 (Cleanup)

#### TC-CLEAN-001: 正常退出 (exit code 0)
| 字段 | 值 |
|------|-----|
| **前置条件** | 子进程正在运行 |
| **测试步骤** | 1. 模拟子进程正常退出，code=0 |
| **预期结果** | Map 移除进程；`terminalExit { code: 0 }` 发送；WebView 显示 "Process exited with code 0"；Run 按钮重新启用 |
| **类型** | UT |

#### TC-CLEAN-002: 异常退出 (exit code 1)
| 字段 | 值 |
|------|-----|
| **前置条件** | 子进程正在运行 |
| **测试步骤** | 1. 模拟子进程异常退出，code=1 |
| **预期结果** | Map 移除进程；`terminalExit { code: 1 }` 发送；WebView 黄色文字显示 "Process exited with code 1"；终端保留所有输出 |
| **类型** | UT |

#### TC-CLEAN-003: 进程被信号终止
| 字段 | 值 |
|------|-----|
| **前置条件** | 子进程正在运行 |
| **测试步骤** | 1. 模拟进程被 SIGTERM 终止，code=null |
| **预期结果** | Map 移除进程；`terminalExit { code: null }` 发送 |
| **类型** | UT |

#### TC-CLEAN-004: 退出后缓冲保留
| 字段 | 值 |
|------|-----|
| **前置条件** | 子进程已退出，停留在卡片 A |
| **测试步骤** | 1. 切换到卡片 B<br>2. 切回卡片 A |
| **预期结果** | 卡片 A 的终端显示完整的历史输出，包含退出信息 |
| **类型** | IT |

---

### 3.9 错误处理 (Error Handling)

#### TC-ERR-001: 进程启动失败 (ENOENT)
| 字段 | 值 |
|------|-----|
| **前置条件** | `claude` 命令不在 PATH 中 |
| **测试步骤** | 1. 点击 Run 按钮 |
| **预期结果** | Extension Host 捕获 `ENOENT`，不崩溃；发送 `terminalError` 消息 "Command 'claude' not found. Please ensure Claude Code is installed and in your PATH."；WebView 红字显示该消息；Run 按钮重新启用 |
| **类型** | IT |

#### TC-ERR-002: xterm 初始化失败
| 字段 | 值 |
|------|-----|
| **前置条件** | 终端容器 DOM 元素缺失或异常 |
| **测试步骤** | 1. 移除终端容器元素<br>2. 初始化 xterm |
| **预期结果** | WebView 显示 fallback 文字 "Terminal failed to initialize"；发送 `error` 消息到 Extension Host |
| **类型** | UT |

#### TC-ERR-003: 进程异常退出 (非零)
| 字段 | 值 |
|------|-----|
| **前置条件** | 子进程正在运行 |
| **测试步骤** | 1. 模拟 exit code = 2 |
| **预期结果** | 黄色文字显示 "Process exited with code 2"；所有输出保留；Run 按钮重新启用 |
| **类型** | UT |

#### TC-ERR-004: spawn 命令路径错误
| 字段 | 值 |
|------|-----|
| **前置条件** | `claude` 路径无效 |
| **测试步骤** | 1. 尝试 spawn 不存在的路径 |
| **预期结果** | 捕获异常，发送 `terminalError`，Extension 不崩溃 |
| **类型** | UT |

#### TC-ERR-005: 面板隐藏时进程继续运行
| 字段 | 值 |
|------|-----|
| **前置条件** | 子进程正在运行 |
| **测试步骤** | 1. 切换到其他 VSCode 标签页（面板隐藏）<br>2. 等待数秒<br>3. 切换回面板 |
| **预期结果** | 进程在后台继续运行；面板恢复时，终端显示累积的完整输出 |
| **类型** | Manual |

---

### 3.10 集成测试 (Integration)

#### TC-INT-001: 端到端 Run 流程
| 字段 | 值 |
|------|-----|
| **前置条件** | 项目存在 `.workflow/state/*.yaml` 文件，`claude` 命令可用 |
| **测试步骤** | 1. 打开面板<br>2. 点击某张卡片的 Run 按钮<br>3. 观察终端区域 |
| **预期结果** | 终端区域显示 "Starting..." 等输出；`claude` 命令在终端中实时显示输出；Run 按钮变为 "Running..." |
| **类型** | Manual |

#### TC-INT-002: 多卡片交叉操作
| 字段 | 值 |
|------|-----|
| **前置条件** | 2 张以上卡片，`claude` 命令可用 |
| **测试步骤** | 1. 对卡片 A 点击 Run<br>2. 切换至卡片 B，点击 Run<br>3. 切换回卡片 A |
| **预期结果** | 卡片 A 和 B 各自独立运行，互不干扰；切换时终端显示对应卡片的输出；后台进程持续运行 |
| **类型** | Manual |

#### TC-INT-003: 面板 resize 后终端自适应
| 字段 | 值 |
|------|-----|
| **前置条件** | 面板已打开，终端有输出 |
| **测试步骤** | 1. 拖拽 VSCode 侧边栏宽度调整面板大小 |
| **预期结果** | 终端列数和行数自适应调整；`fit.fit()` 被调用；`terminalResize` 消息发送 |
| **类型** | Manual |

#### TC-INT-004: 面板重新打开后终端恢复
| 字段 | 值 |
|------|-----|
| **前置条件** | 面板曾打开过，进程已退出 |
| **测试步骤** | 1. 关闭面板<br>2. 重新打开面板 |
| **预期结果** | 面板正常加载，终端区域显示初始占位消息；无残留进程 |
| **类型** | Manual |

#### TC-INT-005: 同一卡片重复 Run
| 字段 | 值 |
|------|-----|
| **前置条件** | 卡片 A 正在运行 |
| **测试步骤** | 1. 再次点击卡片 A 的 Run 按钮 |
| **预期结果** | 原进程被 kill；新进程启动；终端清空并显示新输出 |
| **类型** | Manual |

---

## 4. 边界条件测试

| 编号 | 边界条件 | 模块 | 预期行为 |
|------|----------|------|----------|
| BND-01 | 50 个需求卡片同时存在，各自有独立终端 | processManager | 50 个独立进程运行，不互相阻塞，内存占用可控 |
| BND-02 | 单次终端输出数据量超过 64KB | terminalBridge | 自动分片或流式传输，不丢失数据，不阻塞 |
| BND-03 | 拖拽分割线使终端区域正好 80px | layout | 终端正常渲染，内容可读，`fit.fit()` 返回非零尺寸 |
| BND-04 | 拖拽分割线使卡片区域正好 100px | layout | 卡片内容可滚动，无布局断裂 |
| BND-05 | 连续快速切换卡片 10 次/秒 | terminalSwitch | 终端重建稳定，无崩溃或状态丢失 |
| BND-06 | 终端 scrollback 为 0（极限值） | configuration | xterm 初始化成功，scrollback 值为 0 或无滚动缓冲 |
| BND-07 | fontFamily 配置为无效字体名 | configuration | 回退到系统默认等宽字体，不崩溃 |
| BND-08 | splitRatio 为 0.0（全卡片） | configuration | 终端区域隐藏或最小高度，卡片区域占满 |
| BND-09 | splitRatio 为 1.0（全终端） | configuration | 卡片区域隐藏或最小高度，终端区域占满 |
| BND-10 | changeId 含特殊字符（`/`, `\`, `#`, `?`, `&`） | processManager | Map 操作正常，命令执行正常 |
| BND-11 | 同时收到 100 条连续 terminalOutput 消息 | terminalBridge | 消息按序写入 xterm，不丢失，不卡顿 |
| BND-12 | 终端输出包含超长行（>10000 字符） | xterm | xterm 正常换行渲染，不卡顿 |

---

## 5. 错误场景测试

| 编号 | 错误场景 | 模块 | 预期行为 |
|------|----------|------|----------|
| ERR-01 | `child_process.spawn` 抛出 ENOENT | processManager | 捕获异常，发送 `terminalError`，Extension 不崩溃 |
| ERR-02 | `child_process.spawn` 抛出 EACCES | processManager | 捕获异常，发送 `terminalError` 含权限错误描述 |
| ERR-03 | `child_process.spawn` 抛出 EMFILE（进程数超限） | processManager | 捕获异常，发送 `terminalError`，提示用户关闭部分进程 |
| ERR-04 | 子进程写入 stdout 时 WebView 面板已关闭 | terminalBridge | 丢弃消息，不抛出异常 |
| ERR-05 | xterm 初始化时 `Terminal` 构造函数抛出异常 | xtermManager | try-catch 捕获，显示 fallback 文字 |
| ERR-06 | postMessage 发送时 WebView 已销毁 | extension.ts | 捕获异常，静默忽略 |
| ERR-07 | 进程已退出后收到 terminalInput 消息 | terminalBridge | 忽略写入，不抛出异常 |
| ERR-08 | 配置项类型错误（如 fontSize 设为字符串 "abc"） | configuration | 使用默认值，记录警告日志 |
| ERR-09 | 多次调用 `deactivate()` 导致重复清理 | processManager | 幂等清理，第二次调用无副作用 |
| ERR-10 | 在进程启动过程中快速切换卡片 | terminalSwitch | 等待当前进程启动完成，或优雅取消，不残留孤儿进程 |
| ERR-11 | 终端容器 resize 时 xterm 尚未初始化 | layout | 跳过 `fit.fit()` 调用，不抛出异常 |
| ERR-12 | 全局 CSS 变量 `--vscode-terminal-*` 返回空字符串 | theme | 回退到 xterm 默认主题，不崩溃 |
| ERR-13 | `claude` 命令超时无响应（长时间无输出） | processManager | 保持进程运行，不主动 kill，终端维持等待状态 |
| ERR-14 | 多个 change 同时发起 spawn 竞争 | processManager | 每个 spawn 独立创建，Map 写入正确，无竞争条件 |
| ERR-15 | 拖拽分割线时 WebView 面板被关闭 | layout | mouseup 事件不触发，无残留事件监听器 |

---

## 6. 环境要求

### 6.1 操作系统兼容性

| 操作系统 | 测试要求 | 特殊注意事项 |
|----------|----------|--------------|
| **Windows 10/11** | 必须测试 | `shell: true` 生效；`claude.cmd` 后缀处理；`conpty` 兼容性 |
| **macOS 12+** | 必须测试 | `spawn` 默认路径行为；`SIGTERM` 处理 |
| **Ubuntu 20.04+ / Debian** | 推荐测试 | 与 CI 环境一致；`spawn` 路径兼容性 |

### 6.2 软件版本要求

| 项目 | 最低版本 | 测试版本 |
|------|----------|----------|
| Node.js | v18.x LTS | v18.20+ / v20.10+ |
| VSCode | v1.85.0 | v1.85+ |
| VSCode CLI (code) | 与 VSCode 版本匹配 | 必须可用 |
| Claude Code CLI | 最新 | 必须在 PATH 中 |
| npm | v9+ | v10+ |

### 6.3 测试数据准备

在项目根目录准备 `.workflow/state/` 目录，包含至少 2 个 YAML 文件用于多卡片测试。参考现有 `openspec/specs/vscode-dashboard-inline-terminal/spec.md` 中的变化定义。

### 6.4 测试工具

| 工具 | 用途 |
|------|------|
| **VSCode Extension Debugger (F5)** | 启动 Extension 开发实例，加载完整 WebView |
| **WebView Developer Tools** | 检查 postMessage 收发、DOM 结构、xterm 状态 |
| **VSCode Output Channel: FlowMaster** | 查看 Extension 日志输出 |
| **Vitest** | 运行自动化单元测试和集成测试 |
| **Process Explorer / Task Manager** | 验证子进程创建和清理 |

### 6.5 自动化测试执行

```bash
# 安装 xterm 依赖
npm install xterm@4.19.0 xterm-addon-fit@0.7.0 xterm-addon-web-links@0.8.0

# 运行全部单元测试
npx vitest run

# 运行特定模块测试
npx vitest run src/processManager.test.ts
npx vitest run src/terminalBridge.test.ts

# 带覆盖率报告
npx vitest run --coverage
```

---

## 7. 测试优先级

| 优先级 | 定义 | 测试编号 | 说明 |
|--------|------|----------|------|
| **P0** | 核心功能，阻塞发布 | TC-LAYOUT-001, TC-TERM-001, TC-PM-001, TC-PM-002, TC-PM-005, TC-TB-001, TC-TB-003, TC-SWITCH-001, TC-SWITCH-003, TC-MSG-001, TC-MSG-002, TC-MSG-003, TC-ERR-001, TC-ERR-002, TC-INT-001, TC-INT-002 | 分栏布局、xterm 初始化、spawn 进程管理、消息收发、终端切换、错误处理基本路径 |
| **P1** | 重要功能，需覆盖边界 | TC-LAYOUT-002, TC-LAYOUT-003, TC-LAYOUT-004, TC-TERM-002, TC-TERM-003, TC-TERM-006, TC-PM-003, TC-PM-004, TC-PM-006, TC-PM-008, TC-TB-005, TC-TB-006, TC-SWITCH-002, TC-SWITCH-004, TC-MSG-004, TC-MSG-005, TC-MSG-006, TC-CONFIG-001, TC-CONFIG-004, TC-CLEAN-001, TC-CLEAN-002, TC-ERR-003, TC-ERR-005, TC-INT-003, TC-INT-005 | 拖拽交互、ANSI/Unicode 渲染、主题、kill 进程、多进程切换、配置项、退出清理 |
| **P2** | 体验增强 | TC-LAYOUT-005, TC-TERM-004, TC-TERM-005, TC-TERM-007, TC-TERM-008, TC-PM-007, TC-TB-002, TC-TB-004, TC-SWITCH-005, TC-CONFIG-002, TC-CONFIG-003, TC-CONFIG-005, TC-CONFIG-006, TC-CLEAN-003, TC-CLEAN-004, TC-ERR-004, TC-INT-004, 所有 BND 和 ERR 场景 | 分割线视觉反馈、fit 插件、web-links 插件、亮色主题、默认值回退、Extension 停用清理、边界条件和错误场景全覆盖 |

---

## 附录：需求-测试用例追溯矩阵

| 需求编号 | 需求描述 | 覆盖测试用例 |
|----------|----------|-------------|
| REQ-1 | 分栏布局，默认 60/40，可拖拽分割线 | TC-LAYOUT-001, TC-LAYOUT-002, TC-LAYOUT-003, TC-LAYOUT-004, TC-LAYOUT-005 |
| REQ-2 | xterm.js 渲染终端，支持 ANSI、Unicode | TC-TERM-001, TC-TERM-002, TC-TERM-003, TC-TERM-004, TC-TERM-005 |
| REQ-3 | child_process.spawn 执行命令 | TC-PM-001, TC-PM-008, TC-MSG-006 |
| REQ-4 | 每个需求独立终端会话 | TC-PM-002, TC-PM-006, TC-SWITCH-005 |
| REQ-5 | 切换卡片时切换终端 | TC-SWITCH-001, TC-SWITCH-002, TC-SWITCH-003, TC-SWITCH-004 |
| REQ-6 | 终端 resize 支持 | TC-TERM-004, TC-LAYOUT-002, TC-INT-003 |
| REQ-7 | 进程退出自动清理 | TC-CLEAN-001, TC-CLEAN-002, TC-CLEAN-003, TC-CLEAN-004, TC-PM-005, TC-PM-007 |
| REQ-8 | 错误处理（4 类场景） | TC-ERR-001, TC-ERR-002, TC-ERR-003, TC-ERR-004, TC-ERR-005 |
| REQ-9 | 消息协议扩展（5 种新消息） | TC-MSG-001, TC-MSG-002, TC-MSG-003, TC-MSG-004, TC-MSG-005, TC-MSG-006 |
| REQ-10 | 配置项（fontSize, scrollback 等） | TC-CONFIG-001, TC-CONFIG-002, TC-CONFIG-003, TC-CONFIG-004, TC-CONFIG-005, TC-CONFIG-006 |
| REQ-11 | TerminalSession 接口 | TC-PM-002, TC-PM-005, TC-SWITCH-005 |
| REQ-12 | 依赖添加 | TC-TERM-001, 自动化安装验证 |
| REQ-13 | 分割线交互 | TC-LAYOUT-002, TC-LAYOUT-003, TC-LAYOUT-004, TC-LAYOUT-005 |
| REQ-14 | 终端主题集成 | TC-TERM-006, TC-TERM-007, TC-TERM-008 |
| REQ-15 | 多终端缓冲 | TC-SWITCH-002, TC-SWITCH-004, TC-SWITCH-005, TC-CLEAN-004 |
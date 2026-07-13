# VSCode Dashboard — 测试方案文档 (testing-guide.md)

---

## 1. 测试概述

### 1.1 测试范围

本测试方案覆盖 FlowMaster VSCode Dashboard 的全部功能模块，包括 Extension 入口、WebView 面板管理、状态读取器、终端运行器、文件打开器以及 WebView 前端界面。测试范围为 openspec 中定义的 10 条功能需求 (REQ-1 ~ REQ-10) 及其对应的 25 条测试场景 (SCN-REQ-1 ~ SCN-REQ-25)。

### 1.2 测试策略

| 类型 | 覆盖目标 | 工具/方法 |
|---|---|---|
| **单元测试** | 各 TypeScript 模块的核心逻辑（YAML 解析、消息路由、终端命令组装、文件路径拼接） | Vitest + tsx |
| **集成测试** | Extension 激活流程、WebView 与 Extension 的消息往返、终端命令实际下发 | Vitest + @vscode/test-web 或 手动验证 |
| **手动测试** | UI 渲染、主题适配、卡片交互、点击事件、空状态展示 | 在真实 VSCode 实例中加载 Extension |

### 1.3 测试优先级

| 优先级 | 定义 | 对应模块 |
|---|---|---|
| P0 | 核心功能，阻塞发布 | Extension 激活、面板注册、卡片展示、Run 终端执行 |
| P1 | 重要功能，需覆盖边界 | 状态刷新、文件打开、错误处理 |
| P2 | 体验增强 | 主题适配、空状态、多 change 展示 |

---

## 2. 测试覆盖矩阵

| 模块 | 文件 | 测试点 | 类型 | 预期结果 |
|---|---|---|---|---|
| Extension 入口 | extension.ts | 命令 `flowmaster.dashboard.open` 注册成功 | 单元 | 命令 ID 存在于贡献点中，调用时激活面板 |
| Extension 入口 | extension.ts | 命令 `flowmaster.dashboard.refresh` 注册成功 | 单元 | 命令绑定到刷新逻辑 |
| Extension 入口 | extension.ts | activate 函数无异常抛出 | 单元 | 所有命令注册完成，无报错 |
| Extension 入口 | extension.ts | deactivate 资源清理 | 单元 | 无句柄泄漏 |
| WebView 面板 | panel.ts | 不存在面板时创建新面板 | 单元 | 调用 `createOrShow` 生成 WebViewPanel |
| WebView 面板 | panel.ts | 已存在面板时 focus 而非重建 | 单元 | 复用现有 panel 实例 |
| WebView 面板 | panel.ts | 面板关闭后清理引用 | 单元 | panel 置为 undefined |
| WebView 面板 | panel.ts | 消息路由 — refreshState 处理 | 集成 | 收到消息后调用 stateReader 并返回 stateUpdated 消息 |
| WebView 面板 | panel.ts | 消息路由 — runPhase 处理 | 集成 | 收到消息后调用 terminalRunner 执行对应阶段 |
| WebView 面板 | panel.ts | 消息路由 — openFile 处理 | 集成 | 收到消息后调用 fileOpener 打开文件 |
| WebView 面板 | panel.ts | 未知消息类型不报错 | 单元 | 静默忽略，无异常 |
| WebView 面板 | panel.ts | 面板 dispose 时销毁关联资源 | 单元 | terminal 引用清理，监听器移除 |
| 状态读取器 | stateReader.ts | 读取单个 YAML 文件并解析为 ChangeState 结构 | 单元 | 正确解析 name/phase/gate/artifacts 字段 |
| 状态读取器 | stateReader.ts | 读取 `.workflow/state/` 目录下所有 YAML 文件 | 单元 | 返回 ChangeState[] 数组 |
| 状态读取器 | stateReader.ts | 目录不存在时返回空数组 | 单元 | 无异常，返回 `[]` |
| 状态读取器 | stateReader.ts | YAML 文件格式错误时跳过该文件 | 单元 | 记录错误，继续处理其他文件 |
| 状态读取器 | stateReader.ts | 无变化时返回空变化集 | 单元 | 增量读取返回 `[]` |
| 状态读取器 | stateReader.ts | 文件内容为空时返回默认状态 | 单元 | 返回 phase=unknown, gate=unknown |
| 状态读取器 | stateReader.ts | 某些字段缺失时的容错（如 gate 字段不存在） | 单元 | 缺失字段填充默认值 |
| 终端运行器 | terminalRunner.ts | 创建终端并执行 `claude /openflow:<phase>` | 集成 | VSCode 终端创建成功，命令被发送 |
| 终端运行器 | terminalRunner.ts | 同一 change 已有运行中终端时复用 | 单元 | 不创建新终端，focus 已有终端 |
| 终端运行器 | terminalRunner.ts | 终端关闭后清理状态 | 单元 | 终端引用置空 |
| 终端运行器 | terminalRunner.ts | 传递 change ID + phase 参数正确 | 单元 | 命令字符串拼接正确 |
| 终端运行器 | terminalRunner.ts | `window.createTerminal` 失败时的错误处理 | 单元 | 返回错误消息，不崩溃 |
| 终端运行器 | terminalRunner.ts | 多个 change 同时运行时各自独立 | 集成 | 每个 change 拥有独立终端 |
| 文件打开器 | fileOpener.ts | 调用 `code -r <filepath>` 打开文件 | 集成 | 文件在 VSCode 编辑器中打开 |
| 文件打开器 | fileOpener.ts | 文件路径含空格时正确处理 | 单元 | 路径被正确引号包裹 |
| 文件打开器 | fileOpener.ts | `code` CLI 不可用时的 fallback | 单元 | 返回错误信息，不崩溃 |
| 文件打开器 | fileOpener.ts | 文件不存在时返回错误 | 单元 | 返回文件不存在提示 |
| WebView 前端 | media/index.html | 页面正确加载 HTML 骨架 | 手动 | 显示标题和卡片区域 |
| WebView 前端 | media/style.css | 亮色/暗色主题 CSS 变量生效 | 手动 | 跟随 VSCode 主题切换 |
| WebView 前端 | media/script.js | 收到 stateUpdated 消息后渲染卡片 | 手动 | 每个 change 生成一张卡片 |
| WebView 前端 | media/script.js | 点击 Run 按钮发送 runPhase 消息 | 集成 | Extension 收到正确消息 |
| WebView 前端 | media/script.js | 点击 artifact 链接发送 openFile 消息 | 集成 | Extension 收到正确消息 |
| WebView 前端 | media/script.js | 刷新按钮发送 refreshState 消息 | 集成 | Extension 收到 refreshState |
| WebView 前端 | media/script.js | 空状态（无 change）显示占位提示 | 手动 | 显示"暂无需求"文案 |
| WebView 前端 | media/script.js | 错误消息显示错误提示 UI | 手动 | 错误横幅展示 |
| WebView 前端 | media/script.js | 阶段状态颜色标识正确 | 手动 | 各阶段有不同颜色标签 |
| 集成测试 | 全链路 | 打开面板 → 展示卡片 → 点击 Run → 终端启动 → 刷新 → 文件打开 | 手动 | 端到端流程无断裂 |
| 集成测试 | 全链路 | 面板关闭后重新打开，状态保持 | 手动 | 重新打开后能正常刷新 |
| 集成测试 | 全链路 | 连续快速点击 Run 按钮，不重复创建终端 | 手动 | 同一 change 不会重复开终端 |

---

## 3. 详细测试用例

### 3.1 Extension 入口 (extension.ts)

#### TC-EXT-001: 命令注册验证
| 字段 | 值 |
|---|---|
| **测试模块** | Extension 入口 |
| **测试描述** | 验证 `flowmaster.dashboard.open` 命令被正确注册 |
| **前置条件** | Extension 已加载 |
| **测试步骤** | 1. 在 VSCode 命令面板 (Ctrl+Shift+P) 中搜索 "FlowMaster: Open Dashboard" |
| **预期结果** | 命令出现在候选列表中 |
| **类型** | 手动测试 |

#### TC-EXT-002: activate 函数无异常
| 字段 | 值 |
|---|---|
| **测试模块** | Extension 入口 |
| **测试描述** | activate 函数执行过程中不抛出未捕获异常 |
| **前置条件** | 测试环境准备完毕 |
| **测试步骤** | 1. 启动 VSCode Extension 调试模式<br>2. 观察 Debug Console 输出 |
| **预期结果** | 无错误日志，activate 正常返回 |
| **类型** | 手动测试 |

#### TC-EXT-003: deactivate 资源释放
| 字段 | 值 |
|---|---|
| **测试模块** | Extension 入口 |
| **测试描述** | deactivate 时释放所有注册的 Disposable |
| **前置条件** | Extension 已激活 |
| **测试步骤** | 1. 激活 Extension<br>2. 停用 Extension<br>3. 检查订阅列表是否全部 disposed |
| **预期结果** | 所有 Disposable 已释放，无内存泄漏 |
| **类型** | 单元测试 |

---

### 3.2 WebView 面板 (panel.ts)

#### TC-PANEL-001: 创建新面板
| 字段 | 值 |
|---|---|
| **测试模块** | WebView 面板 |
| **测试描述** | 首次调用 `createOrShow` 时创建新的 WebViewPanel |
| **前置条件** | 面板未创建 (currentPanel === undefined) |
| **测试步骤** | 1. 执行 `FlowMaster: Open Dashboard` 命令 |
| **预期结果** | 新的 WebView 面板在 Sidebar/Editor 区域打开，标题正确 |
| **类型** | 手动测试 |

#### TC-PANEL-002: 复用已有面板
| 字段 | 值 |
|---|---|
| **测试模块** | WebView 面板 |
| **测试描述** | 面板已存在时 focus 而非重建 |
| **前置条件** | 面板已打开 |
| **测试步骤** | 1. 关闭面板所在的 tab 组<br>2. 再次执行 `FlowMaster: Open Dashboard` 命令 |
| **预期结果** | 面板被 focus 到前台，而非创建新的 tab |
| **类型** | 手动测试 |

#### TC-PANEL-003: 面板关闭时清理引用
| 字段 | 值 |
|---|---|
| **测试模块** | WebView 面板 |
| **测试描述** | 面板被用户关闭后，内部引用被正确清理 |
| **前置条件** | 面板已打开 |
| **测试步骤** | 1. 手动关闭面板<br>2. 检查 currentPanel 引用状态 |
| **预期结果** | currentPanel 置为 undefined，onDidDispose 监听器已移除 |
| **类型** | 单元测试 |

#### TC-PANEL-004: 消息路由 - refreshState
| 字段 | 值 |
|---|---|
| **测试模块** | WebView 面板 |
| **测试描述** | 收到 `refreshState` 消息后路由到 stateReader 并回复 |
| **前置条件** | 面板已打开，WebView 已加载 |
| **测试步骤** | 1. WebView 发送 `{ type: "refreshState" }`<br>2. 监听回复消息 |
| **预期结果** | Panel 调用 stateReader，回复 `stateUpdated` 消息包含状态数据 |
| **类型** | 集成测试 |

#### TC-PANEL-005: 消息路由 - runPhase
| 字段 | 值 |
|---|---|
| **测试模块** | WebView 面板 |
| **测试描述** | 收到 `runPhase` 消息后路由到 terminalRunner |
| **前置条件** | 面板已打开 |
| **测试步骤** | 1. WebView 发送 `{ type: "runPhase", changeId: "xxx", phase: "design" }`<br>2. 观察终端行为 |
| **预期结果** | terminalRunner.createTerminal 被调用，命令为 `claude /openflow:design` |
| **类型** | 集成测试 |

#### TC-PANEL-006: 消息路由 - openFile
| 字段 | 值 |
|---|---|
| **测试模块** | WebView 面板 |
| **测试描述** | 收到 `openFile` 消息后路由到 fileOpener |
| **前置条件** | 面板已打开 |
| **测试步骤** | 1. WebView 发送 `{ type: "openFile", filePath: "/path/to/file.md" }`<br>2. 观察文件是否打开 |
| **预期结果** | fileOpener.openFile 被调用，VSCode 打开对应文件 |
| **类型** | 集成测试 |

#### TC-PANEL-007: 未知消息类型容错
| 字段 | 值 |
|---|---|
| **测试模块** | WebView 面板 |
| **测试描述** | 收到未定义的消息类型时不崩溃 |
| **前置条件** | 面板已打开 |
| **测试步骤** | 1. WebView 发送 `{ type: "unknownType" }` |
| **预期结果** | Panel 静默忽略，无异常抛出，控制台无报错 |
| **类型** | 单元测试 |

---

### 3.3 状态读取器 (stateReader.ts)

#### TC-SR-001: 正确解析 YAML 文件
| 字段 | 值 |
|---|---|
| **测试模块** | 状态读取器 |
| **测试描述** | 读取一个标准 YAML 文件并解析为 ChangeState 结构 |
| **前置条件** | 存在 `.workflow/state/change-001.yaml`，内容合法 |
| **测试步骤** | 1. 调用 `readState("change-001")`<br>2. 检查返回对象 |
| **预期结果** | 返回对象包含 name、phase、gate、artifacts[] 等字段，值与 YAML 一致 |
| **类型** | 单元测试 |

#### TC-SR-002: 读取目录下所有 YAML 文件
| 字段 | 值 |
|---|---|
| **测试模块** | 状态读取器 |
| **测试描述** | 从 `.workflow/state/` 目录读取所有 `*.yaml` 文件 |
| **前置条件** | 目录下存在 2 个以上 YAML 文件 |
| **测试步骤** | 1. 调用 `readAllStates()`<br>2. 检查返回数组长度 |
| **预期结果** | 返回数组包含所有 change 的解析结果，数量与 YAML 文件数一致 |
| **类型** | 单元测试 |

#### TC-SR-003: 目录不存在时返回空数组
| 字段 | 值 |
|---|---|
| **测试模块** | 状态读取器 |
| **测试描述** | `.workflow/state/` 目录不存在时优雅降级 |
| **前置条件** | `.workflow/state/` 目录不存在 |
| **测试步骤** | 1. 调用 `readAllStates()` |
| **预期结果** | 返回空数组 `[]`，无异常抛出 |
| **类型** | 单元测试 |

#### TC-SR-004: YAML 格式错误时跳过
| 字段 | 值 |
|---|---|
| **测试模块** | 状态读取器 |
| **测试描述** | 其中一个 YAML 文件格式错误时，跳过该文件继续处理其他 |
| **前置条件** | 目录下有 2 个 YAML 文件，其中一个格式错误 |
| **测试步骤** | 1. 调用 `readAllStates()` |
| **预期结果** | 返回正确文件的解析结果，错误文件被跳过，日志记录错误 |
| **类型** | 单元测试 |

#### TC-SR-005: 空文件处理
| 字段 | 值 |
|---|---|
| **测试模块** | 状态读取器 |
| **测试描述** | YAML 文件内容为空时返回默认状态 |
| **前置条件** | 存在空内容的 YAML 文件 |
| **测试步骤** | 1. 调用 `readState("empty-change")` |
| **预期结果** | 返回 phase=unknown, gate=unknown 的默认结构 |
| **类型** | 单元测试 |

#### TC-SR-006: 缺失字段容错
| 字段 | 值 |
|---|---|
| **测试模块** | 状态读取器 |
| **测试描述** | YAML 文件缺少可选字段（如 gate、artifacts）时填充默认值 |
| **前置条件** | 存在缺少字段的 YAML 文件 |
| **测试步骤** | 1. 调用 `readState("partial-change")`<br>2. 检查各字段 |
| **预期结果** | 缺失 gate → "unknown"，缺失 artifacts → []，不报错 |
| **类型** | 单元测试 |

---

### 3.4 终端运行器 (terminalRunner.ts)

#### TC-TR-001: 创建终端并执行命令
| 字段 | 值 |
|---|---|
| **测试模块** | 终端运行器 |
| **测试描述** | 为指定 change + phase 创建终端并执行 `claude /openflow:<phase>` |
| **前置条件** | VSCode 终端功能正常 |
| **测试步骤** | 1. 调用 `runPhase("change-001", "design")` |
| **预期结果** | 新终端创建，标题含 change ID，命令为 `claude /openflow:design` |
| **类型** | 单元测试 |

#### TC-TR-002: 复用已有终端
| 字段 | 值 |
|---|---|
| **测试模块** | 终端运行器 |
| **测试描述** | 同一 change 已有运行中的终端时不重复创建 |
| **前置条件** | change-001 已有终端且未关闭 |
| **测试步骤** | 1. 调用 `runPhase("change-001", "design")`<br>2. 调用 `runPhase("change-001", "testcase")` |
| **预期结果** | 第二次调用不创建新终端，而是 focus 已有终端显示 |
| **类型** | 单元测试 |

#### TC-TR-003: 终端关闭后清理
| 字段 | 值 |
|---|---|
| **测试模块** | 终端运行器 |
| **测试描述** | 用户手动关闭终端后，内部引用被清理 |
| **前置条件** | change-001 的终端已创建 |
| **测试步骤** | 1. 手动关闭终端<br>2. 检查内部映射表 |
| **预期结果** | change-001 对应的终端引用被移除 |
| **类型** | 单元测试 |

#### TC-TR-004: 命令参数拼接正确
| 字段 | 值 |
|---|---|
| **测试模块** | 终端运行器 |
| **测试描述** | 验证命令字符串拼接逻辑 |
| **前置条件** | — |
| **测试步骤** | 1. 调用 `buildCommand("change-001", "development")` |
| **预期结果** | 输出 `claude /openflow:development` |
| **类型** | 单元测试 |

#### TC-TR-005: createTerminal 失败处理
| 字段 | 值 |
|---|---|
| **测试模块** | 终端运行器 |
| **测试描述** | `window.createTerminal` 返回 undefined 时处理 |
| **前置条件** | 模拟 VSCode 环境无法创建终端 |
| **测试步骤** | 1. 调用 `runPhase("change-001", "design")` |
| **预期结果** | 返回错误提示，不崩溃，日志记录失败原因 |
| **类型** | 单元测试 |

#### TC-TR-006: 多 change 并发终端
| 字段 | 值 |
|---|---|
| **测试模块** | 终端运行器 |
| **测试描述** | 多个不同的 change 同时运行，各自拥有独立终端 |
| **前置条件** | — |
| **测试步骤** | 1. 对 change-001 调用 runPhase("change-001", "design")<br>2. 对 change-002 调用 runPhase("change-002", "design") |
| **预期结果** | 创建两个独立的终端，标题不同，互不干扰 |
| **类型** | 集成测试 |

---

### 3.5 文件打开器 (fileOpener.ts)

#### TC-FO-001: 正常打开文件
| 字段 | 值 |
|---|---|
| **测试模块** | 文件打开器 |
| **测试描述** | 调用 `code -r` 打开指定文件 |
| **前置条件** | 文件存在，`code` CLI 可用 |
| **测试步骤** | 1. 调用 `openFile("/path/to/proposal.md")` |
| **预期结果** | VSCode 编辑器打开该文件并 focus |
| **类型** | 集成测试 |

#### TC-FO-002: 路径含空格
| 字段 | 值 |
|---|---|
| **测试模块** | 文件打开器 |
| **测试描述** | 文件路径包含空格时正确转义 |
| **前置条件** | 路径如 `/my project/docs/spec 1.md` |
| **测试步骤** | 1. 调用 `openFile("/my project/docs/spec 1.md")`<br>2. 检查拼接的命令 |
| **预期结果** | 命令为 `code -r "/my project/docs/spec 1.md"`，路径被引号包裹 |
| **类型** | 单元测试 |

#### TC-FO-003: code CLI 不存在
| 字段 | 值 |
|---|---|
| **测试模块** | 文件打开器 |
| **测试描述** | `code` 命令不可用时返回友好的错误信息 |
| **前置条件** | VSCode CLI 未安装 |
| **测试步骤** | 1. 调用 `openFile("/path/to/file.md")` |
| **预期结果** | 返回错误信息：`code CLI not available`，不崩溃，无未捕获异常 |
| **类型** | 单元测试 |

#### TC-FO-004: 文件不存在
| 字段 | 值 |
|---|---|
| **测试模块** | 文件打开器 |
| **测试描述** | 目标文件不存在时返回错误 |
| **前置条件** | 文件路径无效 |
| **测试步骤** | 1. 调用 `openFile("/nonexistent/file.md")` |
| **预期结果** | 返回错误信息指示文件不存在，Extension 不崩溃 |
| **类型** | 单元测试 |

---

### 3.6 WebView 前端 (media/)

#### TC-WV-001: 初始渲染
| 字段 | 值 |
|---|---|
| **测试模块** | WebView 前端 |
| **测试描述** | 页面加载后显示正确的标题和卡片容器 |
| **前置条件** | 面板已打开 |
| **测试步骤** | 1. 打开 Dashboard 面板<br>2. 观察页面内容 |
| **预期结果** | 页面标题为 "FlowMaster Dashboard"，卡片容器区域可见 |
| **类型** | 手动测试 |

#### TC-WV-002: 主题适配 (亮色/暗色)
| 字段 | 值 |
|---|---|
| **测试模块** | WebView 前端 |
| **测试描述** | UI 跟随 VSCode 亮色/暗色主题变化 |
| **前置条件** | 面板已打开 |
| **测试步骤** | 1. 切换 VSCode 主题为暗色<br>2. 观察面板背景、文字、卡片颜色<br>3. 切换为亮色主题<br>4. 再次观察 |
| **预期结果** | 背景和文字颜色随主题变化，可读性良好 |
| **类型** | 手动测试 |

#### TC-WV-003: 卡片渲染
| 字段 | 值 |
|---|---|
| **测试模块** | WebView 前端 |
| **测试描述** | 收到 stateUpdated 消息后正确渲染每张卡片 |
| **前置条件** | 存在 2 个 change 数据 |
| **测试步骤** | 1. 发送 `{ type: "stateUpdated", data: [...] }`<br>2. 观察卡片区域 |
| **预期结果** | 每个 change 生成一张卡片，显示 name、phase、gate、artifacts 列表 |
| **类型** | 手动测试 |

#### TC-WV-004: 点击 Run 按钮
| 字段 | 值 |
|---|---|
| **测试模块** | WebView 前端 |
| **测试描述** | 点击卡片上的 Run 按钮发送正确消息 |
| **前置条件** | 卡片已渲染，VSCode 开发者工具已打开 |
| **测试步骤** | 1. 点击某张卡片的 Run 按钮<br>2. 检查 WebView 发送的 postMessage |
| **预期结果** | 发送 `{ type: "runPhase", changeId: "...", phase: "..." }` |
| **类型** | 手动测试 |

#### TC-WV-005: 点击 artifact 链接
| 字段 | 值 |
|---|---|
| **测试模块** | WebView 前端 |
| **测试描述** | 点击 artifact 条目发送 openFile 消息 |
| **前置条件** | 卡片已渲染，包含 artifacts 列表 |
| **测试步骤** | 1. 点击某个 artifact 链接<br>2. 检查 WebView 发送的 postMessage |
| **预期结果** | 发送 `{ type: "openFile", filePath: "..." }` |
| **类型** | 手动测试 |

#### TC-WV-006: 刷新按钮
| 字段 | 值 |
|---|---|
| **测试模块** | WebView 前端 |
| **测试描述** | 点击刷新按钮发送 refreshState 消息 |
| **前置条件** | 面板已打开 |
| **测试步骤** | 1. 点击刷新按钮<br>2. 检查 Extension 收到的消息 |
| **预期结果** | Extension 收到 `{ type: "refreshState" }` |
| **类型** | 集成测试 |

#### TC-WV-007: 空状态展示
| 字段 | 值 |
|---|---|
| **测试模块** | WebView 前端 |
| **测试描述** | 无 change 数据时显示占位提示 |
| **前置条件** | `.workflow/state/` 目录为空或不存在 |
| **测试步骤** | 1. 打开面板<br>2. 等待初始刷新完成 |
| **预期结果** | 显示 "暂无需求" 或类似空状态提示，卡片区域不渲染任何卡片 |
| **类型** | 手动测试 |

#### TC-WV-008: 错误消息展示
| 字段 | 值 |
|---|---|
| **测试模块** | WebView 前端 |
| **测试描述** | 收到 error 消息时显示错误提示 UI |
| **前置条件** | 面板已打开 |
| **测试步骤** | 1. Extension 发送 `{ type: "error", message: "Something went wrong" }` |
| **预期结果** | 页面顶部或中部显示错误横幅，包含错误文本 |
| **类型** | 手动测试 |

#### TC-WV-009: 阶段状态颜色标识
| 字段 | 值 |
|---|---|
| **测试模块** | WebView 前端 |
| **测试描述** | 各阶段使用不同的颜色标签 |
| **前置条件** | 卡片已渲染，包含不同阶段的 change |
| **测试步骤** | 1. 观察各卡片的阶段标签颜色 |
| **预期结果** | design/testcase/development/delivery/closure 各有独立颜色，便于区分 |
| **类型** | 手动测试 |

---

### 3.7 集成测试

#### TC-INT-001: 端到端基本流程
| 字段 | 值 |
|---|---|
| **测试模块** | 集成测试 |
| **测试描述** | 完整用户操作流程：打开面板 → 查看卡片 → 运行阶段 → 刷新 → 打开文件 |
| **前置条件** | FlowMaster 项目存在 `.workflow/state/*.yaml` 文件 |
| **测试步骤** | 1. 执行 `FlowMaster: Open Dashboard` 打开面板<br>2. 验证卡片列表正确显示<br>3. 点击某 change 的 Run 按钮<br>4. 验证终端创建并执行命令<br>5. 点击刷新按钮<br>6. 验证状态更新<br>7. 点击某 artifact 文件<br>8. 验证文件在编辑器中打开 |
| **预期结果** | 所有步骤连贯执行无断裂，各组件协作正常 |
| **类型** | 手动测试 |

#### TC-INT-002: 面板重新打开
| 字段 | 值 |
|---|---|
| **测试模块** | 集成测试 |
| **测试描述** | 关闭面板后重新打开，功能正常 |
| **前置条件** | 面板至少打开过一次 |
| **测试步骤** | 1. 关闭 Dashboard 面板<br>2. 执行 `FlowMaster: Open Dashboard` 重新打开<br>3. 点击刷新按钮 |
| **预期结果** | 面板重新打开并正常加载，刷新后正确显示状态 |
| **类型** | 手动测试 |

#### TC-INT-003: 快速点击 Run
| 字段 | 值 |
|---|---|
| **测试模块** | 集成测试 |
| **测试描述** | 连续快速点击 Run 按钮，不会为同一 change 重复创建终端 |
| **前置条件** | 卡片已渲染 |
| **测试步骤** | 1. 在 1 秒内对同一 change 的 Run 按钮点击 3 次 |
| **预期结果** | 只创建 1 个终端，后续点击仅 focus 已有终端 |
| **类型** | 手动测试 |

#### TC-INT-004: 多 Change 交叉操作
| 字段 | 值 |
|---|---|
| **测试模块** | 集成测试 |
| **测试描述** | 对不同 change 执行不同阶段的 Run 操作，互不干扰 |
| **前置条件** | 存在 2 个以上 change |
| **测试步骤** | 1. 对 change-A 点击 Run(design)<br>2. 对 change-B 点击 Run(development)<br>3. 分别查看终端 |
| **预期结果** | change-A 终端执行 `claude /openflow:design`，change-B 终端执行 `claude /openflow:development`，互不干扰 |
| **类型** | 手动测试 |

---

## 4. 边界条件测试

| 编号 | 边界条件 | 模块 | 预期行为 |
|---|---|---|---|
| BND-01 | `.workflow/state/` 目录不存在 | stateReader | 返回空数组，无异常 |
| BND-02 | `.workflow/state/` 目录为空 | stateReader | 返回空数组 |
| BND-03 | YAML 文件内容为空 | stateReader | 返回默认结构 (phase=unknown, gate=unknown) |
| BND-04 | YAML 文件只有注释 | stateReader | 返回默认结构 |
| BND-05 | YAML 文件超过 10MB | stateReader | 应限制读取大小，或分块解析 |
| BND-06 | 单个 change 有 100+ artifacts | stateReader / WebView | 所有 artifact 条目正常显示，卡片不卡顿 |
| BND-07 | 同时存在 50+ 个 change 文件 | stateReader / WebView | 所有卡片正常渲染，页面不崩溃 |
| BND-08 | 文件路径包含特殊字符 `&` `$` `"` `'` | fileOpener | 路径被正确转义和引号包裹 |
| BND-09 | 文件路径为根路径 `/` | fileOpener | 返回合理错误，不执行 `code -r /` |
| BND-10 | 文件路径为空字符串 | fileOpener | 不执行命令，返回错误 |
| BND-11 | phase 参数为空字符串 | terminalRunner | 返回校验错误，不创建终端 |
| BND-12 | changeId 为空字符串 | terminalRunner / panel | 返回校验错误，不执行任何操作 |
| BND-13 | changeId 含特殊字符 | terminalRunner | 终端标题使用原始字符串，不转义 |
| BND-14 | WebView 发送超大消息（> 1MB） | panel | 消息被截断或丢弃，不崩溃 |
| BND-15 | WebView 连续发送 100 条消息/秒 | panel | 消息队列正常处理，不堆积崩溃 |

---

## 5. 错误场景测试

| 编号 | 错误场景 | 模块 | 预期行为 |
|---|---|---|---|
| ERR-01 | `window.createWebviewPanel` 抛出异常 | panel | 捕获异常，输出错误日志，不阻断 Extension |
| ERR-02 | `window.createTerminal` 返回 undefined | terminalRunner | 返回错误消息，WebView 显示错误提示 |
| ERR-03 | YAML 解析抛出 SyntaxError | stateReader | 跳过该文件，记录错误，继续处理其他文件 |
| ERR-04 | 读取 YAML 文件时文件被占用/锁定 | stateReader | 捕获 IO 异常，跳过该文件 |
| ERR-05 | `exec(`code -r`)` 返回非零退出码 | fileOpener | 捕获错误，返回友好提示 |
| ERR-06 | `code` CLI 不存在 (ENOENT) | fileOpener | 返回 "code CLI not available" 错误 |
| ERR-07 | WebView 的 HTML 资源加载失败 | panel | 显示加载失败页面或默认错误提示 |
| ERR-08 | WebView 与 Extension 的消息通道断开 | panel / WebView | 清理监听器，尝试重建连接或提示用户重启面板 |
| ERR-09 | 全局命令 `flowmaster.dashboard.open` 被重复注册 | extension | 第二次注册被 VSCode 忽略，无冲突 |
| ERR-10 | onDidDispose 未触发时强制销毁面板 | panel | 手动调用 dispose 并清理所有引用 |
| ERR-11 | `workspace.fs` 不可用（无工作区） | stateReader | 返回空数组，提示 "No workspace folder open" |
| ERR-12 | `workspace.fs` 读取权限不足 | stateReader | 返回错误提示，不崩溃 |
| ERR-13 | postMessage 时 WebView 已销毁 | panel | 包裹 try-catch，忽略发送失败 |
| ERR-14 | Extension 反复激活/停用 | extension | 每次激活重新注册，无残留监听器 |
| ERR-15 | 终端创建成功但 `sendText` 失败 | terminalRunner | 捕获异常，记录错误，终端保持打开 |

---

## 6. 测试环境

### 6.1 开发环境

| 项目 | 配置 |
|---|---|
| **操作系统** | Windows 10/11、macOS 12+、Ubuntu 20.04+ |
| **Node.js** | v18.x 或 v20.x LTS |
| **VSCode** | v1.85.0 或更高 |
| **Extension 开发工具** | `@vscode/vsce`、`yo` generator-code |
| **CLI 工具** | `code` 命令必须在 PATH 中（VSCode CLI） |
| **测试框架** | Vitest v1.x |
| **YAML 解析** | `js-yaml` 或 `yaml` npm 包 |

### 6.2 测试数据准备

在项目根目录创建 `.workflow/state/` 目录，并准备以下测试 YAML 文件：

**正常状态文件 — `.workflow/state/change-001.yaml`**
```yaml
name: "vscode-dashboard"
phase: "design"
gate: "passed"
artifacts:
  - "openspec/changes/vscode-dashboard/proposal.md"
  - "openspec/changes/vscode-dashboard/specs.md"
  - "openspec/changes/vscode-dashboard/design.md"
```

**多阶段文件 — `.workflow/state/change-002.yaml`**
```yaml
name: "api-refactor"
phase: "development"
gate: "pending"
artifacts:
  - "openspec/changes/api-refactor/design.md"
  - "src/services/api.ts"
```

**最小文件 — `.workflow/state/change-003.yaml`**
```yaml
name: "bugfix-login"
```

**空文件 — `.workflow/state/change-004.yaml`**
```yaml
```

**格式错误文件 — `.workflow/state/change-005.yaml`**
```
invalid: yaml: : :
broken
```

### 6.3 手动测试工具

| 工具 | 用途 |
|---|---|
| **VSCode Extension Debugger** (F5) | 启动 Extension 开发实例 |
| **WebView Developer Tools** (Developer: Toggle Developer Tools) | 检查 WebView 消息收发 |
| **VSCode 命令面板** (Ctrl+Shift+P) | 触发注册的命令 |
| **Output Channel: FlowMaster** | 查看 Extension 日志输出 |
| **Terminal 面板** | 检查终端创建和命令执行 |

### 6.4 自动化测试执行

```bash
# 安装依赖
npm install

# 运行全部单元测试
npx vitest run

# 运行特定模块测试
npx vitest run src/stateReader.test.ts
npx vitest run src/terminalRunner.test.ts

# 带覆盖率报告
npx vitest run --coverage
```

---

## 附录：需求-测试用例追溯矩阵

| 需求编号 | 需求描述 | 覆盖测试用例 |
|---|---|---|
| REQ-1 | Extension 激活时注册命令 | TC-EXT-001, TC-EXT-002 |
| REQ-2 | WebView 面板创建/复用 | TC-PANEL-001, TC-PANEL-002, TC-PANEL-003 |
| REQ-3 | 卡片展示阶段和 Gate 状态 | TC-WV-003, TC-WV-009 |
| REQ-4 | Run 按钮执行对应阶段 | TC-PANEL-005, TC-TR-001, TC-WV-004 |
| REQ-5 | 产出物文档可点击打开 | TC-PANEL-006, TC-FO-001, TC-WV-005 |
| REQ-6 | 手动刷新按钮 | TC-PANEL-004, TC-WV-006 |
| REQ-7 | 错误处理与提示 | TC-PANEL-007, ERR-01 ~ ERR-15 |
| REQ-8 | 主题适配 | TC-WV-002 |
| REQ-9 | 空状态展示 | TC-WV-007, BND-01, BND-02 |
| REQ-10 | 多 change 支持 | TC-SR-002, TC-TR-006, TC-INT-004 |
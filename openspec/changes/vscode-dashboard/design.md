# FlowMaster VSCode Dashboard — 技术设计文档

## Context

### 背景
FlowMaster 是基于 OpenFlow 规范的工作流管理平台，通过 `claude /openflow:<phase>` 命令驱动需求从设计到交付的完整生命周期。当前所有操作均通过 Claude Code 命令行交互完成，缺乏可视化管理界面，导致用户无法直观查看多个需求的阶段状态、Gate 审批进度和产出物清单。

### 当前状态
- OpenFlow 各阶段 skill 已实现（design / plan / build / close / review / fix）
- 需求状态持久化在 `.workflow/state/` 目录下，以 YAML 文件存储
- 产出物文档存储在 `openspec/` 目录中
- 所有操作依赖 Claude Code 命令行，无 UI 层

### 约束
- 不得引入外部前端框架或构建工具链（Vite / Webpack / React 等）
- 必须与现有 OpenFlow skill 保持兼容，不破坏已有流程
- 项目本身为纯 CLI 工具，VSCode Extension 作为附加的辅助界面
- 必须使用 VSCode Extension API 实现，最低兼容 VSCode 1.85+

### 利益相关方
- **FlowMaster 用户**：需要可视化界面管理需求流程的开发者和技术管理者
- **OpenFlow 流程维护者**：需要确保 Extension 不破坏现有流程语义
- **VSCode 生态使用者**：习惯在 IDE 内完成工作流操作的用户

---

## Goals / Non-Goals

### Goals
1. 在 VSCode 中提供 WebView 面板，展示所有 OpenFlow change/需求及其阶段状态
2. 每个需求以卡片形式呈现，清晰标识当前阶段、Gate 状态和可执行操作
3. 支持一键在 VSCode 终端中启动 `claude /openflow:<phase>` 命令执行对应阶段
4. 每个阶段列出产出物（artifacts），支持点击通过 `code -r` 在 VSCode 中打开
5. 提供手动刷新按钮，实时读取 `.workflow/state/` 最新状态
6. 保持与现有 OpenFlow skill 的完全兼容，Extension 仅作为 UI 层驱动已有流程

### Non-Goals
1. 不取代或重写 OpenFlow 核心流程引擎
2. 不提供实时推送/WebSocket 状态更新（仅手动刷新）
3. 不实现多用户协作或权限管理
4. 不提供 CI/CD 集成或外部系统对接
5. 不构建独立的 Web 应用（仅限 VSCode Extension + WebView）
6. 不修改 `.workflow/state/` 的数据结构或持久化逻辑

---

## Decisions

### 1. VSCode Extension + 原生 WebView（vanilla HTML/CSS/JS）

**决策**：使用 VSCode Extension API 内置的 WebView 面板，采用纯原生 HTML/CSS/JS 实现前端界面，不引入任何前端框架或构建工具。

**理由**：
- VSCode WebView 本身提供了安全的沙箱隔离环境，原生 JS 足以满足卡片渲染需求
- 避免构建步骤，简化开发和调试流程，与项目整体"无构建"风格一致
- 维持极低的依赖和包体积，用户无需等待构建或安装额外运行时
- WebView 的 `postMessage`/`onDidReceiveMessage` 通信机制稳定可靠

**备选方案**：
- React + Vite 构建：引入构建步骤和依赖，与本项目"无构建"原则冲突
- Tree View + 自定义视图：VSCode TreeView 的交互能力有限，难以实现卡片布局和 Run 按钮等富交互

### 2. 数据源：读取 `.workflow/state/*.yaml` + `openspec/` 目录

**决策**：Extension Host 直接通过 Node.js `fs` 模块读取 YAML 文件，解析后序列化为 JSON 传递给 WebView。

**理由**：
- `.workflow/state/` 是 OpenFlow 的官方状态持久化位置，数据权威且完整
- 文件系统读取是最简单可靠的方案，无需额外服务或中间层
- 使用 `yaml` npm 包（轻量级，已广泛使用）解析 YAML 内容
- 目录结构简单，支持按 change-id 索引和遍历

**备选方案**：
- 解析 `.workflow/state/` 目录索引：已采用
- 数据库存储：过度设计，与当前文件系统持久化方案不匹配

### 3. 终端执行：通过 `window.createTerminal` API

**决策**：使用 VSCode 的 `window.createTerminal` API 创建或复用终端，执行 `claude /openflow:<phase> <change-id>` 命令。

**理由**：
- VSCode 原生 API，无需外部 Shell 或子进程管理
- 终端输出直接展示给用户，体验与手动执行 Claude Code 一致
- 支持 `terminal.show()` 将终端聚焦到前台，用户可实时观察执行过程
- 与现有工作流完全兼容，本质上就是自动化执行用户原本手动输入的命令

**备选方案**：
- `child_process.exec`：在后台执行，用户无法交互，不符合 OpenFlow 需要人工审核的流程特性
- Task API (`vscode.tasks`)：更适合编译任务，对交互式 CLI 支持不佳

### 4. 文件打开：通过 `code -r <file>` CLI 命令

**决策**：使用 `code -r` 命令在 VSCode 中打开文件，而非 `workspace.openTextDocument` API。

**理由**：
- `code -r` 是 VSCode 内置 CLI，确保文件在新标签页中打开
- `workspace.openTextDocument` 仅打开文档，不聚焦到编辑器标签
- `code -r` 行为与用户日常操作一致（在终端中打开文件）
- 支持相对路径（相对于项目根目录）和绝对路径

**备选方案**：
- `workspace.openTextDocument` + `window.showTextDocument`：需要额外两步 API 调用，且无法保证标签页聚焦
- 直接 `vscode.open` 命令：需要 `Uri.file()` 转换，语义不如 `code -r` 直观

### 5. Extension 文件结构

**决策**：采用模块化文件结构，每个职责独立文件。

```
extension/
├── src/
│   ├── extension.ts        # 入口：activate / deactivate，注册命令和 WebView 面板
│   ├── panel.ts            # WebView 管理：创建、销毁、消息路由
│   ├── stateReader.ts      # 状态读取：解析 .workflow/state/*.yaml
│   ├── terminalRunner.ts   # 终端执行：createTerminal + sendText
│   └── fileOpener.ts       # 文件打开：code -r 命令执行
├── media/
│   ├── index.html          # WebView 主页面
│   ├── style.css           # WebView 样式
│   └── script.js           # WebView 前端逻辑
├── package.json
└── tsconfig.json
```

**理由**：
- 单一职责，便于单元测试和维护
- 每个模块不超过 100 行，逻辑清晰
- 未来扩展时（如新增消息类型）只需修改对应模块

---

## Risks / Trade-offs

### 风险 1：WebView 与 Extension Host 通信延迟

**描述**：`postMessage` 通信在 WebView 冷启动时可能存在初始状态同步延迟，用户可能在状态加载完成前看到空白界面。

**缓解措施**：
- WebView 加载完成后立即发送 `refreshState` 消息，无等待
- 在加载状态完成前显示 Loading 指示器
- 设置合理的超时处理（5 秒后显示错误提示）

### 风险 2：`claude` 命令未在 PATH 中

**描述**：`window.createTerminal` 执行的 `claude` 命令依赖环境变量，如果用户 PATH 配置不正确，终端会显示"command not found"。

**缓解措施**：
- 在终端发送命令前，通过 `vscode.env.shell` 检测可用的 Shell 环境
- 在终端启动时发送 `claude --version` 验证命令可用性
- 在 WebView 中显示清晰的错误提示，引导用户检查 Claude Code 安装
- 提供配置项允许用户自定义 `claude` 命令路径

### 风险 3：YAML 文件格式变化

**描述**：如果 OpenFlow 后续更新 `.workflow/state/*.yaml` 的数据结构，Extension 可能解析失败或显示错误数据。

**缓解措施**：
- 采用宽松解析策略，对于未知字段不做报错处理
- 定义 `ChangeState` 接口，解析时使用可选字段 (`?`) 标记非必填项
- 在 WebView 中显示"未知阶段"或"数据异常"的容错 UI
- 版本号字段预留，便于未来做向前兼容

### 风险 4：多个终端堆积

**描述**：用户频繁点击"Run"按钮可能导致大量终端实例被创建，造成 VSCode 界面混乱。

**缓解措施**：
- 每个 change-id 复用终端（通过 `terminal.name` 追踪）
- 支持可配置的"每次运行创建新终端"模式
- 在 WebView 中显示当前运行状态，运行中时禁用按钮

### 风险 5：性能问题（大量需求）

**描述**：当项目中有 50+ 个 change 时，WebView 渲染所有卡片可能导致性能下降。

**缓解措施**：
- 采用虚拟滚动或分页加载（按需渲染可视区域的卡片）
- 状态读取使用异步流式处理，避免阻塞 Extension Host
- 卡片内容精简，避免过大的 DOM 树

### Trade-off：纯前端 vs 框架

选择原生 HTML/CSS/JS 意味着放弃了组件化开发、状态管理和热更新等便利性。这是有意为之的权衡——项目当前阶段不需要这些能力，而零构建步骤带来的开发体验提升是更重要的考量。

---

## Open Questions

1. **终端复用策略**：是否应该为每个 change 复用同一个终端，还是每次运行创建新终端？前者更整洁但可能带来状态污染，后者更清晰但可能堆积终端窗口。初期建议采用"每次创建新终端"方案，并在终端名称中标注 change-id 和 phase 以区分。

2. **自动刷新机制**：目前仅支持手动刷新。是否需要在终端命令执行完成后自动触发状态刷新？如果实现，需要监听终端退出事件 (`onDidCloseTerminal`)，但无法可靠区分是哪个 change 的执行完成。可能的方案：在发送命令时记录 timestamp，终端关闭时触发一次全量刷新。

3. **错误状态表示**：当 `.workflow/state/` 目录不存在或 YAML 解析失败时，WebView 应如何展示？是否需要在卡片上显示具体错误信息，还是统一显示"数据不可用"？

4. **`claude /openflow:review` 的 Gate 审核交互**：当前设计仅通过终端执行命令，但 Gate 审核可能需要用户在终端中交互确认。是否需要在 WebView 中提供一个"通过/打回"的快捷操作，直接发送对应指令到终端？这需要进一步调研 `window.createTerminal` 的交互式输入能力。

5. **多 workspace 支持**：如果用户打开了多个 workspace 文件夹，Extension 应读取哪个 workspace 的 `.workflow/state/`？按照 VSCode 惯例，应读取第一个 workspace 根目录。但如果有多个项目各自包含 OpenFlow 配置，是否需要支持 workspace 选择？

6. **配置项设计**：需要定义哪些 VSCode 配置项（`contributes.configuration`）？初步考虑的配置项包括：
   - `flowmaster.claudeCommand`：自定义 `claude` 命令路径（默认 `claude`）
   - `flowmaster.autoRefresh`：终端执行完成后自动刷新（默认 `true`）
   - `flowmaster.terminalReuse`：是否复用终端（默认 `false`）

7. **图标和主题适配**：VSCode 支持深色/浅色/高对比度主题，WebView 是否需要适配 VSCode 主题变量（如 `--vscode-editor-background`）？建议使用 VSCode 提供的 CSS 变量实现主题自适应，避免硬编码颜色值。

---

## 架构设计

### 整体架构图

```
┌──────────────────────────────────────────────────┐
│                   VSCode Extension                │
│                                                    │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────┐ │
│  │ extension.ts │  │   panel.ts   │  │ stateReader│ │
│  │  (入口/激活) │──│ (WebView管理) │  │ (YAML读取) │ │
│  └──────┬──────┘  └──────┬───────┘  └─────┬─────┘ │
│         │                │                 │        │
│  ┌──────┴──────┐  ┌──────┴───────┐  ┌──────┴─────┐ │
│  │ terminalRun │  │ fileOpener   │  │ postMessage │ │
│  │ (终端执行)   │  │ (文件打开)    │  │ (消息通信)  │ │
│  └──────┬──────┘  └──────┬───────┘  └──────┬─────┘ │
│         │                │                 │        │
└─────────┼────────────────┼─────────────────┼────────┘
          │                │                 │
          ▼                ▼                 ▼
   ┌──────────┐    ┌──────────────┐  ┌────────────────┐
   │ Terminal │    │ code -r path │  │  WebView Panel │
   │ claude / │    │ (打开文件)    │  │  (卡片渲染/交互)│
   │ openflow │    └──────────────┘  └────────────────┘
   └──────────┘
```

### 消息协议

WebView 与 Extension Host 之间通过 `postMessage`/`onDidReceiveMessage` 通信，消息类型定义如下：

| 消息方向 | 消息类型 | 载荷 | 描述 |
|---|---|---|---|
| WebView → Host | `refreshState` | 无 | 请求刷新所有需求状态 |
| Host → WebView | `stateUpdated` | `{ changes: ChangeState[] }` | 返回最新状态数据 |
| WebView → Host | `runPhase` | `{ changeId: string, phase: string }` | 请求在终端中执行指定阶段 |
| Host → WebView | `phaseStarted` | `{ changeId: string, phase: string }` | 通知阶段已开始执行 |
| WebView → Host | `openFile` | `{ path: string }` | 请求在 VSCode 中打开文件 |
| WebView → Host | `openFolder` | `{ path: string }` | 请求在 VSCode 中打开文件夹 |
| WebView → Host | `error` | `{ message: string }` | 报告 WebView 侧错误 |

### 状态文件结构

Extension Host 读取 `.workflow/state/<change-id>.yaml`，解析为以下 TypeScript 接口：

```typescript
interface ChangeState {
  /** Change 标识符，如 "vscode-dashboard" */
  change: string;
  /** 人类可读的标题 */
  title: string;
  /** 整体状态，如 "active", "completed", "archived" */
  status: string;
  /** 当前所处阶段名称 */
  current_phase: string;
  /** 各阶段详情 */
  phases: {
    [phase: string]: {
      /** 阶段状态: "pending" | "active" | "completed" | "blocked" */
      status: string;
      /** 产出物文件路径列表（相对于项目根目录） */
      artifacts: string[];
      /** 阶段报告文件路径，可为 null */
      report: string | null;
      /** Gate 审核信息 */
      gate: {
        /** Gate 状态: "pending" | "passed" | "failed" | "not_required" */
        status: string;
      };
    };
  };
}
```

### 页面布局

```
┌──────────────────────────────────────────────────────┐
│  [FlowMaster Icon]  FlowMaster Dashboard    [🔄 刷新] │
├──────────────────────────────────────────────────────┤
│                                                        │
│  ┌──────────────────────────────────────────────────┐ │
│  │  ⚡ vscode-dashboard                              │ │
│  │  VSCode Extension WebView 可视化需求管理          │ │
│  │                                                    │ │
│  │  ┌──────────┐  ┌────────┐  ┌────────┐  ┌──────┐  │ │
│  │  │  Design   │  │  Plan  │  │  Build │  │ Close│  │ │
│  │  │    ✓      │  │   →    │  │   ⛔   │  │  ⛔  │  │ │
│  │  │ Gate: ✓   │  │ Gate: ⏳│  │        │  │      │  │ │
│  │  └──────────┘  └────────┘  └────────┘  └──────┘  │ │
│  │                                                    │ │
│  │  当前阶段: Design                           [▶ Run] │ │
│  │                                                    │ │
│  │  产出物:                                            │ │
│  │    📄 proposal.md                          [打开]  │ │
│  │    📄 design.md                            [打开]  │ │
│  │                                                    │ │
│  │  阶段报告:                                          │ │
│  │    📄 design-report.md                     [打开]  │ │
│  │                                                    │ │
│  │  Gate 1: 待审核                            [▶ Run] │ │
│  └──────────────────────────────────────────────────┘ │
│                                                        │
│  ┌──────────────────────────────────────────────────┐ │
│  │  🔧 another-change                                │ │
│  │  Some other change description                    │ │
│  │  ...                                              │ │
│  └──────────────────────────────────────────────────┘ │
│                                                        │
└──────────────────────────────────────────────────────┘
```

### 阶段状态颜色映射

| 阶段状态 | 颜色 | 含义 |
|---|---|---|
| `completed` | 绿色 (#4CAF50) | 已完成 |
| `active` | 蓝色 (#2196F3) | 当前阶段 |
| `pending` | 灰色 (#9E9E9E) | 待开始 |
| `blocked` | 红色 (#F44336) | 阻塞 |

### Gate 状态颜色映射

| Gate 状态 | 颜色 | 含义 |
|---|---|---|
| `passed` | 绿色 ✓ | 已通过 |
| `pending` | 橙色 ⏳ | 待审核 |
| `failed` | 红色 ✗ | 未通过 |
| `not_required` | 灰色 — | 无需审核 |

### Skills 扩展

当前 OpenFlow skill 无需修改即可兼容 Extension 调用。Extension 作为 UI 层，本质上执行的是用户手动输入的命令。但以下扩展点需考虑：

1. **终端执行命令格式**：`claude /openflow:<phase> <change-id>`，与现有 skill 调用方式完全一致
2. **状态读取**：直接读取 `.workflow/state/` 目录，无需修改 OpenFlow 的写入逻辑
3. **Gate 交互**：`/openflow:review` 阶段的 Gate 审核需要用户在终端中交互，Extension 通过 `terminal.show()` 将终端聚焦到前台，用户可手动输入审核结果
4. **未来可扩展**：如果后续需要更紧密的集成，可在 OpenFlow skill 中增加 `--json` 输出模式，供 Extension 解析执行结果

---

## 数据流

### 流程 1：WebView 初始化加载

```
WebView 创建
    │
    ▼
WebView HTML 加载完成
    │
    ▼
script.js 发送 postMessage({ type: 'refreshState' })
    │
    ▼
panel.ts 的 onDidReceiveMessage 处理消息
    │
    ▼
stateReader.ts 读取 .workflow/state/ 目录
    │
    ├── 遍历所有 *.yaml 文件
    ├── 使用 yaml.parse() 解析每个文件
    ├── 构建 ChangeState[] 数组
    │
    ▼
panel.ts 发送 postMessage({ type: 'stateUpdated', changes: [...] })
    │
    ▼
WebView 渲染卡片列表
```

### 流程 2：用户点击 Run

```
用户点击卡片的 [▶ Run] 按钮
    │
    ▼
WebView 发送 postMessage({ type: 'runPhase', changeId, phase })
    │
    ▼
panel.ts 路由到 terminalRunner.ts
    │
    ▼
terminalRunner.ts:
    ├── 调用 window.createTerminal({ name: 'FlowMaster: changeId/phase' })
    ├── terminal.sendText('claude /openflow:phase changeId')
    ├── terminal.show()
    │
    ▼
panel.ts 发送 postMessage({ type: 'phaseStarted', changeId, phase })
    │
    ▼
WebView 更新按钮状态为"运行中..."并禁用
```

### 流程 3：用户点击打开文件

```
用户点击产出物列表中的 [打开] 按钮
    │
    ▼
WebView 发送 postMessage({ type: 'openFile', path: 'openspec/.../design.md' })
    │
    ▼
panel.ts 路由到 fileOpener.ts
    │
    ▼
fileOpener.ts:
    ├── 拼接绝对路径: workspaceRoot + '/' + path
    ├── 执行 child_process.exec('code -r <absolute-path>')
    │
    ▼
VSCode 在新标签页中打开文件
```

### 流程 4：手动刷新

```
用户点击顶部 [🔄 刷新] 按钮
    │
    ▼
与流程 1 相同（refreshState → stateUpdated）
    │
    ▼
WebView 重新渲染，替换旧数据
```

---

## 实现计划

### 阶段 1：Extension 骨架（预估 1-2 天）
- 创建 `package.json`，配置 `contributes.views` 和 `activationEvents`
- 实现 `extension.ts` 入口，注册命令和 WebView 面板
- 实现 `panel.ts` WebView 基础管理

### 阶段 2：状态读取与渲染（预估 1-2 天）
- 实现 `stateReader.ts`：YAML 文件读取和解析
- 实现 `media/index.html`：WebView 主页面结构
- 实现 `media/style.css`：卡片布局和主题适配
- 实现 `media/script.js`：消息处理和 DOM 渲染

### 阶段 3：交互功能（预估 1 天）
- 实现 `terminalRunner.ts`：终端创建和命令执行
- 实现 `fileOpener.ts`：文件打开
- 实现 Run 按钮和文件打开按钮的交互逻辑

### 阶段 4：打磨与测试（预估 1 天）
- 错误处理和边界情况
- 主题适配完善
- 配置项注册
- 安装和测试
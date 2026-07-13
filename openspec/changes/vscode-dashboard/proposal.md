# Proposal: VSCode Dashboard for OpenFlow Workflow Management

## Why

目前 OpenFlow 工作流完全依赖命令行操作，用户需要手动输入 `claude /openflow:<phase>` 命令并切换文件目录来查看需求状态和产出物，缺乏可视化的集中管理界面，导致多需求并行时效率低下、状态感知困难。

## What Changes

1. **新建 VSCode Extension 项目** — 在 `extensions/vscode-dashboard/` 目录下创建完整的 Extension 骨架，包括 `package.json`（激活事件、命令、视图注册）、`extension.js`（激活/停用入口）、以及 WebView 资源文件。

2. **WebView 面板** — 注册一个 `flowmaster.dashboard` WebView 视图，以卡片列表形式展示所有 change/需求，每张卡片包含：需求名称、当前阶段标签、Gate 状态指示器（通过/阻塞/未检查）、以及阶段流转操作按钮。

3. **State Reader 模块** — 实现读取 `.workflow/state/*.yaml` 文件并解析为结构化 JSON 的能力，供 WebView 渲染。支持 YAML 解析（通过 `js-yaml` 或手写简单解析器）。

4. **Terminal Runner 模块** — 通过 VSCode `window.createTerminal` API 在终端中执行 `claude /openflow:<phase>` 命令，支持按需求名称和阶段动态拼接命令。

5. **File Opener 模块** — 在 WebView 中展示每个阶段的产出物（artifacts）列表，点击后通过 `code -r <file>` 在 VSCode 中打开对应文件。

6. **手动刷新机制** — WebView 提供刷新按钮，重新读取 `.workflow/state/` 和 `openspec/` 目录的最新状态。

7. **扩展注册** — 在 `package.json` 中注册命令 `flowmaster.refresh` 和 `flowmaster.runPhase`，支持通过命令面板触发。

## Capabilities

- **flowmaster.dashboard.open** — 打开 FlowMaster Dashboard WebView 面板
- **flowmaster.refresh** — 手动刷新所有需求状态并更新 WebView
- **flowmaster.runPhase** — 在终端中为指定需求运行指定 OpenFlow 阶段命令
- **flowmaster.openArtifact** — 在 VSCode 中打开指定的产出物文件
- **flowmaster.readState** — 读取 `.workflow/state/*.yaml` 解析为结构化数据
- **flowmaster.listChanges** — 列举 `openspec/changes/` 目录下的所有 change

## Impact

| 维度 | 影响 |
|---|---|
| **代码** | 新增 `extensions/vscode-dashboard/` 目录，包含约 10-15 个文件（Extension 入口、WebView HTML/CSS/JS、状态读取器、终端运行器）。不修改现有 OpenFlow Skills 或 `openspec/` 核心逻辑。 |
| **API** | 无对外 API 变更。新增内部模块间接口（State Reader -> WebView 的 JSON 数据格式）。 |
| **依赖** | 新增 devDependency: `@types/vscode`（Extension 开发用）。运行时零额外依赖（YAML 解析使用 VSCode 内置的 `js-yaml` 或手写轻量解析器）。 |
| **配置** | `package.json` 中新增 `contributes.views` 和 `contributes.commands` 注册。 |

## Open Questions

1. YAML 解析方案：VSCode 内置 `js-yaml` 是否在所有目标版本中可用？若不保险，需手写一个仅支持 `openspec/` 状态文件子集（键值对 + 嵌套对象）的轻量解析器。
2. 终端复用策略：每次运行 `claude /openflow:<phase>` 是创建新终端还是复用已有终端？复用可减少杂乱，但需处理命令冲突。
3. 状态变更检测：当前仅支持手动刷新。是否需要在后续迭代中增加文件监听（`fs.watch`）自动刷新 WebView？
4. 浏览器兼容性：WebView 使用 VSCode 内置的 Chromium 内核，CSS/JS 特性需确认兼容性（如 CSS Grid、ES2020 语法）。
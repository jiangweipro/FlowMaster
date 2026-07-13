# 设计报告 — vscode-dashboard

执行时间：2026-07-09T23:30:00+08:00
执行阶段：design

## 变更清单
- 新增：openspec/changes/vscode-dashboard/proposal.md
- 新增：openspec/specs/vscode-dashboard/spec.md
- 新增：openspec/changes/vscode-dashboard/design.md

## 产出物
| 文件 | 行数 | 状态 |
|---|---|---|
| openspec/changes/vscode-dashboard/proposal.md | 45 | ✓ |
| openspec/specs/vscode-dashboard/spec.md | 291 | ✓ |
| openspec/changes/vscode-dashboard/design.md | 459 | ✓ |

## 自检结果

| 检查项 | 结果 | 说明 |
|---|---|---|
| 需求可理解 | ✅ 是 | proposal.md 清晰说明 Why（命令行缺乏可视化界面）、What Changes（7 项变更）、Capabilities（6 个） |
| 范围边界清晰 | ✅ 是 | design.md §Goals/Non-Goals 列出 6 个目标和 6 个明确不做的范围 |
| 消息接口定义数量 | ✅ 7 个 | design.md §消息协议 定义了 refreshState / stateUpdated / runPhase / phaseStarted / openFile / openFolder / error 共 7 种消息 |
| 每个接口有错误处理 | ✅ 是 | spec.md REQ-8 覆盖 4 类错误场景（目录不存在、YAML 解析失败、终端创建失败、code CLI 缺失）；design.md §Risks 覆盖 5 类风险 |
| 关键决策有理由 | ✅ 是 | design.md §Decisions 包含 5 项决策，每项均列出备选方案和选择理由 |
| 规格可测试 | ✅ 是 | spec.md 包含 10 条 Requirement（SHALL/MUST 格式）和 25 条测试场景（WHEN/THEN 格式） |
| 与探索共识一致 | ✅ 是 | VSCode Extension + 原生 WebView、终端自动执行、手动刷新、不涉及额外框架 |

## 遗留问题
1. 终端复用策略：每次创建新终端 vs 复用同 change 终端，需开发阶段确定
2. 自动刷新机制：终端执行完成后是否自动触发状态刷新
3. 错误状态表示：目录不存在或 YAML 解析失败时的 UI 展示方案
4. Gate 审核交互：是否在 WebView 中提供快捷通过/打回操作
5. 多 workspace 支持：多个 workspace 时读取哪个根目录
6. 配置项设计：`claude` 命令路径、自动刷新开关、终端复用开关等配置项
7. 图标和主题适配：WebView 主题变量使用方案

## 下一步
- 等待 Gate 1 人工审核
- 审核通过后执行 `/openflow:plan vscode-dashboard`
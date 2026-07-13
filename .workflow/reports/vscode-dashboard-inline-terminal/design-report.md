# 设计报告 — vscode-dashboard-inline-terminal

执行时间：2026-07-13T16:00:00+08:00
执行阶段：design

## 变更清单
- 新增：openspec/changes/vscode-dashboard-inline-terminal/proposal.md
- 新增：openspec/specs/vscode-dashboard-inline-terminal/spec.md
- 新增：openspec/changes/vscode-dashboard-inline-terminal/design.md

## 产出物
| 文件 | 状态 |
|------|------|
| openspec/changes/vscode-dashboard-inline-terminal/proposal.md | ✓ |
| openspec/specs/vscode-dashboard-inline-terminal/spec.md | ✓ |
| openspec/changes/vscode-dashboard-inline-terminal/design.md | ✓ |
| .workflow/reports/vscode-dashboard-inline-terminal/design-report.md | ✓ |

## 自检结果

| 检查项 | 结果 | 说明 |
|--------|------|------|
| 需求可理解 | ✅ 是 | proposal.md 清晰说明 4 个问题（上下文割裂、终端堆积、状态感知延迟、信息关联弱）和 11 项变更 |
| 范围边界清晰 | ✅ 是 | design.md §Goals/Non-Goals 列出 7 个目标和 7 个明确不做的范围 |
| 消息接口定义数量 | ✅ 14 个 | design.md 定义了 Host→WebView 6 种消息（stateUpdated, terminalOutput, terminalExit, terminalError, terminalStart, skipPermissionsChanged）和 WebView→Host 8 种消息（refreshState, runPhase, openFile, reviewGate, terminalInput, terminalResize, toggleSkipPermissions, terminalSwitch） |
| 每个接口有错误处理 | ✅ 是 | spec.md REQ-8 覆盖 4 类错误场景（进程启动失败、进程异常退出、xterm 渲染失败、spawn 命令不存在）；design.md §Risks 覆盖 6 类风险（xterm 加载失败、XSS 注入、进程残留、ANSI 性能、Windows 兼容性、版本冲突） |
| 关键决策有理由 | ✅ 是 | design.md 包含 5 项决策（D1-xterm.js 选型、D2-spawn 进程管理、D3-分栏布局、D4-终端切换策略、D5-依赖管理），每项均列出备选方案和选择理由 |
| 规格可测试 | ✅ 是 | spec.md 包含 15 条 Requirement（SHALL 格式）和 25 条测试场景（GIVEN/WHEN/THEN 格式） |
| 与探索共识一致 | ✅ 是 | xterm.js + child_process.spawn + 上下分栏 + 可拖拽分割线 + 每个需求独立终端 + 完全替代 createTerminal |

## 遗留问题
1. xterm 输入 vs 只读输出：是否支持用户输入，还是仅显示输出
2. 终端历史保存策略：切换需求时是否保留历史，内存开销控制
3. 多进程生命周期管理：关闭 WebView 面板时如何清理子进程
4. spawn 跨平台兼容性：Windows 上 claude.cmd 后缀处理
5. 安全边界与 XSS 防护：ANSI 转义序列和 HTML 注入防护
6. xterm.js 加载方式：node_modules 直接加载 vs vendor 拷贝
7. Windows PTY 支持：是否需要 winpty/conpty 模拟

## 下一步
- 等待 Gate 1: 需求审核（人工审核）
- 审核通过后执行 `/openflow:review vscode-dashboard-inline-terminal`
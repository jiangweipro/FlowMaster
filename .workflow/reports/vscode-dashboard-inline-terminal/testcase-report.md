# 测试方案报告 — vscode-dashboard-inline-terminal

执行时间：2026-07-13T16:20:00+08:00
执行阶段：testcase

## 变更清单
- 新增：openspec/changes/vscode-dashboard-inline-terminal/testing-guide.md
- 新增：openspec/changes/vscode-dashboard-inline-terminal/tasks.md

## 产出物
| 文件 | 状态 |
|------|------|
| openspec/changes/vscode-dashboard-inline-terminal/testing-guide.md | ✓ |
| openspec/changes/vscode-dashboard-inline-terminal/tasks.md | ✓ |
| .workflow/reports/vscode-dashboard-inline-terminal/testcase-report.md | ✓ |

## 自检结果

| 检查项 | 结果 | 说明 |
|--------|------|------|
| 场景覆盖完整性 | ✅ | 10 个测试域共 68 条用例 + 12 条边界条件 + 15 条错误场景，覆盖所有功能和交互 |
| 需求-测试追溯 | ✅ | 15 条 REQ 全部映射到对应测试用例，需求-测试双向追溯 |
| 任务可验证性 | ✅ | 9 个任务各有明确的验收标准，可逐条验证完成条件 |
| 任务依赖关系 | ✅ | 依赖图清晰，关键路径 T-2→T-3→T-7→T-8→T-9 (10h)，建议并行优化 |
| 工作量估算 | ✅ | 总计 15.5h（单人），关键路径 10h，2 人并行可缩短至 8h |
| 测试优先级分级 | ✅ | P0 19 条 / P1 26 条 / P2 23 条，分级明确，核心功能优先 |
| 错误处理覆盖 | ✅ | 15 条错误场景（ERR-01~ERR-15），覆盖 spawn 失败、xterm 初始化失败、进程异常退出、配置错误等 |
| 跨平台覆盖 | ✅ | Windows/macOS/Linux 三平台测试要求，明确特殊注意事项 |

## 测试方案概览

| 测试域 | 用例数 | 说明 |
|--------|--------|------|
| 分栏布局 | 5 | 默认比例、拖拽、最小尺寸、视觉反馈 |
| xterm.js 渲染 | 8 | 初始化、ANSI、Unicode、fit、web-links、主题 |
| 进程管理 | 8 | spawn、Map 维护、kill、killAll、自动清理、重复 spawn、停用清理、跨平台 |
| 终端桥接 | 6 | stdout/stderr 转发、exit/error 消息、input/resize 转发 |
| 终端切换 | 5 | 切换卡片、恢复历史、无会话卡片、后台运行、缓冲区独立 |
| 消息协议 | 6 | 5 种新消息的收发处理 |
| 配置项 | 6 | 5 项配置的生效验证和默认值回退 |
| 进程退出与清理 | 4 | 正常退出、异常退出、信号终止、缓冲保留 |
| 错误处理 | 5 | 4 类错误场景 + 面板隐藏 |
| 集成测试 | 5 | 端到端 Run、多卡片交叉、resize、面板恢复、重复 Run |

## 任务概览

| 任务 | 描述 | 工时 | 并行组 |
|------|------|------|--------|
| T-1 | 安装 xterm 依赖 | 0.5h | A |
| T-2 | processManager 新建 | 2h | A |
| T-3 | terminalBridge 新建 | 1.5h | C |
| T-4 | index.html 分栏布局 | 1h | B |
| T-5 | style.css 样式 | 1h | B |
| T-6 | script.js 集成 xterm | 3h | C |
| T-7 | terminalRunner 重构 | 2h | C |
| T-8 | extension.ts 集成 | 2.5h | D |
| T-9 | 端到端测试 | 2h | E |
| **合计** | | **15.5h** | |

## 下一步
- 等待 Gate 2: 用例审核（人工审核）
- 审核通过后执行 `/openflow:build vscode-dashboard-inline-terminal`
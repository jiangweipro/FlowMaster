# 环境信息 — vscode-dashboard

执行时间：2026-07-09T23:50:00+08:00

## 开发环境

| 项目 | 值 |
|---|---|
| 操作系统 | Windows 11 Pro (10.0.26200) |
| Node.js | v26.3.0 |
| npm | 11.16.0 |
| VSCode | 1.128.0 |
| TypeScript | 通过 npm 本地安装 |
| Shell | Git Bash |

## 项目配置

| 配置项 | 值 |
|---|---|
| 工作目录 | `f:/project/FlowMaster/` |
| Extension 目录 | `f:/project/FlowMaster/`（项目根即 Extension 根） |
| 状态文件目录 | `.workflow/state/` |
| OpenSpec 目录 | `openspec/` |
| 编译输出 | `dist/` |
| Extension 入口 | `src/extension.ts` |

## 依赖项

| 依赖 | 版本 | 用途 |
|---|---|---|
| `@types/vscode` | ^1.85.0 | VSCode Extension API 类型定义 |
| `typescript` | ^5.7 | TypeScript 编译器 |
| `yaml` | ^2.7 | YAML 解析 |

## 环境可达性验证

| 检查项 | 结果 |
|---|---|
| Node.js 可用 | ✅ v26.3.0 |
| npm 可用 | ✅ 11.16.0 |
| VSCode CLI (code) 可用 | ✅ 1.128.0 |
| 工作目录可写 | ✅ |
| `.workflow/state/` 目录存在 | ✅ |
| `openspec/` 目录存在 | ✅ |
| `openspec/changes/vscode-dashboard/` 存在 | ✅ |

## 注意事项
- VSCode Extension 开发无需外部服务或数据库
- 测试通过在本地 Extension Host 中加载运行
- Claude Code (`claude` 命令) 需在系统 PATH 中可用（终端执行时依赖）
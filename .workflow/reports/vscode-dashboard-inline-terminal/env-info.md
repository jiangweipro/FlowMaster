# 环境信息报告 — vscode-dashboard-inline-terminal

## 开发环境

| 项目 | 值 |
|---|---|
| 操作系统 | Windows 11 Pro (10.0.26200) |
| Node.js | v18+ / v20+ |
| VSCode | ^1.85.0 |
| TypeScript | ^5.7.0 |
| 构建工具 | tsc (TypeScript Compiler) |
| 测试框架 | Vitest v4.1.10 |
| 包管理器 | npm |

## 项目路径

| 项目 | 路径 |
|---|---|
| 项目根目录 | `F:\project\FlowMaster` |
| 源码目录 | `src/` |
| 测试目录 | `tests/` |
| 静态资源 | `media/` |
| 编译输出 | `dist/` |
| 状态文件 | `.workflow/state/` |

## 依赖项

| 依赖 | 版本 | 用途 |
|---|---|---|
| `xterm` | ^5.3.0 | WebView 内嵌终端渲染引擎 |
| `xterm-addon-fit` | ^0.8.0 | 终端自适应容器尺寸 |
| `xterm-addon-web-links` | ^0.9.0 | 终端内链接点击 |
| `yaml` | ^2.7.0 | YAML 状态文件解析 |
| `typescript` | ^5.7.0 | 编译 |
| `vitest` | ^4.1.10 | 单元测试 |

## xterm.js 加载路径（WebView asWebviewUri）

| 资源 | 路径 |
|---|---|
| xterm.css | `node_modules/xterm/css/xterm.css` |
| xterm.js | `node_modules/xterm/lib/xterm.js` |
| xterm-addon-fit.js | `node_modules/xterm-addon-fit/lib/xterm-addon-fit.js` |
| xterm-addon-web-links.js | `node_modules/xterm-addon-web-links/lib/xterm-addon-web-links.js` |

## 运行时配置

| 配置项 | 默认值 | 说明 |
|---|---|---|
| `flowmaster.terminal.fontSize` | 14 | 内嵌终端字号 |
| `flowmaster.terminal.fontFamily` | Consolas, monospace | 内嵌终端字体 |
| `flowmaster.terminal.scrollback` | 1000 | 缓冲区行数 |
| `flowmaster.terminal.splitRatio` | 0.6 | 面板/终端初始分割比例 |
| `flowmaster.skipPermissions` | false | 跳过权限确认 |

## 环境可达性

- ✅ TypeScript 编译器可用（`tsc`）
- ✅ Vitest 测试框架可用
- ✅ npm 包管理器可用
- ✅ xterm 模块已安装（54 packages）
- ✅ 编译通过（`tsc --noEmit` 无错误）
- ✅ 全部 49 个 AT 测试通过
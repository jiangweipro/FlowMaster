---
name: openflow-build
description: "Phase 3: 环境请求 → 开发 → 编 AT → 编译部署 → 执行 AT → 一次统一修复 → 报告。停等 Gate 3"
metadata:
  author: FlowMaster
  version: "1.1"
  category: Workflow
  tags: [openflow, build, gate-3]
---

# OPENFLOW: Build

执行 Phase 3 开发阶段：生成需求代码与 AT 代码，执行 AT，仅做一次统一修复，输出测试报告。

> **职责边界**：build 只做「一次修复」。循环修复（最多 5 次）由 `openflow-fix` 承担。build 产出的失败用例清单是 fix 的输入之一。

## 输入

change-id（必填）。

## 前置条件

- Plan 阶段已完成且 Gate 2 已通过
- 状态文件中 `phases.testcase.status: done` 且 `phases.testcase.gate.status: passed`

## 步骤

### Step 1: 检查前置条件

读取 `.workflow/state/<change-id>.yaml`，确认：

- `phases.testcase.status: done`
- `phases.testcase.gate.status: passed`
- `current_phase: development`

否则报错。

### Step 2: 读取上下文

- 读取 `openspec/changes/<change-id>/design.md` — 技术方案
- 读取 `openspec/changes/<change-id>/testing-guide.md` — 测试用例
- 读取 `openspec/changes/<change-id>/tasks.md` — 任务清单
- 读取 `.workflow/config.yaml` — 项目配置（编译命令、测试命令等）
- 读取 `.workflow/reports/<change-id>/testcase-report.md` — 用例阶段的遗留问题

### Step 3: 环境请求

收集开发所需的全部环境信息：

| 信息 | 来源 | 说明 |
|---|---|---|
| 地址/端口 | `.workflow/config.yaml` 或询问用户 | 目标服务地址 |
| 账号/凭据 | 环境配置或询问用户 | 认证信息 |
| 数据库/实例 | 环境配置或询问用户 | 测试目标实例 |
| 依赖服务 | 环境配置或询问用户 | 外部依赖可达性 |
| 配置参数 | 环境配置或询问用户 | 运行时参数 |

产出 `.workflow/reports/<change-id>/env-info.md`，包含：
- 环境信息清单
- 可达性验证结果（端口通、服务响应、账号有效）
- 注意事项

### Step 4: 功能开发

基于 `design.md` 和 `tasks.md` 实现需求代码：

1. 按 `tasks.md` 中的任务顺序依次实现
2. 产出至对应模块的 `src/` 目录
3. 编译配置和命令从 `.workflow/config.yaml` 读取

> 编译失败的修复统一交给 Step 6 一次修复，此处不做自循环。

### Step 5: 编写 AT 代码

基于 `testing-guide.md` 编写自动化测试代码：

1. 按测试矩阵中的场景编写对应的可执行测试
2. 产出至对应模块的 `tests/` 目录
3. AT 代码风格与项目中已有的测试保持一致

### Step 6: 编译代码

根据 `.workflow/config.yaml` 中的编译配置执行编译：

- 编译命令：`<config.build.command>`
- 成功标志：`<config.build.success_indicator>`
- **编译通过** → 继续 Step 7
- **编译不通过** → 进入 Step 9 一次修复（`fix_scope: compile`）
  - 修复后重新编译，仍不通过 → **build 失败终止**：产出 `at-exec-report.md` 标注「编译未通过、未进入 AT 执行」，状态置 `phases.development.status: revision_needed`、`gate.status: pending`，停等 Gate 3

### Step 7: 替换补丁到测试环境

1. 将编译产物部署/替换到目标测试环境
2. 确认替换成功、环境就绪
3. 记录部署时间戳

### Step 8: 执行全部 AT 用例

串行执行测试清单中的全部用例，**本步骤不做任何修复**：

```
for each 用例 in 测试清单:
  执行该用例
  记录结果（通过 | 失败 + 失败归因）
```

收集所有失败用例清单，进入 Step 9。

**关键约束**：每条用例串行，禁止并发执行；失败只记录，不在此处修复。

### Step 9: 一次修复（统一一轮）

> 仅当 Step 8 存在失败用例时执行。全量通过则跳过本步，直接进入 Step 10。
> 若来自 Step 6 编译失败，则 `fix_scope = compile`，重跑目标改为「重新编译」。

```
汇总所有失败用例（或编译错误）
  → 统一根因分析
  → 统一修改代码
  → 重新编译 → 替换补丁
  → 重跑"失败用例"（非全量重跑）
if 重跑全部通过:
  标记这些用例为「修复后通过」，进入 Step 10
else:
  标记仍失败的用例为 failed（记录归因）
  回滚本次修复代码 → 重新编译替换
  进入 Step 10
```

**关键约束**：
- build **只做这一次修复**，不再循环
- 修复重跑必须走完整链路：编译 → 替换 → 执行
- 修复失败后必须回滚修复代码、重新编译替换
- 仍失败的用例交给 `openflow-fix` 处理（最多 5 循环）

### Step 10: 输出阶段报告

产出 `.workflow/reports/<change-id>/at-exec-report.md`：

```markdown
# AT 执行报告 — <change-id>

执行时间：<ISO 时间戳>
执行阶段：development

## 执行摘要
- 总用例数：<N>
- 通过：<N>
- 失败：<N>
- 修复后通过：<N>
- 修复回滚：<N>

## 用例明细

| 用例名 | 结果 | 修复尝试 | 回滚 |
|---|---|---|---|
| test_a | 通过 | 否 | — |
| test_b | 修复后通过 | 统一修复 | — |
| test_c | 失败 | 统一修复 | 已回滚 |

## 失败归因
- test_c：环境问题，控制台超时（来源：AT 输出日志）

## 遗留问题
- test_c 需进一步处理 → 执行 `openflow:fix <change-id>` 选择该用例继续修复
```

报告末尾明确提示：**失败用例可由 `openflow:fix <change-id>` 继续处理**。

### Step 11: 更新状态文件

```yaml
phases:
  development:
    status: done  # 编译失败终止时为 revision_needed
    env_ready: true
    env_info: .workflow/reports/<id>/env-info.md
    artifacts:
      - <模块>/src/...
      - <模块>/tests/...
    report: .workflow/reports/<id>/at-exec-report.md
    test_results:
      total: <N>
      passed: <N>
      failed: <N>
      cases:
        - name: "test_a"
          result: passed
          fix_attempted: false
        - name: "test_b"
          result: passed
          fix_attempted: true
          fix_rolled_back: false
        - name: "test_c"
          result: failed
          fix_attempted: true
          fix_rolled_back: true
          failure_reason: "环境问题"
    gate:
      status: pending
  delivery:
    status: in_progress  # 等待 Gate 3 通过后执行
```

`current_phase` 设为 `delivery`。

### Step 12: 输出结果

```
✓ Build 阶段完成
```

**产出物：**

- [.workflow/reports/<id>/env-info.md](.workflow/reports/<id>/env-info.md)
- 需求代码（`<模块>/src/`）
- AT 代码（`<模块>/tests/`）
- [.workflow/reports/<id>/at-exec-report.md](.workflow/reports/<id>/at-exec-report.md)

```
执行结果: <N>/<M> 通过，<K> 条失败（已回滚修复）

▶ 等待 Gate 3: 报告审核（人工）
请查看 at-exec-report.md
Build 阶段结束后可进入：
  • /openflow:fix <change-id>     — 修复失败用例
  • /openflow:retest <change-id>  — 选择部分/全部用例回归重测
  • /openflow:close <change-id>   — 交付归档（全部通过时）
```

## 输出

- [.workflow/reports/<change-id>/env-info.md](.workflow/reports/<change-id>/env-info.md)
- 需求代码（各模块 `src/` 下）
- AT 代码（各模块 `tests/` 下）
- [.workflow/reports/<change-id>/at-exec-report.md](.workflow/reports/<change-id>/at-exec-report.md)
- 更新后的 `.workflow/state/<change-id>.yaml`

## Gate 3: 报告审核（人工）

审核对象：
- `at-exec-report.md` — 每条用例的执行结果、修复记录、回滚记录
- 失败用例的归因和修复记录

通过条件：全部用例通过；或存在失败但人工确认归因合理、有修复计划。
不通过：执行 `openflow:fix <change-id>` 进入问题处理流。

## 编译/测试配置参考

`.workflow/config.yaml` 中与 Build 相关的配置：

```yaml
build:
  command: "<编译命令>"
  success_indicator: "SUCCESS"

test:
  run_command: "<跑测命令>"
  smoke_tag: "Smoke"
  results_dir: "test_results/"

source:
  dirs: ["<模块>/src"]
  test_dirs: ["<模块>/tests"]
```

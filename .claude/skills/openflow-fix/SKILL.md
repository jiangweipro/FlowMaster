---
name: openflow-fix
description: "问题处理流：列出失败用例/接收人工问题 → 选择性修复 → 验证 → 回滚循环（最多5次）。产出修复报告或失败报告"
metadata:
  author: FlowMaster
  version: "1.1"
  category: Workflow
  tags: [openflow, fix, subprocess]
---

# OPENFLOW: Fix

执行问题处理流：接纳两种问题来源（AT 失败用例 + 人工输入问题），对选定问题进行根因分析和修复验证，每个问题最多循环 5 次。

> **与 build 的分工**：`openflow-build` 只做一次统一修复；仍失败的用例和人工发现的问题都由本技能以 5 循环深度修复。仍依赖 change-id（需读设计/测试/报告/状态/配置）。

## 输入

`change-id [issue-id]`，或带 change-id 但纯对话输入人工问题。

- 提供 `issue-id` → 直接定位到该 issue（用于重复触发、续修）
- 不提供 issue-id → 进入 Step 3 选择问题来源

## 前置条件

- 状态文件中 `current_phase` 在 `development` 或 `delivery`（说明有问题待处理）
- **不再强制 `test_results.failed > 0`** — 人工输入问题可不伴随 AT 失败

## 步骤

### Step 1: 检查状态文件

读取 `.workflow/state/<change-id>.yaml`：

- 确认 `current_phase` 在 `development` 或 `delivery`
- 如果提供了 `issue-id`，直接定位到该 issue（继续累加 loop_count）
- 如果未提供，进入 Step 3

### Step 2: 读取上下文

- 读取 `at-exec-report.md` — 了解失败详情和归因
- 读取 `openspec/changes/<change-id>/design.md` — 了解设计意图
- 读取 `openspec/changes/<change-id>/testing-guide.md` — 了解测试预期
- 读取已有的 `issue-log-*.md` — 了解历史修复记录
- 读取 `.workflow/config.yaml` — 编译/测试命令

### Step 3: 确定问题来源（双来源）

本步骤是 fix 的核心入口，接纳两种来源，可叠加：

| 来源 | 行为 |
|---|---|
| **A. AT 失败用例** | 从 `at-exec-report.md` / 状态 `phases.development.test_results.cases` 筛出 `result: failed` 的用例，**列出编号清单**（编号 + 用例名 + 归因摘要）。询问用户选择「全部」或「部分（输入编号）」。 |
| **B. 人工输入问题** | 用户在对话中直接描述一个或多个问题（不一定对应某条 AT 用例）。为每个建立 issue 记录。 |

**流程：**
1. 若存在 AT 失败用例，先列出编号清单，询问用户是否选择（全部 / 部分 / 跳过）
2. 询问用户是否还有人工发现的问题需要补充输入
3. 汇总选定的问题清单（A 选中的 + B 输入的）

**约束**：若用户既不选 AT 失败用例、也不输入人工问题 → 报错退出，不做后续步骤。

对每个待处理问题产出 `.workflow/reports/<change-id>/issue-log-<n>.md`：

```markdown
# 问题记录 — <change-id>

问题编号：<n>
发现阶段：<development | delivery>
触发场景：<at-failure | manual | gate-3 | gate-4 | 其他>

## 问题描述
<问题简述>

## 关联用例（仅 at-failure 来源有）
<用例名>

## 根因分类
<environment | code | at | design>

## 影响范围
<受影响的功能或模块>

## 修复目标
<期望的修复结果；含验证手段：对 AT 失败用例=重跑该条 AT；对人工问题=相关 AT 或用户确认方式>
```

> `trigger` 取值新增 `at-failure` / `manual`（`gate-3`/`gate-4` 等历史取值保留兼容）。
> 初始化 `loop_count = 0`，`max_loops = 5`，每个问题独立计数。

### Step 4: 修复循环

对每个问题循环执行，最多 5 次：

```
loop_count = 0
while loop_count < 5:
  4.1 根因分类（环境/代码/AT/设计）
  4.2 按分类执行修复：
      - 环境问题 → 修复环境配置
      - 代码问题 → 修改需求代码
      - AT 问题 → 修改 AT 代码
      - 设计问题 → 修订 design.md
  4.3 重新验证（编译 → 替换 → 执行）：
      - AT 失败用例 → 重跑该条 AT
      - 人工问题 → 按 issue-log 的"修复目标"验证（相关 AT 或用户确认手段）
  4.4 判断结果：
      if 通过:
        转到 Step 5
      else:
        loop_count++
        if loop_count < 5 且 能分析出新原因:
          回滚本次修复中不必要的/错误的代码修改
          继续循环（回到 4.1）
        else:
          产出修复失败报告
          转到 Step 6
```

**关键约束**：
- 每次重新分析前，必须回滚上一次修复中不必要的/错误的修改
- 确保从干净状态重新分析，不被遗留代码污染
- 每次循环记录修复尝试详情
- 同一个 issue 再次触发时继续累加 loop_count

### Step 5: 修复成功

产出 `.workflow/reports/<change-id>/fix-verify-<n>.md`：

```markdown
# 修复验证报告 — <change-id>

问题编号：<n>
触发场景：<at-failure | manual>
修复次数：<loop_count>

## 修复内容
- <修复了什么>

## 验证结果
- 对应验证：通过（重跑 AT / 用户确认）

## 文档同步
- [ ] design.md 已更新
- [ ] testing-guide.md 已更新
- [ ] spec.md 已更新
```

更新相关文档（spec / design / testing-guide 与实际修复对齐）。

### Step 6: 修复失败

产出 `.workflow/reports/<change-id>/fix-failure-report.md`：

```markdown
# 修复失败报告 — <change-id>

问题编号：<n>
循环次数：<loop_count>/5

## 修复尝试记录

| 尝试 | 修复内容 | 结果 | 回滚 |
|---|---|---|---|
| 1 | <修复内容> | 失败 | 已回滚 |
| 2 | <修复内容> | 失败 | 已回滚 |
| ... | ... | ... | ... |

## 失败原因
- 已达最大循环次数（5 次）
- 无法分析出新原因

## 遗留代码变更
- 已回滚的修改：<清单>
- 保留的修改：<清单（如有）>
```

### Step 7: 更新状态文件

追加 issue 记录到 `issues[]`：

```yaml
issues:
  - id: <n>
    phase: development
    trigger: <at-failure | manual>   # 新增字段，区分来源
    type: <environment | code | at | design>
    summary: "<问题简述>"
    related_case: "<用例名>"          # 仅 at-failure 来源有
    log: .workflow/reports/<id>/issue-log-<n>.md
    fix_attempts:
      - attempt: 1
        fix: "<修复内容>"
        rolled_back: true
        result: failed
    loop_count: <N>
    max_loops: 5
    resolved: <true | false>
    failure_report: .workflow/reports/<id>/fix-failure-report.md  # 仅失败时有
```

Gate 状态：
- 全部 issue `resolved: true` 且原 Gate 因失败打回 → 将对应 `gate.status` 置回 `pending` 等待复审
- 仍有未解决 → 保留失败态

### Step 8: 输出结果

```
成功:
✓ Fix 完成
  issue-<n> 已修复，验证通过
  文档已同步更新
  全部 resolved → 可选 /openflow:retest <change-id> 回归验证 → /openflow:close <change-id>
  仍有失败 → 人工介入或再次 /openflow:fix <change-id>
```

**相关文档：**

- [.workflow/reports/<id>/issue-log-<n>.md](.workflow/reports/<id>/issue-log-<n>.md)
- [.workflow/reports/<id>/fix-verify-<n>.md](.workflow/reports/<id>/fix-verify-<n>.md)（成功时）
- [.workflow/reports/<id>/fix-failure-report.md](.workflow/reports/<id>/fix-failure-report.md)（失败时）

```
失败:
✗ Fix 失败（<loop_count>/5 次尝试后仍未解决）
  已输出修复失败报告
  请人工介入分析
```

## 输出

- [.workflow/reports/<change-id>/issue-log-<n>.md](.workflow/reports/<change-id>/issue-log-<n>.md)
- [.workflow/reports/<change-id>/fix-verify-<n>.md](.workflow/reports/<change-id>/fix-verify-<n>.md)（成功时）
- [.workflow/reports/<change-id>/fix-failure-report.md](.workflow/reports/<change-id>/fix-failure-report.md)（失败时）
- 更新后的 `.workflow/state/<change-id>.yaml`
- 更新的文档（[spec.md](openspec/specs/<capability>/spec.md) / [design.md](openspec/changes/<change-id>/design.md) / [testing-guide.md](openspec/changes/<change-id>/testing-guide.md)）

## 规则

| 规则 | 说明 |
|---|---|
| 最大循环 | 5 次，超限后输出失败报告，不再重试 |
| 代码回滚 | 每次重试前回滚上一次错误的修复，保持干净状态 |
| 文档同步 | 修复成功后必须同步更新相关文档 |
| 重复触发 | 同一个 issue 再次触发时继续累加 loop_count |
| 问题来源 | AT 失败用例（可选部分/全部）+ 人工输入问题，可叠加 |

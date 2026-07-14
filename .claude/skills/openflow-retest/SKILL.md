---
name: openflow-retest
description: "可选阶段：列出全部用例 → 选择部分/全部重跑 → 更新报告。用例由通过转失败可回 openflow-fix 修复"
metadata:
  author: FlowMaster
  version: "1.0"
  category: Workflow
  tags: [openflow, retest, optional]
---

# OPENFLOW: Retest

可选的非强制阶段：重新执行选定的 AT 用例，更新测试结果与报告。出现「通过 → 失败」回归可回 `openflow-fix` 修复。

> **定位**：非主流程阶段，可跳过，不改变 `current_phase`。通常在 `openflow-fix` 之后、`openflow:close` 之前执行，用于回归验证；也可在 build 之后直接执行。同 fix 一样由人工 `/openflow:retest <change-id>` 调用，不在扩展的 `PHASE_COMMAND_MAP` 中。

## 输入

`change-id`（必填）

## 前置条件

- 状态文件中 `current_phase` 在 `development` 或 `delivery`
- 状态文件存在 `phases.development.test_results.cases`（即 build 已产出过用例结果）

## 步骤

### Step 1: 检查前置条件

读取 `.workflow/state/<change-id>.yaml`，确认：

- `current_phase` 在 `development` 或 `delivery`
- `phases.development.test_results` 与 `cases` 存在

否则报错（提示先执行 `openflow:build`）。

### Step 2: 读取上下文

- 读取 `.workflow/reports/<change-id>/at-exec-report.md` — 上次执行详情与归因
- 读取 `openspec/changes/<change-id>/design.md` — 设计意图
- 读取 `openspec/changes/<change-id>/testing-guide.md` — 测试预期
- 读取 `.workflow/config.yaml` — 测试命令（`test.run_command` 等）
- 读取状态 `phases.development.test_results.cases` — 各用例当前结果

### Step 3: 列出全部用例

从 `test_results.cases` 列出全部用例编号清单（编号 + 用例名 + 当前结果 + 上次归因）：

```
1. test_a    [通过]
2. test_b    [修复后通过]
3. test_c    [失败]  归因：环境超时
...
```

询问用户选择：

- **全部重跑**
- **部分**（输入编号，如 `1,3`）
- **跳过**（直接退出，不改任何状态）

> 选「跳过」即结束本技能，不写任何报告、不改状态。

### Step 4: 执行选定用例

串行重跑选定的用例，**不重新编译**（使用当前已部署的代码/补丁）：

```
for each 选定用例:
  执行
  记录新结果（通过 | 失败 + 失败归因）
```

**关键约束**：

- 每条串行，禁止并发执行
- 不重新编译——若代码有手动改动，建议先 `openflow:build` / `openflow:fix` 再 retest
- 重跑范围仅限用户选定用例，未选中的用例结果维持不变

### Step 5: 对比并更新结果

对比每条选定用例的新旧结果，重点标注**状态翻转**：

| 上次 → 本次 | 含义 | 处理 |
|---|---|---|
| pass → pass | 维持 | 不变 |
| pass → fail | **回归** | 标记 failed + 归因 |
| fail → pass | 恢复 | 标记 passed |
| fail → fail | 维持失败 | 更新归因（如有变化） |

### Step 6: 输出重测报告

产出 `.workflow/reports/<change-id>/retest-report-<n>.md`（`n` 为 retest 轮次，递增）：

```markdown
# 重测报告 — <change-id>

执行时间：<ISO 时间戳>
重测轮次：<n>
选定用例：<N> / 总 <M>

## 结果摘要
- 通过：<N>
- 失败：<N>
- 回归（pass→fail）：<N>
- 恢复（fail→pass）：<N>

## 用例明细

| 用例名 | 上次结果 | 本次结果 | 翻转 |
|---|---|---|---|
| test_a | 通过 | 通过 | — |
| test_c | 失败 | 通过 | 恢复 |
| test_b | 通过 | 失败 | 回归 |

## 回归归因
- test_b：<原因，来源：AT 输出日志>

## 遗留问题 / 建议
- 存在回归 → 执行 `/openflow:fix <change-id>`，在问题来源选择回归用例修复
- 无回归、全通过 → 执行 `/openflow:close <change-id>`
```

### Step 7: 更新状态文件

更新 `phases.development.test_results.cases[]`：仅对**选定重跑**的用例更新 `result` / `failure_reason`（未选中的维持原值）；同步 `test_results.passed` / `failed` 计数。

追加 retest 轮次记录到 `retests[]`：

```yaml
retests:
  - round: 1
    report: .workflow/reports/<id>/retest-report-1.md
    selected: <N>
    passed: <N>
    failed: <N>
    regressions: ["test_b"]
    recovered: ["test_c"]
    tested_at: "<ISO 时间戳>"
```

Gate 状态：

- 出现回归（pass→fail）→ `gate.status` 维持 / 置回 `pending`，提示先 `openflow:fix` 处理回归
- 无回归且此前 Gate 已通过 → 不改 Gate

### Step 8: 输出结果

```
无回归:
✓ Retest 完成
  <N> 条重跑，全部通过
  → /openflow:close <change-id>

有回归:
⚠ Retest 完成，发现 <K> 条回归
  回归用例：test_b, ...
  → /openflow:fix <change-id>（选择回归用例修复）

有失败但非回归（fail→fail）:
⚠ Retest 完成，<K> 条仍失败
  → /openflow:fix <change-id>（选择仍失败用例继续修复）
```

**相关文档：**

- [.workflow/reports/<id>/retest-report-<n>.md](.workflow/reports/<id>/retest-report-<n>.md)

## 输出

- [.workflow/reports/<change-id>/retest-report-<n>.md](.workflow/reports/<change-id>/retest-report-<n>.md)
- 更新后的 `.workflow/state/<change-id>.yaml`（`test_results.cases` + `retests[]`）

## 规则

| 规则 | 说明 |
|---|---|
| 非强制 | 可跳过；跳过则不写报告、不改状态 |
| 不重编译 | 使用当前已部署代码；代码有手动改动应先 build/fix |
| 回归必报 | pass→fail 必记录归因并提示 fix |
| 可重复 | retest 可多轮，`round` 递增 |
| 选择性重跑 | 仅重跑用户选定用例，未选中的结果维持 |

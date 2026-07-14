---
name: "OPENFLOW: Retest"
description: "可选阶段：列出全部用例 → 选择部分/全部重跑 → 更新报告。用例由通过转失败可回 openflow-fix 修复"
category: Workflow
tags: [workflow, openflow]
---

可选的非强制阶段：重新执行选定的 AT 用例，更新测试结果与报告。出现「通过 → 失败」回归可回 `openflow:fix` 修复。

> 非主流程阶段，可跳过，不改变 `current_phase`。通常在 fix 之后、close 之前。

**输入**：change-id

**步骤**

1. **检查前置条件**
   - 读取 `.workflow/state/<change-id>.yaml`
   - 确认 `current_phase` 在 `development` 或 `delivery`
   - 确认 `phases.development.test_results.cases` 存在（即 build 已产出过用例结果）
   - 否则报错：提示先执行 `/openflow:build <change-id>`

2. **读取上下文**
   - 读取 `at-exec-report.md`（上次执行详情）
   - 读取 `design.md` / `testing-guide.md`（设计与测试预期）
   - 读取 `.workflow/config.yaml`（测试命令）
   - 读取状态 `test_results.cases`（各用例当前结果）

3. **列出全部用例**
   - 从 `test_results.cases` 列出编号清单（编号 + 用例名 + 当前结果 + 上次归因）
   - 询问用户选择：**全部重跑** / **部分（输入编号）** / **跳过**
   - 选「跳过」→ 直接结束，不写报告、不改状态

4. **执行选定用例**（串行，不重新编译）
   - 使用当前已部署代码重跑选定的用例（代码有手动改动应先 build/fix）
   - 每条记录新结果（通过 | 失败 + 归因）
   - 仅重跑选定用例，未选中的结果维持不变

5. **对比并更新结果**
   - pass→pass：维持
   - pass→fail：**回归**，标记 failed + 归因
   - fail→pass：恢复，标记 passed
   - fail→fail：维持失败，更新归因（如有变化）

6. **输出重测报告**
   - 产出 `.workflow/reports/<change-id>/retest-report-<n>.md`（`n` 递增）
   - 含结果摘要（通过/失败/回归/恢复）、用例明细表（上次|本次|翻转）、回归归因、建议

7. **更新状态文件**
   - 仅对选定重跑的用例更新 `test_results.cases` 的 `result` / `failure_reason`，同步 passed/failed 计数
   - 追加 retest 轮次记录到 `retests[]`（round / selected / passed / failed / regressions / recovered / tested_at）
   - 出现回归 → `gate.status` 维持/置回 `pending`，提示先 fix

8. **输出结果**
   ```
   无回归:
   ✓ Retest 完成
     <N> 条重跑，全部通过
     → /openflow:close <change-id>

   有回归:
   ⚠ Retest 完成，发现 <K> 条回归
     回归用例：test_b, ...
     → /openflow:fix <change-id>（选择回归用例修复）

   仍有失败（非回归）:
   ⚠ Retest 完成，<K> 条仍失败
     → /openflow:fix <change-id>（选择仍失败用例继续修复）
   ```

   **相关文档：**
   - [.workflow/reports/<id>/retest-report-<n>.md](.workflow/reports/<id>/retest-report-<n>.md)

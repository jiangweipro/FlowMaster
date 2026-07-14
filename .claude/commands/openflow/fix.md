---
name: "OPENFLOW: Fix"
description: "问题处理流：列出失败用例/接收人工问题 → 选择性修复 → 验证 → 回滚循环（最多5次）。产出修复报告或失败报告"
category: Workflow
tags: [workflow, openflow]
---

执行问题处理流：接纳两种问题来源（AT 失败用例 + 人工输入问题），对选定问题进行根因分析和修复验证，每个问题最多循环 5 次。

> 与 build 的分工：build 只做一次统一修复；仍失败的用例和人工发现的问题由本技能以 5 循环深度修复。仍依赖 change-id。

**输入**：`change-id [issue-id]` 或带 change-id 对话输入人工问题

**触发场景**
- Gate 3 报告审核判定存在失败后调用
- Gate 4 交付测试二轮打回后调用
- 用户基于需求手动输入人工发现的问题
- 其他阶段发现设计/代码/文档不一致时调用

**步骤**

1. **检查状态文件**
   - 读取 `.workflow/state/<change-id>.yaml`
   - 确认 `current_phase` 在 `development` 或 `delivery`
   - 提供了 `issue-id` → 直接定位该 issue（续修，累加 loop_count）
   - 不再强制 `test_results.failed > 0`（人工问题可不伴随 AT 失败）

2. **读取上下文**
   - 读取 `at-exec-report.md` 了解失败详情
   - 读取 `design.md` / `testing-guide.md` 了解设计意图与测试预期
   - 读取已有的 `issue-log-*.md` 了解历史修复记录
   - 读取 `.workflow/config.yaml` 获取编译/测试命令

3. **确定问题来源（双来源，可叠加）**
   - **A. AT 失败用例**：从 `at-exec-report.md` / 状态 `test_results.cases` 筛出 `result: failed`，列出编号清单（编号 + 用例名 + 归因），询问用户选「全部」或「部分（输入编号）」
   - **B. 人工输入问题**：用户在对话中描述一个或多个问题（不一定对应 AT 用例）
   - 两者都未提供 → 报错退出
   - 对每个待处理问题产出 `.workflow/reports/<change-id>/issue-log-<n>.md`（`触发场景` 取值 `at-failure` / `manual`；含修复目标与验证手段）

4. **修复循环**（每个问题独立计数，最多 5 次）
   - 4.1 根因分类：环境 / 代码 / AT / 设计
   - 4.2 按分类修复（环境→修配置 / 代码→改需求代码 / AT→改 AT 代码 / 设计→修订 design.md）
   - 4.3 重新验证（编译 → 替换 → 执行）：
     - AT 失败用例 → 重跑该条 AT
     - 人工问题 → 按 issue-log 的修复目标验证（相关 AT 或用户确认手段）
   - 4.4 判断结果：
     - **通过** → 转到步骤 5
     - **不通过** → `loop_count++`
       - 若 `loop_count < 5` 且能分析出新原因 → **回滚本次错误的修改** → 回到 4.1
       - 否则 → 产出 `.workflow/reports/<change-id>/fix-failure-report.md` → 转到步骤 6

5. **修复成功**
   - 产出 `.workflow/reports/<change-id>/fix-verify-<n>.md`
   - 更新相关文档（spec / design / testing-guide 与实际修复对齐）

6. **更新状态文件**
   - 追加 issue 记录到 `issues[]`，含 `trigger`（at-failure / manual）、每次修复尝试与回滚记录
   - 全部 resolved 且原 Gate 因失败打回 → 将对应 `gate.status` 置回 `pending` 等待复审
   - 否则保留失败态

7. **输出结果**
   ```
   成功：
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
   失败：
   ✗ Fix 失败（<loop_count>/5 次尝试后仍未解决）
   已输出修复失败报告
   请人工介入分析
   ```

---
name: "OPENFLOW: Fix"
description: "问题处理流：问题识别 → 修复 → 验证 → 回滚循环（最多5次）。产出修复报告或失败报告"
category: Workflow
tags: [workflow, openflow]
---

执行问题处理流：对已识别的问题进行根因分析和修复验证，最多循环 5 次。

**输入**：change-id [可选的 issue-id]

**触发场景**
- Gate 3 报告审核判定存在失败后调用
- Gate 4 交付测试二轮打回后调用
- 其他阶段发现设计/代码/文档不一致时调用

**步骤**

1. **检查状态文件**
   - 读取 `.workflow/state/<change-id>.yaml`
   - 确认 `current_phase` 在 `development` 或 `delivery`（说明有问题待处理）
   - 如果提供了 issue-id，直接定位到该 issue
   - 如果未提供，检查 `phases.development.test_results.failed > 0` 或 Gate 状态

2. **读取上下文**
   - 读取 `at-exec-report.md` 了解失败详情
   - 读取 `design.md` 和 `testing-guide.md` 了解设计意图
   - 读取已有的 `issue-log-*.md` 了解历史修复记录

3. **问题识别**
   - 记录问题描述、根因分类（环境/代码/AT/设计）、影响范围
   - 初始化 `loop_count = 0`，`max_loops = 5`
   - 产出 `.workflow/reports/<change-id>/issue-log-<n>.md`

4. **修复循环**（最多 5 次）
   - 4.1 根因分类：环境 / 代码 / AT / 设计
   - 4.2 按分类修复：
     - 环境问题 → 修复环境配置
     - 代码问题 → 修改需求代码
     - AT 问题 → 修改 AT 代码
     - 设计问题 → 修订 design.md
   - 4.3 重新执行对应 AT（编译 → 替换 → 执行）
   - 4.4 判断结果：
     - **通过** → 转到步骤 5
     - **不通过** → `loop_count++`
       - 如果 `loop_count < 5` **且** 能分析出新原因：
         → **回滚上一次修复中不必要的/错误的代码修改**
         → 回到 4.1 重新识别
       - 否则：
         → 产出 `.workflow/reports/<change-id>/fix-failure-report.md`
         → 转到步骤 6

5. **修复成功**
   - 产出 `.workflow/reports/<change-id>/fix-verify-<n>.md`
   - 更新相关文档（spec / design / testing-guide 与实际修复对齐）

6. **更新状态文件**
   - 追加 issue 记录到 `issues[]`，含每次修复尝试和回滚记录
   - 更新 `phases.development.gate` 或 `phases.delivery.gate` 状态

7. **输出结果**
   ```
   成功：
   ✓ Fix 完成
   issue-<n> 已修复，验证通过
   文档已同步更新
   返回主流程，继续执行 /openflow:build 或 /openflow:close
   ```

   **相关文档：**
   - [.workflow/reports/<id>/issue-log-<n>.md](.workflow/reports/<id>/issue-log-<n>.md)
   - [.workflow/reports/<id>/fix-verify-<n>.md](.workflow/reports/<id>/fix-verify-<n>.md)（成功时）
   - [.workflow/reports/<id>/fix-failure-report.md](.workflow/reports/<id>/fix-failure-report.md)（失败时）

   ```
   失败：
   ✗ Fix 失败（<loop_count> 次尝试后仍未解决）
   已输出修复失败报告
   请人工介入分析
   ```
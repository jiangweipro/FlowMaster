---
name: "OPENFLOW: Plan"
description: "Phase 2: 生成测试方案 → 任务拆分 → 自检报告，产出 testing-guide + tasks。停等 Gate 2"
category: Workflow
tags: [workflow, openflow]
---

执行 Phase 2 用例阶段：基于设计文档生成测试方案和任务清单，停等人工审核。

**输入**：change-id

**步骤**

1. **检查前置条件**
   - 读取 `.workflow/state/<change-id>.yaml`
   - 确认 `phases.design.status: done` 且 `phases.design.gate.status: passed`
   - 否则报错：提示先完成 Design 阶段并通过 Gate 1

2. **读取上下文**
   - 读取 `openspec/changes/<change-id>/proposal.md` 了解需求范围
   - 读取 `openspec/changes/<change-id>/design.md` 了解技术方案
   - 读取 `openspec/specs/<cap>/spec.md` 了解规格要求

3. **生成用例文档**（按顺序连续执行，不中断）
   - 3.1 生成测试方案：基于设计文档，确定覆盖点、预期结果、边界条件
     - 产出 `openspec/changes/<change-id>/testing-guide.md`
   - 3.2 任务拆分：将实现工作拆解为可验证的子任务
     - 产出 `openspec/changes/<change-id>/tasks.md`
   - 3.3 自检并输出阶段报告
     - 检查场景覆盖完整性、任务可验证性
     - 产出 `.workflow/reports/<change-id>/testcase-report.md`

4. **更新状态文件**
   - `phases.testcase.status: done`
   - `phases.testcase.gate.status: pending`
   - `current_phase: development`

5. **输出结果**
   ```
   ✓ Plan 阶段完成
   ```

   **产出物：**
   - [openspec/changes/<id>/testing-guide.md](openspec/changes/<id>/testing-guide.md)
   - [openspec/changes/<id>/tasks.md](openspec/changes/<id>/tasks.md)
   - [.workflow/reports/<id>/testcase-report.md](.workflow/reports/<id>/testcase-report.md)

   ```
   ▶ 等待 Gate 2: 用例审核（人工/邮件）
   请审核上述文档，通过后运行 /openflow:build <change-id>
   ```
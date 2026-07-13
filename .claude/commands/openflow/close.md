---
name: "OPENFLOW: Close"
description: "Phase 4: 更新文档 → 归档。完结需求生命周期"
category: Workflow
tags: [workflow, openflow]
---

执行 Phase 4 交付阶段：更新文档、归档需求。

**输入**：change-id

**步骤**

1. **检查前置条件**
   - 读取 `.workflow/state/<change-id>.yaml`
   - 确认 `phases.development.gate.status: passed`（Gate 3 已通过）
   - 确认 `phases.delivery.gate.status: passed`（Gate 4 已通过）
   - 如果 Gate 4 未通过，提示先人工完成交付测试二轮

2. **读取上下文**
   - 读取 `openspec/changes/<change-id>/proposal.md`、`design.md`、`testing-guide.md`
   - 读取实际代码，确认文档与实现一致

3. **更新文档**
   - 检查 `spec.md` / `design.md` / `testing-guide.md` 是否与实际代码一致
   - 如有不一致，更新文档对齐实际实现
   - 文档一致性自检通过

4. **归档**
   - 运行 `openspec archive <change-id>` 归档 OpenSpec change
   - 更新状态文件：`status: archived`，`current_phase: closure`
   - （可选）清理 `.workflow/reports/<change-id>/` 下的报告文件

5. **输出结果**
   ```
   ✓ Close 完成
   change: <change-id>
   文档已对齐，需求已归档

   需求开发流程完结
   ```

   **归档文档：**
   - [openspec/specs/<cap>/spec.md](openspec/specs/<cap>/spec.md)
   - [openspec/changes/<id>/design.md](openspec/changes/<id>/design.md)
   - [openspec/changes/<id>/testing-guide.md](openspec/changes/<id>/testing-guide.md)
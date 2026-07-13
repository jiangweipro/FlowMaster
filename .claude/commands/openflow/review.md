---
name: "OPENFLOW: Review"
description: "人工审核 Gate：通过或打回当前阶段的产出。推进流程或退回修订"
category: Workflow
tags: [workflow, openflow]
---

人工审核当前 Gate，通过则推进到下一阶段，打回则退回修订。

**输入**：`change-id [pass|reject] [审核意见]`

**步骤**

1. **读取状态文件**
   - 读取 `.workflow/state/<change-id>.yaml`
   - 找到当前 `gate.status: pending` 的 phase

2. **确定审核动作**
   - 如果输入为 `pass` 或 `通过`：
     - Gate 状态设为 `passed`，记录审核人和时间
     - 推进到下一阶段：`current_phase` 指向下一个 phase
     - 输出下一步建议
   - 如果输入为 `reject` 或 `打回`：
     - Gate 状态设为 `rejected`，记录打回原因
     - 当前 phase 标记为需修订：`status: revision_needed`
     - 输出修订指引
   - 如果无输入：
     - 列出当前 Gate 的状态、审核对象路径、审核要点
     - 提示用户输入 `pass` 或 `reject`

3. **输出结果**

   通过时：
   ```
   ✓ Gate <n> 已通过
   change: <change-id>
   审核人: <user>
   
   下一阶段已就绪，运行：
     /openflow:plan <change-id>     (Gate 1 通过后)
     /openflow:build <change-id>    (Gate 2 通过后)
     /openflow:close <change-id>    (Gate 3 通过后)
   ```

   打回时：
   ```
   Gate <n> 已打回
   change: <change-id>
   原因：<审核意见>
   
   请修订后重新运行当前阶段命令
   ```
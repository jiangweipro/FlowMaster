---
name: openflow-review
description: "人工审核 Gate：通过或打回当前阶段的产出。推进流程或退回修订"
metadata:
  author: FlowMaster
  version: "1.0"
  category: Workflow
  tags: [openflow, review, gate]
---

# OPENFLOW: Review

人工审核当前 Gate，通过则推进到下一阶段，打回则退回修订。

## 输入

`change-id [pass | reject] [审核意见]`

## 步骤

### Step 1: 读取状态文件

读取 `.workflow/state/<change-id>.yaml`，找到当前 `gate.status: pending` 的 phase：

| 当前 phase | Gate | 审核对象 |
|---|---|---|
| design → testcase | Gate 1: 接需求 | proposal + specs + design + design-report |
| testcase → development | Gate 2: 用例审核 | testing-guide + tasks + testcase-report |
| development → delivery | Gate 3: 报告审核 | at-exec-report |
| delivery → closure | Gate 4: 交付测试二轮 | 代码 + 文档 + 测试报告 |

### Step 2: 处理审核结果

**通过（pass）**：

```yaml
phases.<当前phase>.gate:
  status: passed
  reviewer: <当前用户>
  reviewed_at: "<ISO 时间戳>"
  review_notes: "<审核意见>"
```

- 当前 phase 保持 `done`
- 下一 phase 的 `blocked_by` 解除
- 如果下一 phase 是 `delivery`，标记 Gate 4 为 `pending`（等待人工测试）

**打回（reject）**：

```yaml
phases.<当前phase>.gate:
  status: rejected
  reviewer: <当前用户>
  reviewed_at: "<ISO 时间戳>"
  review_notes: "<打回原因>"
```

- 当前 phase 标记为 `revision_needed`
- 提示用户修订后重新执行对应的 openflow 命令

### Step 3: 输出结果

通过时：
```
✓ Gate <N> 已通过
  change: <change-id>
  审核人: <user>
  意见: <审核意见>

  下一阶段：
    Gate 1 → /openflow:plan <change-id>
    Gate 2 → /openflow:build <change-id>
    Gate 3 → /openflow:close <change-id>
```

打回时：
```
Gate <N> 已打回
  change: <change-id>
  原因: <审核意见>

  修订后重新执行：
    Gate 1 → /openflow:design <change-id>
    Gate 2 → /openflow:plan <change-id>
    Gate 3 → /openflow:build <change-id>
```

## 输出

- 更新后的 `.workflow/state/<change-id>.yaml`
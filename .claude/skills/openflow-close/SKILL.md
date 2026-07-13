---
name: openflow-close
description: "Phase 4: 更新文档 → 归档。完结需求生命周期"
metadata:
  author: FlowMaster
  version: "1.0"
  category: Workflow
  tags: [openflow, close, archive]
---

# OPENFLOW: Close

执行 Phase 4 交付阶段：更新文档、归档需求。

## 输入

change-id（必填）。

## 前置条件

- Build 阶段已完成且 Gate 3 已通过
- 人工已完成交付测试二轮（Gate 4 已通过）
- 状态文件中 `phases.development.gate.status: passed` 且 `phases.delivery.gate.status: passed`

## 步骤

### Step 1: 检查前置条件

读取 `.workflow/state/<change-id>.yaml`，确认：

- `phases.development.gate.status: passed`（Gate 3 已通过）
- `phases.delivery.gate.status: passed`（Gate 4 已通过）
- `current_phase: closure`

如果 Gate 4 未通过，提示先完成交付测试二轮。

### Step 2: 读取上下文

- 读取 `openspec/changes/<change-id>/proposal.md` — 原始需求
- 读取 `openspec/changes/<change-id>/design.md` — 设计文档
- 读取 `openspec/changes/<change-id>/testing-guide.md` — 测试方案
- 读取 `openspec/specs/<cap>/spec.md` — 规格说明
- 读取实际代码文件

### Step 3: 文档一致性检查

逐项检查文档是否与实际代码一致：

| 文档 | 检查内容 |
|---|---|
| `spec.md` | 功能规格是否与实现一致 |
| `design.md` | 接口、数据流、架构是否与代码一致 |
| `testing-guide.md` | 测试场景和预期是否与实际测试一致 |

如有不一致，更新文档对齐实际实现。

### Step 4: 归档

1. 运行 `openspec archive <change-id>` 归档 OpenSpec change
2. 更新状态文件：

```yaml
status: archived
current_phase: closure
phases:
  closure:
    status: done
    docs_updated: true
```

### Step 5: 输出结果

```
✓ Close 完成
  change: <change-id>
  文档已对齐，需求已归档

  需求开发流程完结
  总耗时: <各阶段时间>
```

## 输出

- 更新后的文档（[spec.md](openspec/specs/<capability>/spec.md) / [design.md](openspec/changes/<change-id>/design.md) / [testing-guide.md](openspec/changes/<change-id>/testing-guide.md)）
- 更新后的 `.workflow/state/<change-id>.yaml`（status: archived）
- OpenSpec change 已归档

## Gate 4: 交付测试二轮（人工）

此 Gate 在 Close 之前由人工完成，不包含在 Close 命令中。

审核对象：代码 + 文档 + 测试报告
通过条件：交付物完整、质量达标、文档与代码一致
不通过：执行 openflow-fix 进入问题处理流
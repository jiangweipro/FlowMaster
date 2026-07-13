---
name: openflow-status
description: "查看所有或指定需求的当前阶段和 Gate 状态"
metadata:
  author: FlowMaster
  version: "1.0"
  category: Workflow
  tags: [openflow, status, query]
---

# OPENFLOW: Status

查看需求的当前进度和 Gate 状态。

## 输入

`[change-id]`（可选，不指定则列出所有活跃需求）

## 步骤

### Step 1: 读取状态文件

- 如果指定了 change-id：读取 `.workflow/state/<change-id>.yaml`
- 如果未指定：读取 `.workflow/state/` 下所有 `.yaml` 文件

### Step 2: 输出状态

**单个需求明细**：

```
change: <change-id>
title: <需求标题>
status: active | paused | completed | archived

┌─────────────────────────────────────────────────────────────┐
│ 阶段        │ 状态  │ Gate          │ 审核人     │ 时间     │
├─────────────────────────────────────────────────────────────┤
│ Design      │ ✓done │ Gate 1: 通过  │ 张三      │ 07-09   │
│ Plan        │ →     │ Gate 2: 待审核│ —          │ —       │
│ Build       │ ⛔    │ waiting       │ —          │ —       │
│ Close       │ ⛔    │ waiting       │ —          │ —       │
└─────────────────────────────────────────────────────────────┘

当前阶段: Plan
下一步: /openflow:review <change-id> pass/reject
```

**所有需求概览**：

```
change-id          | title          | phase   | gate   | status
───────────────────┼────────────────┼─────────┼────────┼────────
add-user-auth      | 用户认证功能   | plan    | 待审核 | active
data-export-v2     | 数据导出升级   | build   | 待审核 | active
fix-perf-regression| 性能回归修复   | design  | 待审核 | paused
```

## 输出

状态汇总信息。

## 状态符号说明

| 符号 | 含义 |
|---|---|
| ✓done | 完成 |
| → | 进行中 |
| ⛔ | 等待前置条件 |
| ✗ | 失败/打回 |
| — | 未开始 |
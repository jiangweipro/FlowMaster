---
name: "OPENFLOW: Status"
description: "查看所有或指定需求的当前阶段和 Gate 状态"
category: Workflow
tags: [workflow, openflow]
---

查看需求的当前进度和 Gate 状态。

**输入**：`[change-id]`（可选，不指定则列出所有活跃需求）

**步骤**

1. **读取状态文件**
   - 如果指定了 change-id：读取 `.workflow/state/<change-id>.yaml`
   - 如果未指定：读取 `.workflow/state/` 下所有 `.yaml` 文件

2. **输出状态**

   单个需求明细：
   ```
   change: add-user-auth
   title: 用户认证功能
   status: active
   
   ─────────────────────────────────────────────
    Design    [✓]  Gate 1: 通过 (张三, 2026-07-09)
    Plan      [→]  Gate 2: 待审核
    Build     [ ]  ⛔ 等待 plan.gate
    Close     [ ]  ⛔ 等待 build.gate
   ─────────────────────────────────────────────
   ```

   所有需求概览：
   ```
   change-id          | title          | phase   | gate   | status
   ───────────────────┼────────────────┼─────────┼────────┼────────
   add-user-auth      | 用户认证功能   | plan    | 待审核 | active
   data-export-v2     | 数据导出升级   | build   | 待审核 | active
   fix-perf-regression| 性能回归修复   | design  | 待审核 | paused
   ```
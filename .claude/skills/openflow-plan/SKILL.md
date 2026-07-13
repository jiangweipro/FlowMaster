---
name: openflow-plan
description: "Phase 2: 生成测试方案 → 任务拆分 → 自检报告，产出 testing-guide + tasks。停等 Gate 2"
metadata:
  author: FlowMaster
  version: "1.0"
  category: Workflow
  tags: [openflow, plan, gate-2]
---

# OPENFLOW: Plan

执行 Phase 2 用例阶段：基于设计文档生成测试方案和任务清单，停等人工审核。

## 输入

change-id（必填）。

## 前置条件

- Design 阶段已完成且 Gate 1 已通过
- 状态文件中 `phases.design.status: done` 且 `phases.design.gate.status: passed`

## 步骤

### Step 1: 检查前置条件

读取 `.workflow/state/<change-id>.yaml`，确认：

- `phases.design.status: done`
- `phases.design.gate.status: passed`
- `current_phase: testcase`

否则报错：提示先完成 Design 阶段并通过 Gate 1。

### Step 2: 读取上下文

- 读取 `openspec/changes/<change-id>/proposal.md` — 需求范围
- 读取 `openspec/changes/<change-id>/design.md` — 技术方案和接口
- 读取 `openspec/specs/<cap>/spec.md` — 功能规格
- 读取 `.workflow/reports/<change-id>/design-report.md` — 设计的遗留问题

### Step 3: 生成测试方案

产出 `openspec/changes/<change-id>/testing-guide.md`，包含：

| 章节 | 内容 |
|---|---|
| 测试范围 | 被测功能、不在范围内的功能 |
| 测试环境 | 环境要求、配置、依赖 |
| 测试矩阵 | 场景 × 预期结果，含正常路径、边界条件、异常情况 |
| Mock 策略 | 需要模拟的外部依赖 |
| 测试数据 | 前置条件、数据准备 |

### Step 4: 任务拆分

产出 `openspec/changes/<change-id>/tasks.md`：

```markdown
## 1. <任务组>

- [ ] 1.1 <子任务描述>
- [ ] 1.2 <子任务描述>

## 2. <任务组>
...
```

规范：
- 按依赖关系分组
- 每个子任务可独立验证
- 粒度适合单次 AI 执行

### Step 5: 自检并输出阶段报告

产出 `.workflow/reports/<change-id>/testcase-report.md`：

```markdown
# 测试用例报告 — <change-id>

执行时间：<ISO 时间戳>
执行阶段：testcase

## 产出物
- <文件路径>

## 自检结果
- 测试场景总数：<N>
- 正常路径覆盖：<N> 个
- 边界条件覆盖：<N> 个
- 异常情况覆盖：<N> 个
- 每个场景有明确预期结果：是/否
- 覆盖设计中所有接口：是/否（来源：design.md）

## 遗留问题
- <问题描述>

## 下一步建议
- 等待 Gate 2 人工审核
```

### Step 6: 更新状态文件

```yaml
phases:
  testcase:
    status: done
    artifacts:
      - openspec/changes/<id>/testing-guide.md
      - openspec/changes/<id>/tasks.md
    report: .workflow/reports/<id>/testcase-report.md
    gate:
      status: pending
  development:
    status: in_progress  # 等待 Gate 2 通过后执行
```

`current_phase` 设为 `development`。

### Step 7: 输出结果

```
✓ Plan 阶段完成
```

**产出物：**

- [openspec/changes/<id>/testing-guide.md](openspec/changes/<id>/testing-guide.md)
- [openspec/changes/<id>/tasks.md](openspec/changes/<id>/tasks.md)
- [.workflow/reports/<id>/testcase-report.md](.workflow/reports/<id>/testcase-report.md)

```
▶ 等待 Gate 2: 用例审核（人工/邮件）
请审核上述文档，通过后执行 openflow-build
```

## 输出

- [openspec/changes/<change-id>/testing-guide.md](openspec/changes/<change-id>/testing-guide.md)
- [openspec/changes/<change-id>/tasks.md](openspec/changes/<change-id>/tasks.md)
- [.workflow/reports/<change-id>/testcase-report.md](.workflow/reports/<change-id>/testcase-report.md)
- 更新后的 `.workflow/state/<change-id>.yaml`

## Gate 2: 用例审核（人工，可邮件）

审核对象：
- `testing-guide.md` — 覆盖充分性、预期正确性
- `tasks.md` — 任务拆解合理性
- `testcase-report.md` — 自检结果

通过条件：测试覆盖充分、预期结果正确、任务拆解合理。
不通过：退回修订，重新执行 openflow-plan。
---
name: openflow-fix
description: "问题处理流：问题识别 → 修复 → 验证 → 回滚循环（最多5次）。产出修复报告或失败报告"
metadata:
  author: FlowMaster
  version: "1.0"
  category: Workflow
  tags: [openflow, fix, subprocess]
---

# OPENFLOW: Fix

执行问题处理流：对已识别的问题进行根因分析和修复验证，最多循环 5 次。

## 输入

`change-id [可选的 issue-id]`

## 触发场景

- Gate 3 报告审核判定存在失败后
- Gate 4 交付测试二轮打回后
- 其他阶段发现设计/代码/文档不一致

## 步骤

### Step 1: 检查状态文件

读取 `.workflow/state/<change-id>.yaml`：

- 确认 `current_phase` 在 `development` 或 `delivery`
- 如果提供了 issue-id，直接定位到该 issue
- 如果未提供，检查 `phases.development.test_results.failed > 0`

### Step 2: 读取上下文

- 读取 `at-exec-report.md` — 了解失败详情和归因
- 读取 `openspec/changes/<change-id>/design.md` — 了解设计意图
- 读取 `openspec/changes/<change-id>/testing-guide.md` — 了解测试预期
- 读取已有的 `issue-log-*.md` — 了解历史修复记录

### Step 3: 问题识别

产出 `.workflow/reports/<change-id>/issue-log-<n>.md`：

```markdown
# 问题记录 — <change-id>

问题编号：<n>
发现阶段：<development | delivery>
触发场景：<Gate 3 | Gate 4 | 其他>

## 问题描述
<问题简述>

## 根因分类
<environment | code | at | design>

## 影响范围
<受影响的功能或模块>

## 修复目标
<期望的修复结果>
```

### Step 4: 修复循环

循环执行，最多 5 次：

```
loop_count = 0
while loop_count < 5:
  4.1 根因分类（环境/代码/AT/设计）
  4.2 按分类执行修复：
      - 环境问题 → 修复环境配置
      - 代码问题 → 修改需求代码
      - AT 问题 → 修改 AT 代码
      - 设计问题 → 修订 design.md
  4.3 重新执行对应 AT（编译 → 替换 → 执行）
  4.4 判断结果：
      if 通过:
        转到 Step 5
      else:
    loop_count++
        if loop_count < 5 且 能分析出新原因:
          回滚本次修复中不必要的/错误的代码修改
          继续循环（回到 4.1）
        else:
          产出修复失败报告
          转到 Step 6
```

**关键约束**：
- 每次重新分析前，必须回滚上一次修复中不必要的/错误的修改
- 确保从干净状态重新分析，不被遗留代码污染
- 每次循环记录修复尝试详情

### Step 5: 修复成功

产出 `.workflow/reports/<change-id>/fix-verify-<n>.md`：

```markdown
# 修复验证报告 — <change-id>

问题编号：<n>
修复次数：<loop_count>

## 修复内容
- <修复了什么>

## 验证结果
- 对应 AT 执行：通过

## 文档同步
- [ ] design.md 已更新
- [ ] testing-guide.md 已更新
- [ ] spec.md 已更新
```

更新相关文档（spec / design / testing-guide 与实际修复对齐）。

### Step 6: 修复失败

产出 `.workflow/reports/<change-id>/fix-failure-report.md`：

```markdown
# 修复失败报告 — <change-id>

问题编号：<n>
循环次数：<loop_count>/5

## 修复尝试记录

| 尝试 | 修复内容 | 结果 | 回滚 |
|---|---|---|---|
| 1 | <修复内容> | 失败 | 已回滚 |
| 2 | <修复内容> | 失败 | 已回滚 |
| ... | ... | ... | ... |

## 失败原因
- 已达最大循环次数（5 次）
- 无法分析出新原因

## 遗留代码变更
- 已回滚的修改：<清单>
- 保留的修改：<清单（如有）>
```

### Step 7: 更新状态文件

```yaml
issues:
  - id: <n>
    phase: development
    type: <environment | code | at | design>
    summary: "<问题简述>"
    log: .workflow/reports/<id>/issue-log-<n>.md
    fix_attempts:
      - attempt: 1
        fix: "<修复内容>"
        rolled_back: true
        result: failed
    loop_count: <N>
    max_loops: 5
    resolved: <true | false>
    failure_report: .workflow/reports/<id>/fix-failure-report.md  # 仅失败时有
```

### Step 8: 输出结果

```
成功:
✓ Fix 完成
  issue-<n> 已修复，验证通过
  文档已同步更新
  返回主流程 → 执行 openflow-build 或 openflow-close
```

**相关文档：**

- [.workflow/reports/<id>/issue-log-<n>.md](.workflow/reports/<id>/issue-log-<n>.md)
- [.workflow/reports/<id>/fix-verify-<n>.md](.workflow/reports/<id>/fix-verify-<n>.md)（成功时）
- [.workflow/reports/<id>/fix-failure-report.md](.workflow/reports/<id>/fix-failure-report.md)（失败时）

```
失败:
✗ Fix 失败（<N> 次尝试后仍未解决）
  已输出修复失败报告
  请人工介入分析
```

## 输出

- [.workflow/reports/<change-id>/issue-log-<n>.md](.workflow/reports/<change-id>/issue-log-<n>.md)
- [.workflow/reports/<change-id>/fix-verify-<n>.md](.workflow/reports/<change-id>/fix-verify-<n>.md)（成功时）
- [.workflow/reports/<change-id>/fix-failure-report.md](.workflow/reports/<change-id>/fix-failure-report.md)（失败时）
- 更新后的 `.workflow/state/<change-id>.yaml`
- 更新的文档（[spec.md](openspec/specs/<capability>/spec.md) / [design.md](openspec/changes/<change-id>/design.md) / [testing-guide.md](openspec/changes/<change-id>/testing-guide.md)）

## 规则

| 规则 | 说明 |
|---|---|
| 最大循环 | 5 次，超限后输出失败报告，不再重试 |
| 代码回滚 | 每次重试前回滚上一次错误的修复，保持干净状态 |
| 文档同步 | 修复成功后必须同步更新相关文档 |
| 重复触发 | 同一个 issue 再次触发时继续累加 loop_count |
---
name: openflow-design
description: "Phase 1: 需求探索 → 并发生成 proposal + specs + design → 自检报告。停等 Gate 1"
metadata:
  author: FlowMaster
  version: "1.0"
  category: Workflow
  tags: [openflow, design, gate-1]
---

# OPENFLOW: Design

执行 Phase 1 设计阶段：从需求描述出发，产出设计文档，停等人工审核。

## 输入

需求描述（自然语言），或 change-id（继续已有 change）。

## 工作目录

项目根目录（含 `.workflow/` 和 `openspec/` 结构）。

## 依赖

- OpenSpec CLI（`openspec` 命令可用）
- 项目已初始化 OpenSpec（`openspec init` 已执行）
- `.workflow/config.yaml` 已配置（可选，但建议）

## 步骤

### Step 1: 确定输入

- 如果输入是 **change-id**：直接使用已有 change，**跳过探索步骤**，转到 Step 4（初始化状态文件）
- 如果输入是**需求描述**或**无输入**：进入 Step 2 需求探索，先澄清需求再创建 change

### Step 2: 需求探索（交互式）

> **目的**：在生成提案之前，通过交互式对话完全理解需求，避免直接根据模糊描述生成不准确的文档。

采用 **探索模式（Explore Mode）** 的 stance 与用户对话：

**核心原则：**
- **好奇而非预设** — 从用户描述中自然生发问题，不按固定脚本走
- **多线程而非审问** — 提出多个有趣的方向，让用户选择关注点，不 funnel 成单一问题链
- **可视化** — 善用 ASCII 图、对比表、流程图帮助思考
- **自适应** — 跟随有价值的线索，新信息出现时及时调整方向
- **耐心** — 不急于下结论，让问题轮廓自然浮现
- **接地** — 必要时查阅实际代码库，不空谈

**探索方向（根据情况灵活选择）：**

| 方向 | 典型问题 |
|---|---|
| 问题/机会 | 这个需求解决什么核心问题？当前痛点是什么？ |
| 目标用户 | 谁在使用这个功能？使用场景是什么？ |
| 范围边界 | 做哪些？明确不做哪些？MVP 范围是什么？ |
| 技术约束 | 有什么技术栈限制？需要兼容什么？性能要求？ |
| 依赖关系 | 依赖其他模块吗？其他团队在做什么？ |
| 风险评估 | 难点在哪里？有什么不确定性？ |
| 验收标准 | 怎么算做完？怎么验证成功？ |

**流程：**
1. 读取现有上下文（`openspec/config.yaml`、`openspec/specs/`、代码库相关部分）
2. 与用户展开对话，逐步澄清需求
3. 每轮对话后，可以总结当前理解，让用户确认或纠偏
4. 当用户确认需求已清晰时，进入下一步

**结束条件：** 用户明确表示需求已清晰，或你说出"需求已经清晰了，可以开始生成提案了吗？"并得到用户确认。

### Step 3: 创建 change（提供 3 个候选名）

根据探索结果，从不同角度生成 **3 个候选 kebab-case 名称**，让用户选择：

| 角度 | 示例 |
|---|---|
| 功能导向 | `add-dark-mode` |
| 问题导向 | `fix-auth-timeout` |
| 领域术语 | `unified-oauth-provider` |

流程：
1. 列出 3 个候选名并简要说明每个名称的侧重点
2. 用户选择其一，或提供自定义名称
3. 运行 `openspec new change "<选定的名称>"`

如果用户都不满意，可以根据用户反馈调整后重新提供。

### Step 4: 初始化状态文件

创建 `.workflow/state/<change-id>.yaml`：

```yaml
change: <change-id>
title: "<需求简述>"
status: active
current_phase: design

phases:
  design:
    status: in_progress
    artifacts: []
    report: null
    gate:
      status: pending
  testcase:
    status: blocked
    blocked_by: [design.gate]
  development:
    status: blocked
    blocked_by: [testcase.gate]
  delivery:
    status: blocked
    blocked_by: [development.gate]
  closure:
    status: blocked
    blocked_by: [delivery.gate]
```

如果状态文件已存在，检查当前 phase 是否为 `design`，否则报错。

### Step 5: 读取上下文

- 读取 `openspec/config.yaml` 了解项目上下文（技术栈、规范）
- 读取 `.workflow/config.yaml` 了解项目配置
- 读取 `openspec/specs/` 下已有 specs，了解现有 capability
- 读取 `openspec/changes/<change-id>/` 下已有内容（如果是继续已有 change）

### Step 6: 并发生成设计文档（并行子 agent）

> **依据**：基于 Step 2 需求探索中与用户达成共识的理解，三份文档内容独立、可并行生成。
> **方式**：启动多个子 agent 并发执行，各自写入对应文件，全部完成后合并进入自检。

**并行任务：**

| # | 子 Agent | 产出文件 | 内容 |
|---|---|---|---|
| A | **提案生成** | `openspec/changes/<id>/proposal.md` | Why / What Changes / Capabilities / Impact |
| B | **规格生成** | `openspec/specs/<capability>/spec.md` | Requirement (SHALL/MUST) / Scenarios (WHEN/THEN) |
| C | **设计生成** | `openspec/changes/<id>/design.md` | Context / Goals & Non-Goals / Decisions / Risks / Open Questions |

**执行说明：**
- 三个子 agent 共享同一份**探索摘要**（Step 2 中与用户达成共识的核心结论）
- 每个子 agent 独立工作，互不依赖，写入各自的文件路径
- 如果某个子 agent 产出涉及新增 capability，其他 agent 按同一名称体系自动对齐（通过共享的探索共识中的 capability 列表来保证一致性）
- 所有子 agent 完成后统一继续

**各子 agent 规范：**

**Agent A — 提案（proposal.md）：**
| 章节 | 内容 |
|---|---|
| Why | 1-2 句说明问题或机会（源自探索阶段的共识） |
| What Changes | 具体变更清单，标记 BREAKING（源自探索阶段确认的范围） |
| Capabilities | 新增/修改的 capability 列表 |
| Impact | 影响范围：代码、API、依赖 |

注意：如果探索阶段有未关闭的遗留问题，须在 proposal.md 中记录为 Open Questions 或假设条件。

**Agent B — 规格（spec.md）：**
每个 capability 一个文件，产出 `openspec/specs/<capability>/spec.md`。

| 章节 | 内容 |
|---|---|
| Requirement | 功能需求描述（SHALL/MUST 格式） |
| Scenarios | 测试场景（WHEN/THEN 格式），每个 requirement 至少一个 scenario |

**Agent C — 设计（design.md）：**
产出 `openspec/changes/<change-id>/design.md`。

| 章节 | 内容 |
|---|---|
| Context | 背景、当前状态、约束、利益相关方 |
| Goals / Non-Goals | 设计目标和明确排除的范围（源自探索阶段确认的边界） |
| Decisions | 关键技术决策及理由（为什么选 A 不选 B） |
| Risks / Trade-offs | 探索阶段已识别的风险 + 新增风险及缓解措施 |
| Open Questions | 探索阶段未关闭的决策或未知项 |

### Step 7: 自检并输出阶段报告

产出 `.workflow/reports/<change-id>/design-report.md`：

```markdown
# 设计报告 — <change-id>

执行时间：<ISO 时间戳>
执行阶段：design

## 变更清单
- 新增：[openspec/changes/<id>/proposal.md](openspec/changes/<id>/proposal.md)
- 新增：[openspec/specs/<cap>/spec.md](openspec/specs/<cap>/spec.md)
- 新增：[openspec/changes/<id>/design.md](openspec/changes/<id>/design.md)

## 产出物
- <文件路径>（<行数>）

## 自检结果
- 需求可理解：是
- 范围边界清晰：是
- 接口定义数量：<N> 个（来源：design.md §接口定义）
- 每个接口有错误处理：是/否（来源：design.md）
- 关键决策有理由：是/否（来源：design.md）

## 遗留问题
- <问题描述>（无则写"无"）

## 下一步建议
- 等待 Gate 1 人工审核
```

### Step 8: 更新状态文件

```yaml
phases:
  design:
    status: done
    artifacts:
      - openspec/changes/<id>/proposal.md
      - openspec/specs/<cap>/spec.md
      - openspec/changes/<id>/design.md
    report: .workflow/reports/<id>/design-report.md
    gate:
      status: pending
  testcase:
    status: in_progress  # 等待 Gate 1 通过后执行
```

`current_phase` 设为 `testcase`。

### Step 9: 输出结果

```
✓ Design 阶段完成
```

**产出物：**

- [openspec/changes/<id>/proposal.md](openspec/changes/<id>/proposal.md)
- [openspec/specs/<cap>/spec.md](openspec/specs/<cap>/spec.md)
- [openspec/changes/<id>/design.md](openspec/changes/<id>/design.md)
- [.workflow/reports/<id>/design-report.md](.workflow/reports/<id>/design-report.md)

```
▶ 等待 Gate 1: 接需求（人工审核）
请审核上述文档，通过后执行 openflow-review
```

## 输出

- [openspec/changes/<change-id>/proposal.md](openspec/changes/<change-id>/proposal.md)
- [openspec/specs/<capability>/spec.md](openspec/specs/<capability>/spec.md)（每个 capability 一个）
- [openspec/changes/<change-id>/design.md](openspec/changes/<change-id>/design.md)
- [.workflow/reports/<change-id>/design-report.md](.workflow/reports/<change-id>/design-report.md)
- 更新后的 `.workflow/state/<change-id>.yaml`

## Gate 1: 接需求（人工）

审核对象：
- `proposal.md` — 需求范围、目标、影响（是否准确反映探索阶段达成的共识）
- `specs/*/spec.md` — 功能规格完整性
- `design.md` — 技术方案可行性
- `design-report.md` — 自检结果和遗留问题

通过条件：需求清晰、方案可行、范围边界合理，且与探索阶段的共识一致。
不通过：退回修订，重新执行 openflow-design。
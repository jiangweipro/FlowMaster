---
name: "OPENFLOW: Design"
description: "Phase 1: 需求探索 → 并发生成 proposal + specs + design → 自检报告。停等 Gate 1"
category: Workflow
tags: [workflow, openflow]
---

执行 Phase 1 设计阶段：从需求描述出发，产出设计文档，停等人工审核。

**输入**：需求描述（自然语言），或 change-id（继续已有 change）

**步骤**

1. **确定输入**
   - 如果输入是 change-id：直接使用已有，跳过探索步骤，转到步骤 4
   - 如果输入是需求描述或无输入：进入步骤 2

2. **需求探索（交互式）**
   - 采用探索模式（Explore Mode）的 stance，与用户交互式澄清需求
   - 围绕问题/机会、目标用户、范围边界、技术约束、依赖关系、风险评估、验收标准等方向展开对话
   - 可视化、多线程、不急于结论
   - 直到用户确认需求已清晰

3. **创建 change（提供 3 个候选名）**
   - 根据探索结果，从功能导向、问题导向、领域术语等不同角度生成 3 个候选 kebab-case 名称
   - 用户选择其一，或提供自定义名称
   - 运行 `openspec new change "<选定的名称>"`

4. **初始化状态文件**
   - 创建 `.workflow/state/<change-id>.yaml`，`status: active`，`current_phase: design`
   - 如果已存在，检查当前 phase 是否在 design，否则报错

5. **读取上下文**
   - 读取 `openspec/config.yaml` 了解项目上下文
   - 读取 `.workflow/config.yaml` 了解项目配置（如有）
   - 读取 `openspec/specs/` 下已有 specs 了解现有 capability

6. **并发生成设计文档**（基于探索共识，启动多个子 agent 并行执行）
   - **并行子 agent A** — 需求分析：生成 `proposal.md`
     - 基于探索阶段达成的共识，理解需求背景、目标、约束、范围
     - 未关闭的遗留问题须记录为 Open Questions
   - **并行子 agent B** — 规格说明：生成 `specs/<capability>/spec.md`（每个 capability 一个）
     - 基于探索阶段明确的验收标准，推导可测试的规格
   - **并行子 agent C** — 技术设计：生成 `design.md`
     - 基于探索阶段确认的约束和风险评估
   - 三个子 agent 共享同一份探索摘要，独立工作互不依赖
   - 全部完成后统一进入自检

7. **自检并输出阶段报告**
   - 检查接口完整性、错误处理覆盖、关键决策有理由
   - 产出 `.workflow/reports/<change-id>/design-report.md`

8. **更新状态文件**
   - `phases.design.status: done`
   - `phases.design.gate.status: pending`
   - `current_phase: testcase`

9. **输出结果**
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
   请审核上述文档，通过后运行 /openflow:review <change-id>
   ```
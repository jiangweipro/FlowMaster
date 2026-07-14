---
name: "OPENFLOW: Build"
description: "Phase 3: 环境请求 → 开发 → 编 AT → 编译部署 → 执行 AT → 一次统一修复 → 报告。停等 Gate 3"
category: Workflow
tags: [workflow, openflow]
---

执行 Phase 3 开发阶段：生成需求代码与 AT 代码，执行 AT，仅做一次统一修复，输出测试报告。

> build 只做「一次修复」；循环修复（≤5 次）在 `openflow:fix`。

**输入**：change-id

**步骤**

1. **检查前置条件**
   - 读取 `.workflow/state/<change-id>.yaml`
   - 确认 `phases.testcase.status: done` 且 `phases.testcase.gate.status: passed`
   - `current_phase: development`，否则报错

2. **读取上下文**
   - 读取 `openspec/changes/<change-id>/design.md`（技术方案）
   - 读取 `openspec/changes/<change-id>/testing-guide.md`（测试方案）
   - 读取 `openspec/changes/<change-id>/tasks.md`（任务清单）
   - 读取 `.workflow/config.yaml`（编译/测试配置）

3. **环境请求**
   - 收集开发所需的全部环境信息：地址、端口、账号、数据库实例、依赖服务、配置参数
   - 信息不足则询问用户补齐
   - 验证环境可达性（端口通、服务在、账号有效）
   - 产出 `.workflow/reports/<change-id>/env-info.md`

4. **功能开发**
   - 基于 `design.md` + `tasks.md` 实现需求代码
   - 产出各模块 `src/` 下的代码文件

5. **编写 AT 代码**
   - 基于 `testing-guide.md` 编写自动化测试代码
   - 产出各模块 `tests/` 下的测试文件，风格对齐已有测试

6. **编译代码**
   - 按 `.workflow/config.yaml` 的 `build.command` 编译
   - 编译通过 → 继续 Step 7
   - 编译不通过 → 进入 Step 9 一次修复（`fix_scope: compile`）；修复后仍失败 → **build 失败终止**：产 `at-exec-report.md` 标注「编译未通过、未进入 AT 执行」，状态 `revision_needed`，停等 Gate 3

7. **替换补丁到测试环境**
   - 将编译产物部署/替换到目标测试环境
   - 确认替换成功、环境就绪，记录时间戳

8. **执行全部 AT 用例**（串行，不在本步修复）
   - 每条记录结果（通过 | 失败 + 归因）
   - 收集失败用例清单

9. **一次修复（统一一轮）** — 仅当存在失败用例时执行；全量通过则跳过
   - 汇总所有失败用例 → 统一根因分析 → 统一改代码 → 重新编译 → 替换补丁 → 重跑"失败用例"（非全量）
   - 重跑全部通过 → 标记「修复后通过」
   - 仍失败 → 标记 failed（记录归因）→ 回滚修复代码 → 重新编译替换
   - **只做这一次，不再循环**；仍失败交给 `openflow:fix`

10. **输出阶段报告**
    - 产出 `.workflow/reports/<change-id>/at-exec-report.md`
    - 含执行摘要（总数/通过/失败/修复后通过/修复回滚）、用例明细表、失败归因、遗留问题
    - 报告末尾提示：失败用例可由 `openflow:fix <change-id>` 继续处理

11. **更新状态文件**
    - `phases.development.status: done`（编译失败终止时为 `revision_needed`）
    - `test_results.cases[]` 记录每条最终结果（含 `fix_attempted` / `fix_rolled_back` / `failure_reason`）
    - `gate.status: pending`，`current_phase: delivery`

12. **输出结果**
    ```
    ✓ Build 阶段完成
    ```

    **产出物：**
    - [.workflow/reports/<id>/env-info.md](.workflow/reports/<id>/env-info.md)
    - 需求代码（`<模块>/src/`）
    - AT 代码（`<模块>/tests/`）
    - [.workflow/reports/<id>/at-exec-report.md](.workflow/reports/<id>/at-exec-report.md)

    ```
    执行结果：N/M 通过，K 条失败（已回滚修复）

    ▶ 等待 Gate 3: 报告审核（人工）
    请查看 at-exec-report.md
    Build 阶段结束后可进入：
      • /openflow:fix <change-id>     — 修复失败用例
      • /openflow:retest <change-id>  — 选择部分/全部用例回归重测
      • /openflow:close <change-id>   — 交付归档（全部通过时）
    ```

---
name: "OPENFLOW: Build"
description: "Phase 3: 环境请求 → 开发 → AT → 审核 → 编译部署 → 执行 → 修复回滚 → 报告。停等 Gate 3"
category: Workflow
tags: [workflow, openflow]
---

执行 Phase 3 开发阶段：从设计到可执行验证的完整链路，含编译部署、AT 执行、单次修复回滚。

**输入**：change-id

**步骤**

1. **检查前置条件**
   - 读取 `.workflow/state/<change-id>.yaml`
   - 确认 `phases.testcase.status: done` 且 `phases.testcase.gate.status: passed`
   - 否则报错：提示先完成 Plan 阶段并通过 Gate 2

2. **读取上下文**
   - 读取 `openspec/changes/<change-id>/design.md`（技术方案）
   - 读取 `openspec/changes/<change-id>/testing-guide.md`（测试方案）
   - 读取 `openspec/changes/<change-id>/tasks.md`（任务清单）
   - 读取 `.workflow/config.yaml`（编译/测试配置）

3. **环境请求**
   - 收集开发所需的全部环境信息：地址、端口、账号、数据库实例、依赖服务、配置参数
   - 如果环境信息已在 `.workflow/config.yaml` 或 `.claude/env.yaml` 中配置，直接从配置读取
   - 如果信息不足，询问用户补齐
   - 验证环境可达性（端口通、服务在、账号有效）
   - 产出 `.workflow/reports/<change-id>/env-info.md`

4. **功能开发**
   - 基于 design.md 实现需求代码
   - 产出各模块 `src/` 下的代码文件
   - 确保编译通过，不通过则自循环修复

5. **编写 AT 代码**
   - 基于 testing-guide.md 编写自动化测试代码
   - 产出各模块 `tests/` 下的测试文件

6. **AI 代码审核**
   - 调用审查 skill 对需求代码 + AT 代码进行自动化审查
   - 检查逻辑正确性、边界覆盖、编码规范、常见缺陷
   - 发现问题 → 回到步骤 4 或 5 修复，修复后重新审核
   - 通过 → 继续

7. **编译代码**
   - 根据 `.workflow/config.yaml` 中的编译配置执行编译
   - 编译不通过 → 回到步骤 4 修复
   - 产出编译产物

8. **替换补丁到测试环境**
   - 将编译产物部署/替换到目标测试环境
   - 确认替换成功、环境就绪

9. **逐条执行 AT 用例**（串行，每条独立处理）
   - 每执行一条，判断结果：
     - **通过** → 标记通过，继续下一条
     - **失败且未修复过** → 尝试修复该条：
       1. 分析失败原因，修改代码
       2. 重新编译 → 替换补丁 → 重跑该条
       3. 修复成功 → 标记通过，继续下一条
       4. 修复失败 → 标记失败，记录归因
          → **回滚修复代码** → 重新编译替换 → 继续下一条
     - **失败且已修复过** → 标记失败，记录归因
       → **回滚修复代码** → 重新编译替换 → 继续下一条

10. **输出阶段报告**
    - 汇总所有用例的执行结果、失败归因、修复记录、回滚记录
    - 产出 `.workflow/reports/<change-id>/at-exec-report.md`

11. **更新状态文件**
    - `phases.development.status: done`
    - `phases.development.test_results` 记录每条用例的结果
    - `phases.development.gate.status: pending`
    - `current_phase: delivery`

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
    请查看 at-exec-report.md，通过后运行 /openflow:close <change-id>
    如有失败需处理，运行 /openflow:fix <change-id>
    ```
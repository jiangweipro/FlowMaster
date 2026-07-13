---
name: openflow-build
description: "Phase 3: 环境请求 → 开发 → AT → 审核 → 编译部署 → 执行 → 修复回滚 → 报告。停等 Gate 3"
metadata:
  author: FlowMaster
  version: "1.0"
  category: Workflow
  tags: [openflow, build, gate-3]
---

# OPENFLOW: Build

执行 Phase 3 开发阶段：从设计到可执行验证的完整链路，含编译部署、AT 执行、单次修复回滚。

## 输入

change-id（必填）。

## 前置条件

- Plan 阶段已完成且 Gate 2 已通过
- 状态文件中 `phases.testcase.status: done` 且 `phases.testcase.gate.status: passed`

## 步骤

### Step 1: 检查前置条件

读取 `.workflow/state/<change-id>.yaml`，确认：

- `phases.testcase.status: done`
- `phases.testcase.gate.status: passed`
- `current_phase: development`

否则报错。

### Step 2: 读取上下文

- 读取 `openspec/changes/<change-id>/design.md` — 技术方案
- 读取 `openspec/changes/<change-id>/testing-guide.md` — 测试用例
- 读取 `openspec/changes/<change-id>/tasks.md` — 任务清单
- 读取 `.workflow/config.yaml` — 项目配置（编译命令、测试命令等）
- 读取 `.workflow/reports/<change-id>/testcase-report.md` — 用例阶段的遗留问题

### Step 3: 环境请求

收集开发所需的全部环境信息：

| 信息 | 来源 | 说明 |
|---|---|---|
| 地址/端口 | `.workflow/config.yaml` 或询问用户 | 目标服务地址 |
| 账号/凭据 | 环境配置或询问用户 | 认证信息 |
| 数据库/实例 | 环境配置或询问用户 | 测试目标实例 |
| 依赖服务 | 环境配置或询问用户 | 外部依赖可达性 |
| 配置参数 | 环境配置或询问用户 | 运行时参数 |

产出 `.workflow/reports/<change-id>/env-info.md`，包含：
- 环境信息清单
- 可达性验证结果（端口通、服务响应、账号有效）
- 注意事项

### Step 4: 功能开发

基于 design.md 和 tasks.md 实现需求代码：

1. 按 tasks.md 中的任务顺序依次实现
2. 每个任务完成后确保编译通过
3. 产出至对应模块的 `src/` 目录
4. 编译配置和命令从 `.workflow/config.yaml` 读取

### Step 5: 编写 AT 代码

基于 testing-guide.md 编写自动化测试代码：

1. 按测试矩阵中的场景编写对应的可执行测试
2. 产出至对应模块的 `tests/` 目录
3. AT 代码风格与项目中已有的测试保持一致

### Step 6: AI 代码审核

调用审查能力对需求代码 + AT 代码进行自动化检查：

| 检查项 | 说明 |
|---|---|
| 逻辑正确性 | 核心逻辑是否符合设计意图 |
| 边界覆盖 | 测试是否覆盖了边界条件 |
| 编码规范 | 是否符合项目约定 |
| 常见缺陷 | 空指针、资源泄漏、并发问题 |

- **发现问题** → 回到 Step 4 或 Step 5 修复，修复后重新审核
- **通过** → 继续

### Step 7: 编译代码

根据 `.workflow/config.yaml` 中的编译配置执行编译：

- 编译命令：`<config.build.command>`
- 成功标志：`<config.build.success_indicator>`
- 编译不通过 → 回到 Step 4 修复
- 产出编译产物

### Step 8: 替换补丁到测试环境

1. 将编译产物部署/替换到目标测试环境
2. 确认替换成功、环境就绪
3. 记录部署时间戳

### Step 9: 逐条执行 AT 用例

串行执行，每条独立处理，不并发：

```
for each 用例 in 测试清单:
  执行该用例
  if 通过:
    标记通过，继续下一条
  elif 未修复过:
    分析失败原因
    修改代码修复
    编译 → 替换补丁 → 重跑该条
    if 修复成功:
      标记通过，继续下一条
    else:
      标记失败，记录归因
      回滚修复代码
      重新编译替换
      继续下一条
  else: # 已修复过仍失败
    标记失败，记录归因
    继续下一条
```

**关键约束**：
- 修复重跑必须走完整链路：编译 → 替换 → 执行
- 修复失败后必须回滚修复代码、重新编译替换，再执行下一条
- 每条用例串行，禁止并发执行

### Step 10: 输出阶段报告

产出 `.workflow/reports/<change-id>/at-exec-report.md`：

```markdown
# AT 执行报告 — <change-id>

执行时间：<ISO 时间戳>
执行阶段：development

## 执行摘要
- 总用例数：<N>
- 通过：<N>
- 失败：<N>
- 修复后通过：<N>
- 修复回滚：<N>

## 用例明细

| 用例名 | 结果 | 修复尝试 | 回滚 |
|---|---|---|---|
| test_a | 通过 | 否 | — |
| test_b | 修复后通过 | 修复超时参数 | — |
| test_c | 失败 | 修复连接池 | 已回滚 |

## 失败归因
- test_c：环境问题，控制台超时（来源：AT 输出日志）

## 遗留问题
- test_c 需人工确认环境配置
```

### Step 11: 更新状态文件

```yaml
phases:
  development:
    status: done
    env_ready: true
    env_info: .workflow/reports/<id>/env-info.md
    artifacts:
      - <模块>/src/...
      - <模块>/tests/...
    report: .workflow/reports/<id>/at-exec-report.md
    test_results:
      total: <N>
      passed: <N>
      failed: <N>
      cases:
        - name: "test_a"
          result: passed
          fix_attempted: false
        - name: "test_c"
          result: failed
          fix_attempted: true
          fix_rolled_back: true
          failure_reason: "环境问题"
    gate:
      status: pending
  delivery:
    status: in_progress  # 等待 Gate 3 通过后执行
```

`current_phase` 设为 `delivery`。

### Step 12: 输出结果

```
✓ Build 阶段完成
```

**产出物：**

- [.workflow/reports/<id>/env-info.md](.workflow/reports/<id>/env-info.md)
- 需求代码（`<模块>/src/`）
- AT 代码（`<模块>/tests/`）
- [.workflow/reports/<id>/at-exec-report.md](.workflow/reports/<id>/at-exec-report.md)

```
执行结果: <N>/<M> 通过，<K> 条失败（已回滚修复）

▶ 等待 Gate 3: 报告审核（人工）
请查看 at-exec-report.md
  全部通过 → 执行 openflow-close
  有失败需处理 → 执行 openflow-fix
```

## 输出

- [.workflow/reports/<change-id>/env-info.md](.workflow/reports/<change-id>/env-info.md)
- 需求代码（各模块 `src/` 下）
- AT 代码（各模块 `tests/` 下）
- [.workflow/reports/<change-id>/at-exec-report.md](.workflow/reports/<change-id>/at-exec-report.md)
- 更新后的 `.workflow/state/<change-id>.yaml`

## Gate 3: 报告审核（人工）

审核对象：
- `at-exec-report.md` — 每条用例的执行结果、修复记录、回滚记录
- 失败用例的归因和修复记录

通过条件：全部用例通过；或存在失败但人工确认归因合理、有修复计划。
不通过：执行 openflow-fix 进入问题处理流。

## 编译/测试配置参考

`.workflow/config.yaml` 中与 Build 相关的配置：

```yaml
build:
  command: "<编译命令>"
  success_indicator: "SUCCESS"

test:
  run_command: "<跑测命令>"
  smoke_tag: "Smoke"
  results_dir: "test_results/"

source:
  dirs: ["<模块>/src"]
  test_dirs: ["<模块>/tests"]
```
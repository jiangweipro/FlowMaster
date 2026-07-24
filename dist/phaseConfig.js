"use strict";
// ============================================================
// Phase Configuration — single source of truth for all phase
// constants used across the extension (extension.ts, terminal
// management, gate review, webview).
// ============================================================
Object.defineProperty(exports, "__esModule", { value: true });
exports.NEXT_STEPS = exports.ACTION_LABELS = exports.PHASE_DESCRIPTIONS = exports.PHASE_STATUS = exports.PHASE_LABELS = exports.PHASE_COMMAND_MAP = exports.PHASE_ORDER = void 0;
exports.buildNextSteps = buildNextSteps;
/** 7-phase lifecycle order (must match OpenFlow spec exactly). */
exports.PHASE_ORDER = [
    'design',
    'testcase',
    'development',
    'fix',
    'retest',
    'delivery',
    'closure',
];
/** Maps internal phase name → Claude slash command. */
exports.PHASE_COMMAND_MAP = {
    design: '/openflow:design',
    testcase: '/openflow:plan',
    development: '/openflow:build',
    delivery: '/openflow:close',
    fix: '/openflow:fix',
    retest: '/openflow:retest',
};
/** zh-CN display labels for each phase. */
exports.PHASE_LABELS = {
    design: '设计',
    testcase: '用例',
    development: '开发',
    fix: '修复',
    retest: '重测',
    delivery: '交付',
    closure: '关闭',
};
/** zh-CN status labels. */
exports.PHASE_STATUS = {
    done: '完成',
    active: '进行中',
    blocked: '阻塞',
    pending: '待开始',
    in_progress: '进行中',
    completed: '完成',
    revision_needed: '需修改',
};
/** zh-CN phase descriptions shown in the phase info panel. */
exports.PHASE_DESCRIPTIONS = {
    design: '需求探索与澄清 → 生成提案(proposal) → 编写设计文档(design) → 自检并产出设计报告',
    testcase: '基于设计文档生成测试方案(testing-guide) → 拆分任务清单(tasks) → 自检并产出用例报告',
    development: '环境请求与确认 → 编码实现 → 编写AT(Acceptance Tests) → 编译部署 → 执行AT → 一次统一修复 → 产出测试报告',
    fix: '汇总失败用例 → 统一修复代码 → 重编译替换 → 重跑失败用例验证 → 仍失败则标记失败回滚(最多循环5次)',
    retest: '列出全部用例 → 选部分/全部重跑(不重编译，用当前已部署代码) → 更新test_results → 产出retest-report',
    delivery: '更新文档 → 归档需求(changes/specs) → 产出交付报告 → 完结需求生命周期',
    closure: '需求已完成归档，无需执行操作。如需查看历史报告或重新打开需求，请使用其他命令。',
};
/** English action labels used in the phase-complete banner. */
exports.ACTION_LABELS = {
    design: 'Design',
    testcase: 'Plan',
    development: 'Build',
    fix: 'Fix',
    retest: 'Retest',
    delivery: 'Close',
};
/**
 * Context-aware next-step suggestions shown after each phase command exits.
 * Keyed by the phase that just completed.
 */
exports.NEXT_STEPS = {
    design: [{ phase: 'testcase', desc: '生成测试用例与任务' }],
    testcase: [{ phase: 'development', desc: '编码实现' }],
    development: [
        { phase: 'fix', desc: '修复失败用例' },
        { phase: 'retest', desc: '回归重测' },
        { phase: 'delivery', desc: '交付归档' },
    ],
    fix: [
        { phase: 'retest', desc: '回归重测' },
        { phase: 'delivery', desc: '交付归档' },
    ],
    retest: [
        { phase: 'fix', desc: '修复回归用例' },
        { phase: 'delivery', desc: '交付归档' },
    ],
    delivery: [
        { phase: 'fix', desc: '修复遗留问题' },
        { phase: 'retest', desc: '回归重测' },
    ],
    closure: [
        { phase: 'fix', desc: '修复遗留问题' },
        { phase: 'retest', desc: '回归重测' },
    ],
};
/**
 * Build the next-steps list for a completed phase.
 * Pure function — no side effects, easy to test.
 */
function buildNextSteps(phase) {
    return (exports.NEXT_STEPS[phase] || []).map((s) => ({
        phase: s.phase,
        label: exports.ACTION_LABELS[s.phase] || s.phase,
        desc: s.desc,
        cmd: exports.PHASE_COMMAND_MAP[s.phase] || '',
    }));
}
//# sourceMappingURL=phaseConfig.js.map
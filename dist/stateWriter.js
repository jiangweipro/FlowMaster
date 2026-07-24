"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.StateWriter = void 0;
exports.applyGateReview = applyGateReview;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const yaml_1 = require("yaml");
const phaseConfig_1 = require("./phaseConfig");
/**
 * Parse a state file and return the raw YAML object.
 * Returns null if the file doesn't exist or is invalid.
 */
function readStateFile(statePath) {
    if (!fs.existsSync(statePath)) {
        return null;
    }
    try {
        const content = fs.readFileSync(statePath, 'utf-8');
        const parsed = (0, yaml_1.parse)(content);
        if (!parsed || !parsed.phases) {
            return null;
        }
        return parsed;
    }
    catch {
        return null;
    }
}
function writeStateFile(statePath, data) {
    fs.writeFileSync(statePath, (0, yaml_1.stringify)(data, { indent: 2 }), 'utf-8');
}
/**
 * Given the current state, determine the effective phase to review.
 * Prefers the phase selected in the UI, falls back to current_phase,
 * then checks if the target phase is blocked by another phase's gate.
 */
function resolveTargetPhase(state, preferredPhase) {
    let targetPhase = state.phases[preferredPhase]
        ? preferredPhase
        : state.current_phase;
    const phaseData = state.phases[targetPhase];
    if (phaseData?.blocked_by) {
        const blocker = Array.isArray(phaseData.blocked_by)
            ? phaseData.blocked_by[0]
            : '';
        if (blocker) {
            const blockerPhase = blocker.split('.')[0];
            if (state.phases[blockerPhase]?.gate) {
                targetPhase = blockerPhase;
            }
        }
    }
    return state.phases[targetPhase] ? targetPhase : null;
}
/**
 * Apply a gate review decision to the state object.
 * This is a pure mutation of the in-memory object — no file I/O.
 *
 * Returns the updated state (same reference) for chaining.
 */
function applyGateReview(state, targetPhase, action) {
    const phaseObj = state.phases[targetPhase];
    if (!phaseObj)
        return state;
    // Update gate status
    phaseObj.gate = {
        ...(phaseObj.gate || {}),
        status: action === 'pass' ? 'passed' : 'rejected',
        reviewer: 'user',
        reviewed_at: new Date().toISOString(),
    };
    if (action === 'pass') {
        phaseObj.status = 'done';
        const idx = phaseConfig_1.PHASE_ORDER.indexOf(targetPhase);
        if (idx >= 0 && idx < phaseConfig_1.PHASE_ORDER.length - 1) {
            const nextPhase = phaseConfig_1.PHASE_ORDER[idx + 1];
            if (state.phases[nextPhase]) {
                state.phases[nextPhase].status = 'in_progress';
                state.phases[nextPhase].blocked_by = undefined;
            }
            state.current_phase = nextPhase;
        }
    }
    else {
        phaseObj.status = 'revision_needed';
    }
    return state;
}
// ============================================================
// StateWriter class
// ============================================================
class StateWriter {
    constructor(projectRoot) {
        this.projectRoot = projectRoot;
    }
    /**
     * Full review gate flow: read file → resolve phase → apply → write → return result.
     */
    reviewGate(demandId, phase, action) {
        const statePath = path.join(this.projectRoot, '.workflow', 'state', `${demandId}.yaml`);
        const state = readStateFile(statePath);
        if (!state) {
            return {
                success: false,
                message: '审核失败',
                error: `状态文件不存在或格式无效: ${statePath}`,
            };
        }
        const targetPhase = resolveTargetPhase(state, phase);
        if (!targetPhase || !state.phases[targetPhase]) {
            return {
                success: false,
                message: '审核失败',
                error: `找不到阶段: ${phase}`,
            };
        }
        applyGateReview(state, targetPhase, action);
        try {
            writeStateFile(statePath, state);
        }
        catch (e) {
            return {
                success: false,
                message: '审核失败',
                error: `写入状态文件失败: ${e.message}`,
            };
        }
        return {
            success: true,
            message: action === 'pass' ? '审核通过成功' : '审核打回成功',
        };
    }
}
exports.StateWriter = StateWriter;
//# sourceMappingURL=stateWriter.js.map
import * as fs from 'fs';
import * as path from 'path';
import { parse, stringify } from 'yaml';
import { PHASE_ORDER } from './phaseConfig';

// ============================================================
// State Writer — reads / writes .workflow/state/*.yaml
// ============================================================

export interface ReviewGateResult {
  success: boolean;
  message: string;
  error?: string;
}

/**
 * Parse a state file and return the raw YAML object.
 * Returns null if the file doesn't exist or is invalid.
 */
function readStateFile(statePath: string): Record<string, any> | null {
  if (!fs.existsSync(statePath)) {
    return null;
  }
  try {
    const content = fs.readFileSync(statePath, 'utf-8');
    const parsed = parse(content);
    if (!parsed || !parsed.phases) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeStateFile(statePath: string, data: Record<string, any>): void {
  fs.writeFileSync(statePath, stringify(data, { indent: 2 }), 'utf-8');
}

/**
 * Given the current state, determine the effective phase to review.
 * Prefers the phase selected in the UI, falls back to current_phase,
 * then checks if the target phase is blocked by another phase's gate.
 */
function resolveTargetPhase(
  state: Record<string, any>,
  preferredPhase: string,
): string | null {
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
export function applyGateReview(
  state: Record<string, any>,
  targetPhase: string,
  action: 'pass' | 'reject',
): Record<string, any> {
  const phaseObj = state.phases[targetPhase];
  if (!phaseObj) return state;

  // Update gate status
  phaseObj.gate = {
    ...(phaseObj.gate || {}),
    status: action === 'pass' ? 'passed' : 'rejected',
    reviewer: 'user',
    reviewed_at: new Date().toISOString(),
  };

  if (action === 'pass') {
    phaseObj.status = 'done';
    const idx = PHASE_ORDER.indexOf(targetPhase as any);
    if (idx >= 0 && idx < PHASE_ORDER.length - 1) {
      const nextPhase = PHASE_ORDER[idx + 1];
      if (state.phases[nextPhase]) {
        state.phases[nextPhase].status = 'in_progress';
        state.phases[nextPhase].blocked_by = undefined;
      }
      state.current_phase = nextPhase;
    }
  } else {
    phaseObj.status = 'revision_needed';
  }

  return state;
}

// ============================================================
// StateWriter class
// ============================================================

export class StateWriter {
  constructor(private readonly projectRoot: string) {}

  /**
   * Full review gate flow: read file → resolve phase → apply → write → return result.
   */
  reviewGate(
    demandId: string,
    phase: string,
    action: 'pass' | 'reject',
  ): ReviewGateResult {
    const statePath = path.join(
      this.projectRoot,
      '.workflow',
      'state',
      `${demandId}.yaml`,
    );

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
    } catch (e: any) {
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
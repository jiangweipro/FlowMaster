import { describe, it, expect } from 'vitest';
import {
  PHASE_ORDER,
  PHASE_COMMAND_MAP,
  PHASE_LABELS,
  PHASE_STATUS,
  PHASE_DESCRIPTIONS,
  ACTION_LABELS,
  NEXT_STEPS,
  buildNextSteps,
} from '../src/phaseConfig';

describe('PhaseConfig - Constants Integrity', () => {
  it('should have exactly 7 phases in correct order', () => {
    expect(PHASE_ORDER).toEqual([
      'design',
      'testcase',
      'development',
      'fix',
      'retest',
      'delivery',
      'closure',
    ]);
  });

  it('should have a command mapping for every non-closure phase', () => {
    for (const phase of PHASE_ORDER) {
      if (phase === 'closure') {
        // closure has no command — it's display-only
        expect(PHASE_COMMAND_MAP[phase]).toBeUndefined();
      } else {
        expect(PHASE_COMMAND_MAP[phase]).toBeDefined();
        expect(PHASE_COMMAND_MAP[phase]).toMatch(/^\/openflow:/);
      }
    }
  });

  it('should have a zh-CN label for every phase', () => {
    for (const phase of PHASE_ORDER) {
      expect(PHASE_LABELS[phase]).toBeDefined();
      expect(PHASE_LABELS[phase].length).toBeGreaterThan(0);
    }
  });

  it('should have a phase description for every phase', () => {
    for (const phase of PHASE_ORDER) {
      expect(PHASE_DESCRIPTIONS[phase]).toBeDefined();
      expect(PHASE_DESCRIPTIONS[phase].length).toBeGreaterThan(0);
    }
  });

  it('should have an action label for every non-closure phase', () => {
    for (const phase of PHASE_ORDER) {
      if (phase === 'closure') continue;
      expect(ACTION_LABELS[phase]).toBeDefined();
      expect(ACTION_LABELS[phase].length).toBeGreaterThan(0);
    }
  });

  it('should have command map entries for fix and retest', () => {
    expect(PHASE_COMMAND_MAP.fix).toBe('/openflow:fix');
    expect(PHASE_COMMAND_MAP.retest).toBe('/openflow:retest');
  });

  it('should have status labels for all known statuses', () => {
    const knownStatuses = [
      'done',
      'active',
      'blocked',
      'pending',
      'in_progress',
      'completed',
      'revision_needed',
    ];
    for (const s of knownStatuses) {
      expect(PHASE_STATUS[s]).toBeDefined();
    }
  });
});

describe('PhaseConfig - NEXT_STEPS', () => {
  it('should have next-steps entries for every phase', () => {
    for (const phase of PHASE_ORDER) {
      expect(NEXT_STEPS[phase]).toBeDefined();
      expect(Array.isArray(NEXT_STEPS[phase])).toBe(true);
    }
  });

  it('should suggest testcase after design', () => {
    expect(NEXT_STEPS.design).toEqual([
      { phase: 'testcase', desc: '生成测试用例与任务' },
    ]);
  });

  it('should suggest fix, retest, and delivery after development', () => {
    const steps = NEXT_STEPS.development;
    expect(steps.find((s) => s.phase === 'fix')).toBeDefined();
    expect(steps.find((s) => s.phase === 'retest')).toBeDefined();
    expect(steps.find((s) => s.phase === 'delivery')).toBeDefined();
  });

  it('should suggest fix and retest after closure', () => {
    const steps = NEXT_STEPS.closure;
    expect(steps.find((s) => s.phase === 'fix')).toBeDefined();
    expect(steps.find((s) => s.phase === 'retest')).toBeDefined();
  });
});

describe('PhaseConfig - buildNextSteps', () => {
  it('should return items with phase, label, desc, and cmd', () => {
    const steps = buildNextSteps('development');
    for (const step of steps) {
      expect(step.phase).toBeDefined();
      expect(step.label).toBeDefined();
      expect(step.desc).toBeDefined();
      expect(step.cmd).toBeDefined();
    }
  });

  it('should include the correct command for each step', () => {
    const steps = buildNextSteps('development');
    const fixStep = steps.find((s) => s.phase === 'fix');
    expect(fixStep?.cmd).toBe('/openflow:fix');
  });

  it('should return empty array for unknown phase', () => {
    expect(buildNextSteps('unknown')).toEqual([]);
  });

  it('should return empty array for no-next-steps phase', () => {
    // All phases have next steps, but test the fallback
    expect(buildNextSteps('')).toEqual([]);
  });
});
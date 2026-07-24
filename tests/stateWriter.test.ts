import { describe, it, expect, vi } from 'vitest';
import { applyGateReview } from '../src/stateWriter';

// ==========================================================
// applyGateReview — pure function (no I/O)
// ==========================================================

describe('applyGateReview', () => {
  const createState = () => ({
    change: 'test-001',
    title: 'Test Demand',
    status: 'active',
    current_phase: 'development',
    phases: {
      design: {
        status: 'done',
        artifacts: ['proposal.md'],
        report: null,
        gate: { status: 'passed' },
      },
      testcase: {
        status: 'done',
        artifacts: ['testing-guide.md'],
        report: null,
        gate: { status: 'passed' },
      },
      development: {
        status: 'in_progress',
        artifacts: [],
        report: null,
        gate: { status: 'pending' },
        blocked_by: ['testcase.gate'],
      },
      fix: {
        status: 'pending',
        artifacts: [],
        report: null,
        gate: { status: 'pending' },
        blocked_by: ['development.gate'],
      },
      retest: {
        status: 'pending',
        artifacts: [],
        report: null,
        gate: { status: 'pending' },
        blocked_by: ['fix.gate'],
      },
      delivery: {
        status: 'blocked',
        artifacts: [],
        report: null,
        gate: { status: 'pending' },
        blocked_by: ['retest.gate'],
      },
      closure: {
        status: 'blocked',
        artifacts: [],
        report: null,
        gate: { status: 'pending' },
        blocked_by: ['delivery.gate'],
      },
    },
  });

  it('should pass gate and advance to next phase', () => {
    const state = createState();
    applyGateReview(state, 'development', 'pass');

    expect(state.phases.development.gate.status).toBe('passed');
    expect(state.phases.development.status).toBe('done');
    expect(state.current_phase).toBe('fix');
    expect(state.phases.fix.status).toBe('in_progress');
    expect(state.phases.fix.blocked_by).toBeUndefined();
  });

  it('should reject gate and set revision_needed', () => {
    const state = createState();
    applyGateReview(state, 'development', 'reject');

    expect(state.phases.development.gate.status).toBe('rejected');
    expect(state.phases.development.status).toBe('revision_needed');
    // current_phase should NOT advance
    expect(state.current_phase).toBe('development');
  });

  it('should advance through all phases in order', () => {
    const state = createState();
    const phases = ['development', 'fix', 'retest', 'delivery', 'closure'];

    for (const phase of phases) {
      applyGateReview(state, phase, 'pass');
      const idx = phases.indexOf(phase);
      if (idx < phases.length - 1) {
        expect(state.current_phase).toBe(phases[idx + 1]);
      } else {
        // closure is last — don't advance further
        expect(state.current_phase).toBe('closure');
      }
    }
  });

  it('should handle gate pass on the last phase (closure)', () => {
    const state = createState();
    state.current_phase = 'closure';

    applyGateReview(state, 'closure', 'pass');

    expect(state.phases.closure.gate.status).toBe('passed');
    expect(state.phases.closure.status).toBe('done');
    // Should not advance beyond the last phase
    expect(state.current_phase).toBe('closure');
  });

  it('should set reviewer and reviewed_at timestamp', () => {
    const state = createState();
    applyGateReview(state, 'development', 'pass');

    expect(state.phases.development.gate.reviewer).toBe('user');
    expect(state.phases.development.gate.reviewed_at).toBeDefined();
    const ts = new Date(state.phases.development.gate.reviewed_at);
    expect(ts.getTime()).not.toBeNaN();
  });

  it('should handle missing gate object gracefully', () => {
    const state = createState();
    delete state.phases.development.gate;

    applyGateReview(state, 'development', 'pass');

    expect(state.phases.development.gate).toBeDefined();
    expect(state.phases.development.gate.status).toBe('passed');
  });

  it('should handle non-existent phase gracefully', () => {
    const state = createState();
    // Should not throw
    applyGateReview(state, 'nonexistent', 'pass');
    // State should remain unchanged
    expect(state.current_phase).toBe('development');
  });
});

// ==========================================================
// StateWriter class — with mocked fs
// ==========================================================

const mockFs = vi.hoisted(() => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  readdirSync: vi.fn(),
}));

vi.mock('fs', () => ({
  default: mockFs,
  ...mockFs,
}));

const validYaml = [
  'change: test-001',
  'title: "Test"',
  'status: active',
  'current_phase: development',
  'phases:',
  '  design:',
  '    status: done',
  '    artifacts: []',
  '    report: null',
  '    gate: { status: passed }',
  '  testcase:',
  '    status: done',
  '    artifacts: []',
  '    report: null',
  '    gate: { status: passed }',
  '  development:',
  '    status: in_progress',
  '    artifacts: []',
  '    report: null',
  '    gate: { status: pending }',
  '  fix:',
  '    status: pending',
  '    artifacts: []',
  '    report: null',
  '    gate: { status: pending }',
  '  retest:',
  '    status: pending',
  '    artifacts: []',
  '    report: null',
  '    gate: { status: pending }',
  '  delivery:',
  '    status: blocked',
  '    artifacts: []',
  '    report: null',
  '    gate: { status: pending }',
  '  closure:',
  '    status: blocked',
  '    artifacts: []',
  '    report: null',
  '    gate: { status: pending }',
].join('\n');

import { StateWriter } from '../src/stateWriter';

describe('StateWriter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return error if state file is missing', () => {
    mockFs.existsSync.mockReturnValue(false);

    const writer = new StateWriter('/workspace');
    const result = writer.reviewGate('test-001', 'development', 'pass');

    expect(result.success).toBe(false);
    expect(result.error).toContain('状态文件不存在');
  });

  it('should return error for invalid YAML in state file', () => {
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync.mockReturnValue('invalid: yaml: \n  broken: [}');

    const writer = new StateWriter('/workspace');
    const result = writer.reviewGate('test-001', 'development', 'pass');

    expect(result.success).toBe(false);
  });

  it('should successfully pass a gate review', () => {
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync.mockReturnValue(validYaml);
    const writeMock = mockFs.writeFileSync.mockImplementation(() => {});

    const writer = new StateWriter('/workspace');
    const result = writer.reviewGate('test-001', 'development', 'pass');

    expect(result.success).toBe(true);
    expect(result.message).toContain('审核通过');

    // Verify writeFileSync was called
    expect(writeMock).toHaveBeenCalledOnce();

    // Verify the written content advanced the phase
    const writtenContent = writeMock.mock.calls[0][1];
    expect(writtenContent).toContain('current_phase: fix');
    expect(writtenContent).toContain('gate:');
    expect(writtenContent).toContain('passed');
  });

  it('should successfully reject a gate review', () => {
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync.mockReturnValue(validYaml);
    const writeMock = mockFs.writeFileSync.mockImplementation(() => {});

    const writer = new StateWriter('/workspace');
    const result = writer.reviewGate('test-001', 'development', 'reject');

    expect(result.success).toBe(true);
    expect(result.message).toContain('打回');

    const writtenContent = writeMock.mock.calls[0][1];
    expect(writtenContent).toContain('revision_needed');
    expect(writtenContent).toContain('rejected');
    // current_phase should NOT advance
    expect(writtenContent).toContain('current_phase: development');
  });
});
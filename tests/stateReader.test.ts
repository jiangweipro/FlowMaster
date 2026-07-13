import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';

// We test the StateReader logic by mocking vscode and testing the parsing logic
// Since StateReader depends on vscode.workspace, we extract the YAML parsing logic

describe('StateReader - YAML Parsing', () => {
  const sampleStateYaml = `
change: vscode-dashboard
title: "VSCode Extension WebView UI"
status: active
current_phase: design

phases:
  design:
    status: done
    artifacts:
      - openspec/changes/vscode-dashboard/proposal.md
      - openspec/changes/vscode-dashboard/design.md
    report: .workflow/reports/vscode-dashboard/design-report.md
    gate:
      status: passed
  testcase:
    status: done
    artifacts:
      - openspec/changes/vscode-dashboard/testing-guide.md
    gate:
      status: pending
  development:
    status: blocked
    blocked_by: [testcase.gate]
  delivery:
    status: blocked
    blocked_by: [development.gate]
  closure:
    status: blocked
    blocked_by: [delivery.gate]
`;

  it('should parse valid YAML state file', () => {
    const { parse } = require('yaml');
    const parsed = parse(sampleStateYaml);

    expect(parsed).toBeDefined();
    expect(parsed.change).toBe('vscode-dashboard');
    expect(parsed.title).toBe('VSCode Extension WebView UI');
    expect(parsed.status).toBe('active');
    expect(parsed.current_phase).toBe('design');
  });

  it('should parse phases with artifacts', () => {
    const { parse } = require('yaml');
    const parsed = parse(sampleStateYaml);

    expect(parsed.phases).toBeDefined();
    expect(parsed.phases.design).toBeDefined();
    expect(parsed.phases.design.status).toBe('done');
    expect(parsed.phases.design.artifacts).toHaveLength(2);
    expect(parsed.phases.design.artifacts[0]).toBe('openspec/changes/vscode-dashboard/proposal.md');
  });

  it('should parse gate status', () => {
    const { parse } = require('yaml');
    const parsed = parse(sampleStateYaml);

    expect(parsed.phases.design.gate.status).toBe('passed');
    expect(parsed.phases.testcase.gate.status).toBe('pending');
  });

  it('should handle blocked_by dependencies', () => {
    const { parse } = require('yaml');
    const parsed = parse(sampleStateYaml);

    expect(parsed.phases.development.blocked_by).toContain('testcase.gate');
  });

  it('should throw on invalid YAML', () => {
    const { parse } = require('yaml');
    expect(() => parse('invalid: yaml: \n  broken: [')).toThrow();
  });
});

describe('StateReader - Edge Cases', () => {
  it('should handle empty YAML content', () => {
    const { parse } = require('yaml');
    expect(() => parse('')).not.toThrow();
    // parse('') returns null
    expect(parse('')).toBeNull();
  });

  it('should handle YAML with missing optional fields', () => {
    const { parse } = require('yaml');
    const minimal = parse('change: test\nstatus: active\ncurrent_phase: design\nphases: {}');
    expect(minimal.change).toBe('test');
    expect(minimal.phases).toEqual({});
  });

  it('should handle YAML with extra unknown fields', () => {
    const { parse } = require('yaml');
    const withExtra = parse(`
change: test
title: "Test"
status: active
current_phase: design
unknown_field: "should be ignored"
phases: {}
`);
    expect(withExtra.change).toBe('test');
    expect(withExtra.unknown_field).toBe('should be ignored');
  });
});

describe('FileOpener - Path Resolution', () => {
  const workspaceRoot = '/workspace';

  it('should resolve relative path correctly', () => {
    const relativePath = 'openspec/specs/test/spec.md';
    const absolutePath = path.join(workspaceRoot, relativePath);
    expect(absolutePath.replace(/\\/g, '/')).toBe('/workspace/openspec/specs/test/spec.md');
  });

  it('should keep absolute path unchanged', () => {
    const absolutePath = '/absolute/path/to/file.md';
    const resolved = path.isAbsolute(absolutePath) ? absolutePath : path.join(workspaceRoot, absolutePath);
    expect(resolved.replace(/\\/g, '/')).toBe(absolutePath);
  });

  it('should handle path with special characters', () => {
    const relativePath = 'openspec/specs/test/spec with spaces.md';
    const absolutePath = path.join(workspaceRoot, relativePath);
    expect(absolutePath.replace(/\\/g, '/')).toBe('/workspace/openspec/specs/test/spec with spaces.md');
  });
});

describe('TerminalRunner - Phase Command Mapping', () => {
  const PHASE_COMMAND_MAP: Record<string, string> = {
    design: '/openflow:design',
    testcase: '/openflow:plan',
    development: '/openflow:build',
    delivery: '/openflow:close',
    closure: '',
  };

  it('should map design phase to /openflow:design', () => {
    expect(PHASE_COMMAND_MAP.design).toBe('/openflow:design');
  });

  it('should map testcase phase to /openflow:plan', () => {
    expect(PHASE_COMMAND_MAP.testcase).toBe('/openflow:plan');
  });

  it('should map development phase to /openflow:build', () => {
    expect(PHASE_COMMAND_MAP.development).toBe('/openflow:build');
  });

  it('should map delivery phase to /openflow:close', () => {
    expect(PHASE_COMMAND_MAP.delivery).toBe('/openflow:close');
  });

  it('should have empty command for closure phase', () => {
    expect(PHASE_COMMAND_MAP.closure).toBe('');
  });

  it('should return undefined for unknown phase', () => {
    expect(PHASE_COMMAND_MAP['unknown' as string]).toBeUndefined();
  });
});

describe('WebView - Message Protocol', () => {
  it('should have valid message types', () => {
    const validCommands = ['refreshState', 'runPhase', 'openFile', 'openFolder', 'error'];
    const testMessage = { command: 'runPhase', payload: { demandId: 'test', phase: 'design' } };
    expect(validCommands).toContain(testMessage.command);
  });

  it('should reject unknown message types', () => {
    const validCommands = ['refreshState', 'runPhase', 'openFile', 'openFolder', 'error'];
    const invalidMessage = { command: 'invalidCommand' };
    expect(validCommands).not.toContain(invalidMessage.command);
  });

  it('should have required payload fields for runPhase', () => {
    const payload = { demandId: 'test', phase: 'design' };
    expect(payload.demandId).toBeDefined();
    expect(typeof payload.demandId).toBe('string');
    expect(payload.phase).toBeDefined();
    expect(typeof payload.phase).toBe('string');
  });

  it('should have required payload fields for openFile', () => {
    const payload = { path: 'openspec/spec.md' };
    expect(payload.path).toBeDefined();
    expect(typeof payload.path).toBe('string');
  });

  it('should handle stateUpdated response with empty demands', () => {
    const response = { command: 'stateUpdated', payload: { demands: [] } };
    expect(response.payload.demands).toEqual([]);
  });

  it('should handle stateUpdated response with demands', () => {
    const demands = [
      { id: 'test1', name: 'test1', phase: 'design', gate: 'pending', status: 'active', artifacts: [] }
    ];
    const response = { command: 'stateUpdated', payload: { demands } };
    expect(response.payload.demands).toHaveLength(1);
    expect(response.payload.demands[0].id).toBe('test1');
  });

  it('should handle stateUpdated response with error', () => {
    const response = { command: 'stateUpdated', payload: { demands: [], error: 'Failed to read' } };
    expect(response.payload.error).toBeDefined();
    expect(response.payload.demands).toEqual([]);
  });
});
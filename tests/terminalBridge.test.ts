import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ProcessManager } from '../src/processManager';
import { TerminalBridge, TerminalToWebViewMessage } from '../src/terminalBridge';
import { EventEmitter } from 'events';

// Mock child_process
vi.mock('child_process', () => {
  const actual = vi.importActual('child_process') as any;
  return {
    ...actual,
    spawn: vi.fn(),
  };
});

import { spawn } from 'child_process';

describe('TerminalBridge', () => {
  let pm: ProcessManager;
  let bridge: TerminalBridge;
  let mockProc: any;
  let messages: TerminalToWebViewMessage[];

  beforeEach(() => {
    pm = new ProcessManager();
    bridge = new TerminalBridge(pm);
    messages = [];

    mockProc = new EventEmitter();
    mockProc.pid = 12345;
    mockProc.stdout = new EventEmitter();
    mockProc.stderr = new EventEmitter();
    mockProc.stdin = { write: vi.fn(), destroyed: false };
    mockProc.kill = vi.fn();
    (spawn as any).mockReturnValue(mockProc);

    bridge.setMessageCallback((msg: TerminalToWebViewMessage) => {
      messages.push(msg);
    });
  });

  afterEach(() => {
    bridge.dispose();
    vi.clearAllMocks();
  });

  // TC-TB-001: stdout data forwarding
  it('should forward stdout data as terminalOutput message', () => {
    bridge.startProcess('change-1', 'echo', ['hello']);
    mockProc.stdout.emit('data', Buffer.from('Hello World\n'));

    expect(messages.length).toBeGreaterThan(0);
    const outputMsg = messages.find(m => m.command === 'terminalOutput');
    expect(outputMsg).toBeDefined();
    if (outputMsg && outputMsg.command === 'terminalOutput') {
      expect(outputMsg.demandId).toBe('change-1');
      expect(outputMsg.data).toBe('Hello World\n');
    }
  });

  // TC-TB-002: stderr data forwarding
  it('should forward stderr data as terminalOutput message', () => {
    bridge.startProcess('change-1', 'echo', ['hello']);
    mockProc.stderr.emit('data', Buffer.from('Error: something\n'));

    const outputMsg = messages.find(m => m.command === 'terminalOutput');
    expect(outputMsg).toBeDefined();
    if (outputMsg && outputMsg.command === 'terminalOutput') {
      expect(outputMsg.demandId).toBe('change-1');
      expect(outputMsg.data).toBe('Error: something\n');
    }
  });

  // TC-TB-003: Process exit message forwarding
  it('should forward exit event as terminalExit message', () => {
    bridge.startProcess('change-1', 'echo', ['hello']);
    mockProc.emit('close', 0);

    const exitMsg = messages.find(m => m.command === 'terminalExit');
    expect(exitMsg).toBeDefined();
    if (exitMsg && exitMsg.command === 'terminalExit') {
      expect(exitMsg.demandId).toBe('change-1');
      expect(exitMsg.code).toBe(0);
    }
  });

  // TC-TB-004: Process start message
  it('should send terminalStart message on startProcess', () => {
    bridge.startProcess('change-1', 'echo', ['/openflow:design', 'change-1']);

    const startMsg = messages.find(m => m.command === 'terminalStart');
    expect(startMsg).toBeDefined();
    if (startMsg && startMsg.command === 'terminalStart') {
      expect(startMsg.demandId).toBe('change-1');
    }
  });

  // TC-TB-005: terminalInput forwarding to stdin
  it('should forward input to process stdin', () => {
    bridge.startProcess('change-1', 'echo', ['hello']);
    const result = bridge.write('change-1', 'ls\n');
    expect(result).toBe(true);
    expect(mockProc.stdin.write).toHaveBeenCalledWith('ls\n');
  });

  // TC-TB-006: Process error forwarding
  it('should forward error event as terminalError message', () => {
    bridge.startProcess('change-1', 'echo', ['hello']);
    mockProc.emit('error', new Error('ENOENT: command not found'));

    const errMsg = messages.find(m => m.command === 'terminalError');
    expect(errMsg).toBeDefined();
    if (errMsg && errMsg.command === 'terminalError') {
      expect(errMsg.demandId).toBe('change-1');
      expect(errMsg.error).toContain('ENOENT');
    }
  });

  // TC-TB-007: Detach stops forwarding
  it('should stop forwarding after detach', () => {
    bridge.startProcess('change-1', 'echo', ['hello']);
    bridge.detach('change-1');

    // Clear messages from start
    messages.length = 0;

    mockProc.stdout.emit('data', Buffer.from('Data after detach\n'));

    expect(messages.length).toBe(0);
  });

  // TC-TB-008: getBuffer returns accumulated output
  it('should return buffered output via getBuffer', () => {
    bridge.startProcess('change-1', 'echo', ['hello']);
    mockProc.stdout.emit('data', Buffer.from('Line 1\n'));

    const buffer = bridge.getBuffer('change-1');
    expect(buffer).toBe('Line 1\n');
  });

  // TC-TB-009: Kill process via bridge
  it('should kill a process and detach', () => {
    bridge.startProcess('change-1', 'echo', ['hello']);
    expect(pm.hasProcess('change-1')).toBe(true);

    bridge.killProcess('change-1');
    expect(pm.hasProcess('change-1')).toBe(false);
  });

  // TC-TB-010: Dispose cleans up
  it('should cleanup on dispose', () => {
    bridge.startProcess('change-1', 'echo', ['hello']);
    bridge.dispose();

    expect(pm.processCount).toBe(0);
    expect(pm.getActiveDemandIds()).toEqual([]);
  });
});
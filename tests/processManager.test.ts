import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ProcessManager } from '../src/processManager';
import { ChildProcess } from 'child_process';
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

describe('ProcessManager', () => {
  let pm: ProcessManager;
  let mockProc: any;

  beforeEach(() => {
    pm = new ProcessManager();
    mockProc = new EventEmitter();
    mockProc.pid = 12345;
    mockProc.stdout = new EventEmitter();
    mockProc.stderr = new EventEmitter();
    mockProc.stdin = { write: vi.fn(), destroyed: false };
    mockProc.kill = vi.fn();
    (spawn as any).mockReturnValue(mockProc);
  });

  afterEach(() => {
    pm.dispose();
    vi.clearAllMocks();
  });

  // TC-PM-001: Normal spawn
  it('should spawn a process and return ChildProcess', () => {
    const proc = pm.spawnProcess('change-1', 'echo', ['hello']);
    expect(proc).toBeDefined();
    expect(spawn).toHaveBeenCalledWith('echo', ['hello'], expect.any(Object));
    expect(pm.hasProcess('change-1')).toBe(true);
  });

  // TC-PM-002: Process Map maintenance
  it('should maintain process map correctly', () => {
    pm.spawnProcess('change-1', 'echo', ['a']);
    pm.spawnProcess('change-2', 'echo', ['b']);

    expect(pm.getProcess('change-1')).toBe(mockProc);
    expect(pm.getProcess('change-2')).toBe(mockProc);
    expect(pm.getProcess('nonexistent')).toBeUndefined();
    expect(pm.processCount).toBe(2);
  });

  // TC-PM-003: Kill specific process
  it('should kill a specific process', () => {
    pm.spawnProcess('change-1', 'echo', ['hello']);
    const result = pm.killProcess('change-1');
    expect(result).toBe(true);
    expect(pm.hasProcess('change-1')).toBe(false);
  });

  // TC-PM-004: killAll cleans all processes
  it('should kill all processes', () => {
    pm.spawnProcess('change-1', 'echo', ['a']);
    pm.spawnProcess('change-2', 'echo', ['b']);
    pm.killAll();
    expect(pm.processCount).toBe(0);
    expect(pm.getActiveDemandIds()).toEqual([]);
  });

  // TC-PM-005: Process exit auto-cleanup
  it('should remove process from map on exit', () => {
    pm.spawnProcess('change-1', 'echo', ['hello']);
    expect(pm.hasProcess('change-1')).toBe(true);

    // Simulate process exit
    mockProc.emit('close', 0);

    expect(pm.hasProcess('change-1')).toBe(false);
  });

  // TC-PM-006: onExit callback
  it('should trigger onExit callback when process exits', () => {
    const onExitMock = vi.fn();
    pm.onExit('change-1', onExitMock);
    pm.spawnProcess('change-1', 'echo', ['hello']);

    mockProc.emit('close', 0);

    expect(onExitMock).toHaveBeenCalledWith(0);
  });

  // TC-PM-007: onData callback for stdout
  it('should trigger onData callback for stdout data', () => {
    const onDataMock = vi.fn();
    pm.onData('change-1', onDataMock);
    pm.spawnProcess('change-1', 'echo', ['hello']);

    mockProc.stdout.emit('data', Buffer.from('Hello World\n'));

    expect(onDataMock).toHaveBeenCalledWith('Hello World\n');
  });

  // TC-PM-008: onData callback for stderr
  it('should trigger onData callback for stderr data', () => {
    const onDataMock = vi.fn();
    pm.onData('change-1', onDataMock);
    pm.spawnProcess('change-1', 'echo', ['hello']);

    mockProc.stderr.emit('data', Buffer.from('Error: something\n'));

    expect(onDataMock).toHaveBeenCalledWith('Error: something\n');
  });

  // TC-PM-009: onError callback
  it('should trigger onError callback on spawn error', () => {
    const onErrorMock = vi.fn();
    pm.onError('change-1', onErrorMock);
    pm.spawnProcess('change-1', 'echo', ['hello']);

    mockProc.emit('error', new Error('ENOENT'));

    expect(onErrorMock).toHaveBeenCalledWith('ENOENT');
  });

  // TC-PM-010: Kill nonexistent process returns false
  it('should return false when killing nonexistent process', () => {
    const result = pm.killProcess('nonexistent');
    expect(result).toBe(false);
  });

  // TC-PM-011: Write to stdin
  it('should write data to process stdin', () => {
    pm.spawnProcess('change-1', 'echo', ['hello']);
    const result = pm.write('change-1', 'ls\n');
    expect(result).toBe(true);
    expect(mockProc.stdin.write).toHaveBeenCalledWith('ls\n');
  });

  // TC-PM-012: Write to nonexistent process returns false
  it('should return false when writing to nonexistent process', () => {
    const result = pm.write('nonexistent', 'data');
    expect(result).toBe(false);
  });

  // TC-PM-013: getBuffer returns accumulated output
  it('should accumulate output in buffer', () => {
    pm.spawnProcess('change-1', 'echo', ['hello']);
    mockProc.stdout.emit('data', Buffer.from('Line 1\n'));
    mockProc.stdout.emit('data', Buffer.from('Line 2\n'));

    const buffer = pm.getBuffer('change-1');
    expect(buffer).toBe('Line 1\nLine 2\n');
  });

  // TC-PM-014: Dispose cleans all listeners
  it('should clean all listeners on dispose', () => {
    const onDataMock = vi.fn();
    pm.onData('change-1', onDataMock);
    pm.spawnProcess('change-1', 'echo', ['hello']);

    pm.dispose();
    expect(pm.processCount).toBe(0);
    expect(pm.getActiveDemandIds()).toEqual([]);
  });

  // TC-PM-015: getActiveDemandIds
  it('should return active demand IDs', () => {
    pm.spawnProcess('change-1', 'echo', ['a']);
    pm.spawnProcess('change-2', 'echo', ['b']);
    const ids = pm.getActiveDemandIds();
    expect(ids).toContain('change-1');
    expect(ids).toContain('change-2');
    expect(ids.length).toBe(2);
  });
});
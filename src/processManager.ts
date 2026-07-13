import { spawn, ChildProcess, SpawnOptions } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

/**
 * Manages child_process.spawn lifecycle for per-demand terminal sessions.
 * Maintains a Map<demandId, ChildProcess> and provides clean-up on dispose.
 */
export class ProcessManager {
  private processes: Map<string, ChildProcess> = new Map();
  private outputBuffers: Map<string, string[]> = new Map();
  private exitListeners: Map<string, Array<(code: number | null) => void>> = new Map();
  private dataListeners: Map<string, Array<(data: string) => void>> = new Map();
  private errorListeners: Map<string, Array<(error: string) => void>> = new Map();

  /**
   * Spawn a new process for the given demand.
   * If a process already exists for this demandId, it is killed first.
   */
  spawnProcess(
    demandId: string,
    command: string,
    args: string[] = [],
    cwd?: string
  ): ChildProcess {
    // Kill existing process for this demand if any
    this.killProcess(demandId);

    const options: SpawnOptions = {
      shell: process.platform === 'win32',
      windowsHide: true,
      cwd: cwd || process.cwd(),
    };

    // On Windows, use shell: true for .cmd/.bat resolution
    const proc = spawn(command, args, options);

    this.processes.set(demandId, proc);
    this.outputBuffers.set(demandId, []);

    // Pipe stdout
    if (proc.stdout) {
      proc.stdout.on('data', (chunk: Buffer) => {
        const text = chunk.toString('utf-8');
        const buffer = this.outputBuffers.get(demandId);
        if (buffer) {
          buffer.push(text);
          // Limit buffer to 10000 lines to avoid memory issues
          if (buffer.length > 10000) {
            buffer.splice(0, buffer.length - 10000);
          }
        }
        // Notify data listeners
        const listeners = this.dataListeners.get(demandId);
        if (listeners) {
          listeners.forEach(cb => cb(text));
        }
      });
    }

    // Pipe stderr through the same channel
    if (proc.stderr) {
      proc.stderr.on('data', (chunk: Buffer) => {
        const text = chunk.toString('utf-8');
        const buffer = this.outputBuffers.get(demandId);
        if (buffer) {
          buffer.push(text);
          if (buffer.length > 10000) {
            buffer.splice(0, buffer.length - 10000);
          }
        }
        const listeners = this.dataListeners.get(demandId);
        if (listeners) {
          listeners.forEach(cb => cb(text));
        }
      });
    }

    // Handle process exit
    proc.on('close', (code: number | null) => {
      this.processes.delete(demandId);
      const exitListeners = this.exitListeners.get(demandId);
      if (exitListeners) {
        exitListeners.forEach(cb => cb(code));
      }
    });

    // Handle spawn errors
    proc.on('error', (err: Error) => {
      const errorListeners = this.errorListeners.get(demandId);
      if (errorListeners) {
        errorListeners.forEach(cb => cb(err.message));
      }
    });

    return proc;
  }

  /**
   * Kill a specific process by demandId.
   */
  killProcess(demandId: string): boolean {
    const proc = this.processes.get(demandId);
    if (!proc) return false;

    try {
      if (process.platform === 'win32') {
        // On Windows, use taskkill to ensure child process tree is killed
        spawn('taskkill', ['/pid', String(proc.pid), '/f', '/t'], {
          windowsHide: true,
          shell: true,
        });
      } else {
        proc.kill('SIGTERM');
        // Fallback to SIGKILL after 3 seconds
        setTimeout(() => {
          try {
            if (!proc.killed) proc.kill('SIGKILL');
          } catch {
            // Process already dead
          }
        }, 3000);
      }
    } catch {
      // Process may already be dead
    }

    this.processes.delete(demandId);
    return true;
  }

  /**
   * Kill all managed processes.
   */
  killAll(): void {
    const ids = Array.from(this.processes.keys());
    ids.forEach(id => this.killProcess(id));
    this.processes.clear();
    this.exitListeners.clear();
    this.dataListeners.clear();
    this.errorListeners.clear();
    this.outputBuffers.clear();
  }

  /**
   * Write data to a process's stdin.
   */
  write(demandId: string, input: string): boolean {
    const proc = this.processes.get(demandId);
    if (!proc || !proc.stdin || proc.stdin.destroyed) return false;
    try {
      proc.stdin.write(input);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get a process by demandId.
   */
  getProcess(demandId: string): ChildProcess | undefined {
    return this.processes.get(demandId);
  }

  /**
   * Check if a process exists for the given demandId.
   */
  hasProcess(demandId: string): boolean {
    return this.processes.has(demandId);
  }

  /**
   * Get the number of managed processes.
   */
  get processCount(): number {
    return this.processes.size;
  }

  /**
   * Get the full buffered output for a demand.
   */
  getBuffer(demandId: string): string {
    const buffer = this.outputBuffers.get(demandId);
    return buffer ? buffer.join('') : '';
  }

  // --- Event subscription ---

  onData(demandId: string, callback: (data: string) => void): void {
    const listeners = this.dataListeners.get(demandId) || [];
    listeners.push(callback);
    this.dataListeners.set(demandId, listeners);
  }

  offData(demandId: string, callback: (data: string) => void): void {
    const listeners = this.dataListeners.get(demandId) || [];
    this.dataListeners.set(demandId, listeners.filter(cb => cb !== callback));
  }

  onExit(demandId: string, callback: (code: number | null) => void): void {
    const listeners = this.exitListeners.get(demandId) || [];
    listeners.push(callback);
    this.exitListeners.set(demandId, listeners);
  }

  offExit(demandId: string, callback: (code: number | null) => void): void {
    const listeners = this.exitListeners.get(demandId) || [];
    this.exitListeners.set(demandId, listeners.filter(cb => cb !== callback));
  }

  onError(demandId: string, callback: (error: string) => void): void {
    const listeners = this.errorListeners.get(demandId) || [];
    listeners.push(callback);
    this.errorListeners.set(demandId, listeners);
  }

  offError(demandId: string, callback: (error: string) => void): void {
    const listeners = this.errorListeners.get(demandId) || [];
    this.errorListeners.set(demandId, listeners.filter(cb => cb !== callback));
  }

  /**
   * Dispose all resources.
   */
  dispose(): void {
    this.killAll();
  }

  /**
   * Get all active demand IDs.
   */
  getActiveDemandIds(): string[] {
    return Array.from(this.processes.keys());
  }
}
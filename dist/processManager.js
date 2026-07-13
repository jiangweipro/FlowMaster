"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProcessManager = void 0;
const child_process_1 = require("child_process");
/**
 * Manages child_process.spawn lifecycle for per-demand terminal sessions.
 * Maintains a Map<demandId, ChildProcess> and provides clean-up on dispose.
 */
class ProcessManager {
    constructor() {
        this.processes = new Map();
        this.outputBuffers = new Map();
        this.exitListeners = new Map();
        this.dataListeners = new Map();
        this.errorListeners = new Map();
    }
    /**
     * Spawn a new process for the given demand.
     * If a process already exists for this demandId, it is killed first.
     */
    spawnProcess(demandId, command, args = [], cwd) {
        // Kill existing process for this demand if any
        this.killProcess(demandId);
        const options = {
            shell: process.platform === 'win32',
            windowsHide: true,
            cwd: cwd || process.cwd(),
        };
        // On Windows, use shell: true for .cmd/.bat resolution
        const proc = (0, child_process_1.spawn)(command, args, options);
        this.processes.set(demandId, proc);
        this.outputBuffers.set(demandId, []);
        // Pipe stdout
        if (proc.stdout) {
            proc.stdout.on('data', (chunk) => {
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
            proc.stderr.on('data', (chunk) => {
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
        proc.on('close', (code) => {
            this.processes.delete(demandId);
            const exitListeners = this.exitListeners.get(demandId);
            if (exitListeners) {
                exitListeners.forEach(cb => cb(code));
            }
        });
        // Handle spawn errors
        proc.on('error', (err) => {
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
    killProcess(demandId) {
        const proc = this.processes.get(demandId);
        if (!proc)
            return false;
        try {
            if (process.platform === 'win32') {
                // On Windows, use taskkill to ensure child process tree is killed
                (0, child_process_1.spawn)('taskkill', ['/pid', String(proc.pid), '/f', '/t'], {
                    windowsHide: true,
                    shell: true,
                });
            }
            else {
                proc.kill('SIGTERM');
                // Fallback to SIGKILL after 3 seconds
                setTimeout(() => {
                    try {
                        if (!proc.killed)
                            proc.kill('SIGKILL');
                    }
                    catch {
                        // Process already dead
                    }
                }, 3000);
            }
        }
        catch {
            // Process may already be dead
        }
        this.processes.delete(demandId);
        return true;
    }
    /**
     * Kill all managed processes.
     */
    killAll() {
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
    write(demandId, input) {
        const proc = this.processes.get(demandId);
        if (!proc || !proc.stdin || proc.stdin.destroyed)
            return false;
        try {
            proc.stdin.write(input);
            return true;
        }
        catch {
            return false;
        }
    }
    /**
     * Get a process by demandId.
     */
    getProcess(demandId) {
        return this.processes.get(demandId);
    }
    /**
     * Check if a process exists for the given demandId.
     */
    hasProcess(demandId) {
        return this.processes.has(demandId);
    }
    /**
     * Get the number of managed processes.
     */
    get processCount() {
        return this.processes.size;
    }
    /**
     * Get the full buffered output for a demand.
     */
    getBuffer(demandId) {
        const buffer = this.outputBuffers.get(demandId);
        return buffer ? buffer.join('') : '';
    }
    // --- Event subscription ---
    onData(demandId, callback) {
        const listeners = this.dataListeners.get(demandId) || [];
        listeners.push(callback);
        this.dataListeners.set(demandId, listeners);
    }
    offData(demandId, callback) {
        const listeners = this.dataListeners.get(demandId) || [];
        this.dataListeners.set(demandId, listeners.filter(cb => cb !== callback));
    }
    onExit(demandId, callback) {
        const listeners = this.exitListeners.get(demandId) || [];
        listeners.push(callback);
        this.exitListeners.set(demandId, listeners);
    }
    offExit(demandId, callback) {
        const listeners = this.exitListeners.get(demandId) || [];
        this.exitListeners.set(demandId, listeners.filter(cb => cb !== callback));
    }
    onError(demandId, callback) {
        const listeners = this.errorListeners.get(demandId) || [];
        listeners.push(callback);
        this.errorListeners.set(demandId, listeners);
    }
    offError(demandId, callback) {
        const listeners = this.errorListeners.get(demandId) || [];
        this.errorListeners.set(demandId, listeners.filter(cb => cb !== callback));
    }
    /**
     * Dispose all resources.
     */
    dispose() {
        this.killAll();
    }
    /**
     * Get all active demand IDs.
     */
    getActiveDemandIds() {
        return Array.from(this.processes.keys());
    }
}
exports.ProcessManager = ProcessManager;
//# sourceMappingURL=processManager.js.map
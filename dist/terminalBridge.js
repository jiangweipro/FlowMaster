"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TerminalBridge = void 0;
/**
 * Bridges ProcessManager streams to message callbacks that can be
 * forwarded to the WebView via postMessage.
 */
class TerminalBridge {
    constructor(processManager) {
        this.attachedDemands = new Set();
        this.messageCallback = null;
        // Store callback references for proper detach
        this.dataCallbacks = new Map();
        this.exitCallbacks = new Map();
        this.errorCallbacks = new Map();
        this.processManager = processManager;
    }
    /**
     * Set the callback that will receive messages to forward to the WebView.
     */
    setMessageCallback(callback) {
        this.messageCallback = callback;
    }
    /**
     * Attach to a process's streams for the given demand.
     * Sets up data, exit, and error listeners with stored references for detach.
     */
    attach(demandId) {
        if (this.attachedDemands.has(demandId))
            return;
        this.attachedDemands.add(demandId);
        // Forward stdout/stderr data
        const dataCb = (data) => {
            this.emit({ command: 'terminalOutput', demandId, data });
        };
        this.dataCallbacks.set(demandId, dataCb);
        this.processManager.onData(demandId, dataCb);
        // Forward exit events
        const exitCb = (code) => {
            this.emit({ command: 'terminalExit', demandId, code });
        };
        this.exitCallbacks.set(demandId, exitCb);
        this.processManager.onExit(demandId, exitCb);
        // Forward error events
        const errorCb = (error) => {
            this.emit({ command: 'terminalError', demandId, error });
        };
        this.errorCallbacks.set(demandId, errorCb);
        this.processManager.onError(demandId, errorCb);
    }
    /**
     * Detach from a process's streams.
     */
    detach(demandId) {
        if (!this.attachedDemands.has(demandId))
            return;
        this.attachedDemands.delete(demandId);
        const dataCb = this.dataCallbacks.get(demandId);
        if (dataCb) {
            this.processManager.offData(demandId, dataCb);
            this.dataCallbacks.delete(demandId);
        }
        const exitCb = this.exitCallbacks.get(demandId);
        if (exitCb) {
            this.processManager.offExit(demandId, exitCb);
            this.exitCallbacks.delete(demandId);
        }
        const errorCb = this.errorCallbacks.get(demandId);
        if (errorCb) {
            this.processManager.offError(demandId, errorCb);
            this.errorCallbacks.delete(demandId);
        }
    }
    /**
     * Write input to the process's stdin.
     */
    write(demandId, input) {
        return this.processManager.write(demandId, input);
    }
    /**
     * Handle a resize event for the terminal.
     * On Windows, PTY resize is not directly supported via signals,
     * so this is a no-op for now unless the process supports it.
     */
    resize(demandId, _cols, _rows) {
        const proc = this.processManager.getProcess(demandId);
        if (!proc || !proc.pid)
            return;
        // On Unix, SIGWINCH could be sent to the process group
        // On Windows, conpty handles resize automatically via the pty host
        if (process.platform !== 'win32' && proc.pid) {
            try {
                process.kill(proc.pid, 'SIGWINCH');
            }
            catch {
                // Process may not exist or signal not supported
            }
        }
    }
    /**
     * Start a process and attach its streams.
     */
    startProcess(demandId, command, args, cwd) {
        this.processManager.spawnProcess(demandId, command, args, cwd);
        this.attach(demandId);
        this.emit({ command: 'terminalStart', demandId, phase: args[0] || '' });
    }
    /**
     * Kill a process and detach its streams.
     */
    killProcess(demandId) {
        this.detach(demandId);
        this.processManager.killProcess(demandId);
    }
    /**
     * Get buffered output for a demand.
     */
    getBuffer(demandId) {
        return this.processManager.getBuffer(demandId);
    }
    /**
     * Dispose all resources.
     */
    dispose() {
        this.messageCallback = null;
        // Detach all attached demands
        const demandIds = Array.from(this.attachedDemands);
        demandIds.forEach(id => this.detach(id));
        this.dataCallbacks.clear();
        this.exitCallbacks.clear();
        this.errorCallbacks.clear();
        this.processManager.dispose();
    }
    emit(msg) {
        if (this.messageCallback) {
            try {
                this.messageCallback(msg);
            }
            catch {
                // WebView may be disposed
            }
        }
    }
}
exports.TerminalBridge = TerminalBridge;
//# sourceMappingURL=terminalBridge.js.map
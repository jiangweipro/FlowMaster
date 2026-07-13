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
exports.TerminalRunner = void 0;
const vscode = __importStar(require("vscode"));
const PHASE_COMMAND_MAP = {
    design: '/openflow:design',
    testcase: '/openflow:plan',
    development: '/openflow:build',
    delivery: '/openflow:close',
    closure: '',
};
/**
 * Manages the execution of OpenFlow commands via child_process.spawn.
 * Replaces the previous vscode.window.createTerminal-based approach.
 * Delegates to ProcessManager for process lifecycle and TerminalBridge
 * for stream-to-message conversion.
 */
class TerminalRunner {
    constructor(processManager, terminalBridge) {
        this.processManager = processManager;
        this.terminalBridge = terminalBridge;
        const folders = vscode.workspace.workspaceFolders;
        this.workspaceRoot = folders && folders.length > 0
            ? folders[0].uri.fsPath
            : process.cwd();
    }
    /**
     * Run a phase command for the given demand via spawn.
     * Returns true if the process was started successfully.
     */
    runPhase(demandId, phase) {
        const command = PHASE_COMMAND_MAP[phase];
        // Closure phase: no command to run
        if (phase === 'closure' || command === '') {
            vscode.window.showInformationMessage(`[FlowMaster] ${demandId} is already in Closure phase — no action needed.`);
            return false;
        }
        if (!command) {
            vscode.window.showErrorMessage(`[FlowMaster] Unknown phase: ${phase}`);
            return false;
        }
        const skipPermissions = vscode.workspace.getConfiguration('flowmaster')
            .get('skipPermissions', false);
        const args = skipPermissions
            ? [command, demandId, '--dangerously-skip-permissions']
            : [command, demandId];
        try {
            this.terminalBridge.startProcess(demandId, 'claude', args, this.workspaceRoot);
            return true;
        }
        catch (err) {
            vscode.window.showErrorMessage(`[FlowMaster] Failed to start process for ${demandId}: ${String(err)}`);
            return false;
        }
    }
    /**
     * Write input to a process's stdin.
     */
    write(demandId, input) {
        return this.terminalBridge.write(demandId, input);
    }
    /**
     * Resize a terminal.
     */
    resize(demandId, cols, rows) {
        this.terminalBridge.resize(demandId, cols, rows);
    }
    /**
     * Kill a specific process.
     */
    kill(demandId) {
        this.terminalBridge.killProcess(demandId);
    }
    /**
     * Get the underlying ProcessManager.
     */
    getProcessManager() {
        return this.processManager;
    }
    /**
     * Get the underlying TerminalBridge.
     */
    getTerminalBridge() {
        return this.terminalBridge;
    }
    /**
     * Dispose all resources.
     */
    dispose() {
        this.terminalBridge.dispose();
    }
}
exports.TerminalRunner = TerminalRunner;
//# sourceMappingURL=terminalRunner.js.map
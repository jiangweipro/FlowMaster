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
class TerminalRunner {
    constructor() {
        this.terminals = new Map();
    }
    runPhase(demandId, phase) {
        const command = PHASE_COMMAND_MAP[phase];
        // Closure phase: no command to run, gracefully skip
        if (phase === 'closure' || command === '') {
            vscode.window.showInformationMessage(`[FlowMaster] ${demandId} is already in Closure phase — no action needed.`);
            return;
        }
        if (!command) {
            vscode.window.showErrorMessage(`[FlowMaster] Unknown phase: ${phase}`);
            return;
        }
        const reuse = vscode.workspace.getConfiguration('flowmaster').get('terminalReuse', false);
        let terminal;
        if (reuse && this.terminals.has(demandId)) {
            terminal = this.terminals.get(demandId);
        }
        else {
            // Dispose old terminal for this demand if exists
            if (this.terminals.has(demandId)) {
                this.terminals.get(demandId).dispose();
            }
            terminal = vscode.window.createTerminal({
                name: `FlowMaster: ${demandId}`,
            });
            if (!terminal) {
                vscode.window.showErrorMessage(`[FlowMaster] Failed to create terminal for ${demandId}`);
                return;
            }
            this.terminals.set(demandId, terminal);
        }
        if (!terminal) {
            vscode.window.showErrorMessage(`[FlowMaster] No terminal available for ${demandId}`);
            return;
        }
        const workspaceFolders = vscode.workspace.workspaceFolders;
        const cwd = workspaceFolders && workspaceFolders.length > 0
            ? workspaceFolders[0].uri.fsPath
            : '';
        terminal.show();
        if (cwd) {
            terminal.sendText(`cd "${cwd}"`);
        }
        terminal.sendText(`claude ${command} ${demandId}`);
    }
    getTerminal(demandId) {
        return this.terminals.get(demandId);
    }
    dispose() {
        for (const [, terminal] of this.terminals) {
            terminal.dispose();
        }
        this.terminals.clear();
    }
}
exports.TerminalRunner = TerminalRunner;
//# sourceMappingURL=terminalRunner.js.map
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
exports.TerminalManager = void 0;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
const phaseConfig_1 = require("./phaseConfig");
class TerminalManager {
    constructor(projectRoot, onPhaseComplete) {
        this.projectRoot = projectRoot;
        this.onPhaseComplete = onPhaseComplete;
        this.demandTerminals = new Map();
        this.runningPhase = new Map();
        this.closeDisposables = new Map();
    }
    // ----------------------------------------------------------
    // Public API
    // ----------------------------------------------------------
    /**
     * Get or create a VS Code terminal for the given demand.
     * Reuses existing terminal if available, otherwise creates a new one.
     */
    getDemandTerminal(demandId) {
        let term = this.demandTerminals.get(demandId);
        if (term) {
            try {
                // Check if terminal is still alive by accessing a property
                // that throws if the terminal was disposed.
                term.creationId;
                term.show();
                return term;
            }
            catch {
                // Terminal was disposed — remove from map and create new.
                this.demandTerminals.delete(demandId);
                this.closeDisposables.get(demandId)?.dispose();
                this.closeDisposables.delete(demandId);
            }
        }
        term = vscode.window.createTerminal({
            name: `FlowMaster: ${demandId}`,
            cwd: this.projectRoot,
            message: `FlowMaster 终端 - ${demandId}`,
        });
        this.demandTerminals.set(demandId, term);
        // Listen for terminal close to emit phaseComplete
        const disposable = vscode.window.onDidCloseTerminal((closedTerm) => {
            if (closedTerm === term) {
                this.demandTerminals.delete(demandId);
                this.closeDisposables.get(demandId)?.dispose();
                this.closeDisposables.delete(demandId);
                const phase = this.runningPhase.get(demandId);
                if (phase) {
                    this.runningPhase.delete(demandId);
                    this.onPhaseComplete?.({
                        demandId,
                        phase,
                        phaseLabel: phaseConfig_1.ACTION_LABELS[phase] || phase,
                        nextSteps: (0, phaseConfig_1.buildNextSteps)(phase),
                    });
                }
            }
        });
        this.closeDisposables.set(demandId, disposable);
        term.show();
        return term;
    }
    /**
     * Send a phase command to the demand's terminal.
     */
    runPhase(demandId, phase) {
        if (phase === 'propose' || phase === 'design') {
            if (!this.ensureOpenflowDesignSkill())
                return;
            this.runningPhase.set(demandId, phase);
            const cmd = `claude --dangerously-skip-permissions /openflow:design`;
            this.getDemandTerminal(demandId).sendText(cmd);
            return;
        }
        const command = phaseConfig_1.PHASE_COMMAND_MAP[phase];
        if (!command) {
            vscode.window.showErrorMessage(`[FlowMaster] 未知阶段: ${phase}`);
            return;
        }
        this.runningPhase.set(demandId, phase);
        const cmd = `claude --dangerously-skip-permissions ${command} ${demandId}`;
        this.getDemandTerminal(demandId).sendText(cmd);
    }
    /**
     * Start a new demand (design phase, no demandId arg).
     */
    runOpenflowDesign() {
        if (!this.ensureOpenflowDesignSkill())
            return;
        const demandId = 'flowmaster:new';
        this.runningPhase.set(demandId, 'design');
        const cmd = `claude --dangerously-skip-permissions /openflow:design`;
        this.getDemandTerminal(demandId).sendText(cmd);
    }
    /**
     * Dispose all tracked terminals.
     */
    disposeAll() {
        this.demandTerminals.forEach((term) => {
            try {
                term.dispose();
            }
            catch {
                // already disposed
            }
        });
        this.demandTerminals.clear();
        this.closeDisposables.forEach((d) => d.dispose());
        this.closeDisposables.clear();
        this.runningPhase.clear();
    }
    // ----------------------------------------------------------
    // Skill detection
    // ----------------------------------------------------------
    hasOpenflowDesignSkill() {
        const root = this.projectRoot;
        const home = os.homedir();
        const candidates = [
            path.join(root, '.claude', 'skills', 'openflow-design', 'SKILL.md'),
            path.join(home, '.claude', 'skills', 'openflow-design', 'SKILL.md'),
        ];
        return candidates.some((p) => fs.existsSync(p));
    }
    ensureOpenflowDesignSkill() {
        if (this.hasOpenflowDesignSkill())
            return true;
        vscode.window.showInformationMessage('[FlowMaster] 未检测到 openflow-design 技能，请先在 .claude/skills 或 ~/.claude/skills 中添加该技能。');
        return false;
    }
}
exports.TerminalManager = TerminalManager;
//# sourceMappingURL=terminalManager.js.map
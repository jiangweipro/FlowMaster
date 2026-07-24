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
exports.StateReader = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const vscode = __importStar(require("vscode"));
const yaml_1 = require("yaml");
// ============================================================
// State Reader — parses .workflow/state/*.yaml with caching
// ============================================================
class StateReader {
    constructor(workspaceRoot) {
        this.cache = null;
        if (workspaceRoot) {
            this.workspaceRoot = workspaceRoot;
        }
        else {
            const folders = vscode.workspace.workspaceFolders;
            this.workspaceRoot =
                folders && folders.length > 0
                    ? folders[0].uri.fsPath
                    : process.cwd();
        }
        const configPath = vscode.workspace
            .getConfiguration('flowmaster')
            .get('statePath', '.workflow/state');
        this.statePath = path.join(this.workspaceRoot, configPath);
    }
    /**
     * Read all demand states from the state directory.
     * Results are cached; call invalidateCache() to force re-read.
     */
    readAllStates() {
        if (this.cache)
            return this.cache;
        if (!fs.existsSync(this.statePath)) {
            this.cache = [];
            return this.cache;
        }
        const files = fs
            .readdirSync(this.statePath)
            .filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'));
        const results = [];
        for (const file of files) {
            try {
                const fullPath = path.join(this.statePath, file);
                const content = fs.readFileSync(fullPath, 'utf-8');
                if (!content.trim()) {
                    console.warn(`[FlowMaster] Empty state file: ${file}`);
                    continue;
                }
                const parsed = (0, yaml_1.parse)(content);
                if (!parsed || !parsed.change) {
                    console.warn(`[FlowMaster] Invalid state file (missing "change" field): ${file}`);
                    continue;
                }
                results.push(this.toSummary(parsed));
            }
            catch (err) {
                console.warn(`[FlowMaster] Failed to parse state file: ${file} — ${String(err)}`);
            }
        }
        this.cache = results;
        return results;
    }
    /**
     * Read a single demand state by ID. Uses cache when available (O(1)).
     */
    readState(demandId) {
        // Ensure cache is populated
        const all = this.readAllStates();
        return all.find((d) => d.id === demandId) || null;
    }
    /**
     * Invalidate the internal cache so the next readAllStates() re-reads from disk.
     */
    invalidateCache() {
        this.cache = null;
    }
    /** Get the resolved state directory path. */
    getStatePath() {
        return this.statePath;
    }
    // ----------------------------------------------------------
    // Private helpers
    // ----------------------------------------------------------
    toSummary(parsed) {
        return {
            id: parsed.change,
            name: parsed.change,
            title: parsed.title || parsed.change,
            phase: parsed.current_phase || 'unknown',
            gate: this.getCurrentGateStatus(parsed),
            status: parsed.status || 'unknown',
            artifacts: this.getCurrentArtifacts(parsed),
            phases: parsed.phases || {},
        };
    }
    getCurrentGateStatus(demand) {
        if (!demand.phases || !demand.current_phase)
            return 'unknown';
        const currentPhase = demand.phases[demand.current_phase];
        return currentPhase?.gate?.status || 'unknown';
    }
    getCurrentArtifacts(demand) {
        if (!demand.phases || !demand.current_phase)
            return [];
        return demand.phases[demand.current_phase]?.artifacts || [];
    }
}
exports.StateReader = StateReader;
//# sourceMappingURL=stateReader.js.map
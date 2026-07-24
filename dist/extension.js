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
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const sidebarProvider_1 = require("./sidebarProvider");
const stateReader_1 = require("./stateReader");
const stateWriter_1 = require("./stateWriter");
const terminalManager_1 = require("./terminalManager");
const panelProvider_1 = require("./panelProvider");
// ============================================================
// Extension Entry Point — thin coordinator
// ============================================================
let dashboard;
let sidebar;
let terminalManager;
function activate(context) {
    try {
        console.log('[FlowMaster] Extension activating...');
        // Resolve project root
        const folders = vscode.workspace.workspaceFolders;
        const projectRoot = folders && folders.length > 0
            ? folders[0].uri.fsPath
            : process.cwd();
        console.log('[FlowMaster] Project root:', projectRoot);
        // Create core services
        const stateReader = new stateReader_1.StateReader(projectRoot);
        const stateWriter = new stateWriter_1.StateWriter(projectRoot);
        // Create terminal manager with phase-complete callback
        terminalManager = new terminalManager_1.TerminalManager(projectRoot, (event) => {
            // Forward to dashboard for next-steps banner
            dashboard?.onPhaseComplete(event);
            // Refresh sidebar and dashboard state
            stateReader.invalidateCache();
            refreshAll();
        });
        // Create dashboard panel provider
        dashboard = new panelProvider_1.FlowMasterDashboardProvider(stateReader, stateWriter, terminalManager, context);
        // Create sidebar provider
        sidebar = new sidebarProvider_1.FlowMasterSidebarProvider(stateReader, context);
        // Register sidebar view
        context.subscriptions.push(vscode.window.registerWebviewViewProvider(sidebarProvider_1.FlowMasterSidebarProvider.viewType, sidebar));
        // Register commands
        const openCmd = vscode.commands.registerCommand('flowmaster.openDashboard', (demandId) => {
            dashboard?.createOrShow(demandId);
        });
        const refreshCmd = vscode.commands.registerCommand('flowmaster.refresh', () => {
            stateReader.invalidateCache();
            refreshAll();
        });
        const newDemandCmd = vscode.commands.registerCommand('flowmaster.newDemand', () => {
            // Ensure dashboard is open first
            dashboard?.createOrShow();
            terminalManager?.runOpenflowDesign();
        });
        context.subscriptions.push(openCmd, refreshCmd, newDemandCmd);
        // Status bar button
        const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
        statusBar.text = '$(project) FlowMaster';
        statusBar.command = 'flowmaster.openDashboard';
        statusBar.tooltip = 'Open FlowMaster Dashboard';
        statusBar.show();
        context.subscriptions.push(statusBar);
        // Auto-refresh every 30 seconds
        const refreshTimer = setInterval(() => {
            stateReader.invalidateCache();
            refreshAll();
        }, 30000);
        context.subscriptions.push({
            dispose: () => clearInterval(refreshTimer),
        });
        console.log('[FlowMaster] Extension activated.');
    }
    catch (err) {
        console.error('[FlowMaster] Activation failed:', err);
        vscode.window.showErrorMessage(`[FlowMaster] 扩展激活失败: ${String(err)}`);
    }
}
function deactivate() {
    terminalManager?.disposeAll();
    dashboard?.dispose();
}
// ----------------------------------------------------------
// Shared refresh for both sidebar and dashboard
// ----------------------------------------------------------
function refreshAll() {
    sidebar?.refresh();
    dashboard?.refresh();
}
//# sourceMappingURL=extension.js.map
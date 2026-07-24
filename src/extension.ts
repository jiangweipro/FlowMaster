import * as vscode from 'vscode';
import { FlowMasterSidebarProvider } from './sidebarProvider';
import { StateReader } from './stateReader';
import { StateWriter } from './stateWriter';
import { TerminalManager } from './terminalManager';
import { FlowMasterDashboardProvider } from './panelProvider';

// ============================================================
// Extension Entry Point — thin coordinator
// ============================================================

let dashboard: FlowMasterDashboardProvider | undefined;
let sidebar: FlowMasterSidebarProvider | undefined;
let terminalManager: TerminalManager | undefined;

export function activate(context: vscode.ExtensionContext): void {
  try {
    console.log('[FlowMaster] Extension activating...');

    // Resolve project root
    const folders = vscode.workspace.workspaceFolders;
    const projectRoot =
      folders && folders.length > 0
        ? folders[0].uri.fsPath
        : process.cwd();
    console.log('[FlowMaster] Project root:', projectRoot);

    // Create core services
    const stateReader = new StateReader(projectRoot);
    const stateWriter = new StateWriter(projectRoot);

    // Create terminal manager with phase-complete callback
    terminalManager = new TerminalManager(projectRoot, (event) => {
      // Forward to dashboard for next-steps banner
      dashboard?.onPhaseComplete(event);
      // Refresh sidebar and dashboard state
      stateReader.invalidateCache();
      refreshAll();
    });

    // Create dashboard panel provider
    dashboard = new FlowMasterDashboardProvider(
      stateReader,
      stateWriter,
      terminalManager,
      context,
    );

    // Create sidebar provider
    sidebar = new FlowMasterSidebarProvider(stateReader, context);

    // Register sidebar view
    context.subscriptions.push(
      vscode.window.registerWebviewViewProvider(
        FlowMasterSidebarProvider.viewType,
        sidebar,
      ),
    );

    // Register commands
    const openCmd = vscode.commands.registerCommand(
      'flowmaster.openDashboard',
      (demandId?: string) => {
        dashboard?.createOrShow(demandId);
      },
    );

    const refreshCmd = vscode.commands.registerCommand(
      'flowmaster.refresh',
      () => {
        stateReader.invalidateCache();
        refreshAll();
      },
    );

    const newDemandCmd = vscode.commands.registerCommand(
      'flowmaster.newDemand',
      () => {
        // Ensure dashboard is open first
        dashboard?.createOrShow();
        terminalManager?.runOpenflowDesign();
      },
    );

    context.subscriptions.push(openCmd, refreshCmd, newDemandCmd);

    // Status bar button
    const statusBar = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      100,
    );
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
  } catch (err) {
    console.error('[FlowMaster] Activation failed:', err);
    vscode.window.showErrorMessage(
      `[FlowMaster] 扩展激活失败: ${String(err)}`,
    );
  }
}

export function deactivate(): void {
  terminalManager?.disposeAll();
  dashboard?.dispose();
}

// ----------------------------------------------------------
// Shared refresh for both sidebar and dashboard
// ----------------------------------------------------------

function refreshAll(): void {
  sidebar?.refresh();
  dashboard?.refresh();
}
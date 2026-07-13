import * as vscode from 'vscode';

const PHASE_COMMAND_MAP: Record<string, string> = {
  design: '/openflow:design',
  testcase: '/openflow:plan',
  development: '/openflow:build',
  delivery: '/openflow:close',
  closure: '',
};

export class TerminalRunner {
  private terminals: Map<string, vscode.Terminal> = new Map();

  runPhase(demandId: string, phase: string): void {
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

    const reuse = vscode.workspace.getConfiguration('flowmaster').get<boolean>('terminalReuse', false);
    let terminal: vscode.Terminal | undefined;

    if (reuse && this.terminals.has(demandId)) {
      terminal = this.terminals.get(demandId);
    } else {
      // Dispose old terminal for this demand if exists
      if (this.terminals.has(demandId)) {
        this.terminals.get(demandId)!.dispose();
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

  getTerminal(demandId: string): vscode.Terminal | undefined {
    return this.terminals.get(demandId);
  }

  dispose(): void {
    for (const [, terminal] of this.terminals) {
      terminal.dispose();
    }
    this.terminals.clear();
  }
}
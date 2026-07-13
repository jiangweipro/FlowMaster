import * as vscode from 'vscode';
import { ProcessManager } from './processManager';
import { TerminalBridge } from './terminalBridge';

const PHASE_COMMAND_MAP: Record<string, string> = {
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
export class TerminalRunner {
  private processManager: ProcessManager;
  private terminalBridge: TerminalBridge;
  private workspaceRoot: string;

  constructor(processManager: ProcessManager, terminalBridge: TerminalBridge) {
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
  runPhase(demandId: string, phase: string): boolean {
    const command = PHASE_COMMAND_MAP[phase];

    // Closure phase: no command to run
    if (phase === 'closure' || command === '') {
      vscode.window.showInformationMessage(
        `[FlowMaster] ${demandId} is already in Closure phase — no action needed.`
      );
      return false;
    }

    if (!command) {
      vscode.window.showErrorMessage(`[FlowMaster] Unknown phase: ${phase}`);
      return false;
    }

    const skipPermissions = vscode.workspace.getConfiguration('flowmaster')
      .get<boolean>('skipPermissions', false);
    const args = skipPermissions
      ? [command, demandId, '--dangerously-skip-permissions']
      : [command, demandId];

    try {
      this.terminalBridge.startProcess(
        demandId,
        'claude',
        args,
        this.workspaceRoot
      );
      return true;
    } catch (err) {
      vscode.window.showErrorMessage(
        `[FlowMaster] Failed to start process for ${demandId}: ${String(err)}`
      );
      return false;
    }
  }

  /**
   * Write input to a process's stdin.
   */
  write(demandId: string, input: string): boolean {
    return this.terminalBridge.write(demandId, input);
  }

  /**
   * Resize a terminal.
   */
  resize(demandId: string, cols: number, rows: number): void {
    this.terminalBridge.resize(demandId, cols, rows);
  }

  /**
   * Kill a specific process.
   */
  kill(demandId: string): void {
    this.terminalBridge.killProcess(demandId);
  }

  /**
   * Get the underlying ProcessManager.
   */
  getProcessManager(): ProcessManager {
    return this.processManager;
  }

  /**
   * Get the underlying TerminalBridge.
   */
  getTerminalBridge(): TerminalBridge {
    return this.terminalBridge;
  }

  /**
   * Dispose all resources.
   */
  dispose(): void {
    this.terminalBridge.dispose();
  }
}
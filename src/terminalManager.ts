import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { PHASE_COMMAND_MAP, ACTION_LABELS, buildNextSteps } from './phaseConfig';

// ============================================================
// Terminal Manager — owns VS Code terminal lifecycle per demand
// ============================================================

export interface PhaseCompleteEvent {
  demandId: string;
  phase: string;
  phaseLabel: string;
  nextSteps: ReturnType<typeof buildNextSteps>;
}

export class TerminalManager {
  private demandTerminals: Map<string, vscode.Terminal> = new Map();
  private runningPhase: Map<string, string> = new Map();
  private closeDisposables: Map<string, vscode.Disposable> = new Map();

  constructor(
    private readonly projectRoot: string,
    private readonly onPhaseComplete?: (event: PhaseCompleteEvent) => void,
  ) {}

  // ----------------------------------------------------------
  // Public API
  // ----------------------------------------------------------

  /**
   * Get or create a VS Code terminal for the given demand.
   * Reuses existing terminal if available, otherwise creates a new one.
   */
  getDemandTerminal(demandId: string): vscode.Terminal {
    let term = this.demandTerminals.get(demandId);
    if (term) {
      try {
        // Check if terminal is still alive by accessing a property
        // that throws if the terminal was disposed.
        (term as any).creationId;
        term.show();
        return term;
      } catch {
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
            phaseLabel: ACTION_LABELS[phase] || phase,
            nextSteps: buildNextSteps(phase),
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
  runPhase(demandId: string, phase: string): void {
    if (phase === 'propose' || phase === 'design') {
      if (!this.ensureOpenflowDesignSkill()) return;
      this.runningPhase.set(demandId, phase);
      const cmd = `claude --dangerously-skip-permissions /openflow:design`;
      this.getDemandTerminal(demandId).sendText(cmd);
      return;
    }

    const command = PHASE_COMMAND_MAP[phase];
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
  runOpenflowDesign(): void {
    if (!this.ensureOpenflowDesignSkill()) return;
    const demandId = 'flowmaster:new';
    this.runningPhase.set(demandId, 'design');
    const cmd = `claude --dangerously-skip-permissions /openflow:design`;
    this.getDemandTerminal(demandId).sendText(cmd);
  }

  /**
   * Dispose all tracked terminals.
   */
  disposeAll(): void {
    this.demandTerminals.forEach((term) => {
      try {
        term.dispose();
      } catch {
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

  private hasOpenflowDesignSkill(): boolean {
    const root = this.projectRoot;
    const home = os.homedir();
    const candidates = [
      path.join(root, '.claude', 'skills', 'openflow-design', 'SKILL.md'),
      path.join(home, '.claude', 'skills', 'openflow-design', 'SKILL.md'),
    ];
    return candidates.some((p) => fs.existsSync(p));
  }

  private ensureOpenflowDesignSkill(): boolean {
    if (this.hasOpenflowDesignSkill()) return true;
    vscode.window.showInformationMessage(
      '[FlowMaster] 未检测到 openflow-design 技能，请先在 .claude/skills 或 ~/.claude/skills 中添加该技能。',
    );
    return false;
  }
}
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { parse } from 'yaml';

export interface PhaseState {
  status: string;
  artifacts: string[];
  report: string | null;
  gate: {
    status: string;
    reviewer?: string;
    reviewed_at?: string;
  };
  blocked_by?: string[];
}

export interface DemandState {
  change: string;
  title: string;
  status: string;
  current_phase: string;
  phases: Record<string, PhaseState>;
}

export interface DemandSummary {
  id: string;
  name: string;
  title: string;
  phase: string;
  gate: string;
  status: string;
  artifacts: string[];
  phases: Record<string, PhaseState>;
}

export class StateReader {
  private workspaceRoot: string;

  constructor() {
    const folders = vscode.workspace.workspaceFolders;
    this.workspaceRoot = folders && folders.length > 0
      ? folders[0].uri.fsPath
      : process.cwd();
  }

  readAllStates(): DemandSummary[] {
    const statePath = this.getStatePath();
    if (!fs.existsSync(statePath)) {
      return [];
    }

    const files = fs.readdirSync(statePath).filter(f => f.endsWith('.yaml') || f.endsWith('.yml'));
    const results: DemandSummary[] = [];

    for (const file of files) {
      try {
        const fullPath = path.join(statePath, file);
        const content = fs.readFileSync(fullPath, 'utf-8');
        if (!content.trim()) {
          console.warn(`[FlowMaster] Empty state file: ${file}`);
          continue;
        }

        const parsed = parse(content) as DemandState;
        if (!parsed || !parsed.change) {
          console.warn(`[FlowMaster] Invalid state file (missing "change" field): ${file}`);
          continue;
        }

        const summary: DemandSummary = {
          id: parsed.change,
          name: parsed.change,
          title: parsed.title || parsed.change,
          phase: parsed.current_phase || 'unknown',
          gate: this.getCurrentGateStatus(parsed),
          status: parsed.status || 'unknown',
          artifacts: this.getCurrentArtifacts(parsed),
          phases: parsed.phases || {}
        };

        results.push(summary);
      } catch (err) {
        console.warn(`[FlowMaster] Failed to parse state file: ${file} — ${String(err)}`);
      }
    }

    return results;
  }

  readState(demandId: string): DemandSummary | null {
    const all = this.readAllStates();
    return all.find(d => d.id === demandId) || null;
  }

  private getStatePath(): string {
    const configPath = vscode.workspace.getConfiguration('flowmaster').get<string>('statePath', '.workflow/state');
    return path.join(this.workspaceRoot, configPath);
  }

  private getCurrentGateStatus(demand: DemandState): string {
    if (!demand.phases || !demand.current_phase) {
      return 'unknown';
    }
    const currentPhase = demand.phases[demand.current_phase];
    if (!currentPhase || !currentPhase.gate) {
      return 'unknown';
    }
    return currentPhase.gate.status || 'unknown';
  }

  private getCurrentArtifacts(demand: DemandState): string[] {
    if (!demand.phases || !demand.current_phase) {
      return [];
    }
    const currentPhase = demand.phases[demand.current_phase];
    if (!currentPhase || !currentPhase.artifacts) {
      return [];
    }
    return currentPhase.artifacts;
  }
}
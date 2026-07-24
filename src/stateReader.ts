import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { parse } from 'yaml';

// ============================================================
// Types
// ============================================================

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

// ============================================================
// State Reader — parses .workflow/state/*.yaml with caching
// ============================================================

export class StateReader {
  private workspaceRoot: string;
  private statePath: string;
  private cache: DemandSummary[] | null = null;

  constructor(workspaceRoot?: string) {
    if (workspaceRoot) {
      this.workspaceRoot = workspaceRoot;
    } else {
      const folders = vscode.workspace.workspaceFolders;
      this.workspaceRoot =
        folders && folders.length > 0
          ? folders[0].uri.fsPath
          : process.cwd();
    }
    const configPath = vscode.workspace
      .getConfiguration('flowmaster')
      .get<string>('statePath', '.workflow/state');
    this.statePath = path.join(this.workspaceRoot, configPath);
  }

  /**
   * Read all demand states from the state directory.
   * Results are cached; call invalidateCache() to force re-read.
   */
  readAllStates(): DemandSummary[] {
    if (this.cache) return this.cache;

    if (!fs.existsSync(this.statePath)) {
      this.cache = [];
      return this.cache;
    }

    const files = fs
      .readdirSync(this.statePath)
      .filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'));
    const results: DemandSummary[] = [];

    for (const file of files) {
      try {
        const fullPath = path.join(this.statePath, file);
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

        results.push(this.toSummary(parsed));
      } catch (err) {
        console.warn(`[FlowMaster] Failed to parse state file: ${file} — ${String(err)}`);
      }
    }

    this.cache = results;
    return results;
  }

  /**
   * Read a single demand state by ID. Uses cache when available (O(1)).
   */
  readState(demandId: string): DemandSummary | null {
    // Ensure cache is populated
    const all = this.readAllStates();
    return all.find((d) => d.id === demandId) || null;
  }

  /**
   * Invalidate the internal cache so the next readAllStates() re-reads from disk.
   */
  invalidateCache(): void {
    this.cache = null;
  }

  /** Get the resolved state directory path. */
  getStatePath(): string {
    return this.statePath;
  }

  // ----------------------------------------------------------
  // Private helpers
  // ----------------------------------------------------------

  private toSummary(parsed: DemandState): DemandSummary {
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

  private getCurrentGateStatus(demand: DemandState): string {
    if (!demand.phases || !demand.current_phase) return 'unknown';
    const currentPhase = demand.phases[demand.current_phase];
    return currentPhase?.gate?.status || 'unknown';
  }

  private getCurrentArtifacts(demand: DemandState): string[] {
    if (!demand.phases || !demand.current_phase) return [];
    return demand.phases[demand.current_phase]?.artifacts || [];
  }
}
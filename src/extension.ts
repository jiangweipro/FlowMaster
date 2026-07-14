import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { spawn } from 'child_process';
import { FlowMasterSidebarProvider } from './sidebarProvider';
import { StateReader } from './stateReader';
import { ProcessManager } from './processManager';
import { TerminalBridge, TerminalToWebViewMessage } from './terminalBridge';

// ============================================
// Extension Entry Point
// ============================================

let panel: vscode.WebviewPanel | undefined;
let panelReady = false;
let projectRoot: string = '';
let selectedDemandId: string | null = null;
let stateReader: StateReader | undefined;
let sidebarProvider: FlowMasterSidebarProvider | undefined;
let processManager: ProcessManager | undefined;
let terminalBridge: TerminalBridge | undefined;
let contextGlobal: vscode.ExtensionContext;
let pendingDemandSelection: string | null = null;

export function activate(context: vscode.ExtensionContext): void {
  contextGlobal = context;
  try {
    console.log('[FlowMaster] Extension activating...');

    // Determine project root (prefer the currently opened workspace folder)
    const folders = vscode.workspace.workspaceFolders;
    projectRoot = (folders && folders.length > 0)
      ? folders[0].uri.fsPath
      : process.cwd();
    console.log('[FlowMaster] Project root:', projectRoot);

    stateReader = new StateReader(projectRoot);

    // Initialize ProcessManager and TerminalBridge
    processManager = new ProcessManager();
    terminalBridge = new TerminalBridge(processManager);

    sidebarProvider = new FlowMasterSidebarProvider(stateReader, context);

    // Register sidebar view
    context.subscriptions.push(
      vscode.window.registerWebviewViewProvider(
        FlowMasterSidebarProvider.viewType,
        sidebarProvider
      )
    );

    // Register commands
    const openCmd = vscode.commands.registerCommand('flowmaster.openDashboard', (demandId?: string) => {
      if (demandId && typeof demandId === 'string') {
        selectedDemandId = demandId;
      }
      if (panel) {
        panel.reveal();
        if (panelReady) {
          sendSelectedDemand();
        } else {
          pendingDemandSelection = selectedDemandId;
        }
        return;
      }
      createPanel(context);
    });

    const refreshCmd = vscode.commands.registerCommand('flowmaster.refresh', () => {
      refreshAll();
    });

    const newDemandCmd = vscode.commands.registerCommand('flowmaster.newDemand', () => {
      runOpenflowDesign();
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
      refreshAll();
    }, 30000);
    context.subscriptions.push({ dispose: () => clearInterval(refreshTimer) });

    console.log('[FlowMaster] Extension activated.');
  } catch (err) {
    console.error('[FlowMaster] Activation failed:', err);
    vscode.window.showErrorMessage(`[FlowMaster] 扩展激活失败: ${String(err)}`);
  }
}

export function deactivate(): void {
  panel?.dispose();
  panel = undefined;
  if (processManager) {
    processManager.killAll();
  }
}

// ============================================
// Panel Management
// ============================================

const PHASE_COMMAND_MAP: Record<string, string> = {
  design: '/openflow:design',
  testcase: '/openflow:plan',
  development: '/openflow:build',
  delivery: '/openflow:close',
  fix: '/openflow:fix',
  retest: '/openflow:retest',
};

// Action label shown in the end-of-phase banner (command-friendly, not the Chinese phase label).
const ACTION_LABELS: Record<string, string> = {
  design: 'Design',
  testcase: 'Plan',
  development: 'Build',
  delivery: 'Close',
  fix: 'Fix',
  retest: 'Retest',
};

// Context-aware next-step suggestions shown after each phase command exits.
// build → fix / retest / close ; fix → retest / close ; retest → fix / close
const NEXT_STEPS: Record<string, { phase: string; desc: string }[]> = {
  development: [
    { phase: 'fix', desc: '修复失败用例' },
    { phase: 'retest', desc: '回归重测' },
    { phase: 'delivery', desc: '交付归档' },
  ],
  fix: [
    { phase: 'retest', desc: '回归重测' },
    { phase: 'delivery', desc: '交付归档' },
  ],
  retest: [
    { phase: 'fix', desc: '修复回归用例' },
    { phase: 'delivery', desc: '交付归档' },
  ],
  design: [{ phase: 'testcase', desc: '生成测试用例与任务' }],
  testcase: [{ phase: 'development', desc: '编码实现' }],
};

// Tracks which phase command is currently running per demand, so that on
// terminalExit the extension can emit a phaseComplete message with next steps.
const runningPhase: Map<string, string> = new Map();

function buildNextSteps(phase: string) {
  return (NEXT_STEPS[phase] || []).map(s => ({
    phase: s.phase,
    label: ACTION_LABELS[s.phase] || s.phase,
    desc: s.desc,
    cmd: PHASE_COMMAND_MAP[s.phase] || '',
  }));
}

function createPanel(context: vscode.ExtensionContext): void {
  panelReady = false;
  panel = vscode.window.createWebviewPanel(
    'flowmasterDashboard',
    'FlowMaster 控制台',
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [
        vscode.Uri.file(path.join(context.extensionPath, 'media')),
        vscode.Uri.file(path.join(context.extensionPath, 'node_modules', 'xterm')),
        vscode.Uri.file(path.join(context.extensionPath, 'node_modules', 'xterm-addon-fit')),
        vscode.Uri.file(path.join(context.extensionPath, 'node_modules', 'xterm-addon-web-links')),
      ],
    }
  );

  panel.webview.html = getHtml(panel.webview, context);

  // Wire up terminal bridge message callback
  if (terminalBridge) {
    terminalBridge.setMessageCallback((msg: TerminalToWebViewMessage) => {
      if (!panel) return;
      // On process exit, emit a phaseComplete message carrying the phase that
      // just ran and its context-aware next-step suggestions (build→fix/retest/close, etc.).
      if (msg.command === 'terminalExit') {
        const phase = runningPhase.get(msg.demandId);
        if (phase) {
          panel.webview.postMessage({
            command: 'phaseComplete',
            demandId: msg.demandId,
            phase,
            phaseLabel: ACTION_LABELS[phase] || phase,
            code: msg.code,
            nextSteps: buildNextSteps(phase),
          });
          runningPhase.delete(msg.demandId);
        }
      }
      panel.webview.postMessage(msg);
    });
  }

  panel.webview.onDidReceiveMessage(
    (msg: any) => handleMessage(msg),
    undefined,
    context.subscriptions
  );

  panel.onDidDispose(() => { panel = undefined; panelReady = false; });

  sendSelectedDemand();
}

function handleMessage(msg: any): void {
  if (!panel) return;
  switch (msg.command) {
    case 'ready': {
      panelReady = true;
      if (pendingDemandSelection) {
        selectedDemandId = pendingDemandSelection;
        pendingDemandSelection = null;
      }
      sendSelectedDemand();
      break;
    }
    case 'refreshState': sendSelectedDemand(); break;
    case 'runPhase': runPhase(msg.demandId || msg.payload?.demandId, msg.phase || msg.payload?.phase); break;
    case 'openFile': openFile(msg.path || msg.payload?.path); break;
    case 'reviewGate': reviewGate(msg.demandId || msg.payload?.demandId, msg.phase || msg.payload?.phase, msg.action || msg.payload?.action); break;
    case 'terminalInput': {
      const demandId = msg.payload?.demandId;
      const data = msg.payload?.data;
      if (demandId && data && terminalBridge) {
        terminalBridge.write(demandId, data);
      }
      break;
    }
    case 'terminalResize': {
      const demandId = msg.payload?.demandId;
      const cols = msg.payload?.cols;
      const rows = msg.payload?.rows;
      if (demandId && terminalBridge) {
        terminalBridge.resize(demandId, cols, rows);
      }
      break;
    }
    case 'switchTerminal': {
      const demandId = msg.payload?.demandId;
      if (demandId && terminalBridge) {
        // Send buffered output for the switched demand
        const buffer = terminalBridge.getBuffer(demandId);
        if (buffer) {
          panel.webview.postMessage({
            command: 'terminalOutput',
            demandId,
            data: buffer,
          });
        }
        // If the process is still running, send start notification
        if (processManager?.hasProcess(demandId)) {
          panel.webview.postMessage({
            command: 'terminalStart',
            demandId,
            phase: '',
          });
        }
      }
      break;
    }
  }
}

function refreshAll(): void {
  sidebarProvider?.refresh();
  if (panel) sendSelectedDemand();
}

function ensurePanelOpen(): void {
  if (panel) {
    panel.reveal();
    return;
  }
  createPanel(contextGlobal);
}

// ============================================
// State Reader
// ============================================

function getProjectRoot(): string {
  return projectRoot || process.cwd();
}

function sendSelectedDemand(): void {
  if (!panel || !panelReady) return;
  const all = stateReader?.readAllStates() || [];

  if (all.length === 0) {
    panel.webview.postMessage({ command: 'stateUpdated', payload: { demand: null, noDemands: true } });
    return;
  }

  // If a pending selection exists, prefer it
  if (pendingDemandSelection && all.find(d => d.id === pendingDemandSelection)) {
    selectedDemandId = pendingDemandSelection;
    pendingDemandSelection = null;
  }

  // If no demand selected, pick the first one
  if (!selectedDemandId || !all.find(d => d.id === selectedDemandId)) {
    selectedDemandId = all[0].id;
  }

  const demand = all.find(d => d.id === selectedDemandId);
  panel.webview.postMessage({ command: 'stateUpdated', payload: { demand: demand || all[0], noDemands: false } });
}

// ============================================
// Terminal Runner
// ============================================

function getSkipPermissionsFlag(): string {
  // Always skip interactive permission prompts in the embedded terminal
  return ' --dangerously-skip-permissions';
}

function runPhase(demandId: string, phase: string): void {
  const root = getProjectRoot();
  const skipFlag = getSkipPermissionsFlag();
  // Track the running phase so terminalExit can emit context-aware next steps.
  runningPhase.set(demandId, phase);

  if (phase === 'propose' || phase === 'design') {
    if (!ensureOpenflowDesignSkill()) return;
    ensurePanelOpen();
    const args = skipFlag ? [skipFlag.trim(), '/openflow:design'] : ['/openflow:design'];
    terminalBridge?.startProcess(demandId, 'claude', args, root);
    return;
  }
  if (phase === 'closure') {
    const args = skipFlag ? [skipFlag.trim(), '/openflow:close', demandId] : ['/openflow:close', demandId];
    terminalBridge?.startProcess(demandId, 'claude', args, root);
    return;
  }
  const command = PHASE_COMMAND_MAP[phase];
  if (!command) {
    vscode.window.showErrorMessage(`[FlowMaster] 未知阶段: ${phase}`);
    return;
  }

  // Use spawn-based process for all other phases
  const args = skipFlag ? [skipFlag.trim(), command, demandId] : [command, demandId];
  terminalBridge?.startProcess(demandId, 'claude', args, root);
}

function runOpenflowDesign(): void {
  if (!ensureOpenflowDesignSkill()) return;
  const root = getProjectRoot();
  const skipFlag = getSkipPermissionsFlag();
  ensurePanelOpen();
  const args = skipFlag ? [skipFlag.trim(), '/openflow:design'] : ['/openflow:design'];
  terminalBridge?.startProcess('flowmaster:new', 'claude', args, root);
}

function hasOpenflowDesignSkill(): boolean {
  const root = getProjectRoot();
  const home = os.homedir();
  const candidates = [
    path.join(root, '.claude', 'skills', 'openflow-design', 'SKILL.md'),
    path.join(home, '.claude', 'skills', 'openflow-design', 'SKILL.md'),
  ];
  return candidates.some(p => fs.existsSync(p));
}

function ensureOpenflowDesignSkill(): boolean {
  if (hasOpenflowDesignSkill()) return true;
  vscode.window.showInformationMessage(
    '[FlowMaster] 未检测到 openflow-design 技能，请先在 .claude/skills 或 ~/.claude/skills 中添加该技能。'
  );
  return false;
}

// ============================================
// File Opener
// ============================================

function openFile(filePath: string): void {
  const root = getProjectRoot();
  const absPath = path.isAbsolute(filePath) ? filePath : path.join(root, filePath);
  if (!fs.existsSync(absPath)) {
    vscode.window.showErrorMessage(`[FlowMaster] 文件不存在: ${absPath}`);
    return;
  }
  const proc = spawn('code', ['-r', absPath], { shell: false, windowsHide: true });
  proc.on('error', () => {
    vscode.workspace.openTextDocument(absPath).then(
      doc => vscode.window.showTextDocument(doc, { preview: false }),
      err => vscode.window.showErrorMessage(`[FlowMaster] 打开失败: ${String(err)}`)
    );
  });
}

// ============================================
// Gate Review - Direct state file update
// ============================================

function reviewGate(demandId: string, phase: string, action: string): void {
  const root = getProjectRoot();
  const statePath = path.join(root, '.workflow', 'state', demandId + '.yaml');

  if (!fs.existsSync(statePath)) {
    vscode.window.showErrorMessage(`[FlowMaster] 状态文件不存在: ${statePath}`);
    return;
  }

  try {
    const { parse, stringify } = require('yaml');
    const content = fs.readFileSync(statePath, 'utf-8');
    const parsed = parse(content);

    if (!parsed || !parsed.phases) {
      vscode.window.showErrorMessage('[FlowMaster] 状态文件格式无效');
      return;
    }

    // Determine the target phase to review: prefer the one selected in the UI,
    // fall back to the current phase if not provided or invalid.
    const phaseOrder = ['design', 'testcase', 'development', 'delivery', 'closure'];
    let targetPhase = phase && parsed.phases[phase] ? phase : parsed.current_phase;
    const curPhaseData = parsed.phases[targetPhase];
    if (curPhaseData && curPhaseData.blocked_by) {
      const blocker = Array.isArray(curPhaseData.blocked_by) ? curPhaseData.blocked_by[0] : '';
      if (blocker) {
        const blockerPhase = blocker.split('.')[0];
        if (parsed.phases[blockerPhase] && parsed.phases[blockerPhase].gate) {
          targetPhase = blockerPhase;
        }
      }
    }

    const phaseObj = parsed.phases[targetPhase];
    if (!phaseObj) {
      vscode.window.showErrorMessage(`[FlowMaster] 找不到阶段: ${targetPhase}`);
      return;
    }

    if (!phaseObj.gate) phaseObj.gate = {};
    phaseObj.gate.status = action === 'pass' ? 'passed' : 'rejected';
    phaseObj.gate.reviewer = 'user';
    phaseObj.gate.reviewed_at = new Date().toISOString();

    if (action === 'pass') {
      const idx = phaseOrder.indexOf(targetPhase);
      phaseObj.status = 'done';
      if (idx >= 0 && idx < phaseOrder.length - 1) {
        const nextPhase = phaseOrder[idx + 1];
        if (parsed.phases[nextPhase]) {
          parsed.phases[nextPhase].status = 'in_progress';
          parsed.phases[nextPhase].blocked_by = undefined;
        }
        parsed.current_phase = nextPhase;
      }
    } else {
      phaseObj.status = 'revision_needed';
    }

    fs.writeFileSync(statePath, stringify(parsed, { indent: 2 }), 'utf-8');
    vscode.window.showInformationMessage(`[FlowMaster] 审核${action === 'pass' ? '通过' : '打回'}成功`);
    refreshAll();
  } catch (e) {
    vscode.window.showErrorMessage(`[FlowMaster] 审核失败: ${String(e)}`);
  }
}

// ============================================
// WebView HTML (inlined CSS + JS, Chinese UI)
// Main dashboard: workflow-only view + inline terminal
// ============================================

function getHtml(webview: vscode.Webview, context: vscode.ExtensionContext): string {
  // Read configuration for panel split ratio
  const cfg = vscode.workspace.getConfiguration('flowmaster');
  const splitRatio = cfg.get<number>('terminal.splitRatio', 0.6);

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; font-src ${webview.cspSource}; style-src 'unsafe-inline' ${webview.cspSource}; script-src 'unsafe-inline' ${webview.cspSource};">
<style>
*{box-sizing:border-box;margin:0;padding:0}
html,body{height:100%;overflow:hidden}
body{font-family:var(--vscode-font-family);font-size:var(--vscode-font-size,13px);color:var(--vscode-editor-foreground);background:var(--vscode-editor-background)}
#app{display:flex;flex-direction:column;height:100vh}
#header{display:flex;align-items:center;justify-content:space-between;padding:8px 16px;border-bottom:1px solid var(--vscode-panel-border);flex-shrink:0}
#header h1{font-size:15px;font-weight:600}
.btn{cursor:pointer;border:none;border-radius:4px;padding:5px 12px;font-size:12px;font-family:inherit;transition:opacity .15s}
.btn-run{background:var(--vscode-button-background,#0078d4);color:var(--vscode-button-foreground,#fff)}
.btn-run:hover{background:var(--vscode-button-hoverBackground,#026ec1)}
.btn-run:disabled{opacity:.4;cursor:not-allowed}
.btn-icon{background:none;border:1px solid var(--vscode-panel-border);color:var(--vscode-editor-foreground);padding:4px;border-radius:4px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px}
.btn-icon:hover{background:var(--vscode-toolbar-hoverBackground)}
.btn-icon.active{background:var(--vscode-button-background,#0078d4);color:var(--vscode-button-foreground,#fff);border-color:var(--vscode-button-background,#0078d4)}
.btn-icon svg{display:block}
.state-message{text-align:center;padding:32px;color:var(--vscode-descriptionForeground)}
.state-message.hidden{display:none}
.state-error{color:var(--vscode-errorForeground);background:var(--vscode-inputValidation-errorBackground);border:1px solid var(--vscode-inputValidation-errorBorder);border-radius:4px;padding:8px 12px;margin:8px 16px}
/* Dashboard panel (upper) */
#dashboard-panel{flex:${Math.round(splitRatio * 100)} 1 0;min-height:100px;overflow-y:auto;padding:16px}
/* Splitter */
#divider{height:4px;background:var(--vscode-panel-border,#333);cursor:row-resize;flex-shrink:0;transition:background .15s;z-index:10}
#divider:hover,#divider.active{background:var(--vscode-focusBorder,#007acc)}
/* Terminal panel (lower) */
#terminal-panel{flex:${Math.round((1 - splitRatio) * 100)} 1 0;min-height:80px;overflow:hidden;background:var(--vscode-terminal-background,#1e1e1e);position:relative;display:flex;flex-direction:column;border-top:1px solid var(--vscode-panel-border)}
#terminal-header{flex-shrink:0;height:28px;display:flex;align-items:center;justify-content:space-between;padding:0 12px;background:var(--vscode-titleBar-activeBackground,#2d2d30);border-bottom:1px solid var(--vscode-panel-border);font-size:11px;color:var(--vscode-titleBar-activeForeground,#cccccc)}
#terminal-header .th-title{display:flex;align-items:center;gap:6px;font-weight:600}
#terminal-header .th-status{font-size:10px;opacity:.7}
#terminal-container{flex:1;min-height:0;width:100%;padding:8px 12px;overflow-y:auto;background:var(--vscode-terminal-background,#1e1e1e);color:var(--vscode-terminal-foreground,#ccc)}
#terminal-output{margin:0;font-family:var(--vscode-editor-font-family,'Consolas','Courier New',monospace);font-size:var(--vscode-editor-font-size,13px);line-height:1.5;white-space:pre-wrap;word-break:break-all}
#terminal-placeholder{flex:1;min-height:0;display:flex;align-items:center;justify-content:center;height:100%;color:var(--vscode-descriptionForeground,#858585);font-size:13px;font-family:var(--vscode-font-family);flex-direction:column;gap:8px}
#terminal-placeholder.hidden{display:none}
#terminal-placeholder svg{opacity:.5}
.no-select{user-select:none;-webkit-user-select:none}
/* Demand header */
.demand-header{margin-bottom:16px}
.demand-header .dh-name{font-size:16px;font-weight:600}
.demand-header .dh-id{font-size:11px;color:var(--vscode-descriptionForeground);font-family:monospace;margin-top:2px}
/* Phase grid */
.phase-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin-bottom:16px}
.phase-box{border:1px solid var(--vscode-widget-border);border-radius:8px;padding:10px 4px;text-align:center;font-size:11px;transition:all .2s;cursor:pointer;position:relative}
.phase-box:hover{border-color:var(--vscode-focusBorder)}
.phase-box.passed{background:rgba(78,201,176,0.12);border-color:var(--vscode-testing-iconPassed,#4ec9b0)}
.phase-box.active{background:rgba(0,124,212,0.12);border-color:var(--vscode-focusBorder,#007fd4)}
.phase-box.blocked{background:rgba(244,135,113,0.08);border-color:var(--vscode-editorError-foreground,#f48771)}
.phase-box.selected{box-shadow:0 0 0 2px var(--vscode-focusBorder,#007fd4);transform:scale(1.05)}
.phase-box-label{font-weight:600;font-size:11px;margin-bottom:4px}
.phase-box-status{font-size:10px;opacity:.7}
.phase-box-gate{font-size:9px;margin-top:3px;padding:1px 5px;border-radius:3px;display:inline-block}
.phase-box-gate.passed{background:var(--vscode-testing-iconPassed,#4ec9b0);color:var(--vscode-editor-background)}
.phase-box-gate.pending{background:var(--vscode-editorWarning-foreground,#cca700);color:var(--vscode-editor-background)}
.phase-box-gate.rejected{background:var(--vscode-editorError-foreground,#f48771);color:var(--vscode-editor-background)}
/* Phase info */
.phase-info{margin-bottom:16px;padding:12px;background:var(--vscode-textCodeBlock-background);border-radius:6px;border-left:3px solid var(--vscode-focusBorder)}
.phase-info-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px}
.phase-info-title{font-size:14px;font-weight:600}
.phase-info-status{font-size:10px;padding:2px 8px;border-radius:10px;text-transform:uppercase}
.phase-info-status.done{background:var(--vscode-testing-iconPassed,#4ec9b0);color:var(--vscode-editor-background)}
.phase-info-status.in_progress,.phase-info-status.active{background:var(--vscode-focusBorder,#007fd4);color:var(--vscode-editor-background)}
.phase-info-status.blocked{background:var(--vscode-editorError-foreground,#f48771);color:var(--vscode-editor-background)}
.phase-info-status.pending{background:var(--vscode-descriptionForeground);color:var(--vscode-editor-background)}
.phase-info-desc{font-size:12px;color:var(--vscode-descriptionForeground);margin-bottom:8px;line-height:1.5}
.phase-info-cmd{margin-bottom:8px}
.phase-info-cmd code{font-family:var(--vscode-editor-font-family,'Consolas',monospace);font-size:12px;background:var(--vscode-terminal-background);padding:4px 8px;border-radius:4px;color:var(--vscode-terminal-foreground)}
.phase-info-report{font-size:12px;color:var(--vscode-descriptionForeground);margin-bottom:8px;line-height:1.5}
.phase-info-gate{font-size:12px;color:var(--vscode-descriptionForeground)}
/* Phase artifacts */
.phase-artifacts{margin-bottom:16px;padding:8px 12px;background:var(--vscode-textCodeBlock-background);border-radius:6px;display:none}
.phase-artifacts.visible{display:block}
.phase-artifacts-title{font-size:11px;font-weight:600;color:var(--vscode-descriptionForeground);margin-bottom:6px}
.phase-artifact-item{display:flex;align-items:center;gap:6px;padding:3px 6px;border-radius:3px;cursor:pointer;font-size:12px;color:var(--vscode-textLink-foreground,#3794ff);transition:background .15s}
.phase-artifact-item:hover{background:var(--vscode-list-hoverBackground);text-decoration:underline}
.phase-artifact-empty{font-size:11px;color:var(--vscode-descriptionForeground);font-style:italic}
/* Footer */
.card-footer{display:flex;align-items:center;gap:8px;padding-top:12px;border-top:1px solid var(--vscode-panel-border);flex-wrap:wrap}
.card-footer .gate-label{font-size:12px;color:var(--vscode-descriptionForeground);flex:1}
.completed-badge{color:var(--vscode-testing-iconPassed,#4ec9b0);font-weight:600;font-size:13px;display:flex;align-items:center;gap:4px}
.btn-gate{background:var(--vscode-button-secondaryBackground,#3a3d41);color:var(--vscode-button-secondaryForeground);cursor:pointer;border:none;border-radius:4px;padding:4px 10px;font-size:11px;font-family:inherit;transition:opacity .15s}
.btn-gate:hover{opacity:.85}
.btn-gate:disabled{opacity:.4;cursor:not-allowed}
/* End-of-phase next-steps banner */
.next-steps{margin:12px 0 4px;padding:10px 12px;background:var(--vscode-textCodeBlock-background);border-radius:6px;border-left:3px solid var(--vscode-testing-iconPassed,#4ec9b0)}
.next-steps.hidden{display:none}
.ns-title{font-size:12px;font-weight:600;margin-bottom:8px;color:var(--vscode-editor-foreground)}
.ns-list{display:flex;flex-direction:column;gap:6px}
.btn-ns{display:flex;align-items:center;gap:10px;padding:7px 10px;border:none;border-radius:4px;background:var(--vscode-button-background,#0078d4);color:var(--vscode-button-foreground,#fff);cursor:pointer;font-family:inherit;font-size:12px;text-align:left;transition:opacity .15s}
.btn-ns:hover{opacity:.85}
.btn-ns .ns-label{font-weight:600;min-width:52px;text-align:left}
.btn-ns .ns-desc{opacity:.9;flex:1}
.btn-ns code{font-family:var(--vscode-editor-font-family,'Consolas',monospace);font-size:11px;background:rgba(0,0,0,.2);padding:2px 6px;border-radius:3px;white-space:pre}
</style>
</head>
<body>
<div id="app">
  <header id="header">
    <div style="display:flex;align-items:center;gap:8px">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="6" r="3"></circle><circle cx="18" cy="6" r="3"></circle><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="18" r="3"></circle><path d="M9 6h6"></path><path d="M6 9v6"></path><path d="M18 9v6"></path><path d="M9 18h6"></path></svg>
      <h1>FlowMaster 控制台</h1>
    </div>
    <div style="display:flex;align-items:center;gap:8px">
      <button id="refreshBtn" class="btn-icon" title="刷新">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M23 4v6h-6"></path><path d="M1 20v-6h6"></path><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>
      </button>
    </div>
  </header>
  <div id="loadingState" class="state-message">加载中...</div>
  <div id="errorState" class="state-message state-error hidden"></div>
  <div id="dashboard-panel">
    <div id="mainContent"></div>
    <div id="emptyDetail" class="state-message">请从左侧 FlowMaster 侧边栏选择一个需求</div>
    <div id="nextStepsBanner" class="next-steps hidden"></div>
  </div>
  <div id="divider"></div>
  <div id="terminal-panel">
    <div id="terminal-header">
      <div class="th-title">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 17 10 11 4 5"></polyline><line x1="12" y1="19" x2="20" y2="19"></line></svg>
        <span>FlowMaster 终端</span>
      </div>
      <div class="th-status" id="terminalStatus">就绪</div>
    </div>
    <div id="terminal-container"><pre id="terminal-output"></pre></div>
    <div id="terminal-placeholder">
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 17 10 11 4 5"></polyline><line x1="12" y1="19" x2="20" y2="19"></line></svg>
      <span>终端准备就绪，点击下方“执行”按钮启动</span>
    </div>
  </div>
</div>
<script>
(function(){
  'use strict';
  var api = acquireVsCodeApi();
  var mainContent = document.getElementById('mainContent');
  var emptyDetail = document.getElementById('emptyDetail');
  var loadingState = document.getElementById('loadingState');
  var errorState = document.getElementById('errorState');
  var refreshBtn = document.getElementById('refreshBtn');
  var terminalStatus = document.getElementById('terminalStatus');
  var terminalContainer = document.getElementById('terminal-container');
  var terminalOutput = document.getElementById('terminal-output');
  var terminalPlaceholder = document.getElementById('terminal-placeholder');
  var divider = document.getElementById('divider');
  var dashboardPanel = document.getElementById('dashboard-panel');
  var terminalPanel = document.getElementById('terminal-panel');
  var nextStepsBanner = document.getElementById('nextStepsBanner');

  var PHASE_ORDER = ['design','testcase','development','delivery','closure'];
  var PHASE_LABELS = {design:'设计',testcase:'测试',development:'开发',delivery:'交付',closure:'关闭'};
  var PHASE_STATUS = {done:'完成',active:'进行中',blocked:'阻塞',pending:'待开始',in_progress:'进行中'};
  var PHASE_COMMANDS = {design:'/openflow:design',testcase:'/openflow:plan',development:'/openflow:build',delivery:'/openflow:close',closure:''};
  var PHASE_DESCRIPTIONS = {design:'创建需求设计文档，明确实现方案',testcase:'生成测试计划与测试用例',development:'根据设计进行编码实现',delivery:'交付变更并关闭需求',closure:'需求已完成，无需执行操作'};

  var currentDemand = null;
  var selectedPhase = null;
  var displayedDemandId = null;
  var currentDemandId = null;
  var isDragging = false;
  var dragStartY = 0;
  var dragStartFlex = 0.6;
  var minDashboardHeight = 100;
  var minTerminalHeight = 80;

  window.addEventListener('message',function(e){
    var msg = e.data;
    if(msg.command === 'stateUpdated'){ handleState(msg.payload); }
    if(msg.command === 'terminalOutput'){ handleTerminalOutput(msg); }
    if(msg.command === 'terminalExit'){ handleTerminalExit(msg); }
    if(msg.command === 'terminalError'){ handleTerminalError(msg); }
    if(msg.command === 'terminalStart'){ handleTerminalStart(msg); }
    if(msg.command === 'phaseComplete'){ handlePhaseComplete(msg); }
  });

  // --- Terminal handlers ---
  function appendToTerminal(text){
    if(!terminalOutput || !terminalContainer) return;
    terminalOutput.textContent += text;
    terminalContainer.scrollTop = terminalContainer.scrollHeight;
  }
  function handleTerminalOutput(msg){
    appendToTerminal(msg.data);
  }
  function handleTerminalStart(msg){
    if(terminalPlaceholder) terminalPlaceholder.classList.add('hidden');
    if(msg.demandId) currentDemandId = msg.demandId;
    if(terminalStatus) terminalStatus.textContent = '运行中';
  }
  function handleTerminalExit(msg){
    appendToTerminal('\r\n[进程已退出，退出码: ' + msg.code + ']');
    if(msg.demandId){ currentDemandId = null; }
    if(terminalStatus) terminalStatus.textContent = '已退出';
  }
  function handleTerminalError(msg){
    appendToTerminal('\r\n[错误: ' + msg.error + ']');
    if(terminalStatus) terminalStatus.textContent = '错误';
  }

  // --- End-of-phase next-steps banner ---
  function handlePhaseComplete(msg){
    if(!nextStepsBanner) return;
    // Only show banner for the currently displayed demand
    if(currentDemand && msg.demandId && msg.demandId !== currentDemand.id){
      nextStepsBanner.classList.add('hidden');
      return;
    }
    var phaseLabel = msg.phaseLabel || msg.phase || '';
    var steps = msg.nextSteps || [];
    if(!steps.length){
      nextStepsBanner.innerHTML = '<div class="ns-title">✓ ' + esc(phaseLabel) + ' 完成 — 需求生命周期结束</div>';
      nextStepsBanner.classList.remove('hidden');
      return;
    }
    var demandId = currentDemand ? currentDemand.id : '';
    var html = '<div class="ns-title">✓ ' + esc(phaseLabel) + ' 阶段执行结束，下一步可执行：</div><div class="ns-list">';
    html += steps.map(function(s){
      return '<button class="btn-ns" data-phase="' + esc(s.phase) + '">' +
        '<span class="ns-label">' + esc(s.label) + '</span>' +
        '<span class="ns-desc">' + esc(s.desc) + '</span>' +
        '<code>claude ' + esc(s.cmd) + ' ' + esc(demandId) + '</code>' +
      '</button>';
    }).join('');
    html += '</div>';
    nextStepsBanner.innerHTML = html;
    nextStepsBanner.classList.remove('hidden');
    nextStepsBanner.querySelectorAll('.btn-ns').forEach(function(btn){
      btn.addEventListener('click', function(){
        var p = this.getAttribute('data-phase');
        if(!currentDemand || !p) return;
        // Clear terminal and start the next phase command
        if(terminalOutput) terminalOutput.textContent = '';
        if(terminalPlaceholder) terminalPlaceholder.classList.add('hidden');
        appendToTerminal('[FlowMaster] 启动阶段: ' + esc(p) + ' (需求: ' + esc(currentDemand.id) + ')\n');
        api.postMessage({command:'runPhase', demandId: currentDemand.id, phase: p});
        nextStepsBanner.classList.add('hidden');
      });
    });
  }

  // --- Terminal init (plain text) ---
  function initTerminal(){
    if(terminalPlaceholder){
      terminalPlaceholder.classList.remove('hidden');
    }
  }

  function fitTerminal(){
    // No-op for plain text terminal; scroll area resizes automatically
  }

  // --- Splitter drag ---
  function initSplitter(){
    if(!divider || !dashboardPanel || !terminalPanel) return;
    divider.addEventListener('mousedown',function(e){
      isDragging = true;
      dragStartY = e.clientY;
      var currentFlex = dashboardPanel.style.flex;
      dragStartFlex = currentFlex ? parseFloat(currentFlex)/100 : 0.6;
      divider.classList.add('active');
      document.body.classList.add('no-select');
      document.addEventListener('mousemove',onDragMove);
      document.addEventListener('mouseup',onDragUp);
    });
  }
  function onDragMove(e){
    if(!isDragging) return;
    var containerHeight = document.getElementById('app').clientHeight;
    if(containerHeight <= 0) return;
    var deltaRatio = (e.clientY - dragStartY) / containerHeight;
    var newRatio = dragStartFlex + deltaRatio;
    var maxR = 1 - minTerminalHeight/containerHeight;
    var minR = minDashboardHeight/containerHeight;
    newRatio = Math.max(minR, Math.min(maxR, newRatio));
    dashboardPanel.style.flex = (newRatio * 100) + ' 1 0';
    terminalPanel.style.flex = ((1-newRatio) * 100) + ' 1 0';
    fitTerminal();
  }
  function onDragUp(){
    isDragging = false;
    divider.classList.remove('active');
    document.body.classList.remove('no-select');
    document.removeEventListener('mousemove',onDragMove);
    document.removeEventListener('mouseup',onDragUp);
    fitTerminal();
  }

  // --- State handling ---
  function handleState(payload){
    hide(loadingState); hide(errorState);
    if(!payload){ showError('响应无效'); return; }
    if(payload.error){ showError(payload.error); }
    if(payload.noDemands || !payload.demand){
      currentDemand = null;
      displayedDemandId = null;
      mainContent.innerHTML = '';
      if(nextStepsBanner) nextStepsBanner.classList.add('hidden');
      show(emptyDetail);
      emptyDetail.textContent = '暂无需求，请从左侧创建新需求';
      return;
    }
    // Reset selected phase when the demand itself advances to a new phase
    if(currentDemand && currentDemand.id === payload.demand.id && currentDemand.phase !== payload.demand.phase){
      selectedPhase = payload.demand.phase || 'unknown';
      displayedDemandId = payload.demand.id;
    }
    currentDemand = payload.demand;
    hide(emptyDetail);
    showDemandDetail(currentDemand);
  }

  function showDemandDetail(d){
    // Keep user's selected phase while viewing the same demand; reset only when demand changes
    if(displayedDemandId !== d.id || !selectedPhase || selectedPhase === 'unknown' || !d.phases || !(selectedPhase in d.phases)){
      selectedPhase = d.phase || 'unknown';
      displayedDemandId = d.id;
      if(nextStepsBanner) nextStepsBanner.classList.add('hidden');
    }
    var phases = d.phases || {};
    var isClosure = selectedPhase === 'closure';

    var phaseBoxes = PHASE_ORDER.map(function(p){
      var pdata = phases[p]||{};
      var cls = 'phase-box';
      var status = pdata.status||'pending';
      var gateStatus = (pdata.gate&&pdata.gate.status)||'';
      if(p===d.phase) cls += ' active';
      else if(status==='done'||status==='completed') cls += ' passed';
      else if(status==='blocked') cls += ' blocked';
      else cls += ' pending';
      if(p===selectedPhase) cls += ' selected';
      var gateHtml = gateStatus ? '<div class="phase-box-gate '+gateStatus+'">'+gateIcon(gateStatus)+'</div>' : '';
      var statusIcon = '';
      if(status==='done'||status==='completed') statusIcon = ' ✓';
      else if(status==='blocked') statusIcon = ' ⛔';
      return '<div class="'+cls+'" data-phase="'+p+'">'+
        '<div class="phase-box-label">'+PHASE_LABELS[p]+statusIcon+'</div>'+
        '<div class="phase-box-status">'+ (PHASE_STATUS[status]||status) +'</div>'+
        gateHtml+'</div>';
    }).join('');

    var selPhaseData = phases[selectedPhase]||{};
    var selArtifacts = selPhaseData.artifacts||[];
    var selGateStatus = (selPhaseData.gate && selPhaseData.gate.status) || 'unknown';
    var selGatePending = selGateStatus === 'pending';
    var selPhaseStatus = selPhaseData.status || 'pending';
    var selPhaseCmd = PHASE_COMMANDS[selectedPhase] || '';
    var selPhaseDesc = PHASE_DESCRIPTIONS[selectedPhase] || '暂无说明';
    var selPhaseReport = selPhaseData.report || '';
    var selArtHtml = '';

    var phaseInfoHtml = '<div class="phase-info">'+
      '<div class="phase-info-header">'+
        '<div class="phase-info-title">'+esc(PHASE_LABELS[selectedPhase]||selectedPhase)+'</div>'+
        '<div class="phase-info-status '+esc(selPhaseStatus)+'">'+esc(PHASE_STATUS[selPhaseStatus]||selPhaseStatus)+'</div>'+
      '</div>'+
      '<div class="phase-info-desc">'+esc(selPhaseDesc)+'</div>'+
      (selPhaseCmd ? '<div class="phase-info-cmd"><code>claude '+esc(selPhaseCmd)+' '+esc(d.id)+'</code></div>' : '')+
      (selPhaseReport ? '<div class="phase-info-report"><strong>阶段报告：</strong>'+esc(selPhaseReport)+'</div>' : '')+
      '<div class="phase-info-gate">审核：'+(selGateStatus === 'passed' ? '✓ 已通过' : selGateStatus === 'pending' ? '⏱ 待审核' : selGateStatus === 'rejected' ? '✗ 已打回' : '无需审核')+'</div>'+
    '</div>';

    if(selArtifacts.length > 0){
      selArtHtml = '<div class="phase-artifacts visible">'+
        '<div class="phase-artifacts-title">📄 '+PHASE_LABELS[selectedPhase]+' 阶段产出文档</div>'+
        '<ul>'+selArtifacts.map(function(a){
          var label = a.split('/').pop()||a;
          return '<li class="phase-artifact-item" data-path="'+esc(a)+'"><span>📄</span><span>'+esc(label)+'</span></li>';
        }).join('')+'</ul></div>';
    } else {
      selArtHtml = '<div class="phase-artifacts visible">'+
        '<div class="phase-artifacts-title">📄 '+PHASE_LABELS[selectedPhase]+' 阶段产出文档</div>'+
        '<div class="phase-artifact-empty">暂无产出文档</div></div>';
    }

    mainContent.innerHTML =
      '<div class="demand-header">'+
        '<div class="dh-name">'+esc(d.title||d.name)+'</div>'+
        '<div class="dh-id">id: '+esc(d.id)+'</div>'+
      '</div>'+
      '<div class="phase-grid">'+phaseBoxes+'</div>'+
      phaseInfoHtml+
      selArtHtml+
      '<div class="card-footer">'+
        (isClosure ? '<span class="completed-badge">✔ 已完成</span>' : '<button class="btn btn-run" id="executeBtn">▶ 执行 '+esc(PHASE_LABELS[selectedPhase]||selectedPhase)+'</button>')+
        (selGatePending ? '<button class="btn-gate" id="gatePassBtn">✓ 审核通过</button><button class="btn-gate" id="gateRejectBtn">✗ 打回</button>' : '')+
        '<span class="gate-label">'+(selGateStatus === 'passed' ? '✓ 已通过' : selGateStatus === 'pending' ? '⏱ 待审核' : selGateStatus === 'rejected' ? '✗ 已打回' : '审核: '+selGateStatus)+'</span>'+
      '</div>';

    // Phase box click
    document.querySelectorAll('.phase-box').forEach(function(el){
      el.addEventListener('click',function(){
        var pid = this.getAttribute('data-phase');
        if(pid === selectedPhase) return;
        selectedPhase = pid;
        showDemandDetail(d);
      });
    });

    // Execute button
    var execBtn = document.getElementById('executeBtn');
    if(execBtn){
      execBtn.addEventListener('click',function(){
        this.disabled = true; this.textContent = '执行中...';
        currentDemandId = d.id;
        if(terminalStatus) terminalStatus.textContent = '启动中';
        if(terminalPlaceholder) terminalPlaceholder.classList.add('hidden');
        if(nextStepsBanner) nextStepsBanner.classList.add('hidden');
        // Clear terminal for new execution and show command
        if(terminalOutput) terminalOutput.textContent = '';
        appendToTerminal('[FlowMaster] 启动阶段: ' + esc(PHASE_LABELS[selectedPhase]||selectedPhase) + ' (需求: ' + esc(d.id) + ')\n');
        api.postMessage({command:'runPhase',demandId:d.id,phase:selectedPhase});
        setTimeout(function(){ if(execBtn){ execBtn.disabled=false; execBtn.textContent='▶ 执行 '+esc(PHASE_LABELS[selectedPhase]||selectedPhase); }},5000);
      });
    }

    // Gate review buttons
    var gatePassBtn = document.getElementById('gatePassBtn');
    var gateRejectBtn = document.getElementById('gateRejectBtn');
    if(gatePassBtn){
      gatePassBtn.addEventListener('click',function(){
        this.disabled=true; this.textContent='提交中...';
        api.postMessage({command:'reviewGate',demandId:d.id,phase:selectedPhase,action:'pass'});
        setTimeout(function(){ if(gatePassBtn){ gatePassBtn.disabled=false; gatePassBtn.textContent='✓ 审核通过'; }},5000);
      });
    }
    if(gateRejectBtn){
      gateRejectBtn.addEventListener('click',function(){
        this.disabled=true; this.textContent='提交中...';
        api.postMessage({command:'reviewGate',demandId:d.id,phase:selectedPhase,action:'reject'});
        setTimeout(function(){ if(gateRejectBtn){ gateRejectBtn.disabled=false; gateRejectBtn.textContent='✗ 打回'; }},5000);
      });
    }

    // Artifact clicks
    document.querySelectorAll('.phase-artifact-item').forEach(function(item){
      item.addEventListener('click',function(){
        api.postMessage({command:'openFile',path:this.getAttribute('data-path')});
      });
    });
  }

  function gateIcon(s){ return s==='passed'?'✓':s==='pending'?'⏱':s==='rejected'?'✗':'?'; }
  function showError(m){ if(errorState){ errorState.textContent=m; show(errorState); } }
  function show(el){ if(el) el.classList.remove('hidden'); }
  function hide(el){ if(el) el.classList.add('hidden'); }
  function esc(s){ if(!s) return ''; return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

  if(refreshBtn){ refreshBtn.addEventListener('click',function(){ hide(errorState); api.postMessage({command:'refreshState'}); }); }

  // Initialize
  initSplitter();
  initTerminal();
  // Notify extension that the panel webview is ready to receive messages.
  api.postMessage({command:'ready'});
  setTimeout(function(){ if(loadingState&&!loadingState.classList.contains('hidden')){ showError('无法连接扩展进程'); }},8000);
})();
</script>
</body>
</html>`;
}
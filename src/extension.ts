import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { spawn } from 'child_process';
import { FlowMasterSidebarProvider } from './sidebarProvider';
import { StateReader } from './stateReader';

// ============================================
// Extension Entry Point
// ============================================

let panel: vscode.WebviewPanel | undefined;
let projectRoot: string = '';
let selectedDemandId: string | null = null;
let stateReader: StateReader | undefined;
let sidebarProvider: FlowMasterSidebarProvider | undefined;

export function activate(context: vscode.ExtensionContext): void {
  console.log('[FlowMaster] Extension activating...');

  // Determine project root
  projectRoot = context.extensionPath;
  const folders = vscode.workspace.workspaceFolders;
  if (folders && folders.length > 0) {
    const wsRoot = folders[0].uri.fsPath;
    if (fs.existsSync(path.join(wsRoot, '.workflow', 'state'))) {
      projectRoot = wsRoot;
    }
  }
  console.log('[FlowMaster] Project root:', projectRoot);

  stateReader = new StateReader();
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
    if (demandId && typeof demandId === 'string') selectedDemandId = demandId;
    if (panel) { panel.reveal(); sendSelectedDemand(); return; }
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

  // Auto-launch dashboard is disabled: the sidebar is the entry point.
  // createPanel(context);

  // Auto-refresh every 30 seconds
  const refreshTimer = setInterval(() => {
    refreshAll();
  }, 30000);
  context.subscriptions.push({ dispose: () => clearInterval(refreshTimer) });

  console.log('[FlowMaster] Extension activated.');
}

export function deactivate(): void {
  panel?.dispose();
  panel = undefined;
}

// ============================================
// Panel Management
// ============================================

const PHASE_COMMAND_MAP: Record<string, string> = {
  design: '/openflow:design',
  testcase: '/openflow:plan',
  development: '/openflow:build',
  delivery: '/openflow:close',
};

function createPanel(context: vscode.ExtensionContext): void {
  panel = vscode.window.createWebviewPanel(
    'flowmasterDashboard',
    'FlowMaster 控制台',
    vscode.ViewColumn.One,
    { enableScripts: true, retainContextWhenHidden: true }
  );

  panel.webview.html = getHtml();

  panel.webview.onDidReceiveMessage(
    (msg: any) => handleMessage(msg),
    undefined,
    context.subscriptions
  );

  panel.onDidDispose(() => { panel = undefined; });

  sendSelectedDemand();
}

function handleMessage(msg: any): void {
  if (!panel) return;
  switch (msg.command) {
    case 'refreshState': sendSelectedDemand(); break;
    case 'runPhase': runPhase(msg.demandId, msg.phase); break;
    case 'openFile': openFile(msg.path); break;
    case 'reviewGate': reviewGate(msg.demandId, msg.action); break;
    case 'toggleSkipPermissions': toggleSkipPermissions(); break;
  }
}

function refreshAll(): void {
  sidebarProvider?.refresh();
  if (panel) sendSelectedDemand();
}

// ============================================
// State Reader
// ============================================

function getProjectRoot(): string {
  return projectRoot || process.cwd();
}

function sendSelectedDemand(): void {
  if (!panel) return;
  const all = stateReader?.readAllStates() || [];

  if (all.length === 0) {
    panel.webview.postMessage({ command: 'stateUpdated', payload: { demand: null, noDemands: true } });
    return;
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
  const cfg = vscode.workspace.getConfiguration('flowmaster');
  return cfg.get<boolean>('skipPermissions', false) ? ' --dangerously-skip-permissions' : '';
}

function runPhase(demandId: string, phase: string): void {
  const root = getProjectRoot();
  const terminal = vscode.window.createTerminal({ name: `FlowMaster: ${demandId}` });
  const skipFlag = getSkipPermissionsFlag();
  terminal.show();
  terminal.sendText(`cd "${root}"`);

  if (phase === 'propose' || phase === 'design') {
    if (!ensureOpenflowDesignSkill()) return;
    terminal.sendText(`claude${skipFlag} /openflow:design`);
    return;
  }
  if (phase === 'closure') {
    terminal.sendText(`claude${skipFlag} /openflow:close ${demandId}`);
    return;
  }
  const command = PHASE_COMMAND_MAP[phase];
  if (!command) {
    vscode.window.showErrorMessage(`[FlowMaster] 未知阶段: ${phase}`);
    return;
  }
  terminal.sendText(`claude${skipFlag} ${command} ${demandId}`);
}

function runOpenflowDesign(): void {
  if (!ensureOpenflowDesignSkill()) return;
  const root = getProjectRoot();
  const terminal = vscode.window.createTerminal({ name: 'FlowMaster: New Demand' });
  const skipFlag = getSkipPermissionsFlag();
  terminal.show();
  terminal.sendText(`cd "${root}"`);
  terminal.sendText(`claude${skipFlag} /openflow:design`);
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

function toggleSkipPermissions(): void {
  const cfg = vscode.workspace.getConfiguration('flowmaster');
  const current = cfg.get<boolean>('skipPermissions', false);
  cfg.update('skipPermissions', !current, true).then(
    () => {
      const state = !current ? '已启用' : '已关闭';
      vscode.window.showInformationMessage(`[FlowMaster] --dangerously-skip-permissions ${state}`);
    },
    (err) => vscode.window.showErrorMessage(`[FlowMaster] 更新设置失败: ${String(err)}`)
  );
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

function reviewGate(demandId: string, action: string): void {
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

    // Find the phase that has a pending gate
    const phaseOrder = ['design', 'testcase', 'development', 'delivery', 'closure'];
    let targetPhase = parsed.current_phase;
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

    const phase = parsed.phases[targetPhase];
    if (!phase) {
      vscode.window.showErrorMessage(`[FlowMaster] 找不到阶段: ${targetPhase}`);
      return;
    }

    if (!phase.gate) phase.gate = {};
    phase.gate.status = action === 'pass' ? 'passed' : 'rejected';
    phase.gate.reviewer = 'user';
    phase.gate.reviewed_at = new Date().toISOString();

    if (action === 'pass') {
      const idx = phaseOrder.indexOf(targetPhase);
      phase.status = 'done';
      if (idx >= 0 && idx < phaseOrder.length - 1) {
        const nextPhase = phaseOrder[idx + 1];
        if (parsed.phases[nextPhase]) {
          parsed.phases[nextPhase].status = 'in_progress';
          parsed.phases[nextPhase].blocked_by = undefined;
        }
        parsed.current_phase = nextPhase;
      }
    } else {
      phase.status = 'revision_needed';
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
// Main dashboard: workflow-only view for the selected demand
// ============================================

function getHtml(): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:var(--vscode-font-family);font-size:var(--vscode-font-size,13px);color:var(--vscode-editor-foreground);background:var(--vscode-editor-background);height:100vh;display:flex;flex-direction:column}
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
#main{flex:1;padding:16px;overflow-y:auto}
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
      <button id="skipPermBtn" class="btn-icon" title="切换 --dangerously-skip-permissions">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 19 22 12 13 5 13 19"></polygon><polygon points="2 19 11 12 2 5 2 19"></polygon></svg>
      </button>
      <button id="refreshBtn" class="btn-icon" title="刷新">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M23 4v6h-6"></path><path d="M1 20v-6h6"></path><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>
      </button>
    </div>
  </header>
  <div id="loadingState" class="state-message">加载中...</div>
  <div id="errorState" class="state-message state-error hidden"></div>
  <div id="main">
    <div id="mainContent"></div>
    <div id="emptyDetail" class="state-message">请从左侧 FlowMaster 侧边栏选择一个需求</div>
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
  var skipPermBtn = document.getElementById('skipPermBtn');
  var skipPermissionsEnabled = false;

  var PHASE_ORDER = ['design','testcase','development','delivery','closure'];
  var PHASE_LABELS = {design:'设计',testcase:'测试',development:'开发',delivery:'交付',closure:'关闭'};
  var PHASE_STATUS = {done:'完成',active:'进行中',blocked:'阻塞',pending:'待开始',in_progress:'进行中'};

  var currentDemand = null;
  var selectedPhase = null;

  window.addEventListener('message',function(e){
    var msg = e.data;
    if(msg.command === 'stateUpdated'){ handleState(msg.payload); }
    if(msg.command === 'skipPermissionsChanged'){ updateSkipButton(msg.payload.enabled); }
  });

  function handleState(payload){
    hide(loadingState); hide(errorState);
    if(!payload){ showError('响应无效'); return; }
    if(payload.error){ showError(payload.error); }

    if(payload.noDemands || !payload.demand){
      currentDemand = null;
      mainContent.innerHTML = '';
      show(emptyDetail);
      emptyDetail.textContent = '暂无需求，请从左侧创建新需求';
      return;
    }

    currentDemand = payload.demand;
    hide(emptyDetail);
    showDemandDetail(currentDemand);
  }

  function showDemandDetail(d){
    selectedPhase = d.phase || 'unknown';
    var phases = d.phases || {};
    var isClosure = d.phase === 'closure';

    // Phase boxes
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

    // Phase artifacts for selected phase
    var selPhaseData = phases[selectedPhase]||{};
    var selArtifacts = selPhaseData.artifacts||[];
    var selArtHtml = '';
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
      selArtHtml+
      '<div class="card-footer">'+
        (isClosure ? '<span class="completed-badge">✔ 已完成</span>' : '<button class="btn btn-run" id="executeBtn">▶ 执行 '+esc(PHASE_LABELS[selectedPhase]||selectedPhase)+'</button>')+
        (d.gate === 'pending' ? '<button class="btn-gate" id="gatePassBtn">✓ 审核通过</button><button class="btn-gate" id="gateRejectBtn">✗ 打回</button>' : '')+
        '<span class="gate-label">'+(d.gate === 'passed' ? '✓ 已通过' : d.gate === 'pending' ? '⏱ 待审核' : d.gate === 'rejected' ? '✗ 已打回' : '审核: '+d.gate)+'</span>'+
      '</div>';

    // Phase box click: select
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
        api.postMessage({command:'reviewGate',demandId:d.id,action:'pass'});
        setTimeout(function(){ if(gatePassBtn){ gatePassBtn.disabled=false; gatePassBtn.textContent='✓ 审核通过'; }},5000);
      });
    }
    if(gateRejectBtn){
      gateRejectBtn.addEventListener('click',function(){
        this.disabled=true; this.textContent='提交中...';
        api.postMessage({command:'reviewGate',demandId:d.id,action:'reject'});
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

  function updateSkipButton(enabled){
    skipPermissionsEnabled = !!enabled;
    if(skipPermBtn){
      skipPermBtn.classList.toggle('active', skipPermissionsEnabled);
      skipPermBtn.title = 'skip-permissions: ' + (skipPermissionsEnabled ? '已启用' : '已关闭');
    }
  }

  if(skipPermBtn){
    skipPermBtn.addEventListener('click',function(){
      api.postMessage({command:'toggleSkipPermissions'});
    });
  }

  if(refreshBtn){ refreshBtn.addEventListener('click',function(){ hide(errorState); api.postMessage({command:'refreshState'}); }); }
  api.postMessage({command:'refreshState'});
  setTimeout(function(){ if(loadingState&&!loadingState.classList.contains('hidden')){ showError('无法连接扩展进程'); }},8000);
})();
</script>
</body>
</html>`;
}

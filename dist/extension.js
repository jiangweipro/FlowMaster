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
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const child_process_1 = require("child_process");
// ============================================
// Extension Entry Point
// ============================================
let panel;
let projectRoot = '';
function activate(context) {
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
    // Register commands
    const cmd = vscode.commands.registerCommand('flowmaster.openDashboard', () => {
        if (panel) {
            panel.reveal();
            return;
        }
        createPanel(context);
    });
    const refreshCmd = vscode.commands.registerCommand('flowmaster.refresh', () => {
        if (panel) {
            sendState();
            return;
        }
        createPanel(context);
    });
    context.subscriptions.push(cmd, refreshCmd);
    // Status bar button
    const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    statusBar.text = '$(project) FlowMaster';
    statusBar.command = 'flowmaster.openDashboard';
    statusBar.tooltip = 'Open FlowMaster Dashboard';
    statusBar.show();
    context.subscriptions.push(statusBar);
    // Auto-launch dashboard
    createPanel(context);
    // Auto-refresh every 30 seconds
    const refreshTimer = setInterval(() => {
        if (panel) {
            sendState();
        }
    }, 30000);
    context.subscriptions.push({ dispose: () => clearInterval(refreshTimer) });
    console.log('[FlowMaster] Extension activated.');
}
function deactivate() {
    panel?.dispose();
    panel = undefined;
}
// ============================================
// Panel Management
// ============================================
const PHASE_COMMAND_MAP = {
    design: '/openflow:design',
    testcase: '/openflow:plan',
    development: '/openflow:build',
    delivery: '/openflow:close',
};
function createPanel(context) {
    panel = vscode.window.createWebviewPanel('flowmasterDashboard', 'FlowMaster 控制台', vscode.ViewColumn.One, { enableScripts: true, retainContextWhenHidden: true });
    panel.webview.html = getHtml();
    panel.webview.onDidReceiveMessage((msg) => handleMessage(msg), undefined, context.subscriptions);
    panel.onDidDispose(() => { panel = undefined; });
}
function handleMessage(msg) {
    if (!panel)
        return;
    switch (msg.command) {
        case 'refreshState':
            sendState();
            break;
        case 'runPhase':
            runPhase(msg.demandId, msg.phase);
            break;
        case 'openFile':
            openFile(msg.path);
            break;
        case 'reviewGate':
            reviewGate(msg.demandId, msg.action);
            break;
        case 'toggleSkipPermissions':
            toggleSkipPermissions();
            break;
    }
}
// ============================================
// State Reader
// ============================================
function getProjectRoot() {
    return projectRoot || process.cwd();
}
function sendState() {
    if (!panel)
        return;
    try {
        const root = getProjectRoot();
        const stateDir = path.join(root, '.workflow', 'state');
        const demands = [];
        if (fs.existsSync(stateDir)) {
            const files = fs.readdirSync(stateDir).filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'));
            for (const file of files) {
                try {
                    const content = fs.readFileSync(path.join(stateDir, file), 'utf-8').trim();
                    if (!content)
                        continue;
                    const { parse } = require('yaml');
                    const parsed = parse(content);
                    if (!parsed || !parsed.change)
                        continue;
                    const currentPhase = parsed.current_phase || 'unknown';
                    const phases = parsed.phases || {};
                    // Determine gate status
                    let gateStatus = 'unknown';
                    const curPhase = phases[currentPhase];
                    if (curPhase) {
                        if (curPhase.gate && curPhase.gate.status) {
                            gateStatus = curPhase.gate.status;
                        }
                        else if (curPhase.blocked_by) {
                            const blocker = Array.isArray(curPhase.blocked_by) ? curPhase.blocked_by[0] : null;
                            if (blocker) {
                                const blockerPhase = blocker.split('.')[0];
                                if (phases[blockerPhase] && phases[blockerPhase].gate) {
                                    gateStatus = phases[blockerPhase].gate.status || 'unknown';
                                }
                            }
                        }
                    }
                    // Collect artifacts from all completed phases (document outputs only)
                    const phaseOrder = ['design', 'testcase', 'development', 'delivery', 'closure'];
                    const artifacts = [];
                    for (let i = 0; i < phaseOrder.indexOf(currentPhase); i++) {
                        const p = phases[phaseOrder[i]];
                        if (p && p.artifacts) {
                            p.artifacts.forEach((a) => {
                                if (a.endsWith('.md') || a.endsWith('.yaml') || a.endsWith('.yml') || a.endsWith('.json')) {
                                    if (!artifacts.includes(a))
                                        artifacts.push(a);
                                }
                            });
                        }
                    }
                    demands.push({
                        id: parsed.change,
                        name: parsed.change,
                        title: parsed.title || parsed.change,
                        phase: currentPhase,
                        gate: gateStatus,
                        status: parsed.status || 'unknown',
                        artifacts: artifacts,
                        phases: phases,
                    });
                }
                catch (e) {
                    console.warn('[FlowMaster] Failed to parse:', file, String(e));
                }
            }
        }
        panel.webview.postMessage({ command: 'stateUpdated', payload: { demands } });
    }
    catch (e) {
        panel.webview.postMessage({ command: 'stateUpdated', payload: { demands: [], error: String(e) } });
    }
}
// ============================================
// Terminal Runner
// ============================================
function getSkipPermissionsFlag() {
    const cfg = vscode.workspace.getConfiguration('flowmaster');
    return cfg.get('skipPermissions', false) ? ' --dangerously-skip-permissions' : '';
}
function runPhase(demandId, phase) {
    const root = getProjectRoot();
    const terminal = vscode.window.createTerminal({ name: `FlowMaster: ${demandId}` });
    const skipFlag = getSkipPermissionsFlag();
    terminal.show();
    terminal.sendText(`cd "${root}"`);
    if (phase === 'propose') {
        terminal.sendText(`claude${skipFlag} /opsx:propose`);
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
function toggleSkipPermissions() {
    const cfg = vscode.workspace.getConfiguration('flowmaster');
    const current = cfg.get('skipPermissions', false);
    cfg.update('skipPermissions', !current, true).then(() => {
        const state = !current ? '已启用' : '已关闭';
        vscode.window.showInformationMessage(`[FlowMaster] --dangerously-skip-permissions ${state}`);
    }, (err) => vscode.window.showErrorMessage(`[FlowMaster] 更新设置失败: ${String(err)}`));
}
// ============================================
// File Opener
// ============================================
function openFile(filePath) {
    const root = getProjectRoot();
    const absPath = path.isAbsolute(filePath) ? filePath : path.join(root, filePath);
    if (!fs.existsSync(absPath)) {
        vscode.window.showErrorMessage(`[FlowMaster] 文件不存在: ${absPath}`);
        return;
    }
    const proc = (0, child_process_1.spawn)('code', ['-r', absPath], { shell: false, windowsHide: true });
    proc.on('error', () => {
        vscode.workspace.openTextDocument(absPath).then(doc => vscode.window.showTextDocument(doc, { preview: false }), err => vscode.window.showErrorMessage(`[FlowMaster] 打开失败: ${String(err)}`));
    });
}
// ============================================
// Gate Review - Direct state file update
// ============================================
function reviewGate(demandId, action) {
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
        if (!phase.gate)
            phase.gate = {};
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
        }
        else {
            phase.status = 'revision_needed';
        }
        fs.writeFileSync(statePath, stringify(parsed, { indent: 2 }), 'utf-8');
        vscode.window.showInformationMessage(`[FlowMaster] 审核${action === 'pass' ? '通过' : '打回'}成功`);
        sendState();
    }
    catch (e) {
        vscode.window.showErrorMessage(`[FlowMaster] 审核失败: ${String(e)}`);
    }
}
// ============================================
// WebView HTML (inlined CSS + JS, Chinese UI)
// ============================================
function getHtml() {
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
.btn-new{background:var(--vscode-button-secondaryBackground,#3a3d41);color:var(--vscode-button-secondaryForeground);width:100%;text-align:center;padding:6px;margin-bottom:8px}
.btn-new:hover{opacity:.85}
.btn-icon{background:none;border:1px solid var(--vscode-panel-border);color:var(--vscode-editor-foreground);padding:4px;border-radius:4px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px}
.btn-icon:hover{background:var(--vscode-toolbar-hoverBackground)}
.btn-icon.active{background:var(--vscode-button-background,#0078d4);color:var(--vscode-button-foreground,#fff);border-color:var(--vscode-button-background,#0078d4)}
.btn-icon svg{display:block}
.state-message{text-align:center;padding:32px;color:var(--vscode-descriptionForeground)}
.state-message.hidden{display:none}
.state-error{color:var(--vscode-errorForeground);background:var(--vscode-inputValidation-errorBackground);border:1px solid var(--vscode-inputValidation-errorBorder);border-radius:4px;padding:8px 12px;margin:8px 16px}
/* Layout: sidebar + main */
#layout{display:flex;flex:1;overflow:hidden}
#sidebar{width:200px;min-width:180px;border-right:1px solid var(--vscode-panel-border);padding:12px;overflow-y:auto;flex-shrink:0}
#sidebar-title{font-size:11px;font-weight:600;color:var(--vscode-descriptionForeground);margin-bottom:8px;text-transform:uppercase;letter-spacing:.5px}
.demand-item{padding:8px 10px;border-radius:4px;cursor:pointer;margin-bottom:2px;font-size:12px;transition:background .15s}
.demand-item:hover{background:var(--vscode-list-hoverBackground)}
.demand-item.active{background:var(--vscode-list-activeSelectionBackground);color:var(--vscode-list-activeSelectionForeground)}
.demand-item .di-name{font-weight:500}
.demand-item .di-phase{font-size:10px;opacity:.7;margin-top:2px}
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
  <div id="layout" class="hidden">
    <div id="sidebar">
      <div id="sidebar-title">需求列表</div>
      <button id="newDemandBtn" class="btn btn-new">+ 新建需求</button>
      <div id="demandList"></div>
    </div>
    <div id="main">
      <div id="mainContent"></div>
      <div id="emptyDetail" class="state-message">请从左侧选择一个需求</div>
    </div>
  </div>
</div>
<script>
(function(){
  'use strict';
  var api = acquireVsCodeApi();
  var app = document.getElementById('app');
  var layout = document.getElementById('layout');
  var demandList = document.getElementById('demandList');
  var mainContent = document.getElementById('mainContent');
  var emptyDetail = document.getElementById('emptyDetail');
  var loadingState = document.getElementById('loadingState');
  var errorState = document.getElementById('errorState');
  var refreshBtn = document.getElementById('refreshBtn');
  var skipPermBtn = document.getElementById('skipPermBtn');
  var newDemandBtn = document.getElementById('newDemandBtn');
  var skipPermissionsEnabled = false;

  var PHASE_ORDER = ['design','testcase','development','delivery','closure'];
  var PHASE_LABELS = {design:'设计',testcase:'测试',development:'开发',delivery:'交付',closure:'关闭'};
  var PHASE_STATUS = {done:'完成',active:'进行中',blocked:'阻塞',pending:'待开始',in_progress:'进行中'};

  var allDemands = [];
  var selectedDemandId = null;
  var selectedPhase = null;

  // New demand button
  if(newDemandBtn){
    newDemandBtn.addEventListener('click',function(){
      api.postMessage({command:'runPhase',demandId:'new',phase:'propose'});
    });
  }

  window.addEventListener('message',function(e){
    var msg = e.data;
    if(msg.command === 'stateUpdated'){ handleState(msg.payload); }
    if(msg.command === 'skipPermissionsChanged'){ updateSkipButton(msg.payload.enabled); }
  });

  function handleState(payload){
    hide(loadingState); hide(errorState);
    if(!payload){ showError('响应无效'); return; }
    if(payload.error){ showError(payload.error); }
    var demands = payload.demands || [];
    allDemands = demands;

    show(layout);

    // Sidebar: demand list
    if(demands.length === 0){
      demandList.innerHTML = '<div class="state-message" style="padding:16px 0">暂无需求</div>';
      mainContent.innerHTML = '';
      emptyDetail.style.display = '';
      return;
    }

    demandList.innerHTML = demands.map(function(d){
      var active = d.id === selectedDemandId ? ' active' : '';
      if(!selectedDemandId) selectedDemandId = d.id;
      var phaseLabel = PHASE_LABELS[d.phase]||d.phase;
      return '<div class="demand-item'+active+'" data-id="'+esc(d.id)+'">'+
        '<div class="di-name">'+esc(d.title||d.name)+'</div>'+
        '<div class="di-phase">'+phaseLabel+' | '+(d.gate||'?')+'</div></div>';
    }).join('');

    // Demand list click
    demandList.querySelectorAll('.demand-item').forEach(function(el){
      el.addEventListener('click',function(){
        demandList.querySelectorAll('.demand-item').forEach(function(i){ i.classList.remove('active'); });
        this.classList.add('active');
        selectedDemandId = this.getAttribute('data-id');
        selectedPhase = null;
        showDemandDetail(selectedDemandId);
      });
    });

    // Show selected demand detail
    if(!selectedDemandId && demands.length > 0) selectedDemandId = demands[0].id;
    if(selectedDemandId) showDemandDetail(selectedDemandId);
  }

  function showDemandDetail(id){
    var d = allDemands.find(function(d){ return d.id === id; });
    if(!d){ emptyDetail.style.display = ''; mainContent.innerHTML = ''; return; }
    emptyDetail.style.display = 'none';

    var phase = d.phase||'unknown', gate = d.gate||'unknown';
    var phases = d.phases||{};
    var isClosure = phase === 'closure';

    // Default selected phase = current phase
    if(!selectedPhase) selectedPhase = phase;

    // Phase boxes
    var phaseBoxes = PHASE_ORDER.map(function(p){
      var pdata = phases[p]||{};
      var cls = 'phase-box';
      var status = pdata.status||'pending';
      var gateStatus = (pdata.gate&&pdata.gate.status)||'';
      if(p===phase) cls += ' active';
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
        (gate === 'pending' ? '<button class="btn-gate" id="gatePassBtn">✓ 审核通过</button><button class="btn-gate" id="gateRejectBtn">✗ 打回</button>' : '')+
        '<span class="gate-label">'+(gate === 'passed' ? '✓ 已通过' : gate === 'pending' ? '⏱ 待审核' : gate === 'rejected' ? '✗ 已打回' : '审核: '+gate)+'</span>'+
      '</div>';

    // Phase box click: select
    document.querySelectorAll('.phase-box').forEach(function(el){
      el.addEventListener('click',function(){
        var pid = this.getAttribute('data-phase');
        if(pid === selectedPhase) return;
        selectedPhase = pid;
        showDemandDetail(id);
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
//# sourceMappingURL=extension.js.map
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
exports.FlowMasterSidebarProvider = void 0;
const vscode = __importStar(require("vscode"));
/**
 * WebviewViewProvider for the FlowMaster sidebar.
 * Renders the demand list and lets the user select a demand
 * to display in the main dashboard or start a new demand.
 */
class FlowMasterSidebarProvider {
    constructor(stateReader, context) {
        this.stateReader = stateReader;
        this.context = context;
    }
    resolveWebviewView(webviewView, _context, _token) {
        try {
            this._view = webviewView;
            webviewView.webview.options = {
                enableScripts: true,
                localResourceRoots: [this.context.extensionUri]
            };
            webviewView.webview.html = this.getHtml(webviewView.webview);
            webviewView.webview.onDidReceiveMessage(async (message) => {
                try {
                    switch (message.command) {
                        case 'selectDemand': {
                            const demandId = message.demandId;
                            if (demandId) {
                                await vscode.commands.executeCommand('flowmaster.openDashboard', demandId);
                            }
                            break;
                        }
                        case 'newDemand': {
                            await vscode.commands.executeCommand('flowmaster.newDemand');
                            break;
                        }
                        case 'refresh': {
                            this.refresh();
                            break;
                        }
                        case 'ready': {
                            this.refresh();
                            break;
                        }
                    }
                }
                catch (err) {
                    console.error('[FlowMaster] Sidebar message handler error:', err);
                    this._view?.webview.postMessage({ command: 'stateUpdated', payload: { demands: [], error: String(err) } });
                }
            });
            // Refresh as soon as the view becomes visible
            webviewView.onDidChangeVisibility(() => {
                if (webviewView.visible) {
                    this.refresh();
                }
            });
        }
        catch (err) {
            console.error('[FlowMaster] resolveWebviewView failed:', err);
            vscode.window.showErrorMessage(`[FlowMaster] 侧边栏初始化失败: ${String(err)}`);
        }
    }
    refresh() {
        if (!this._view)
            return;
        try {
            const demands = this.stateReader.readAllStates();
            this._view.webview.postMessage({ command: 'stateUpdated', payload: { demands } });
        }
        catch (err) {
            this._view.webview.postMessage({
                command: 'stateUpdated',
                payload: { demands: [], error: String(err) }
            });
        }
    }
    getHtml(webview) {
        const cspSource = webview.cspSource;
        return /* html */ `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline' ${cspSource}; script-src 'unsafe-inline' ${cspSource};">
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  font-family: var(--vscode-font-family);
  font-size: var(--vscode-font-size, 13px);
  color: var(--vscode-editor-foreground);
  background: var(--vscode-sideBar-background);
  padding: 12px 10px;
}
#sidebar-title {
  font-size: 11px;
  font-weight: 600;
  color: var(--vscode-descriptionForeground);
  margin-bottom: 10px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.btn-icon {
  background: none;
  border: 1px solid var(--vscode-panel-border);
  color: var(--vscode-descriptionForeground);
  padding: 2px;
  border-radius: 4px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
}
.btn-icon:hover { background: var(--vscode-toolbar-hoverBackground); color: var(--vscode-editor-foreground); }
.btn-icon.spinning svg { animation: spin 1s linear infinite; }
@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
.btn-new {
  width: 100%;
  padding: 6px;
  margin-bottom: 10px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-family: inherit;
  font-size: 12px;
  background: var(--vscode-button-secondaryBackground);
  color: var(--vscode-button-secondaryForeground);
  transition: opacity 0.15s;
}
.btn-new:hover { opacity: 0.85; }
.state-message {
  text-align: center;
  padding: 20px 8px;
  color: var(--vscode-descriptionForeground);
  font-size: 12px;
}
.state-error {
  color: var(--vscode-errorForeground);
  background: var(--vscode-inputValidation-errorBackground);
  border: 1px solid var(--vscode-inputValidation-errorBorder);
  border-radius: 4px;
  padding: 6px 8px;
  margin-bottom: 8px;
  font-size: 12px;
}
.demand-list { display: flex; flex-direction: column; gap: 2px; }
.demand-item {
  padding: 8px 10px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  transition: background 0.15s;
}
.demand-item:hover { background: var(--vscode-list-hoverBackground); }
.demand-item.active { background: var(--vscode-list-activeSelectionBackground); color: var(--vscode-list-activeSelectionForeground); }
.demand-item .di-name { font-weight: 500; line-height: 1.4; }
.demand-item .di-phase { font-size: 10px; opacity: 0.7; margin-top: 3px; }
.hidden { display: none; }
</style>
</head>
<body>
  <div id="fallback" style="padding:12px 10px;font-size:12px;color:var(--vscode-descriptionForeground)">FlowMaster 侧边栏加载中...</div>
  <div id="app" style="display:none">
    <div id="sidebar-title">
      <span>需求列表</span>
      <button id="refreshBtn" class="btn-icon" title="刷新">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 4v6h-6"></path><path d="M1 20v-6h6"></path><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>
      </button>
    </div>
    <button id="newDemandBtn" class="btn-new">+ 新建需求</button>
    <div id="errorState" class="state-error hidden"></div>
    <div id="loadingState" class="state-message">加载中...</div>
    <div id="demandList"></div>
  </div>

<script>
(function() {
  'use strict';
  var vscode = acquireVsCodeApi();
  var fallback = document.getElementById('fallback');
  var app = document.getElementById('app');
  var loadingState = document.getElementById('loadingState');
  var errorState = document.getElementById('errorState');
  var demandList = document.getElementById('demandList');
  var refreshBtn = document.getElementById('refreshBtn');

  var PHASE_LABELS = { design: '设计', testcase: '测试', development: '开发', delivery: '交付', closure: '关闭' };
  var selectedDemandId = null;
  var isReady = false;

  function switchToApp() {
    if (fallback) fallback.style.display = 'none';
    if (app) app.style.display = 'block';
  }

  function showError(msg) {
    switchToApp();
    if (errorState) { errorState.textContent = msg; errorState.classList.remove('hidden'); }
    if (loadingState) loadingState.classList.add('hidden');
  }

  window.onerror = function(msg, url, line) {
    showError('运行时错误: ' + msg + ' (line ' + line + ')');
  };

  function esc(s) {
    if (!s) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function render(payload) {
    switchToApp();
    if (loadingState) loadingState.classList.add('hidden');
    if (errorState) errorState.classList.add('hidden');

    if (!payload) { showError('响应无效'); return; }
    if (payload.error) showError(payload.error);

    var demands = payload.demands || [];
    if (demands.length === 0) {
      demandList.innerHTML = '<div class="state-message">暂无需求</div>';
      return;
    }

    demandList.innerHTML = '<div class="demand-list">' + demands.map(function(d) {
      var active = d.id === selectedDemandId ? ' active' : '';
      var phase = PHASE_LABELS[d.phase] || d.phase;
      return '<div class="demand-item' + active + '" data-id="' + esc(d.id) + '">' +
        '<div class="di-name">' + esc(d.title || d.name) + '</div>' +
        '<div class="di-phase">' + esc(phase) + ' | ' + esc(d.gate || '无审核') + '</div>' +
      '</div>';
    }).join('') + '</div>';

    demandList.querySelectorAll('.demand-item').forEach(function(el) {
      el.addEventListener('click', function() {
        selectedDemandId = this.getAttribute('data-id');
        demandList.querySelectorAll('.demand-item').forEach(function(item) { item.classList.remove('active'); });
        this.classList.add('active');
        vscode.postMessage({ command: 'selectDemand', demandId: selectedDemandId });
      });
    });
  }

  window.addEventListener('message', function(event) {
    var msg = event.data;
    if (msg.command === 'stateUpdated') { render(msg.payload); }
  });

  document.getElementById('newDemandBtn').addEventListener('click', function() {
    vscode.postMessage({ command: 'newDemand' });
  });

  if (refreshBtn) {
    refreshBtn.addEventListener('click', function() {
      refreshBtn.classList.add('spinning');
      if (loadingState) loadingState.classList.remove('hidden');
      demandList.innerHTML = '';
      vscode.postMessage({ command: 'refresh' });
      window.addEventListener('message', function stopSpin(event) {
        if (event.data && event.data.command === 'stateUpdated') {
          refreshBtn.classList.remove('spinning');
          window.removeEventListener('message', stopSpin);
        }
      });
    });
  }

  // Notify extension that the webview is ready; it will then send the state.
  try {
    switchToApp();
    if (loadingState) loadingState.classList.remove('hidden');
    vscode.postMessage({ command: 'ready' });
  } catch (e) {
    showError('无法初始化侧边栏: ' + e.message);
  }

  // Timeout: if no response after 8 seconds, prompt user to reload
  setTimeout(function () {
    if (loadingState && !loadingState.classList.contains('hidden')) {
      showError('未收到扩展进程响应，请尝试重新加载窗口。');
    }
  }, 8000);
})();
</script>
</body>
</html>`;
    }
}
exports.FlowMasterSidebarProvider = FlowMasterSidebarProvider;
FlowMasterSidebarProvider.viewType = 'flowmaster-sidebar';
//# sourceMappingURL=sidebarProvider.js.map
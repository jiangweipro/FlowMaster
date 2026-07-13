import * as vscode from 'vscode';
import { DemandSummary, StateReader } from './stateReader';

/**
 * WebviewViewProvider for the FlowMaster sidebar.
 * Renders the demand list and lets the user select a demand
 * to display in the main dashboard or start a new demand.
 */
export class FlowMasterSidebarProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'flowmaster-sidebar';

  private _view?: vscode.WebviewView;

  constructor(
    private readonly stateReader: StateReader,
    private readonly context: vscode.ExtensionContext
  ) {}

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.context.extensionUri]
    };

    webviewView.webview.html = this.getHtml();

    webviewView.webview.onDidReceiveMessage(async (message) => {
      switch (message.command) {
        case 'selectDemand': {
          const demandId = message.demandId as string;
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
      }
    });

    // Refresh as soon as the view becomes visible
    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible) {
        this.refresh();
      }
    });

    this.refresh();
  }

  refresh(): void {
    if (!this._view) return;

    try {
      const demands = this.stateReader.readAllStates();
      this._view.webview.postMessage({ command: 'stateUpdated', payload: { demands } });
    } catch (err) {
      this._view.webview.postMessage({
        command: 'stateUpdated',
        payload: { demands: [], error: String(err) }
      });
    }
  }

  private getHtml(): string {
    return /* html */ `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
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
}
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
  <div id="sidebar-title">需求列表</div>
  <button id="newDemandBtn" class="btn-new">+ 新建需求</button>
  <div id="errorState" class="state-error hidden"></div>
  <div id="loadingState" class="state-message">加载中...</div>
  <div id="demandList"></div>

<script>
(function() {
  'use strict';
  var vscode = acquireVsCodeApi();
  var loadingState = document.getElementById('loadingState');
  var errorState = document.getElementById('errorState');
  var demandList = document.getElementById('demandList');

  var PHASE_LABELS = { design: '设计', testcase: '测试', development: '开发', delivery: '交付', closure: '关闭' };
  var selectedDemandId = null;

  function showError(msg) {
    if (errorState) { errorState.textContent = msg; errorState.classList.remove('hidden'); }
    if (loadingState) loadingState.classList.add('hidden');
  }

  function esc(s) {
    if (!s) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function render(payload) {
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

  // Initial load with a short delay so the extension host is ready
  setTimeout(function () {
    try {
      if (loadingState) loadingState.classList.remove('hidden');
      vscode.postMessage({ command: 'refresh' });
    } catch (e) {
      showError('无法发送刷新请求: ' + e.message);
    }
  }, 200);

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

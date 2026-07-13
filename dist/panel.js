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
exports.FlowMasterPanel = void 0;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const stateReader_1 = require("./stateReader");
const terminalRunner_1 = require("./terminalRunner");
const fileOpener_1 = require("./fileOpener");
class FlowMasterPanel {
    constructor(context) {
        this.context = context;
        this.stateReader = new stateReader_1.StateReader();
        this.terminalRunner = new terminalRunner_1.TerminalRunner();
        this.fileOpener = new fileOpener_1.FileOpener();
    }
    createOrShow() {
        console.log('[FlowMaster] createOrShow called');
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : vscode.ViewColumn.One;
        if (this.panel) {
            console.log('[FlowMaster] Panel already exists, revealing');
            this.panel.reveal(column);
            return;
        }
        this.panel = vscode.window.createWebviewPanel('flowmasterDashboard', 'FlowMaster Dashboard', column || vscode.ViewColumn.One, {
            enableScripts: true,
            retainContextWhenHidden: true,
            localResourceRoots: [
                vscode.Uri.file(path.join(this.context.extensionPath, 'media'))
            ]
        });
        console.log('[FlowMaster] WebView panel created, setting HTML...');
        this.panel.webview.html = this.getHtmlForWebview();
        console.log('[FlowMaster] WebView HTML set');
        this.panel.webview.onDidReceiveMessage((message) => this.handleMessage(message), undefined, this.context.subscriptions);
        this.panel.onDidDispose(() => { this.panel = undefined; }, undefined, this.context.subscriptions);
        // Initial load is triggered by script.js onload
    }
    refresh() {
        if (!this.panel) {
            console.log('[FlowMaster] refresh: panel is null, skipping');
            return;
        }
        try {
            console.log('[FlowMaster] refresh: reading state...');
            const demands = this.stateReader.readAllStates();
            console.log('[FlowMaster] refresh: read ' + demands.length + ' demands');
            this.panel.webview.postMessage({
                command: 'stateUpdated',
                payload: { demands }
            });
            console.log('[FlowMaster] refresh: stateUpdated message sent');
        }
        catch (err) {
            console.error('[FlowMaster] refresh error:', err);
            this.panel.webview.postMessage({
                command: 'stateUpdated',
                payload: { demands: [], error: 'Failed to read state: ' + String(err) }
            });
        }
    }
    handleMessage(message) {
        if (!this.panel) {
            console.log('[FlowMaster] handleMessage: panel is null, dropping message:', message.command);
            return;
        }
        console.log('[FlowMaster] handleMessage: received command:', message.command);
        switch (message.command) {
            case 'refreshState':
                this.refresh();
                break;
            case 'runPhase': {
                const demandId = message.payload?.demandId;
                const phase = message.payload?.phase;
                if (demandId && phase) {
                    this.terminalRunner.runPhase(demandId, phase);
                    this.panel.webview.postMessage({
                        command: 'phaseStarted',
                        payload: { demandId, phase }
                    });
                }
                break;
            }
            case 'openFile': {
                const filePath = message.payload?.path;
                if (filePath) {
                    this.fileOpener.openFile(filePath);
                }
                break;
            }
            case 'openFolder': {
                const folderPath = message.payload?.path;
                if (folderPath) {
                    this.fileOpener.openFolder(folderPath);
                }
                break;
            }
            default:
                console.warn(`[FlowMaster] Unknown message command: ${message.command}`);
        }
    }
    dispose() {
        this.panel?.dispose();
        this.panel = undefined;
        this.terminalRunner.dispose();
    }
    getHtmlForWebview() {
        return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';">
  <style>
body { font-family: var(--vscode-font-family); padding: 16px; color: var(--vscode-editor-foreground); background: var(--vscode-editor-background); }
#app { text-align: center; padding: 32px; }
#loading { color: var(--vscode-descriptionForeground); }
#content { display: none; }
.hidden { display: none; }
.error { color: var(--vscode-errorForeground); background: var(--vscode-inputValidation-errorBackground); padding: 8px; border-radius: 4px; margin: 8px 0; }
  </style>
  <title>FlowMaster Dashboard</title>
</head>
<body>
  <div id="app">
    <h1>FlowMaster Dashboard</h1>
    <div id="loading">Loading...</div>
    <div id="content">
      <div id="demandList"></div>
    </div>
    <div id="errorState" class="hidden"></div>
    <button id="refreshBtn">⟳ Refresh</button>
  </div>
  <script>
(function() {
  'use strict';
  var el = document.getElementById('loading');
  var errorEl = document.getElementById('errorState');
  var listEl = document.getElementById('demandList');
  var refreshBtn = document.getElementById('refreshBtn');

  function showError(msg) {
    errorEl.textContent = msg;
    errorEl.className = 'error';
    el.style.display = 'none';
  }

  // Try acquireVsCodeApi
  var vscodeApi;
  try {
    vscodeApi = acquireVsCodeApi();
    el.textContent = 'acquireVsCodeApi OK, sending refreshState...';
  } catch(e) {
    showError('acquireVsCodeApi FAILED: ' + e.message);
    return;
  }

  // Listen for messages
  window.addEventListener('message', function(event) {
    var msg = event.data;
    el.textContent = 'Received: ' + msg.command;
    if (msg.command === 'stateUpdated') {
      var demands = (msg.payload && msg.payload.demands) || [];
      el.textContent = 'Got ' + demands.length + ' demands';
      if (demands.length === 0) {
        el.textContent = 'No demands found (empty)';
      } else {
        listEl.innerHTML = '<pre>' + JSON.stringify(demands, null, 2) + '</pre>';
      }
    }
  });

  // Send refresh with delay
  setTimeout(function() {
    el.textContent = 'Sending refreshState...';
    try {
      vscodeApi.postMessage({ command: 'refreshState' });
      el.textContent = 'refreshState sent, waiting for response...';
    } catch(e) {
      showError('postMessage FAILED: ' + e.message);
    }
  }, 500);

  // Timeout
  setTimeout(function() {
    if (el.style.display !== 'none') {
      showError('TIMEOUT: No response after 10 seconds');
    }
  }, 10000);

  // Refresh button
  refreshBtn.addEventListener('click', function() {
    el.textContent = 'Manual refresh...';
    el.style.display = '';
    errorEl.className = 'hidden';
    vscodeApi.postMessage({ command: 'refreshState' });
  });
})();
  </script>
</body>
</html>`;
    }
}
exports.FlowMasterPanel = FlowMasterPanel;
//# sourceMappingURL=panel.js.map
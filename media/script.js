/* ============================================
   FlowMaster Dashboard — WebView Frontend Logic
   Includes xterm.js inline terminal integration
   ============================================ */

(function () {
  'use strict';

  // --- DOM References ---
  var demandList = document.getElementById('demandList');
  var emptyState = document.getElementById('emptyState');
  var errorState = document.getElementById('errorState');
  var loadingState = document.getElementById('loadingState');
  var refreshBtn = document.getElementById('refreshBtn');
  var terminalContainer = document.getElementById('terminal-container');
  var terminalPlaceholder = document.getElementById('terminal-placeholder');
  var terminalFallback = document.getElementById('terminal-fallback');
  var divider = document.getElementById('divider');
  var dashboardPanel = document.getElementById('dashboard-panel');
  var terminalPanel = document.getElementById('terminal-panel');
  var appContainer = document.getElementById('app-container');

  // --- VS Code API ---
  var vscode;
  try {
    vscode = acquireVsCodeApi();
  } catch (e) {
    showError('acquireVsCodeApi failed: ' + e.message);
    return;
  }

  // --- State ---
  var demands = [];
  var runningDemands = {};
  var currentDemandId = null;
  var xterm = null;
  var fitAddon = null;
  var webLinksAddon = null;
  var isDragging = false;
  var dragStartY = 0;
  var dragStartRatio = 0.6;
  var defaultSplitRatio = 0.6;
  var minDashboardHeight = 100;
  var minTerminalHeight = 80;
  var xtermReady = false;

  // --- Phase display helpers ---
  var PHASE_LABELS = {
    design: 'Design',
    testcase: 'Plan',
    development: 'Build',
    delivery: 'Delivery',
    closure: 'Closure'
  };

  var PHASE_ORDER = ['design', 'testcase', 'development', 'delivery', 'closure'];

  var GATE_CLASSES = {
    passed: 'badge-gate-passed',
    pending: 'badge-gate-pending',
    rejected: 'badge-gate-rejected',
    unknown: 'badge-gate-unknown'
  };

  // --- Error display ---
  function showError(msg) {
    if (errorState) {
      errorState.textContent = '[FlowMaster] ' + msg;
      errorState.classList.remove('hidden');
    }
    if (loadingState) {
      loadingState.classList.add('hidden');
    }
  }

  // --- Message handling ---
  window.addEventListener('message', function (event) {
    var message = event.data;
    switch (message.command) {
      case 'stateUpdated':
        handleStateUpdated(message.payload);
        break;
      case 'phaseStarted':
        handlePhaseStarted(message.payload);
        break;
      case 'terminalOutput':
        handleTerminalOutput(message);
        break;
      case 'terminalExit':
        handleTerminalExit(message);
        break;
      case 'terminalError':
        handleTerminalError(message);
        break;
      case 'terminalStart':
        handleTerminalStart(message);
        break;
      default:
        console.log('[FlowMaster] Unknown message:', message.command);
    }
  });

  function handleStateUpdated(payload) {
    if (loadingState) loadingState.classList.add('hidden');
    if (errorState) errorState.classList.add('hidden');

    if (!payload) {
      showError('Invalid response from extension.');
      return;
    }

    if (payload.error) {
      showError(payload.error);
    }

    demands = payload.demands || [];

    if (demands.length === 0) {
      if (emptyState) emptyState.classList.remove('hidden');
      if (demandList) demandList.innerHTML = '';
      return;
    }

    if (emptyState) emptyState.classList.add('hidden');
    renderDemands(demands);
  }

  function handlePhaseStarted(payload) {
    if (payload && payload.demandId) {
      runningDemands[payload.demandId] = true;
      updateCardButtons(payload.demandId, true);
    }
  }

  // --- Terminal message handlers ---
  function handleTerminalOutput(msg) {
    if (xterm && xtermReady) {
      xterm.write(msg.data);
    } else if (terminalFallback) {
      terminalFallback.classList.add('visible');
      terminalFallback.textContent += msg.data;
    }
  }

  function handleTerminalExit(msg) {
    var exitMsg = '\r\n[Process exited with code ' + msg.code + ']';
    if (xterm && xtermReady) {
      xterm.write(exitMsg);
    } else if (terminalFallback) {
      terminalFallback.textContent += exitMsg;
    }

    if (msg.demandId) {
      runningDemands[msg.demandId] = false;
      updateCardButtons(msg.demandId, false);
    }
  }

  function handleTerminalError(msg) {
    var errorMsg = '\r\n[Error: ' + msg.error + ']';
    if (xterm && xtermReady) {
      xterm.write('\x1b[31m' + errorMsg + '\x1b[0m');
    } else if (terminalFallback) {
      terminalFallback.textContent += errorMsg;
    }

    if (msg.demandId) {
      runningDemands[msg.demandId] = false;
      updateCardButtons(msg.demandId, false);
    }
  }

  function handleTerminalStart(msg) {
    if (terminalPlaceholder) {
      terminalPlaceholder.classList.add('hidden');
    }
    if (msg.demandId) {
      currentDemandId = msg.demandId;
    }
  }

  // --- Terminal initialization ---
  function initTerminal() {
    if (!terminalContainer) return;

    // Check if xterm is available (loaded from the global scope)
    if (typeof Terminal === 'undefined') {
      showTerminalFallback('xterm.js not loaded. Falling back to plain text output.');
      return;
    }

    try {
      // Read configuration from meta tags
      var configMeta = document.getElementById('xterm-config');
      var config = configMeta ? JSON.parse(configMeta.getAttribute('data-config') || '{}') : {};

      var termOptions = {
        fontSize: config.fontSize || 14,
        fontFamily: config.fontFamily || "Consolas, 'Courier New', monospace",
        scrollback: config.scrollback || 1000,
        theme: {
          background: getComputedStyle(document.documentElement)
            .getPropertyValue('--vscode-terminal-background')
            .trim() || '#1e1e1e',
          foreground: getComputedStyle(document.documentElement)
            .getPropertyValue('--vscode-terminal-foreground')
            .trim() || '#cccccc',
          cursor: getComputedStyle(document.documentElement)
            .getPropertyValue('--vscode-terminalCursor-foreground')
            .trim() || '#cccccc',
          selectionBackground: getComputedStyle(document.documentElement)
            .getPropertyValue('--vscode-terminal-selectionBackground')
            .trim() || '#264f78',
          black: getComputedStyle(document.documentElement)
            .getPropertyValue('--vscode-terminal-ansiBlack')
            .trim() || '#000000',
          red: getComputedStyle(document.documentElement)
            .getPropertyValue('--vscode-terminal-ansiRed')
            .trim() || '#cd3131',
          green: getComputedStyle(document.documentElement)
            .getPropertyValue('--vscode-terminal-ansiGreen')
            .trim() || '#0dbc79',
          yellow: getComputedStyle(document.documentElement)
            .getPropertyValue('--vscode-terminal-ansiYellow')
            .trim() || '#e5e510',
          blue: getComputedStyle(document.documentElement)
            .getPropertyValue('--vscode-terminal-ansiBlue')
            .trim() || '#2472c8',
          magenta: getComputedStyle(document.documentElement)
            .getPropertyValue('--vscode-terminal-ansiMagenta')
            .trim() || '#bc3fbc',
          cyan: getComputedStyle(document.documentElement)
            .getPropertyValue('--vscode-terminal-ansiCyan')
            .trim() || '#11a8cd',
          white: getComputedStyle(document.documentElement)
            .getPropertyValue('--vscode-terminal-ansiWhite')
            .trim() || '#e5e5e5',
          brightBlack: getComputedStyle(document.documentElement)
            .getPropertyValue('--vscode-terminal-ansiBrightBlack')
            .trim() || '#666666',
          brightRed: getComputedStyle(document.documentElement)
            .getPropertyValue('--vscode-terminal-ansiBrightRed')
            .trim() || '#f14c4c',
          brightGreen: getComputedStyle(document.documentElement)
            .getPropertyValue('--vscode-terminal-ansiBrightGreen')
            .trim() || '#23d18b',
          brightYellow: getComputedStyle(document.documentElement)
            .getPropertyValue('--vscode-terminal-ansiBrightYellow')
            .trim() || '#f5f543',
          brightBlue: getComputedStyle(document.documentElement)
            .getPropertyValue('--vscode-terminal-ansiBrightBlue')
            .trim() || '#3b8eea',
          brightMagenta: getComputedStyle(document.documentElement)
            .getPropertyValue('--vscode-terminal-ansiBrightMagenta')
            .trim() || '#d670d6',
          brightCyan: getComputedStyle(document.documentElement)
            .getPropertyValue('--vscode-terminal-ansiBrightCyan')
            .trim() || '#29b8db',
          brightWhite: getComputedStyle(document.documentElement)
            .getPropertyValue('--vscode-terminal-ansiBrightWhite')
            .trim() || '#e5e5e5',
        },
        allowTransparency: true,
        cursorBlink: true,
        cursorStyle: 'block',
        allowProposedApi: true,
      };

      // Create xterm instance
      xterm = new Terminal(termOptions);

      // Load FitAddon
      if (typeof FitAddon !== 'undefined') {
        fitAddon = new FitAddon();
        xterm.loadAddon(fitAddon);
      }

      // Load WebLinksAddon
      if (typeof WebLinksAddon !== 'undefined') {
        webLinksAddon = new WebLinksAddon();
        xterm.loadAddon(webLinksAddon);
      }

      // Open terminal in the container
      xterm.open(terminalContainer);

      // Fit terminal to container
      if (fitAddon) {
        setTimeout(function () {
          try {
            fitAddon.fit();
          } catch (e) {
            console.log('[FlowMaster] fitAddon.fit() failed:', e.message);
          }
        }, 100);
      }

      xtermReady = true;
      if (terminalPlaceholder) terminalPlaceholder.classList.add('hidden');

      // Handle user input
      xterm.onData(function (data) {
        if (currentDemandId) {
          try {
            vscode.postMessage({
              command: 'terminalInput',
              payload: { demandId: currentDemandId, data: data }
            });
          } catch (e) {
            console.log('[FlowMaster] Failed to send terminalInput:', e.message);
          }
        }
      });

      // Write welcome message
      xterm.write('\x1b[33mFlowMaster Terminal ready.\x1b[0m\r\nClick "Run" to start execution for the selected demand.\r\n\n');

    } catch (e) {
      showTerminalFallback('xterm.js init failed: ' + e.message + '. Falling back to plain text output.');
    }
  }

  function showTerminalFallback(msg) {
    if (terminalFallback) {
      terminalFallback.classList.add('visible');
      terminalFallback.textContent = '[' + msg + ']\r\n';
    }
    if (terminalPlaceholder) terminalPlaceholder.classList.add('hidden');
  }

  function fitTerminal() {
    if (fitAddon && xterm && xtermReady) {
      try {
        fitAddon.fit();
        // Send resize event
        if (currentDemandId) {
          try {
            vscode.postMessage({
              command: 'terminalResize',
              payload: {
                demandId: currentDemandId,
                cols: xterm.cols,
                rows: xterm.rows
              }
            });
          } catch (e) {
            // WebView may be disposed
          }
        }
      } catch (e) {
        console.log('[FlowMaster] fitTerminal failed:', e.message);
      }
    }
  }

  // --- Splitter drag logic ---
  function initSplitter() {
    if (!divider || !dashboardPanel || !terminalPanel) return;

    divider.addEventListener('mousedown', function (e) {
      isDragging = true;
      dragStartY = e.clientY;
      dragStartRatio = dashboardPanel.flexBasis
        ? parseFloat(dashboardPanel.flexBasis) / 100
        : defaultSplitRatio;
      divider.classList.add('active');
      document.body.classList.add('no-select');
      document.addEventListener('mousemove', onDragMove);
      document.addEventListener('mouseup', onDragUp);
    });
  }

  function onDragMove(e) {
    if (!isDragging || !appContainer || !dashboardPanel || !terminalPanel) return;

    var containerHeight = appContainer.clientHeight;
    if (containerHeight <= 0) return;

    var deltaY = e.clientY - dragStartY;
    var deltaRatio = deltaY / containerHeight;
    var newRatio = dragStartRatio + deltaRatio;

    // Clamp: ensure both panels have minimum size
    var maxDashboard = 1 - minTerminalHeight / containerHeight;
    var minDashboard = minDashboardHeight / containerHeight;
    newRatio = Math.max(minDashboard, Math.min(maxDashboard, newRatio));

    dashboardPanel.style.flex = newRatio + ' 1 0';
    terminalPanel.style.flex = (1 - newRatio) + ' 1 0';

    fitTerminal();
  }

  function onDragUp() {
    isDragging = false;
    divider.classList.remove('active');
    document.body.classList.remove('no-select');
    document.removeEventListener('mousemove', onDragMove);
    document.removeEventListener('mouseup', onDragUp);
    fitTerminal();
  }

  // --- Rendering ---
  function renderDemands(demands) {
    if (!demandList) return;
    demandList.innerHTML = demands.map(function (demand) { return renderCard(demand); }).join('');

    // Attach event listeners
    demands.forEach(function (demand) {
      var card = document.getElementById('card-' + demand.id);
      if (!card) return;

      // Run button
      var runBtn = card.querySelector('.run-btn');
      if (runBtn) {
        runBtn.addEventListener('click', function () {
          try {
            currentDemandId = demand.id;
            clearTerminal();
            vscode.postMessage({
              command: 'runPhase',
              payload: { demandId: demand.id, phase: demand.phase }
            });
            runningDemands[demand.id] = true;
            this.disabled = true;
            this.textContent = 'Running...';
          } catch (e) {
            showError('Failed to send runPhase: ' + e.message);
          }
        });
      }

      // Artifact items
      var artifactItems = card.querySelectorAll('.artifact-item');
      artifactItems.forEach(function (item) {
        item.addEventListener('click', function () {
          var filePath = this.getAttribute('data-path');
          if (filePath) {
            try {
              vscode.postMessage({
                command: 'openFile',
                payload: { path: filePath }
              });
            } catch (e) {
              showError('Failed to open file: ' + e.message);
            }
          }
        });
      });

      // Card click — switch terminal
      card.addEventListener('click', function () {
        var dId = demand.id;
        if (dId !== currentDemandId) {
          currentDemandId = dId;
          clearTerminal();
          try {
            vscode.postMessage({
              command: 'switchTerminal',
              payload: { demandId: dId }
            });
          } catch (e) {
            console.log('[FlowMaster] Failed to send switchTerminal:', e.message);
          }
        }
      });
    });
  }

  function clearTerminal() {
    if (xterm && xtermReady) {
      xterm.reset();
      xterm.write('\x1b[33mSwitching terminal...\x1b[0m\r\n\n');
    } else if (terminalFallback) {
      terminalFallback.textContent = '';
    }
  }

  function renderCard(demand) {
    var phase = demand.phase || 'unknown';
    var gate = demand.gate || 'unknown';
    var phaseClass = 'phase-' + phase;
    var isClosure = phase === 'closure';
    var isRunning = !!runningDemands[demand.id];

    var phaseDots = PHASE_ORDER.map(function (p) {
      var dotClass = '';
      if (p === phase) dotClass = 'active';
      else if (isPhaseCompleted(demand, p)) dotClass = 'completed';
      else if (isPhaseBlocked(demand, p)) dotClass = 'blocked';
      return '<div class="phase-dot ' + dotClass + '" title="' + (PHASE_LABELS[p] || p) + '"></div>';
    }).join('');

    var artifacts = demand.artifacts || [];
    var artifactHtml;
    if (artifacts.length > 0) {
      artifactHtml = '<ul class="artifact-list">' +
        artifacts.map(function (a) {
          var label = a.split('/').pop() || a;
          return '<li class="artifact-item" data-path="' + escapeHtml(a) + '">' +
            '<span class="artifact-icon">📄</span>' +
            '<span>' + escapeHtml(label) + '</span>' +
          '</li>';
        }).join('') +
        '</ul>';
    } else {
      artifactHtml = '<div class="artifact-empty">No artifacts for this phase</div>';
    }

    var gateIcon = gate === 'passed' ? '✓' : gate === 'pending' ? '⏱' : gate === 'rejected' ? '✗' : '?';
    var gateClass = GATE_CLASSES[gate] || 'badge-gate-unknown';

    return '<div id="card-' + escapeHtml(demand.id) + '" class="demand-card ' + phaseClass + '">' +
        '<div class="card-header">' +
          '<div class="card-title">' +
            '<div class="card-name">' + escapeHtml(demand.title || demand.name) + '</div>' +
            '<div class="card-title-text">' + escapeHtml(demand.id) + '</div>' +
          '</div>' +
          '<div class="card-badges">' +
            '<span class="badge badge-phase">' + escapeHtml(PHASE_LABELS[phase] || phase) + '</span>' +
            '<span class="badge ' + gateClass + '">' + gateIcon + ' ' + escapeHtml(gate) + '</span>' +
          '</div>' +
        '</div>' +
        '<div class="phase-progress">' + phaseDots + '</div>' +
        '<div class="card-body">' +
          '<div class="card-section-title">Artifacts</div>' +
          artifactHtml +
        '</div>' +
        '<div class="card-footer">' +
          (isClosure
            ? '<span class="completed-badge">✔ Completed</span>'
            : '<button class="btn btn-primary run-btn"' + (isRunning ? ' disabled' : '') + '>' +
                (isRunning ? 'Running...' : '▶ Run ' + (PHASE_LABELS[phase] || phase)) +
              '</button>'
          ) +
          '<span class="phase-label">Phase: ' + phase + ' | Gate: ' + gate + '</span>' +
        '</div>' +
      '</div>';
  }

  function updateCardButtons(demandId, running) {
    var card = document.getElementById('card-' + demandId);
    if (!card) return;
    var btn = card.querySelector('.run-btn');
    if (!btn) return;
    btn.disabled = running;
    btn.textContent = running ? 'Running...' : '▶ Run';
  }

  // --- Helpers ---
  function isPhaseCompleted(demand, phase) {
    var p = demand.phases && demand.phases[phase];
    return p && (p.status === 'done' || p.status === 'completed');
  }

  function isPhaseBlocked(demand, phase) {
    var p = demand.phases && demand.phases[phase];
    return p && p.status === 'blocked';
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function show(el) {
    if (el) el.classList.remove('hidden');
  }

  function hide(el) {
    if (el) el.classList.add('hidden');
  }

  // --- Refresh button ---
  if (refreshBtn) {
    refreshBtn.addEventListener('click', function () {
      if (loadingState) loadingState.classList.remove('hidden');
      if (errorState) errorState.classList.add('hidden');
      try {
        vscode.postMessage({ command: 'refreshState' });
      } catch (e) {
        showError('Failed to send refresh: ' + e.message);
      }
    });
  }

  // --- Window resize handler ---
  window.addEventListener('resize', function () {
    fitTerminal();
  });

  // --- Initialization ---
  function initialize() {
    initSplitter();
    initTerminal();

    // Initial load: send refreshState with a short delay
    setTimeout(function () {
      if (loadingState) loadingState.classList.remove('hidden');
      try {
        vscode.postMessage({ command: 'refreshState' });
      } catch (e) {
        showError('Failed to send initial load: ' + e.message);
      }
    }, 300);

    // Timeout: if no response after 8 seconds, show error
    setTimeout(function () {
      if (loadingState && !loadingState.classList.contains('hidden')) {
        showError('No response from extension host. Check that .workflow/state/ exists and contains valid YAML files.');
      }
    }, 8000);
  }

  // Wait for DOM to be ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
  } else {
    initialize();
  }
})();
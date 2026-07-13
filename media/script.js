/* ============================================
   FlowMaster Dashboard — WebView Frontend Logic
   ============================================ */

(function () {
  'use strict';

  // DOM references
  var demandList = document.getElementById('demandList');
  var emptyState = document.getElementById('emptyState');
  var errorState = document.getElementById('errorState');
  var loadingState = document.getElementById('loadingState');
  var refreshBtn = document.getElementById('refreshBtn');

  // Show a visible error in the WebView UI
  function showError(msg) {
    if (errorState) {
      errorState.textContent = '[FlowMaster] ' + msg;
      errorState.classList.remove('hidden');
    }
    if (loadingState) {
      loadingState.classList.add('hidden');
    }
  }

  // Try to get VS Code API
  var vscode;
  try {
    vscode = acquireVsCodeApi();
  } catch (e) {
    showError('acquireVsCodeApi failed: ' + e.message);
    return;
  }

  // State
  var demands = [];
  var runningDemands = {};

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
    });
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

  // --- Initial load: send refreshState with a short delay ---
  // The delay ensures the extension host's message handler is ready
  setTimeout(function () {
    if (loadingState) loadingState.classList.remove('hidden');
    try {
      vscode.postMessage({ command: 'refreshState' });
    } catch (e) {
      showError('Failed to send initial load: ' + e.message);
    }
  }, 300);

  // --- Timeout: if no response after 8 seconds, show error ---
  setTimeout(function () {
    if (loadingState && !loadingState.classList.contains('hidden')) {
      showError('No response from extension host. Check that .workflow/state/ exists and contains valid YAML files.');
    }
  }, 8000);
})();
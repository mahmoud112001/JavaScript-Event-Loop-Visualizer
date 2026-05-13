// ══════════════════════════════════════════════════════
//  main.js — DOM, Events, Rendering, Animation
// ══════════════════════════════════════════════════════

/* ── DOM Shorthand ───────────────────────────────────── */
const $ = id => document.getElementById(id);

/* ── Application State ───────────────────────────────── */
let steps       = [];
let currentStep = 0;
let running     = false;
let autoTimer   = null;

/* ── Utility: Escape HTML ────────────────────────────── */
function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/* ══════════════════════════════════════════════════════
   RENDERING
══════════════════════════════════════════════════════ */

/** Build a colored queue item chip */
function chip(text, color) {
  return `<div class="q-item q-item--${color}">
    <span class="q-dot"></span>
    <span class="q-text">${esc(text)}</span>
  </div>`;
}

/** Set innerHTML of a card body; show empty message if needed */
function renderQueue(bodyId, items, color, emptyMsg = 'فاضي') {
  const el = $(bodyId);
  if (!items || items.length === 0) {
    el.innerHTML = `<div class="empty-msg">— ${emptyMsg} —</div>`;
  } else {
    el.innerHTML = items.map(t => chip(t, color)).join('');
  }
}

/** Map elActive → card id + CSS class */
const ACTIVE_CARD_MAP = {
  nextTick: { id: 'nexttick-card',  cls: 'card--cyan'   },
  micro:    { id: 'microtask-card', cls: 'card--blue'   },
  macro:    { id: 'macrotask-card', cls: 'card--orange' },
};

const ALL_CARD_IDS = [
  'callstack-card', 'webapi-card',
  'nexttick-card', 'microtask-card', 'macrotask-card',
];

const LIBUV_PHASES = ['timers','pending','idle','poll','check','close'];

const LIBUV_STATUS_MAP = {
  timers:  '⏱  timers phase — setTimeout · setInterval',
  pending: '🔄 pending callbacks — I/O errors',
  idle:    '💤 idle / prepare — internal',
  poll:    '🌐 poll phase — I/O events · fs · network',
  check:   '✅ check phase — setImmediate',
  close:   '🚪 close callbacks — socket.on("close")',
};

/** Apply a full state snapshot to the UI */
function applyState(st) {

  /* ── Call Stack ── */
  const csEl = $('call-stack-body');
  if (!st.callStack || st.callStack.length === 0) {
    csEl.innerHTML = '<div class="empty-msg">— فاضي —</div>';
  } else {
    // Render in reverse so newest item appears on top (LIFO visual)
    csEl.innerHTML = [...st.callStack].reverse().map(t => chip(t, 'green')).join('');
  }
  $('cs-count').textContent = (st.callStack || []).length;

  /* ── Web / Node APIs ── */
  const waEl = $('webapi-body');
  if (!st.webAPIs || st.webAPIs.length === 0) {
    waEl.innerHTML = '<div class="empty-msg">— لا توجد عمليات —</div>';
  } else {
    waEl.innerHTML = st.webAPIs.map(t => `
      <div class="q-item q-item--purple api-item">
        <span class="q-dot"></span>
        <span class="q-text">${esc(t)}</span>
        <span class="api-timer">⏳</span>
      </div>`).join('');
  }
  $('wa-count').textContent = (st.webAPIs || []).length;

  /* ── nextTick Queue ── */
  renderQueue('nexttick-body', st.nextTick, 'cyan');
  $('nt-count').textContent = (st.nextTick || []).length;

  /* ── Microtask Queue ── */
  renderQueue('microtask-body', st.microtasks, 'blue');
  $('mt-count').textContent = (st.microtasks || []).length;

  /* ── Macro Task Queue ── */
  renderQueue('macrotask-body', st.macrotasks, 'orange');
  $('ma-count').textContent = (st.macrotasks || []).length;

  /* ── Console Output ── */
  const conEl = $('console-output');
  if (!st.console || st.console.length === 0) {
    conEl.innerHTML = '<span class="console-ph">// output will appear here...</span>';
  } else {
    conEl.innerHTML = st.console.map((line, i) => `
      <div class="log-line" style="animation-delay:${i * 0.03}s">
        <span class="log-chevron">›</span>
        <span class="log-text">${esc(line)}</span>
      </div>`).join('');
    conEl.scrollTop = conEl.scrollHeight;
  }

  /* ── Card Active Highlight ── */
  ALL_CARD_IDS.forEach(id => {
    const el = $(id);
    if (el) el.className = 'viz-card' + (id === 'nexttick-card' || id === 'microtask-card' || id === 'macrotask-card' ? ' viz-card--sm' : '');
  });

  if (st.elActive && ACTIVE_CARD_MAP[st.elActive]) {
    const { id, cls } = ACTIVE_CARD_MAP[st.elActive];
    const cardEl = $(id);
    if (cardEl) cardEl.classList.add(cls);
  } else if (st.callStack && st.callStack.length > 0) {
    $('callstack-card').classList.add('card--green');
  }

  /* ── libuv Phases ── */
  LIBUV_PHASES.forEach(p => {
    const el = $(`phase-${p}`);
    if (el) el.classList.remove('phase--active');
  });

  if (st.libuvPhase) {
    const activePhase = $(`phase-${st.libuvPhase}`);
    if (activePhase) activePhase.classList.add('phase--active');
    $('libuv-status').textContent = LIBUV_STATUS_MAP[st.libuvPhase] || '';
  } else {
    $('libuv-status').textContent = 'في الانتظار...';
  }
}

/* ══════════════════════════════════════════════════════
   LINE NUMBERS + HIGHLIGHT
══════════════════════════════════════════════════════ */

function updateLineNumbers() {
  const code  = $('code-editor').value;
  const count = (code.match(/\n/g) || []).length + 1;
  const el    = $('line-nums');
  el.innerHTML = Array.from({ length: count }, (_, i) => `<div>${i + 1}</div>`).join('');
}

function highlightLine(lineIndex) {
  const hl     = $('line-hl');
  const editor = $('code-editor');

  if (lineIndex < 0) {
    hl.style.display = 'none';
    return;
  }

  const lineH = parseFloat(getComputedStyle(editor).lineHeight) || 22.4;
  const padT  = 14;

  hl.style.display = 'block';
  hl.style.top     = (padT + lineIndex * lineH) + 'px';
  hl.style.height  = lineH + 'px';
}

/* ══════════════════════════════════════════════════════
   TOOLTIP
══════════════════════════════════════════════════════ */

let tooltipTimer = null;

function showTooltip(msg) {
  if (!msg) return;
  const tip = $('tooltip');
  tip.textContent = msg;
  tip.style.bottom = '80px';
  tip.style.left   = '50%';
  tip.style.transform = 'translateX(-50%)';
  tip.classList.add('is-visible');
  clearTimeout(tooltipTimer);
  tooltipTimer = setTimeout(() => tip.classList.remove('is-visible'), 2400);
}

/* ══════════════════════════════════════════════════════
   STEP EXECUTION
══════════════════════════════════════════════════════ */

function updateStepBadge() {
  $('step-counter').textContent = `${currentStep} / ${steps.length}`;
}

function executeStep() {
  if (currentStep >= steps.length) {
    stopAuto();
    $('btn-run').innerHTML = getBtnRunHTML('run');
    $('btn-run').classList.remove('is-running');
    $('btn-step').disabled = true;
    return false;
  }

  const step = steps[currentStep];
  applyState(step.state);
  $('step-description').textContent = step.desc;
  highlightLine(step.line);
  if (step.tooltip) showTooltip(step.tooltip);

  currentStep++;
  updateStepBadge();
  return true;
}

/* ══════════════════════════════════════════════════════
   AUTO-RUN
══════════════════════════════════════════════════════ */

function getDelay() {
  const v = parseInt($('speed-slider').value);
  return [1300, 850, 520, 270, 110][v - 1];
}

function startAuto() {
  stopAuto();
  running = true;

  function tick() {
    const hasMore = executeStep();
    if (hasMore && running) {
      autoTimer = setTimeout(tick, getDelay());
    } else {
      running = false;
      $('btn-run').innerHTML = getBtnRunHTML('run');
      $('btn-run').classList.remove('is-running');
      $('btn-step').disabled = currentStep >= steps.length;
    }
  }
  tick();
}

function stopAuto() {
  running = false;
  clearTimeout(autoTimer);
}

/* ── Button HTML helpers ── */
const ICONS = {
  run:   '<svg viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>',
  pause: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>',
};

function getBtnRunHTML(state) {
  return state === 'pause'
    ? `${ICONS.pause} Pause`
    : `${ICONS.run} Run`;
}

/* ══════════════════════════════════════════════════════
   RESET
══════════════════════════════════════════════════════ */

function reset() {
  stopAuto();
  steps       = [];
  currentStep = 0;

  $('btn-run').innerHTML = getBtnRunHTML('run');
  $('btn-run').classList.remove('is-running');
  $('btn-step').disabled = false;
  $('step-description').textContent = 'اضغط Run أو Step لبدء التنفيذ';
  $('step-counter').textContent = '0 / 0';
  $('tooltip').classList.remove('is-visible');

  highlightLine(-1);
  applyState({
    callStack: [], webAPIs: [], nextTick: [],
    microtasks: [], macrotasks: [], console: [],
    elActive: null, libuvPhase: null,
  });

  updateLineNumbers();
}

/* ══════════════════════════════════════════════════════
   EVENT LISTENERS
══════════════════════════════════════════════════════ */

/* Run / Pause */
$('btn-run').addEventListener('click', () => {
  if (running) {
    stopAuto();
    $('btn-run').innerHTML = getBtnRunHTML('run');
    $('btn-run').classList.remove('is-running');
    $('btn-step').disabled = false;
    return;
  }

  // Build or restart steps
  if (steps.length === 0 || currentStep >= steps.length) {
    steps = buildSteps($('code-editor').value);
    currentStep = 0;
    updateStepBadge();
  }

  $('btn-run').innerHTML = getBtnRunHTML('pause');
  $('btn-run').classList.add('is-running');
  $('btn-step').disabled = true;
  startAuto();
});

/* Step */
$('btn-step').addEventListener('click', () => {
  if (steps.length === 0) {
    steps = buildSteps($('code-editor').value);
    currentStep = 0;
    updateStepBadge();
  }
  executeStep();
  $('btn-step').disabled = currentStep >= steps.length;
});

/* Reset */
$('btn-reset').addEventListener('click', reset);

/* Example Select */
$('example-select').addEventListener('change', e => {
  const v = parseInt(e.target.value);
  if (!v || !EXAMPLES[v]) return;
  reset();
  $('code-editor').value = EXAMPLES[v];
  updateLineNumbers();
  e.target.value = '0'; // Reset select visually
});

/* Code Editor → reset on change */
$('code-editor').addEventListener('input', () => {
  updateLineNumbers();
  if (steps.length > 0) reset();
});

/* Sync line numbers scroll */
$('code-editor').addEventListener('scroll', () => {
  $('line-nums').scrollTop = $('code-editor').scrollTop;
});

/* ══════════════════════════════════════════════════════
   INITIALISE
══════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  reset();
});

// ══════════════════════════════════════════════════════
//  engine.js — Event Loop Simulation Engine v3
//
//  Parses arbitrary JS code with common async patterns
//  and simulates the Node.js Event Loop step by step.
//
//  Supported patterns:
//    console.log("x")
//    setTimeout(() => { ... }, delay)
//    setImmediate(() => { ... })
//    process.nextTick(() => { ... })
//    Promise.resolve().then(() => ...).then(() => ...)
//    async function name() { await ...; ... }
//    name()   ← call to a defined async function
// ══════════════════════════════════════════════════════

/* ════════════════════════════════════════════════════
   PARSER UTILITIES
════════════════════════════════════════════════════ */

function findClose(str, openIdx, open, close) {
  let depth = 0;
  let inStr = false;
  let strChar = '';
  for (let i = openIdx; i < str.length; i++) {
    const ch = str[i];
    if (!inStr && (ch === '"' || ch === "'" || ch === '`')) { inStr = true; strChar = ch; }
    else if (inStr && ch === strChar && str[i-1] !== '\\') { inStr = false; }
    if (!inStr) {
      if (ch === open) depth++;
      else if (ch === close) { depth--; if (depth === 0) return i; }
    }
  }
  return str.length - 1;
}

function collectStatement(lines, startIdx) {
  let depth = 0;
  const parts = [];
  let endLine = startIdx;
  for (let i = startIdx; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (i > startIdx && depth === 0 && trimmed !== '' && !trimmed.startsWith('.')) break;
    parts.push(lines[i]);
    endLine = i;
    for (const ch of lines[i]) {
      if (ch === '(' || ch === '{' || ch === '[') depth++;
      else if (ch === ')' || ch === '}' || ch === ']') depth--;
    }
    if (depth <= 0) {
      let look = i + 1;
      while (look < lines.length && !lines[look].trim()) look++;
      if (look < lines.length && lines[look].trim().startsWith('.')) continue;
      break;
    }
  }
  return { fullCode: parts.join('\n').trim(), endLine };
}

function extractArrowBody(code) {
  const arrowIdx = code.indexOf('=>');
  if (arrowIdx === -1) return { body: '', isBlock: false };
  const afterArrow = code.slice(arrowIdx + 2).trim();
  if (afterArrow[0] === '{') {
    const closeIdx = findClose(afterArrow, 0, '{', '}');
    return { body: afterArrow.slice(1, closeIdx).trim(), isBlock: true };
  }
  let depth = 0, i = 0;
  while (i < afterArrow.length) {
    const ch = afterArrow[i];
    if (ch === '(' || ch === '{' || ch === '[') depth++;
    else if (ch === ')' || ch === '}' || ch === ']') { if (depth === 0) break; depth--; }
    else if ((ch === ',' || ch === '\n') && depth === 0) break;
    i++;
  }
  return { body: afterArrow.slice(0, i).trim().replace(/[;,]$/, ''), isBlock: false };
}

function parseLogValue(code) {
  const m = code.match(/console\.log\(["'`](.*?)["'`]\)/);
  return m ? m[1] : null;
}

function parseBodyActions(body, lineOffset) {
  if (!body || !body.trim()) return [];
  const actions = [];
  const lines = body.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith('//')) continue;
    const logVal = parseLogValue(line);
    if (logVal !== null) actions.push({ type: 'log', value: logVal, lineIdx: lineOffset + i });
  }
  return actions;
}

/* ════════════════════════════════════════════════════
   STATEMENT PARSERS
════════════════════════════════════════════════════ */

function parseSetTimeout(code, lineIdx) {
  const parenOpen = code.indexOf('(');
  if (parenOpen === -1) return null;
  const parenClose = findClose(code, parenOpen, '(', ')');
  const inner = code.slice(parenOpen + 1, parenClose);
  const delayMatch = inner.match(/,\s*(\d+)\s*$/);
  const delay = delayMatch ? parseInt(delayMatch[1]) : 0;
  const { body } = extractArrowBody(inner);
  return { type: 'setTimeout', body: parseBodyActions(body, lineIdx + 1), delay, lineIdx };
}

function parseSimpleCallback(code, type, lineIdx) {
  const parenOpen = code.indexOf('(');
  if (parenOpen === -1) return null;
  const parenClose = findClose(code, parenOpen, '(', ')');
  const inner = code.slice(parenOpen + 1, parenClose);
  const { body } = extractArrowBody(inner);
  return { type, body: parseBodyActions(body, lineIdx), lineIdx };
}

function parsePromiseChain(code, lineIdx) {
  const thens = [];
  let pos = 0;
  while (pos < code.length) {
    const thenIdx = code.indexOf('.then(', pos);
    if (thenIdx === -1) break;
    const parenOpen  = thenIdx + 5;
    const parenClose = findClose(code, parenOpen, '(', ')');
    const cbCode     = code.slice(parenOpen + 1, parenClose);
    const { body }   = extractArrowBody(cbCode);
    thens.push({ actions: parseBodyActions(body, lineIdx), logValue: parseLogValue(body) });
    pos = parenClose + 1;
  }
  return thens.length > 0 ? { type: 'promise_chain', thens, lineIdx } : null;
}

function parseAsyncDef(code, startLineIdx) {
  const bodyOpen = code.indexOf('{');
  if (bodyOpen === -1) return { syncBefore: [], syncAfter: [], awaitLineIdx: startLineIdx };
  const bodyClose  = findClose(code, bodyOpen, '{', '}');
  const body       = code.slice(bodyOpen + 1, bodyClose);
  const awaitPos   = body.search(/\bawait\b/);
  if (awaitPos === -1) return { syncBefore: parseBodyActions(body, startLineIdx + 1), syncAfter: [], awaitLineIdx: startLineIdx };
  const beforeAwait  = body.slice(0, awaitPos);
  const awaitOnwards = body.slice(awaitPos);
  const nlAfterAwait = awaitOnwards.indexOf('\n');
  const afterAwait   = nlAfterAwait !== -1 ? awaitOnwards.slice(nlAfterAwait + 1) : '';
  const linesBeforeAwait = code.slice(0, code.indexOf('await')).split('\n').length - 1;
  const awaitLineIdx = startLineIdx + linesBeforeAwait;
  return { syncBefore: parseBodyActions(beforeAwait, startLineIdx + 1), syncAfter: parseBodyActions(afterAwait, awaitLineIdx + 1), awaitLineIdx };
}

/* ════════════════════════════════════════════════════
   TOP-LEVEL PARSER
════════════════════════════════════════════════════ */

function parseTopLevel(code) {
  const lines     = code.split('\n');
  const asyncDefs = {};
  const actions   = [];

  // Pass 1: collect async function definitions
  {
    let i = 0;
    while (i < lines.length) {
      const line = lines[i].trim();
      const m    = line.match(/^async\s+function\s+(\w+)/);
      if (m) {
        const { fullCode, endLine } = collectStatement(lines, i);
        asyncDefs[m[1]] = { ...parseAsyncDef(fullCode, i), name: m[1], lineIdx: i };
        i = endLine + 1;
      } else { i++; }
    }
  }

  // Pass 2: parse top-level statements in order
  {
    let i = 0;
    while (i < lines.length) {
      const line = lines[i].trim();
      if (!line || line.startsWith('//')) { i++; continue; }

      // async function definition — register + skip body
      if (line.match(/^async\s+function\s+/)) {
        const m = line.match(/^async\s+function\s+(\w+)/);
        if (m && asyncDefs[m[1]]) actions.push({ type: 'async_def', ...asyncDefs[m[1]] });
        i = collectStatement(lines, i).endLine + 1;
        continue;
      }

      if (line.match(/^console\.log\(/)) {
        const val = parseLogValue(line);
        actions.push({ type: 'log', value: val !== null ? val : '...', lineIdx: i });
        i++; continue;
      }

      if (line.match(/^setTimeout\s*\(/)) {
        const { fullCode, endLine } = collectStatement(lines, i);
        const p = parseSetTimeout(fullCode, i);
        if (p) actions.push(p);
        i = endLine + 1; continue;
      }

      if (line.match(/^setImmediate\s*\(/)) {
        const { fullCode, endLine } = collectStatement(lines, i);
        const p = parseSimpleCallback(fullCode, 'setImmediate', i);
        if (p) actions.push(p);
        i = endLine + 1; continue;
      }

      if (line.match(/^process\.nextTick\s*\(/)) {
        const { fullCode, endLine } = collectStatement(lines, i);
        const p = parseSimpleCallback(fullCode, 'nextTick', i);
        if (p) actions.push(p);
        i = endLine + 1; continue;
      }

      if (line.match(/^Promise\.(resolve|reject)\s*\(\s*\)/)) {
        const { fullCode, endLine } = collectStatement(lines, i);
        const p = parsePromiseChain(fullCode, i);
        if (p) actions.push(p);
        i = endLine + 1; continue;
      }

      // async function call
      let called = false;
      for (const name of Object.keys(asyncDefs)) {
        if (line.match(new RegExp(`^${name}\\s*\\(\\s*\\)\\s*;?$`))) {
          actions.push({ type: 'async_call', name, lineIdx: i });
          called = true; i++; break;
        }
      }
      if (called) continue;

      i++;
    }
  }

  return { actions, asyncDefs };
}

/* ════════════════════════════════════════════════════
   MAIN STEP BUILDER
════════════════════════════════════════════════════ */

function buildSteps(code) {
  const out = [];

  function step(desc, state, line = -1, tooltip = null) {
    out.push({ desc, state: JSON.parse(JSON.stringify(state)), line, tooltip });
  }

  // Display state
  const st = {
    callStack:  [],
    webAPIs:    [],
    nextTick:   [],
    microtasks: [],
    macrotasks: [],
    console:    [],
    elActive:   null,
    libuvPhase: null,
  };

  // Internal simulation queues
  const _nextTickQ = [];
  const _microQ    = [];
  const _macroQ    = [];

  const { actions, asyncDefs } = parseTopLevel(code);

  // ── SYNC PHASE ──────────────────────────────────
  step('بدء التنفيذ — تحميل الـ script', st, 0);
  st.callStack.push('main()');
  step('push main() → Call Stack', st, 0);

  for (const action of actions) {
    if (action.type === 'async_def') continue;
    execAction(action);
  }

  // Pop main
  if (st.callStack[st.callStack.length - 1] === 'main()') {
    st.callStack.pop();
  }

  // Move setTimeout WebAPIs to macrotask display
  if (st.webAPIs.length > 0) {
    step('Sync code خلصت — timer(s) انتهت في libuv', st, -1);
    st.webAPIs = [];
    for (const t of _macroQ.filter(t => t.fromTimer)) {
      if (!st.macrotasks.includes(t.label)) st.macrotasks.push(t.label);
    }
    step('setTimeout callbacks → Macro Task Queue ⏰', st, -1,
      'setTimeout callback بتنتقل من Node API → Macro Task Queue');
  } else {
    step('main() خلصت — Call Stack فضى!', st, -1);
  }

  // ── EVENT LOOP ───────────────────────────────────
  drainAllQueues();

  step('🎉 التنفيذ اكتمل! Output: ' + st.console.join(' → '), st, -1);
  return out;

  /* ── execAction ─────────────────────────────────── */
  function execAction(action) {
    switch (action.type) {

      case 'log': {
        st.callStack.push('console.log("' + action.value + '")');
        step('push console.log("' + action.value + '")', st, action.lineIdx);
        st.console.push(action.value);
        st.callStack.pop();
        step('طباعة "' + action.value + '"', st, action.lineIdx);
        break;
      }

      case 'setTimeout': {
        st.callStack.push('setTimeout(cb, ' + action.delay + ')');
        step('push setTimeout(cb, ' + action.delay + ')', st, action.lineIdx);
        st.webAPIs.push('setTimeout · ' + action.delay + 'ms');
        step('setTimeout → Node API (libuv timers) ⏱', st, action.lineIdx,
          'setTimeout → يتسجل في libuv · مش بيتنفذ دلوقتي');
        st.callStack.pop();
        step('pop setTimeout ← Call Stack', st, action.lineIdx);
        _macroQ.push({ label: 'setTimeout cb', actions: action.body, lineIdx: action.lineIdx, fromTimer: true });
        break;
      }

      case 'setImmediate': {
        st.callStack.push('setImmediate(cb)');
        step('push setImmediate(cb)', st, action.lineIdx);
        st.macrotasks.push('setImmediate cb');
        step('setImmediate → Macro Queue (check phase)', st, action.lineIdx,
          'setImmediate → check phase · بعد poll مباشرةً');
        st.callStack.pop();
        _macroQ.push({ label: 'setImmediate cb', actions: action.body, lineIdx: action.lineIdx });
        break;
      }

      case 'nextTick': {
        st.callStack.push('process.nextTick(cb)');
        step('push process.nextTick(cb)', st, action.lineIdx);
        st.nextTick.push('nextTick cb');
        step('nextTick → nextTick Queue (P0) 🔵', st, action.lineIdx,
          'process.nextTick → أعلى أولوية حتى من Promises!');
        st.callStack.pop();
        _nextTickQ.push({ label: 'nextTick cb', actions: action.body, lineIdx: action.lineIdx });
        break;
      }

      case 'promise_chain': {
        if (!action.thens || action.thens.length === 0) break;
        const firstThen = action.thens[0];
        const label = firstThen.logValue !== null
          ? 'then → console.log("' + firstThen.logValue + '")'
          : 'then cb';
        st.callStack.push('Promise.resolve()');
        step('push Promise.resolve().then(...)', st, action.lineIdx);
        st.microtasks.push(label);
        step('Promise.then → Microtask Queue ⚡', st, action.lineIdx,
          'Promise callbacks → Microtask Queue (P1)');
        st.callStack.pop();
        step('pop Promise.resolve() ← Call Stack', st, action.lineIdx);
        _microQ.push({ label, actions: firstThen.actions, remainingThens: action.thens.slice(1), lineIdx: action.lineIdx });
        break;
      }

      case 'async_call': {
        const def = asyncDefs[action.name];
        if (!def) break;
        st.callStack.push(action.name + '()');
        step('استدعاء ' + action.name + '()', st, action.lineIdx);
        for (const a of (def.syncBefore || [])) execAction(a);
        step('await → ' + action.name + '() تتوقف وترجع للـ caller', st, def.awaitLineIdx,
          'await = بيحوّل باقي الـ function لـ microtask continuation');
        st.callStack.pop();
        const resumeLabel = action.name + '() resume';
        st.microtasks.push(resumeLabel);
        step(action.name + '() معلقة → continuation في Microtask Queue', st, action.lineIdx,
          'async/await continuation → Microtask Queue (P1)');
        _microQ.push({ label: resumeLabel, actions: def.syncAfter || [], lineIdx: def.awaitLineIdx });
        break;
      }
    }
  }

  /* ── drainAllQueues ──────────────────────────────── */
  function removeDisplay(arr, label) {
    const idx = arr.indexOf(label);
    if (idx !== -1) arr.splice(idx, 1);
  }

  function drainAllQueues() {
    let safety = 400;

    while ((_nextTickQ.length || _microQ.length || _macroQ.length) && safety-- > 0) {

      // P0: drain nextTick queue fully
      if (_nextTickQ.length) {
        st.elActive = 'nextTick';
        step('Event Loop → nextTick Queue (P0) أولاً!', st, -1,
          'nextTick لازم تفضى كلها قبل أي Promise');
        while (_nextTickQ.length) {
          const task = _nextTickQ.shift();
          removeDisplay(st.nextTick, task.label);
          st.callStack.push(task.label);
          step('pick من nextTick → "' + task.label + '"', st, task.lineIdx);
          for (const a of task.actions) execAction(a);
          st.callStack.pop();
          step('pop "' + task.label + '" ← Call Stack', st, task.lineIdx);
        }
        continue;
      }

      // P1: drain microtask queue fully (re-check nextTick between each)
      if (_microQ.length) {
        if (st.elActive !== 'micro') {
          st.elActive = 'micro';
          step('Event Loop → Microtask Queue (P1)', st, -1,
            'Microtask بتتفرغ كلها قبل أي Macro Task');
        }
        // Take ONE microtask, then re-loop to check nextTick first
        if (_nextTickQ.length) continue;
        const task = _microQ.shift();
        removeDisplay(st.microtasks, task.label);
        st.callStack.push(task.label);
        step('pick من Microtask Queue → "' + task.label + '"', st, task.lineIdx);
        for (const a of task.actions) execAction(a);

        // Schedule next .then() if chained
        if (task.remainingThens && task.remainingThens.length > 0) {
          const nextThen  = task.remainingThens[0];
          const nextLabel = nextThen.logValue !== null
            ? 'then → console.log("' + nextThen.logValue + '")'
            : 'then cb';
          st.microtasks.push(nextLabel);
          step('return → next .then() يروح Microtask Queue', st, task.lineIdx,
            'كل .then() بيتجدول كـ microtask بعد السابقة');
          _microQ.push({ label: nextLabel, actions: nextThen.actions, remainingThens: task.remainingThens.slice(1), lineIdx: task.lineIdx });
        }

        st.callStack.pop();
        step('pop "' + task.label + '" ← Call Stack', st, task.lineIdx);
        continue;
      }

      // P2: ONE macro task, then re-check P0+P1
      if (_macroQ.length) {
        st.elActive   = 'macro';
        st.libuvPhase = 'timers';
        step('Event Loop → Macro Task Queue (P2) · libuv timers phase', st, -1,
          'واحدة Macro Task لكل loop iteration · بعدها بيفحص nextTick + microtask تاني');
        const task = _macroQ.shift();
        removeDisplay(st.macrotasks, task.label);
        st.callStack.push(task.label);
        step('pick من Macro Queue → "' + task.label + '"', st, task.lineIdx);
        for (const a of task.actions) execAction(a);
        st.callStack.pop();
        st.elActive   = null;
        st.libuvPhase = null;
        step('pop "' + task.label + '" ← Call Stack', st, task.lineIdx);
        // loop continues: checks nextTick + micro before next macro
      }
    }
  }
}
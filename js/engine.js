// ══════════════════════════════════════════════════════
//  engine.js — Step Builder
//  Converts a known code snippet → array of state snapshots.
//
//  Each step: { desc, state, line, tooltip }
//  state shape:
//    callStack  : string[]
//    webAPIs    : string[]
//    nextTick   : string[]   ← NEW: process.nextTick queue
//    microtasks : string[]
//    macrotasks : string[]
//    console    : string[]
//    elActive   : 'cs'|'nextTick'|'micro'|'macro'|null
//    libuvPhase : 'timers'|'pending'|'idle'|'poll'|'check'|'close'|null
// ══════════════════════════════════════════════════════

function buildSteps(code) {
  const out = [];

  /* ── helpers ─────────────────────────────────────── */
  const clone = s => JSON.parse(JSON.stringify(s));

  function step(desc, state, line = -1, tooltip = null) {
    out.push({ desc, state: clone(state), line, tooltip });
  }

  const empty = () => ({
    callStack:  [],
    webAPIs:    [],
    nextTick:   [],
    microtasks: [],
    macrotasks: [],
    console:    [],
    elActive:   null,
    libuvPhase: null,
  });

  /* ── detect which example ────────────────────────── */
  const has = t => code.includes(t);

  const isEx1      = has('Start') && has('setTimeout') && has('Promise') && has('End') && !has('Sync 1');
  const isEx2      = has('async function fetchData');
  const isEx3      = has('Promise 1') && has('Promise 2') && !has('Sync 1') && !has('nextTick');
  const isEx4      = has('Sync 1');
  const isEx5      = has('process.nextTick');
  const isEx6      = has('setImmediate') && has('poll phase');

  /* ══════════════════════════════════════════════════
     EXAMPLE 1 — Promise vs setTimeout
  ══════════════════════════════════════════════════ */
  if (isEx1) {
    const st = empty();

    step('بدء التنفيذ — تحميل الـ script', st, 0);

    st.callStack.push('main()');
    step('push main() → Call Stack', st, 0);

    st.callStack.push('console.log("Start")');
    step('push console.log("Start")', st, 1);

    st.console.push('Start');
    step('تنفيذ → طباعة "Start"', st, 1);

    st.callStack.pop();
    step('pop console.log ← Call Stack', st, 1);

    st.callStack.push('setTimeout(cb, 0)');
    step('push setTimeout → Call Stack', st, 2);

    st.webAPIs.push('setTimeout · 0 ms');
    step('setTimeout → Node API (timer بيبدأ في libuv)', st, 2,
      'setTimeout → بيروح لـ libuv timers · مش بيتنفذ فوراً');

    st.callStack.pop();
    step('pop setTimeout ← Call Stack', st, 2);

    st.callStack.push('Promise.resolve().then(cb)');
    step('push Promise.resolve().then(cb)', st, 3);

    st.microtasks.push('Promise cb → console.log("Promise")');
    step('Promise.then → Microtask Queue مباشرةً ⚡', st, 3,
      'Promise callbacks → Microtask Queue (أولوية عالية جداً)');

    st.callStack.pop();
    step('pop Promise.resolve() ← Call Stack', st, 3);

    st.callStack.push('console.log("End")');
    step('push console.log("End")', st, 4);

    st.console.push('End');
    step('تنفيذ → طباعة "End"', st, 4);

    st.callStack.pop();
    st.callStack.pop(); // pop main
    step('pop main() — Call Stack فضى! Event Loop بيبدأ', st, 4);

    // Timer fires → moves to macrotask queue
    st.webAPIs = [];
    st.macrotasks.push('cb: console.log("setTimeout")');
    step('Timer انتهى في libuv → callback يروح Macro Task Queue', st, 2,
      'setTimeout → timers phase → Macro Task Queue');

    // Event Loop checks nextTick first (empty), then microtasks
    st.elActive = 'micro';
    step('Event Loop يفحص: Microtask Queue فيها حاجة؟ نعم!', st, 3,
      'Microtask queue بتتفرغ كلها قبل أي Macro Task');

    const mc = st.microtasks.shift();
    st.callStack.push(mc);
    step(`pick من Microtask → push callback في Call Stack`, st, 3);

    st.console.push('Promise');
    st.callStack.pop();
    step('تنفيذ Promise callback → طباعة "Promise"', st, 3);

    // Now macrotask — libuv timers phase
    st.elActive = 'macro';
    st.libuvPhase = 'timers';
    step('Microtask فضت → libuv timers phase', st, 2,
      'timers phase → بتنفذ setTimeout callbacks');

    const ma = st.macrotasks.shift();
    st.callStack.push(ma);
    step(`pick من timers phase → push callback`, st, 2);

    st.console.push('setTimeout');
    st.callStack.pop();
    st.elActive = null;
    st.libuvPhase = null;
    step('تنفيذ setTimeout callback → طباعة "setTimeout" ✅', st, 2);

    step('🎉 Output: Start → End → Promise → setTimeout', st, -1);

  /* ══════════════════════════════════════════════════
     EXAMPLE 2 — Async / Await
  ══════════════════════════════════════════════════ */
  } else if (isEx2) {
    const st = empty();

    step('بدء التنفيذ', st, 0);

    st.callStack.push('main()');
    st.callStack.push('console.log("Before")');
    step('push main() + console.log("Before")', st, 6);

    st.console.push('Before');
    st.callStack.pop();
    step('طباعة "Before"', st, 6);

    st.callStack.push('fetchData()');
    step('استدعاء fetchData() → تدخل Call Stack', st, 7);

    st.callStack.push('console.log("Fetching...")');
    step('push console.log("Fetching...") داخل fetchData', st, 2);

    st.console.push('Fetching...');
    st.callStack.pop();
    step('طباعة "Fetching..."', st, 2);

    step('await Promise.resolve() → fetchData بتتوقف وترجع للـ caller!', st, 3,
      'await = بيحول باقي الـ function لـ microtask');

    st.callStack.pop(); // fetchData suspends
    st.microtasks.push('fetchData resume · result = "Data!"');
    step('fetchData معلقة → continuation تروح Microtask Queue', st, 3,
      'async/await → microtask (أولوية عالية)');

    st.callStack.push('console.log("After")');
    step('main() بتكمل → push console.log("After")', st, 8);

    st.console.push('After');
    st.callStack.pop();
    step('طباعة "After"', st, 8);

    st.callStack.pop(); // main
    step('main() خلصت — Call Stack فضى', st, 8);

    st.elActive = 'micro';
    step('Event Loop → Microtask Queue فيها fetchData resume', st, 3);

    st.microtasks.shift();
    st.callStack.push('fetchData (resumed)');
    st.callStack.push('console.log(result)');
    step('استئناف fetchData من Microtask Queue', st, 3);

    st.console.push('Data!');
    st.callStack.pop();
    step('طباعة "Data!" ✅', st, 4);

    st.callStack.pop();
    st.elActive = null;
    step('🎉 Output: Before → Fetching... → After → Data!', st, -1);

  /* ══════════════════════════════════════════════════
     EXAMPLE 3 — Nested Promises
  ══════════════════════════════════════════════════ */
  } else if (isEx3) {
    const st = empty();

    step('بدء التنفيذ', st, 0);
    st.callStack.push('main()');

    st.callStack.push('Promise.resolve().then(cb1)');
    step('push Promise.resolve()', st, 1);

    st.microtasks.push('then cb1 → console.log("Promise 1")');
    step('Promise.then → Microtask Queue', st, 1,
      'Promise callbacks → Microtask Queue');

    st.callStack.pop();

    st.callStack.push('setTimeout(cb, 0)');
    step('push setTimeout', st, 6);

    st.webAPIs.push('setTimeout · 0 ms');
    step('setTimeout → Node API (libuv timers)', st, 6,
      'setTimeout → timers phase (lower priority)');

    st.callStack.pop();
    st.callStack.pop(); // main
    st.webAPIs = [];
    st.macrotasks.push('cb: console.log("Timeout")');
    step('Timer انتهى + Call Stack فضى → Macro Queue', st, 6);

    st.elActive = 'micro';
    step('Event Loop → Microtask Queue أول!', st, 2,
      'Microtask runs before Macro Task — دايمًا');

    st.microtasks.shift();
    st.callStack.push('then cb1');
    step('pick then cb1 → Call Stack', st, 2);

    st.console.push('Promise 1');
    st.microtasks.push('then cb2 → console.log("Promise 2")');
    step('طباعة "Promise 1" — return Promise يضيف cb2 لـ Microtask', st, 3,
      'كل microtask ممكن تضيف microtask تانية وتتنفذ كمان!');

    st.callStack.pop();

    step('Microtask Queue لسه فيها cb2 → ينفذ قبل Macro', st, 4);
    st.microtasks.shift();
    st.callStack.push('then cb2');
    step('pick then cb2 → Call Stack', st, 4);

    st.console.push('Promise 2');
    st.callStack.pop();
    step('طباعة "Promise 2"', st, 4);

    st.elActive = 'macro';
    st.libuvPhase = 'timers';
    step('Microtask فضت → libuv timers phase', st, 6);

    st.macrotasks.shift();
    st.callStack.push('cb: console.log("Timeout")');
    step('pick setTimeout callback → Call Stack', st, 6);

    st.console.push('Timeout');
    st.callStack.pop();
    st.elActive = null;
    st.libuvPhase = null;
    step('🎉 Output: Promise 1 → Promise 2 → Timeout', st, -1);

  /* ══════════════════════════════════════════════════
     EXAMPLE 4 — Mixed
  ══════════════════════════════════════════════════ */
  } else if (isEx4) {
    const st = empty();

    step('بدء التنفيذ — mixed example', st, 0);
    st.callStack.push('main()');

    st.callStack.push('console.log("Sync 1")');
    st.console.push('Sync 1');
    step('طباعة "Sync 1"', st, 1);
    st.callStack.pop();

    st.callStack.push('setTimeout(cb, 0)');
    st.webAPIs.push('setTimeout · 0 ms');
    step('setTimeout → Node API (libuv timers)', st, 2,
      'setTimeout → timers phase (lower priority)');
    st.callStack.pop();

    st.callStack.push('Promise.resolve().then(cb1).then(cb2)');
    st.microtasks.push('Micro: Promise 1');
    step('Promise.then → Microtask Queue', st, 6,
      'Promise → Microtask Queue (higher priority)');
    st.callStack.pop();

    st.callStack.push('console.log("Sync 2")');
    st.console.push('Sync 2');
    step('طباعة "Sync 2"', st, 9);
    st.callStack.pop();

    st.callStack.push('run()');
    step('استدعاء run()', st, 10);

    st.callStack.push('await Promise.resolve()');
    st.microtasks.push('run() resume');
    step('await → run() معلقة + continuation في Microtask', st, 11,
      'async/await → microtask continuation');
    st.callStack.pop();
    st.callStack.pop(); // run() suspends

    st.callStack.push('console.log("Sync 3")');
    st.console.push('Sync 3');
    step('طباعة "Sync 3"', st, 14);
    st.callStack.pop();
    st.callStack.pop(); // main

    st.webAPIs = [];
    st.macrotasks.push('Macro: setTimeout callback');
    step('Timer انتهى + Call Stack فضى', st, 2);

    st.elActive = 'micro';
    step('Event Loop → Microtask Queue أول!', st, 6,
      'Microtask runs before Macro Task — دايمًا');

    st.microtasks.shift();
    st.callStack.push('Micro: Promise 1');
    st.microtasks.push('Micro: Promise 2');
    st.console.push('Micro: Promise 1');
    step('تنفيذ Micro Promise 1 → طباعة + push cb2', st, 7);
    st.callStack.pop();

    // run() resume is next in microtask queue
    st.microtasks.shift(); // 'run() resume'
    st.callStack.push('run() resumed');
    step('Event Loop → run() resume (FIFO داخل Microtask Queue)', st, 11);
    st.console.push('Async/Await done');
    st.callStack.pop();
    step('طباعة "Async/Await done"', st, 12);

    step('Microtask Queue لسه فيها "Micro: Promise 2"', st, 7,
      'Queue لازم تفضى كلها قبل Macro');
    st.microtasks.shift();
    st.callStack.push('Micro: Promise 2');
    st.console.push('Micro: Promise 2');
    st.callStack.pop();
    step('طباعة "Micro: Promise 2"', st, 8);

    st.elActive = 'macro';
    st.libuvPhase = 'timers';
    step('Microtask فضت → libuv timers phase', st, 2);

    st.macrotasks.shift();
    st.callStack.push('Macro: setTimeout callback');
    st.console.push('Macro: setTimeout');
    st.callStack.pop();
    st.elActive = null;
    st.libuvPhase = null;
    step('🎉 طباعة "Macro: setTimeout" — Output بالترتيب الصح!', st, 3);

  /* ══════════════════════════════════════════════════
     EXAMPLE 5 — process.nextTick
  ══════════════════════════════════════════════════ */
  } else if (isEx5) {
    const st = empty();

    step('بدء التنفيذ — process.nextTick example', st, 0);
    st.callStack.push('main()');

    st.callStack.push('process.nextTick(cb1)');
    step('push process.nextTick(cb1)', st, 1);

    st.nextTick.push('cb1: console.log("nextTick 1")');
    step('nextTick(cb1) → nextTick Queue (أعلى أولوية، P0)', st, 1,
      'process.nextTick → nextTick Queue · أعلى حتى من Promises!');
    st.callStack.pop();

    st.callStack.push('Promise.resolve().then(cb1)');
    step('push Promise.resolve().then(cb1)', st, 2);

    st.microtasks.push('µTask: console.log("Promise 1")');
    step('Promise.then → Microtask Queue (P1)', st, 2,
      'Promise → Microtask Queue (أقل أولوية من nextTick)');
    st.callStack.pop();

    st.callStack.push('process.nextTick(cb2)');
    step('push process.nextTick(cb2)', st, 3);

    st.nextTick.push('cb2: console.log("nextTick 2")');
    step('nextTick(cb2) → nextTick Queue (P0)', st, 3,
      'nextTick callbacks كلها بتتجمع في Queue وبتتنفذ قبل Promises');
    st.callStack.pop();

    st.callStack.push('Promise.resolve().then(cb2)');
    step('push Promise.resolve().then(cb2)', st, 4);

    st.microtasks.push('µTask: console.log("Promise 2")');
    step('Promise.then → Microtask Queue (P1)', st, 4);
    st.callStack.pop();

    st.callStack.push('console.log("Sync")');
    step('push console.log("Sync")', st, 5);

    st.console.push('Sync');
    st.callStack.pop();
    step('طباعة "Sync"', st, 5);

    st.callStack.pop(); // main
    step('Call Stack فضى — Event Loop بيبدأ!', st, 5);

    // nextTick drains first
    st.elActive = 'nextTick';
    step('Event Loop يفحص nextTick Queue أولاً! (P0)', st, 1,
      'nextTick Queue لازم تفضى خالص قبل Promises');

    st.nextTick.shift();
    st.callStack.push('cb1: console.log("nextTick 1")');
    step('pick nextTick cb1 → Call Stack', st, 1);

    st.console.push('nextTick 1');
    st.callStack.pop();
    step('طباعة "nextTick 1"', st, 1);

    st.nextTick.shift();
    st.callStack.push('cb2: console.log("nextTick 2")');
    step('pick nextTick cb2 → Call Stack', st, 3);

    st.console.push('nextTick 2');
    st.callStack.pop();
    step('طباعة "nextTick 2"', st, 3);

    // nextTick empty → microtasks
    st.elActive = 'micro';
    step('nextTick Queue فضت → الآن Microtask Queue (P1)', st, 2,
      'Priority: nextTick (P0) → Microtask (P1) → Macro (P2)');

    st.microtasks.shift();
    st.callStack.push('µTask: console.log("Promise 1")');
    step('pick µTask → Call Stack', st, 2);

    st.console.push('Promise 1');
    st.callStack.pop();
    step('طباعة "Promise 1"', st, 2);

    st.microtasks.shift();
    st.callStack.push('µTask: console.log("Promise 2")');
    step('pick µTask → Call Stack', st, 4);

    st.console.push('Promise 2');
    st.callStack.pop();
    st.elActive = null;
    step('طباعة "Promise 2" ✅', st, 4);

    step('🎉 Output: Sync → nextTick 1 → nextTick 2 → Promise 1 → Promise 2', st, -1);

  /* ══════════════════════════════════════════════════
     EXAMPLE 6 — setImmediate in I/O (libuv phases)
  ══════════════════════════════════════════════════ */
  } else if (isEx6) {
    const st = empty();

    // We're simulating being inside an I/O callback
    st.libuvPhase = 'poll';
    st.callStack.push('I/O callback (poll phase)');
    step('نحن داخل I/O callback — poll phase في libuv', st, 0,
      'fs.readFile / network callback → بيتنفذ في poll phase');

    st.callStack.push('setTimeout(cb, 0)');
    step('push setTimeout', st, 3);

    // setTimeout inside I/O goes to macrotasks — but will run NEXT iteration's timers phase
    st.macrotasks.push('setTimeout cb · (timers phase · next iteration)');
    st.webAPIs.push('setTimeout · registered in libuv timers');
    step('setTimeout → macrotask (timers phase — لكن في الـ iteration الجاية!)', st, 3,
      'داخل I/O: setTimeout بيتنفذ في timers phase في الـ loop iteration الجاية');
    st.callStack.pop();

    st.callStack.push('setImmediate(cb)');
    step('push setImmediate', st, 4);

    // setImmediate goes to check phase — which comes RIGHT AFTER poll
    st.macrotasks.push('setImmediate cb · (check phase · this iteration)');
    step('setImmediate → check phase (بتيجي مباشرةً بعد poll!)', st, 4,
      'setImmediate → check phase · بتيجي بعد poll في نفس الـ iteration');
    st.callStack.pop();

    st.callStack.pop(); // I/O callback done
    step('I/O callback خلصت — Call Stack فضى', st, 4);

    // poll → check (setImmediate)
    st.libuvPhase = 'check';
    st.elActive = 'macro';
    step('libuv: poll phase خلصت → check phase (setImmediate) 🎯', st, 4,
      'check phase بتيجي بعد poll مباشرةً — لذلك setImmediate دايمًا أول');

    // Execute setImmediate
    const checkCb = st.macrotasks.find(t => t.includes('setImmediate'));
    st.macrotasks = st.macrotasks.filter(t => !t.includes('setImmediate'));
    st.callStack.push('setImmediate callback');
    step('check phase → تنفيذ setImmediate callback', st, 4);

    st.console.push('setImmediate');
    st.callStack.pop();
    step('طباعة "setImmediate"', st, 4);

    // close phase (nothing), then NEW ITERATION → timers
    st.libuvPhase = 'close';
    step('check phase خلصت → close phase (مفيش حاجة هنا)', st, 0);

    st.libuvPhase = 'timers';
    st.webAPIs = [];
    step('🔄 New Loop Iteration — timers phase الآن!', st, 3,
      'timers phase في الـ iteration الجديدة → setTimeout بيتنفذ دلوقتي');

    const timerCb = st.macrotasks.shift();
    st.callStack.push('setTimeout callback');
    step('timers phase → تنفيذ setTimeout callback', st, 3);

    st.console.push('setTimeout');
    st.callStack.pop();
    st.elActive = null;
    st.libuvPhase = null;
    step('طباعة "setTimeout" ✅', st, 3);

    step('🎉 Output: setImmediate → setTimeout\nلأن check phase جاية قبل timers في نفس الـ iteration', st, -1);

  /* ══════════════════════════════════════════════════
     GENERIC FALLBACK
  ══════════════════════════════════════════════════ */
  } else {
    const st = empty();
    const lines = code.split('\n');

    st.callStack.push('main()');
    step('بدء تنفيذ الكود', st, 0);

    lines.forEach((line, i) => {
      const trim = line.trim();
      if (!trim || trim.startsWith('//')) return;

      if (trim.startsWith('console.log')) {
        const m = trim.match(/console\.log\(["'`]?(.*?)["'`]?\)/);
        const val = m ? m[1] : '...';
        st.callStack.push(`console.log(${val})`);
        step('push console.log', st, i);
        st.console.push(val);
        st.callStack.pop();
        step(`طباعة "${val}"`, st, i);

      } else if (trim.includes('process.nextTick')) {
        st.nextTick.push('nextTick cb');
        step('process.nextTick → nextTick Queue (P0)', st, i,
          'process.nextTick → أعلى أولوية من Promises');

      } else if (trim.includes('setTimeout')) {
        st.callStack.push('setTimeout(cb)');
        st.webAPIs.push('setTimeout');
        step('setTimeout → Node API', st, i,
          'setTimeout → timers phase (lower priority)');
        st.callStack.pop();

      } else if (trim.includes('setImmediate')) {
        st.macrotasks.push('setImmediate cb');
        step('setImmediate → check phase', st, i,
          'setImmediate → check phase (بعد poll)');

      } else if (trim.includes('Promise')) {
        st.microtasks.push('Promise cb');
        step('Promise → Microtask Queue (P1)', st, i,
          'Promise callbacks → Microtask Queue');
      }
    });

    // drain queues in order
    st.callStack = [];
    step('Call Stack فضى — Event Loop بيبدأ', st, -1);

    if (st.nextTick.length) {
      st.elActive = 'nextTick';
      while (st.nextTick.length) {
        const t = st.nextTick.shift();
        st.callStack.push(t);
        step(`nextTick → "${t}"`, st, -1);
        st.callStack.pop();
        step('pop', st, -1);
      }
    }

    if (st.microtasks.length) {
      st.elActive = 'micro';
      while (st.microtasks.length) {
        const t = st.microtasks.shift();
        st.callStack.push(t);
        step(`µTask → "${t}"`, st, -1);
        st.callStack.pop();
        step('pop', st, -1);
      }
    }

    if (st.macrotasks.length) {
      st.elActive = 'macro';
      st.libuvPhase = 'timers';
      while (st.macrotasks.length) {
        const t = st.macrotasks.shift();
        st.callStack.push(t);
        step(`Macro → "${t}"`, st, -1);
        st.callStack.pop();
        step('pop', st, -1);
      }
    }

    st.elActive = null;
    st.libuvPhase = null;
    step('✅ التنفيذ اكتمل', st, -1);
  }

  return out;
}

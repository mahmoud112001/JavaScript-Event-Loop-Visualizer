# ⚡ Node.js Event Loop — Live Simulation

> تصوير بصري تفاعلي لـ Event Loop في Node.js مع libuv · للمطورين المبتدئين والمتوسطين

---

## 🗂️ معمارية المشروع (Project Architecture)

```
event-loop-viz/
├── index.html        ← هيكل HTML الكامل للتطبيق
├── styles.css        ← التصميم والألوان والـ layout
└── js/
    ├── examples.js   ← أمثلة الكود المعرّفة مسبقاً (6 أمثلة)
    ├── engine.js     ← محرك المحاكاة — يحوّل الكود لـ steps
    └── main.js       ← العرض (rendering) والتحكم والأحداث
```

### `index.html` — الهيكل

يحتوي على:
- **Header**: شعار التطبيق + badges
- **Left Panel**: محرر الكود + أزرار التحكم + Console
- **Right Panel** (ثلاثة صفوف):
  - **Row 1**: Call Stack | Node APIs / libuv
  - **Row 2**: nextTick Queue | Microtask Queue | Macro Task Queue
  - **Row 3**: libuv 6-Phase Pipeline (الجديد! 🆕)

---

### `styles.css` — التصميم

نظام ألوان واضح لكل component:

| Component         | اللون        | المعنى                  |
|-------------------|--------------|-------------------------|
| Call Stack        | 🟢 Green      | الكود بيشتغل هنا        |
| Node APIs / libuv | 🟣 Purple     | عمليات async خارجية     |
| nextTick Queue    | 🔵 Cyan      | أعلى أولوية (P0)         |
| Microtask Queue   | 🔵 Blue       | Promises (P1)           |
| Macro Task Queue  | 🟠 Orange     | setTimeout / I/O (P2)   |
| libuv Phases      | 🟡 Yellow     | مراحل الـ Event Loop      |

---

### `js/examples.js` — الأمثلة

```javascript
const EXAMPLES = {
  1: // Promise vs setTimeout — الأساسي
  2: // Async / Await — تحت الغطا
  3: // Nested Promises — تراكم الـ microtasks
  4: // Mixed — كل حاجة مع بعض
  5: // process.nextTick — أعلى من Promises!
  6: // setImmediate في I/O — libuv phases
};
```

كل مثال موضوع في `EXAMPLES[n]` كـ string — بيتحمّل في الـ editor عند الاختيار.

---

### `js/engine.js` — محرك المحاكاة

**أهم ملف في المشروع.**

**الوظيفة**: يأخذ كود JavaScript كـ string → يرجع مصفوفة من الـ steps.

```javascript
function buildSteps(code) → Step[]
```

كل `Step` شكله:
```javascript
{
  desc:    string,      // وصف ما بيحصل (بالعربي)
  line:    number,      // رقم السطر في الـ editor
  tooltip: string|null, // تلميح إضافي
  state: {
    callStack:  string[],  // محتوى الـ Call Stack
    webAPIs:    string[],  // العمليات في Node APIs
    nextTick:   string[],  // 🆕 process.nextTick queue
    microtasks: string[],  // Promise callbacks
    macrotasks: string[],  // setTimeout / setImmediate callbacks
    console:    string[],  // Output المطبوع
    elActive:   'cs'|'nextTick'|'micro'|'macro'|null,
    libuvPhase: 'timers'|'pending'|'idle'|'poll'|'check'|'close'|null, // 🆕
  }
}
```

**آلية الكشف عن المثال**: بيستخدم `code.includes()` للكشف عن أي مثال بيتنفذ، وبعدين بيبني الـ steps اليدوية المناسبة له. للكود الغير معروف → Generic Fallback.

---

### `js/main.js` — العرض والتحكم

المسؤوليات:
- **`applyState(st)`**: يحوّل state snapshot → تحديث كامل للـ UI
- **`executeStep()`**: ينفّذ step واحدة ويحدّث الـ UI
- **`startAuto()` / `stopAuto()`**: التشغيل الأوتوماتيكي
- **`reset()`**: يمسح كل حاجة ويرجع للحالة الابتدائية
- **Line Numbers**: يحسب ويعرض أرقام الأسطر ديناميكياً
- **Line Highlight**: يضيء السطر الحالي في الـ editor
- **Event Listeners**: Run / Step / Reset / Example Select / Speed Slider

---

## 🏗️ مكونات الـ Event Loop

### 1. 📚 Call Stack

- بيشتغل بنظام **LIFO** — Last In, First Out
- أحدث function بتيجي فوق (في الـ visualizer)
- لما بتخلص بتتشال (pop)
- لو مليان: **Stack Overflow** 💥

---

### 2. 🌐 Node APIs / libuv

دي مش جزء من V8 Engine — دي **libuv** (C library):

| في Node.js        | بيروح لـ     |
|-------------------|-------------|
| `setTimeout`      | timers phase |
| `setInterval`     | timers phase |
| `setImmediate`    | check phase  |
| `fs.readFile`     | poll phase   |
| `http.request`    | poll phase   |
| `child_process`   | poll phase   |
| `crypto`          | thread pool  |

---

### 3. 🔵 nextTick Queue — Priority 0

```javascript
process.nextTick(() => console.log("أنا P0 — الأول!"));
```

- **Node.js فقط** — مش موجودة في البراوزر
- بتتنفذ **قبل** أي Promise
- بتتنفذ **قبل** libuv phases
- حتى لو كل nextTick callback أضافت nextTick جديد، بيخلصها كلها أول

---

### 4. ⚡ Microtask Queue — Priority 1

```javascript
Promise.resolve().then(() => console.log("أنا P1"));
queueMicrotask(() => console.log("أنا كمان P1"));
```

- **Promises** (`.then`, `.catch`, `.finally`)
- **async/await** (هو في الأساس Promises)
- **`queueMicrotask()`**
- **`MutationObserver`** (في البراوزر)
- لازم تفضى كلها قبل ما libuv يكمل

---

### 5. ⏰ Macro Task Queue — Priority 2

```javascript
setTimeout(() => console.log("أنا P2"), 0);
```

- **`setTimeout`** / **`setInterval`**
- **`setImmediate`** (Node.js فقط — check phase)
- **I/O callbacks**
- حتى `setTimeout(fn, 0)` مش فوري! بيمشي على libuv

---

## 🔬 libuv — الـ 6 Phases

ده أهم جزء في Node.js Event Loop. libuv بتمشي في **6 مراحل متسلسلة**:

```
    ┌─────────────────────────────────────────────────┐
    │                                                 │
    │   ┌──────────┐     ┌──────────┐     ┌────────┐ │
    │   │  timers  │────▶│ pending  │────▶│  idle  │ │
    │   └──────────┘     └──────────┘     └────────┘ │
    │        │                                   │    │
    │        │  (بين كل مرحلة: nextTick + µTask) │    │
    │        ▼                                   ▼    │
    │   ┌──────────┐     ┌──────────┐     ┌────────┐ │
    │   │  close   │◀────│  check   │◀────│  poll  │ │
    │   └──────────┘     └──────────┘     └────────┘ │
    │        │                                        │
    └────────┼────────────────────────────────────────┘
             │
             ▼ (next iteration)
```

---

### Phase 1: ⏱ timers

**بيشتغل إيه؟** Callbacks من `setTimeout` و `setInterval` اللي انتهى وقتهم.

```javascript
setTimeout(() => console.log("أنا في timers phase!"), 100);
```

**ملاحظة مهمة**: الـ delay مش guaranteed! لو الـ poll phase شغال بعملية I/O طويلة، الـ timer ممكن يتأخر.

---

### Phase 2: 🔄 pending callbacks

**بيشتغل إيه؟** Callbacks من عمليات I/O اللي اتأجلت من الـ iteration السابقة.

- بيشمل: TCP errors, الـ `ECONNREFUSED` callbacks

---

### Phase 3: 💤 idle / prepare

**للاستخدام الداخلي فقط** (internal Node.js use).

- المطور العادي مش بيتعامل معاها مباشرة
- libuv بتستخدمها لأعمال صيانة داخلية

---

### Phase 4: 🌐 poll

**أهم phase في العادة!**

**بيعمل إيه؟**
1. بيحسب كام وقت يفضل ينتظر
2. بيجيب I/O events ويشغّل callbacks:
   - `fs.readFile()` callbacks
   - `http.createServer()` requests
   - Database query results
3. لو مفيش events → بيفضل منتظر (ده اللي بيخلي Node.js يرد على requests!)

**لو الـ poll queue خلصت:**
- لو في `setImmediate()` → بروح لـ check phase
- لو مفيش → بيفضل ينتظر لحد ما timer يخلص

---

### Phase 5: ✅ check

**بيشتغل إيه؟** `setImmediate` callbacks **فقط**.

```javascript
setImmediate(() => console.log("أنا في check phase!"));
```

**ليه مهم؟**
```javascript
// داخل I/O callback (poll phase):
fs.readFile("file.txt", () => {
  setTimeout(()    => console.log("setTimeout"),   0);
  setImmediate(() => console.log("setImmediate"));
  // دايمًا: setImmediate → setTimeout
  // لأن check phase بتيجي قبل timers في الـ iteration الجاية
});
```

---

### Phase 6: 🚪 close callbacks

**بيشتغل إيه؟** Callbacks من الأحداث اللي بيتبعتلها `close`:

```javascript
socket.on('close', () => console.log("Connection closed"));
server.on('close', () => console.log("Server stopped"));
```

---

### بين كل مرحلة:

**لازم تحصل الحاجة دي:**

```
Phase N → [nextTick Queue يتفرغ] → [Microtask Queue تتفرغ] → Phase N+1
```

يعني:
```javascript
// process.nextTick + Promises بيتنفذوا بين كل phase وبعضها
// مش بس بعد ما الـ Call Stack يفضى
```

---

## 🎯 أولويات التنفيذ الكاملة

```
Priority 0 ──► process.nextTick()          ← Node.js فقط
               ↓ لما تفضى
Priority 1 ──► Microtask Queue             ← Promises / async-await / queueMicrotask
               ↓ لما تفضى
Priority 2 ──► libuv Phase                 ← طبقاً للـ phase الحالية
               ↓ بعد كل phase
               [يرجع P0 + P1 تاني!]
```

### مثال شامل:

```javascript
process.nextTick(() => console.log("1 - nextTick"));   // P0
Promise.resolve().then(() => console.log("2 - Promise")); // P1
setTimeout(() => console.log("3 - setTimeout"), 0);    // P2 · timers phase
console.log("0 - Sync");

// Output:
// 0 - Sync        ← Call Stack
// 1 - nextTick    ← P0: nextTick queue
// 2 - Promise     ← P1: microtask queue
// 3 - setTimeout  ← P2: libuv timers phase
```

---

## 🚀 تشغيل المشروع

```bash
# افتح index.html مباشرة في البراوزر
open index.html

# أو بـ VS Code Live Server
code .
```

لا يحتاج build tools أو npm install — HTML/CSS/JS خالص.

---

## 🎮 كيف تستخدم الـ Visualizer

| الزر     | الوظيفة                              |
|----------|--------------------------------------|
| ▶ Run    | تشغيل أوتوماتيكي (اضغط تاني للـ Pause) |
| Step     | خطوة واحدة يدوياً                    |
| Reset    | مسح كل حاجة والبدء من الأول          |
| Speed    | تحكم في سرعة التنفيذ (1 بطيء → 5 سريع)|

### الأمثلة المتاحة

| # | المثال                     | يعلّم إيه                              |
|---|----------------------------|-----------------------------------------|
| 1 | Promise vs setTimeout      | أولوية Microtask على Macro Task         |
| 2 | Async / Await              | إزاي await بيشتغل تحت الغطا            |
| 3 | Nested Promises            | تراكم الـ microtasks وتأثيره           |
| 4 | Mixed — الكل               | مثال شامل لكل الحالات                  |
| 5 | process.nextTick           | الـ P0 — أعلى أولوية من Promises       |
| 6 | setImmediate في I/O        | مراحل libuv وليه setImmediate أول      |

---

## 🎨 تفاصيل التصميم

- **Background**: `#080B12` — dark navy مع grid texture
- **Fonts**: `JetBrains Mono` (كود + labels) · `Syne` (titles) · `Cairo` (عربي)
- **Color System**: كل queue ليها لون neon مميز (see styles.css `:root`)
- **libuv Strip**: حصص 28% من الـ right panel — bottom row
- **Responsive**: Stacks vertically على الشاشات الصغيرة (<900px)

---

## 📚 مصادر للتعمق أكتر

- [Node.js Event Loop — الـ Docs الرسمية](https://nodejs.org/en/docs/guides/event-loop-timers-and-nexttick)
- [libuv Documentation](https://libuv.org)
- [Jake Archibald: Tasks, microtasks, queues and schedules](https://jakearchibald.com/2015/tasks-microtasks-queues-and-schedules/)
- [Philip Roberts: What the heck is the event loop?](https://www.youtube.com/watch?v=8aGhZQkoFbQ)
- [Node.js Event Loop Best Practices](https://nodejs.org/en/learn/asynchronous-work/event-loop-timers-and-nexttick)

---

> صُنع لمطوري Node.js — تعلّم بالتجربة والمشاهدة 🚀

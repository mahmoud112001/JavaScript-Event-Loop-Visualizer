// ══════════════════════════════════════════════════════
//  examples.js — Code snippets shown in the editor
// ══════════════════════════════════════════════════════

const EXAMPLES = {

  // Example 1: Classic Promise vs setTimeout priority
  1: `console.log("Start");
setTimeout(() => console.log("setTimeout"), 0);
Promise.resolve().then(() => console.log("Promise"));
console.log("End");`,

  // Example 2: Async / Await under the hood
  2: `async function fetchData() {
  console.log("Fetching...");
  await Promise.resolve();
  console.log("Data!");
}
console.log("Before");
fetchData();
console.log("After");`,

  // Example 3: Nested Promises chain
  3: `Promise.resolve()
  .then(() => {
    console.log("Promise 1");
    return Promise.resolve();
  })
  .then(() => console.log("Promise 2"));
setTimeout(() => console.log("Timeout"), 0);`,

  // Example 4: Full mixed example
  4: `console.log("Sync 1");
setTimeout(() => {
  console.log("Macro: setTimeout");
}, 0);
Promise.resolve()
  .then(() => console.log("Micro: Promise 1"))
  .then(() => console.log("Micro: Promise 2"));
console.log("Sync 2");
async function run() {
  await Promise.resolve();
  console.log("Async/Await done");
}
run();
console.log("Sync 3");`,

  // Example 5: process.nextTick — highest priority
  5: `// process.nextTick runs BEFORE Promises
process.nextTick(() => console.log("nextTick 1"));
Promise.resolve().then(() => console.log("Promise 1"));
process.nextTick(() => console.log("nextTick 2"));
Promise.resolve().then(() => console.log("Promise 2"));
console.log("Sync");
// Output: Sync → nextTick 1 → nextTick 2 → Promise 1 → Promise 2`,

  // Example 6: setImmediate vs setTimeout inside I/O
  6: `// Inside an I/O callback (poll phase):
// setImmediate ALWAYS before setTimeout here
// لأن check phase بتيجي بعد poll مباشرةً
setTimeout(() => console.log("setTimeout"), 0);
setImmediate(() => console.log("setImmediate"));
// Output: setImmediate → setTimeout`,
};
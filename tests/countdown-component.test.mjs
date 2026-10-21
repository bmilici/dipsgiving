import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import {
  EVENT_START_ISO,
  EVENT_START_TIMESTAMP,
  getCountdownParts,
} from "../src/lib/eventSchedule.ts";

// Run the actual component and its effect in a closed VM. The only permitted
// imports are React hooks, JSX nodes, and the pure local schedule helper.
// Neither Firebase nor any browser/network API is reachable from these tests.
function countdownHarness(options = {}) {
  const slots = [];
  const pendingEffects = [];
  const intervals = new Map();
  const intervalDelays = [];
  let cursor = 0;
  let now = options.now ?? EVENT_START_TIMESTAMP - 65_000;
  let nextInterval = 0;
  let calculations = 0;
  const react = {
    useState(initial) {
      const index = cursor++;
      slots[index] ??= { value: initial };
      return [slots[index].value, (next) => { slots[index].value = next; }];
    },
    useEffect(effect, dependencies) {
      const index = cursor++;
      const previous = slots[index];
      if (previous && dependencies.every((value, i) => Object.is(value, previous.dependencies[i]))) return;
      const slot = { dependencies, cleanup: undefined };
      slots[index] = slot;
      pendingEffects.push(() => {
        previous?.cleanup?.();
        slot.cleanup = effect();
      });
    },
  };
  const element = (type, props, key) => ({ type, props: props ?? {}, key });
  const modules = {
    react,
    "react/jsx-runtime": { jsx: element, jsxs: element, Fragment: "fragment" },
    "@/lib/eventSchedule": {
      EVENT_START_ISO,
      getCountdownParts(timestamp) {
        calculations++;
        return (options.calculate ?? getCountdownParts)(timestamp);
      },
    },
  };
  const file = "src/components/EventCountdown.tsx";
  const source = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    fileName: file,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
  }).outputText;
  const exported = {};
  vm.runInNewContext(compiled, {
    exports: exported,
    require(name) {
      assert.ok(Object.hasOwn(modules, name), `Unmocked import blocked: ${name}`);
      return modules[name];
    },
    Date: { now: () => now },
    window: {
      setInterval(callback, delay) {
        if (options.failScheduling) throw new Error("Timer unavailable");
        intervalDelays.push(delay);
        intervals.set(++nextInterval, callback);
        return nextInterval;
      },
      clearInterval(id) { intervals.delete(id); },
    },
  }, { filename: file, timeout: 2_000 });

  return {
    get calculations() { return calculations; },
    get intervalCount() { return intervals.size; },
    intervalDelays,
    render() {
      cursor = 0;
      return exported.default();
    },
    flushEffects() {
      while (pendingEffects.length) pendingEffects.shift()();
    },
    tick(timestamp) {
      now = timestamp;
      for (const callback of [...intervals.values()]) callback();
    },
    unmount() {
      for (const slot of slots) slot.cleanup?.();
    },
  };
}

function nodes(tree, predicate) {
  const result = [];
  function visit(node) {
    if (Array.isArray(node)) return node.forEach(visit);
    if (!node || typeof node !== "object" || !node.props) return;
    if (predicate(node)) result.push(node);
    visit(node.props.children);
  }
  visit(tree);
  return result;
}

function content(tree) {
  if (Array.isArray(tree)) return tree.map(content).join("");
  if (tree == null || typeof tree === "boolean") return "";
  return typeof tree === "object" ? content(tree.props?.children) : String(tree);
}

const timer = (tree) => nodes(tree, (node) => node.props.role === "timer")[0];
const startAnnouncement = (tree) => nodes(tree, (node) => node.props["aria-live"] === "polite")[0];

function assertFallback(tree) {
  assert.match(content(tree), /December 5, 2026/);
  assert.match(content(tree), /4:00 PM Eastern Time/);
  assert.doesNotMatch(content(tree), /NaN|–|Loading countdown/);
  assert.equal(timer(tree), undefined);
  const date = nodes(tree, (node) => node.type === "time")[0];
  assert.equal(date.props.dateTime, EVENT_START_ISO);
}

test("server and first client render share a useful dated fallback before effects run", () => {
  const server = countdownHarness({ now: EVENT_START_TIMESTAMP - 86_400_000 });
  const client = countdownHarness({ now: EVENT_START_TIMESTAMP - 1 });
  const initial = server.render();
  assertFallback(initial);
  assert.equal(content(initial), content(client.render()));
  assert.equal(server.calculations, 0);
  assert.equal(client.calculations, 0);
  assert.equal(client.intervalCount, 0);
});

test("successful initialization replaces the fallback immediately and schedules one-second updates", () => {
  const countdown = countdownHarness();
  countdown.render();
  countdown.flushEffects();
  const tree = countdown.render();
  assert.equal(countdown.calculations, 1);
  assert.equal(countdown.intervalCount, 1);
  assert.deepEqual(countdown.intervalDelays, [1_000]);
  assert.equal(timer(tree).props["aria-label"], "0 days, 0 hours, 1 minutes, 5 seconds until Dipsgiving");
  const tiles = Array.from(timer(tree).props.children);
  assert.deepEqual(tiles.map((tile) => tile.key), ["days", "hours", "minutes", "seconds"]);
  assert.deepEqual(tiles.map(content), ["00days", "00hours", "01minutes", "05seconds"]);
  assert.equal(timer(tree).props["aria-live"], "off");
  assert.equal(content(startAnnouncement(tree)), "");
  // A regular render does not initialize a second timer.
  countdown.flushEffects();
  assert.equal(countdown.intervalCount, 1);
  assert.equal(countdown.calculations, 1);
});

test("ticks use the current clock, reach zero exactly, and stop without negative output", () => {
  const countdown = countdownHarness({ now: EVENT_START_TIMESTAMP - 2_000 });
  countdown.render();
  countdown.flushEffects();
  countdown.tick(EVENT_START_TIMESTAMP - 1_000);
  let tree = countdown.render();
  assert.match(timer(tree).props["aria-label"], /1 seconds until/);
  assert.equal(content(startAnnouncement(tree)), "");
  countdown.tick(EVENT_START_TIMESTAMP);
  tree = countdown.render();
  assert.equal(timer(tree), undefined);
  assert.match(content(tree), /LET THE DIPPING BEGIN!/);
  assert.equal(content(startAnnouncement(tree)), "LET THE DIPPING BEGIN!");
  assert.equal(countdown.intervalCount, 0);
  const calculationsAtStart = countdown.calculations;
  countdown.tick(EVENT_START_TIMESTAMP + 86_400_000);
  assert.equal(countdown.calculations, calculationsAtStart);
  assert.doesNotMatch(content(countdown.render()), /-\d/);
});

test("an event that already started initializes directly without creating an interval", () => {
  const countdown = countdownHarness({ now: EVENT_START_TIMESTAMP + 60_000 });
  countdown.render();
  countdown.flushEffects();
  assert.match(content(countdown.render()), /LET THE DIPPING BEGIN!/);
  assert.equal(countdown.intervalCount, 0);
  assert.deepEqual(countdown.intervalDelays, []);
});

test("an invalid initial clock keeps the event fallback and never starts an interval", () => {
  for (const now of [NaN, Infinity, -Infinity]) {
    const countdown = countdownHarness({ now });
    countdown.render();
    countdown.flushEffects();
    assertFallback(countdown.render());
    assert.equal(countdown.intervalCount, 0);
    assert.deepEqual(countdown.intervalDelays, []);
  }
});

test("a calculation failure during a tick clears the active interval and restores the fallback", () => {
  let fail = false;
  const countdown = countdownHarness({ calculate(now) {
    if (fail) throw new Error("Clock unavailable");
    return getCountdownParts(now);
  } });
  countdown.render();
  countdown.flushEffects();
  assert.equal(countdown.intervalCount, 1);
  fail = true;
  countdown.tick(EVENT_START_TIMESTAMP - 30_000);
  assertFallback(countdown.render());
  assert.equal(countdown.intervalCount, 0);
  const calculationsAtFailure = countdown.calculations;
  countdown.tick(EVENT_START_TIMESTAMP - 20_000);
  assert.equal(countdown.calculations, calculationsAtFailure);
});

test("a timer setup failure leaves useful event information visible", () => {
  const countdown = countdownHarness({ failScheduling: true });
  countdown.render();
  countdown.flushEffects();
  assertFallback(countdown.render());
  assert.equal(countdown.intervalCount, 0);
});

test("unmount clears the timer and prevents subsequent updates", () => {
  const countdown = countdownHarness();
  countdown.render();
  countdown.flushEffects();
  assert.equal(countdown.intervalCount, 1);
  countdown.unmount();
  assert.equal(countdown.intervalCount, 0);
  const calculationsAtUnmount = countdown.calculations;
  countdown.tick(EVENT_START_TIMESTAMP);
  assert.equal(countdown.calculations, calculationsAtUnmount);
  countdown.unmount();
  assert.equal(countdown.intervalCount, 0);
});

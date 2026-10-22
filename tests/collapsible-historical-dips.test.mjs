import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";
import { createAnimationClock } from "./helpers/animation-clock.mjs";

const element = (type, props, key) => ({ type, props: props ?? {}, key });
function nodes(tree, predicate) {
  const found = [];
  function visit(node) {
    if (Array.isArray(node)) return node.forEach(visit);
    if (!node || typeof node !== "object") return;
    if (predicate(node)) found.push(node);
    visit(node.props?.children);
  }
  visit(tree); return found;
}
const text = node => Array.isArray(node) ? node.map(text).join("") : node == null || typeof node === "boolean" ? "" : typeof node === "object" ? text(node.props?.children) : String(node);
const button = tree => nodes(tree, node => node.type === "button")[0];
const panel = tree => nodes(tree, node => node.props?.role === "region")[0];
const child = element("ul", { className: "grid gap-4 sm:grid-cols-2 lg:grid-cols-3", children: [element("li", { children: "Original Dip — Original Chef — Original Notes" }), element("li", { children: "Another Original Dip" })] });

function harness(options = {}) {
  const clock = createAnimationClock(options);
  const hooks = [];
  let cursor = 0, effects = [];
  const react = {
    useState(initial) {
      const index = cursor++;
      if (!(index in hooks)) hooks[index] = initial;
      return [hooks[index], next => { hooks[index] = typeof next === "function" ? next(hooks[index]) : next; }];
    },
    useEffect(effect, deps) {
      const index = cursor++, previous = hooks[index];
      if (previous && deps.every((dep, i) => Object.is(dep, previous.deps[i]))) return;
      hooks[index] = { deps, cleanup: previous?.cleanup };
      effects.push(() => { previous?.cleanup?.(); hooks[index].cleanup = effect(); });
    },
  };
  const exports = {};
  const code = ts.transpileModule(readFileSync(new URL("../src/components/CollapsibleHistoricalDips.tsx", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(code, { exports, window: clock.window, require(name) {
    assert(["react", "react/jsx-runtime"].includes(name), `Unexpected dependency blocked: ${name}`);
    return name === "react" ? react : { jsx: element, jsxs: element };
  } });
  return {
    clock,
    render(props = {}) { cursor = 0; effects = []; return exports.default({ id: "contenders-2025", children: child, ...props }); },
    commit() { const pending = effects; effects = []; pending.forEach(effect => effect()); },
    unmount() { hooks.forEach(hook => hook?.cleanup?.()); },
  };
}
function open(page, tree) {
  button(tree).props.onClick(); tree = page.render(); page.commit();
  page.clock.flushFrames(); page.clock.flushFrames();
  tree = page.render(); page.commit(); return tree;
}

test("the native toggle starts closed with no archived descendants in the DOM or reading/tab order", () => {
  const page = harness(); const tree = page.render(); page.commit();
  const control = button(tree), region = panel(tree);
  assert.equal(control.props.type, "button");
  assert.equal(control.props["aria-expanded"], false);
  assert.equal(control.props["aria-controls"], region.props.id);
  assert.equal(region.props["aria-labelledby"], control.props.id);
  assert.equal(text(control), "View the Victims of the 2025 Voting Disaster");
  assert.equal(region.props.hidden, true);
  assert.equal(region.props.inert, true);
  assert.equal(region.props["aria-hidden"], true);
  assert.equal(nodes(tree, node => node.type === "li" || node.type === "ul").length, 0);
  assert(!text(tree).includes("Original Dip"));
  assert.match(control.props.className, /min-h-16.*focus-visible:outline.*sm:min-h-12/);
  assert.equal(control.props.onKeyDown, undefined, "Enter and Space use built-in button activation");
  assert.equal(nodes(control, node => node.type === "svg")[0].props["aria-hidden"], "true");
});

test("opening paints a collapsed frame before smoothly exposing the unchanged full archive grid", () => {
  const page = harness(); let tree = page.render(); page.commit();
  const controls = button(tree).props["aria-controls"];
  button(tree).props.onClick(); tree = page.render(); page.commit();
  assert.equal(button(tree).props["aria-expanded"], true);
  assert.equal(text(button(tree)), "Hide the 2025 Dip Lineup");
  assert.equal(panel(tree).props.hidden, false);
  assert.equal(panel(tree).props.inert, true);
  assert.match(panel(tree).props.className, /grid-rows-\[0fr\].*opacity-0/);
  page.clock.flushFrames();
  assert.match(panel(page.render()).props.className, /grid-rows-\[0fr\]/);
  page.clock.flushFrames(); tree = page.render(); page.commit();
  assert.equal(button(tree).props["aria-controls"], controls);
  assert.equal(panel(tree).props.inert, false);
  assert.equal(panel(tree).props["aria-hidden"], false);
  assert.match(panel(tree).props.className, /grid-rows-\[1fr\].*opacity-100/);
  assert.match(nodes(button(tree), node => node.type === "svg")[0].props.className, /rotate-180/);
  assert.equal(text(nodes(tree, node => node.type === "ul")[0]), text(child));
  assert.equal(nodes(tree, node => node.type === "ul")[0], child, "The wrapper preserves the original grid element and entries");
});

test("collapse immediately removes reading/focus access, then unmounts the archive after its own transition", () => {
  const page = harness(); let tree = page.render(); page.commit(); tree = open(page, tree);
  button(tree).props.onClick(); tree = page.render(); page.commit();
  assert.equal(button(tree).props["aria-expanded"], false);
  assert.equal(panel(tree).props.inert, true);
  assert.equal(panel(tree).props["aria-hidden"], true);
  assert.equal(nodes(tree, node => node.type === "li").length, 2, "Entries stay mounted only while the closing animation runs");
  const target = {};
  panel(tree).props.onTransitionEnd({ target: {}, currentTarget: target });
  assert.equal(nodes(page.render(), node => node.type === "li").length, 2, "A child transition cannot truncate the panel animation");
  panel(tree).props.onTransitionEnd({ target, currentTarget: target });
  tree = page.render(); page.commit();
  assert.equal(panel(tree).props.hidden, true);
  assert.equal(nodes(tree, node => node.type === "li").length, 0);
  assert.equal(text(button(tree)), "View the Victims of the 2025 Voting Disaster");
  assert.equal(page.clock.timers, 0);
});

test("a missing transition event still unmounts closing records and cancels the fallback timer", () => {
  const page = harness(); let tree = page.render(); page.commit(); tree = open(page, tree);
  button(tree).props.onClick(); tree = page.render(); page.commit();
  assert.equal(page.clock.timers, 1);
  page.clock.flushTimers(); tree = page.render(); page.commit();
  assert.equal(panel(tree).props.hidden, true);
  assert.equal(nodes(tree, node => node.type === "li").length, 0);
});

test("rapid reopen cancels old frames and closing timers, and unmount cancels all pending work", () => {
  const page = harness(); let tree = page.render(); page.commit();
  button(tree).props.onClick(); tree = page.render(); page.commit();
  page.clock.flushFrames(); assert.equal(page.clock.frames, 1);
  button(tree).props.onClick(); tree = page.render(); page.commit();
  assert.equal(page.clock.frames, 0);
  assert.equal(page.clock.timers, 1);
  button(tree).props.onClick(); tree = page.render(); page.commit();
  assert.equal(page.clock.timers, 0);
  page.clock.flushTimers(); page.clock.flushFrames(); page.clock.flushFrames();
  tree = page.render(); page.commit();
  assert.equal(button(tree).props["aria-expanded"], true);
  assert.equal(panel(tree).props.inert, false);
  button(tree).props.onClick(); page.render(); page.commit();
  page.unmount(); assert.equal(page.clock.timers, 0);
  const opening = harness(); let initial = opening.render(); opening.commit();
  button(initial).props.onClick(); initial = opening.render(); opening.commit();
  opening.clock.flushFrames(); opening.unmount();
  assert.equal(opening.clock.frames, 0);
});

test("reduced motion opens and closes without animation frames or delayed removal", () => {
  const page = harness({ reducedMotion: true }); let tree = page.render(); page.commit();
  button(tree).props.onClick(); page.render(); page.commit();
  tree = page.render(); page.commit();
  assert.equal(panel(tree).props.inert, false);
  assert.equal(page.clock.frames, 0);
  assert.match(panel(tree).props.className, /motion-reduce:transition-none/);
  button(tree).props.onClick(); page.render(); page.commit();
  tree = page.render(); page.commit();
  assert.equal(panel(tree).props.hidden, true);
  assert.equal(nodes(tree, node => node.type === "li").length, 0);
  assert.equal(page.clock.timers, 0);
});

test("reusable disclosures keep caller-provided IDs and labels independent", () => {
  const first = harness(), second = harness();
  const a = first.render({ id: "archive-a", showLabel: "Show A", hideLabel: "Hide A" });
  const b = second.render({ id: "archive-b" });
  assert.equal(text(button(a)), "Show A");
  assert.notEqual(panel(a).props.id, panel(b).props.id);
  assert.equal(button(a).props["aria-controls"], "archive-a-panel");
  assert.equal(button(b).props["aria-controls"], "archive-b-panel");
});

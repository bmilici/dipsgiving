import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

function compile(file) {
  return ts.transpileModule(readFileSync(new URL(`../${file}`, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
}

// Execute the actual component and actual path helper. Keyed hook state models
// React remounting the inner image when its source changes; no browser/network
// or real image request is available to this test.
function harness(testing = false) {
  const instances = new Map();
  const active = new Set();
  let current;
  let cursor = 0;
  const element = (type, props, key) => {
    if (typeof type !== "function") return { type, props: props ?? {}, key };
    assert.ok(key, "The stateful image must be keyed by its resolved source");
    active.add(key);
    if (!instances.has(key)) instances.set(key, []);
    current = instances.get(key); cursor = 0;
    return type(props ?? {});
  };
  const pathHelper = {};
  vm.runInNewContext(compile("src/lib/testingMode.ts"), { exports: pathHelper, process: { env: { NEXT_PUBLIC_DESIGN_PREVIEW: String(testing) } } });
  const imports = {
    react: { useState(initial) {
      const state = current, index = cursor++;
      if (!(index in state)) state[index] = initial;
      return [state[index], value => { state[index] = typeof value === "function" ? value(state[index]) : value; }];
    } },
    "react/jsx-runtime": { jsx: element, jsxs: element },
    "@/lib/testingMode": pathHelper,
  };
  const component = {};
  vm.runInNewContext(compile("src/components/ChampionPhoto.tsx"), {
    exports: component,
    require(name) { assert.ok(Object.hasOwn(imports, name), `Unmocked dependency blocked: ${name}`); return imports[name]; },
  }, { timeout: 2_000 });
  return {
    render(props) {
      active.clear();
      const tree = component.default(props);
      for (const key of instances.keys()) if (!active.has(key)) instances.delete(key);
      return tree;
    },
  };
}

test("the nonexistent 2024 year photo produces no image, wrapper or reserved layout space", () => {
  for (const testing of [false, true]) {
    const photo = harness(testing);
    for (const src of [undefined, null, "", "/winners/2024.jpg", "/testing/winners/2024.jpg"]) {
      assert.equal(photo.render({ src, alt: "Dipsgiving 2024 champions", variant: "year" }), null);
    }
  }
});

test("only the known third-place historical filename is corrected and testing prefixes are added once", () => {
  assert.equal(existsSync(new URL("../public/winners/2024-3rd.jpeg", import.meta.url)), true);
  assert.equal(existsSync(new URL("../public/winners/2024-3rd.jpg", import.meta.url)), false);
  for (const testing of [false, true]) {
    const photo = harness(testing);
    const prefix = testing ? "/testing" : "";
    assert.equal(photo.render({ src: "/winners/2024-3rd.jpg", alt: "Third-place dip" }).props.src, `${prefix}/winners/2024-3rd.jpeg`);
    assert.equal(photo.render({ src: "/testing/winners/2024-3rd.jpg", alt: "Third-place dip" }).props.src, "/testing/winners/2024-3rd.jpeg");
    assert.equal(photo.render({ src: "/winners/2024-1st.jpeg", alt: "First-place dip" }).props.src, `${prefix}/winners/2024-1st.jpeg`);
    assert.equal(photo.render({ src: "/winners/2024-2nd.jpeg", alt: "Second-place dip" }).props.src, `${prefix}/winners/2024-2nd.jpeg`);
    for (const src of ["https://photos.example/winners/2024-3rd.jpg", "//photos.example/winners/2024.jpg"]) assert.equal(photo.render({ src, alt: "External photo" }).props.src, src);
    assert.equal(photo.render({ src: "/winners/another-photo.jpg", alt: "Other winner" }).props.src, `${prefix}/winners/another-photo.jpg`);
  }
});

test("optional photos retain their descriptive alt, dimensions, lazy loading and original visual styles", () => {
  const photo = harness();
  const podium = photo.render({ src: "/winners/2024-1st.jpeg", alt: "Cowboy Dip, 1st Place, created by Kim and Brian" });
  assert.equal(podium.type, "img");
  assert.equal(podium.props.alt, "Cowboy Dip, 1st Place, created by Kim and Brian");
  assert.equal(podium.props.width, 320);
  assert.equal(podium.props.height, 200);
  assert.equal(podium.props.loading, "lazy");
  assert.equal(podium.props.decoding, "async");
  assert.equal(podium.props.className, "mx-auto mb-5 h-40 w-full max-w-80 rounded-xl object-contain");
  const year = photo.render({ src: "/winners/event-photo.jpeg", alt: "The event champions", variant: "year" });
  assert.equal(year.props.width, 640);
  assert.equal(year.props.height, 400);
  assert.equal(year.props.className, "mx-auto max-h-64 w-full rounded-xl object-contain");
});

test("a failed image disappears entirely, and changing the source permits a fresh image load", () => {
  for (const variant of ["podium", "year"]) {
    const photo = harness();
    const initial = { src: "/winners/unavailable.jpg", alt: "Unavailable optional photo", variant };
    const image = photo.render(initial);
    image.props.onError();
    assert.equal(photo.render(initial), null, "No broken img, empty wrapper, height or margins remain");
    assert.equal(photo.render(initial), null, "A rerender must not continuously retry the same failed image");
    const replacement = photo.render({ ...initial, src: "/winners/new-photo.jpeg", alt: "Updated photo" });
    assert.equal(replacement.type, "img");
    assert.equal(replacement.props.src, "/winners/new-photo.jpeg");
    assert.equal(replacement.props.alt, "Updated photo");
    assert.equal(photo.render(initial).type, "img", "Returning to an earlier source after a change is a new load attempt");
  }
});

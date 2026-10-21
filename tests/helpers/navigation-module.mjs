import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

// Real shared destinations, evaluated without the application or Firebase.
const source = readFileSync(new URL("../../src/lib/siteNavigation.ts", import.meta.url), "utf8");
export const navigationModule = {};
vm.runInNewContext(ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { exports: navigationModule }, { timeout: 2_000 });

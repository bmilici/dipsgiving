import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import path from "node:path";
import ts from "typescript";

const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, "..");

function load(file, cache = new Map(), realAdmin = false) {
  const filename = path.join(root, file);
  if (cache.has(filename)) return cache.get(filename);
  const compiledModule = { exports: {} };
  cache.set(filename, compiledModule.exports);
  const compiled = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const localRequire = (id) => {
    if (id === "./validation") return load("src/lib/rsvp/validation.ts", cache, realAdmin);
    if (id === "firebase-admin/firestore" && !realAdmin) return { FieldValue: { serverTimestamp: () => "TEST_SERVER_TIMESTAMP" } };
    return require(id);
  };
  vm.runInThisContext(`(function(require,module,exports){${compiled}\n})`, { filename })(localRequire, compiledModule, compiledModule.exports);
  cache.set(filename, compiledModule.exports);
  return compiledModule.exports;
}

export const validation = load("src/lib/rsvp/validation.ts");
export const serviceModule = load("src/lib/rsvp/service.ts");
export const loadEmulatorService = () => load("src/lib/rsvp/service.ts", new Map(), true);

class Snapshot {
  constructor(ref, value) { this.id = ref.id; this.ref = ref; this.value = value; this.exists = value !== undefined; }
  data() { return this.value === undefined ? undefined : structuredClone(this.value); }
}
class Reference {
  constructor(db, path) { this.db = db; this.path = path; this.id = path.split("/").at(-1); }
  get() { return Promise.resolve(this.db.snapshot(this)); }
}
class Query {
  constructor(db, collection, filters = []) { this.db = db; this.collectionName = collection; this.filters = filters; }
  where(field, operator, value) { return new Query(this.db, this.collectionName, [...this.filters, { field, operator, value }]); }
  async get() { return this.db.query(this); }
  doc(id) { return new Reference(this.db, `${this.collectionName}/${id ?? `new-${++this.db.sequence}`}`); }
}

/** Small atomic Firestore double; all writes are staged and aborted on failure. */
export class FakeFirestore {
  constructor(records = {}) {
    this.records = new Map(Object.entries(records).map(([key, value]) => [key, structuredClone(value)]));
    this.sequence = 0;
    this.tail = Promise.resolve();
    this.writes = [];
  }
  collection(name) { return new Query(this, name); }
  doc(path) { return new Reference(this, path); }
  snapshot(ref) { return new Snapshot(ref, this.records.get(ref.path)); }
  query(query) {
    const docs = [];
    for (const [key, value] of this.records) {
      if (!key.startsWith(`${query.collectionName}/`) || key.split("/").length !== 2) continue;
      if (!query.filters.every(({ field, operator, value: expected }) => operator === "==" && value[field] === expected)) continue;
      docs.push(this.snapshot(this.doc(key)));
    }
    return { docs, size: docs.length, empty: docs.length === 0 };
  }
  async runTransaction(fn) {
    const previous = this.tail;
    let release;
    this.tail = new Promise((resolve) => { release = resolve; });
    await previous;
    const writes = [];
    let writing = false;
    const tx = {
      get: async (target) => {
        if (writing) throw new Error("Firestore transactions require reads before writes");
        return target instanceof Reference ? this.snapshot(target) : this.query(target);
      },
      create: (ref, data) => { writing = true; writes.push({ kind: "create", path: ref.path, data: structuredClone(data) }); },
      set: (ref, data) => { writing = true; writes.push({ kind: "set", path: ref.path, data: structuredClone(data) }); },
      update: (ref, data) => { writing = true; writes.push({ kind: "update", path: ref.path, data: structuredClone(data) }); },
    };
    try {
      const result = await fn(tx);
      for (const write of writes) {
        if (write.kind === "create" && this.records.has(write.path)) throw new Error("already exists");
        if (write.kind === "update" && !this.records.has(write.path)) throw new Error("missing record");
      }
      for (const write of writes) this.records.set(write.path, write.kind === "update" ? { ...this.records.get(write.path), ...write.data } : write.data);
      this.writes.push(...writes);
      return result;
    } finally {
      release();
    }
  }
  registrations() { return Object.fromEntries([...this.records].filter(([key]) => key.startsWith("registrations/"))); }
}

export const RSVP = {
  name: "Alex Guest", phone: "+12025550101", party_size: 2, bringing_dip: false,
  dip_name: null, notes: null, type: "full_rsvp", event: "5th Annual Dipsgiving", created_at: "unchanged-created-at",
};
export const newInput = (overrides = {}) => ({
  name: "Alex Guest", phone: "(202) 555-0101", party_size: 2, bringing_dip: false, ...overrides,
});
export const lookupInput = (overrides = {}) => ({ name: "Alex Guest", phone: "202.555.0101", ...overrides });

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

const plain = value => JSON.parse(JSON.stringify(value));
function load() {
  const exports = {};
  const code = ts.transpileModule(readFileSync(new URL("../src/lib/rsvp/champions.ts", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, { exports, require(name) {
    assert.equal(name, "./dip-records");
    return { async readCompetitionRecords(db) { db.reads.push("competition"); return db.competition; } };
  } });
  return exports;
}
const { resolveChampions, readChampions } = load();
const dip = (id, fields = {}) => ({ id, registration_id: "shared-rsvp", event: "2026 Dipsgiving", status: "confirmed", dip_name: id === "dip_a" ? "Cowboy Dip" : "Smoked Queso", name: "Kim and Brian", year: 2026, votes: id === "dip_a" ? 10 : 6, legacy: false, ...fields });
const legacy = { id: "2025", data: { podium: [{ place: 1, dip_name: "Real Historical Champion", by: "Actual Chef", image: "/winners/2025.jpg", category: "People’s Choice", award: "Champion" }] } };

test("a winning individual dip ID resolves exactly its dip and associated chef, never the RSVP's other dip", () => {
  const result = plain(resolveChampions([{ id: "2026", data: { podium: [{ place: 1, dip_id: "dip_b", dip_name: "Incorrect owner-level name", by: "Wrong chef", phone: "Private", registration_id: "Private" }] } }], [], [dip("dip_a"), dip("dip_b")]));
  assert.deepEqual(result.years[0].podium, [{ id: "2026:0", dip_id: "dip_b", dip_name: "Smoked Queso", by: "Kim and Brian", place: 1 }]);
  assert.equal(result.years[0].year, 2026);
  assert.equal(result.has_unresolved, false);
  assert(!JSON.stringify(result).includes("Cowboy Dip"));
  assert(!JSON.stringify(result).includes("phone"));
  assert(!JSON.stringify(result).includes("registration_id"));
});

test("two awards to two dips under one RSVP remain separate championship entries", () => {
  const result = resolveChampions([{ id: "2026", data: { podium: [{ dip_id: "dip_a", place: 1 }, { dip_id: "dip_b", place: 2 }] } }], [], [dip("dip_a"), dip("dip_b")]);
  assert.deepEqual(plain(result.years[0].podium.map(entry => [entry.dip_id, entry.dip_name, entry.by, entry.place])), [
    ["dip_a", "Cowboy Dip", "Kim and Brian", 1], ["dip_b", "Smoked Queso", "Kim and Brian", 2],
  ]);
});

test("pending, unverified, missing, owner-only and wrong-year IDs never become new champions", () => {
  for (const [dipId, records] of [
    ["dip_a", [dip("dip_a", { status: "pending" })]],
    ["dip_a", [dip("dip_a", { status: "unverified" })]],
    ["missing", [dip("dip_a")]],
    ["shared-rsvp", [dip("dip_a"), dip("dip_b")]],
    ["dip_a", [dip("dip_a", { year: 2025 })]],
    ["dip_a", [dip("dip_a", { year: null })]],
    ["dip_a", [dip("dip_a", { name: null })]],
  ]) {
    const result = resolveChampions([legacy, { id: "2026", data: { dip_id: dipId, dip_name: "Unsafe fallback", by: "Unsafe name", place: 1 } }], [], records);
    assert.equal(result.has_unresolved, true);
    assert.deepEqual(plain(result.years.map(year => year.year)), [2025]);
    assert.equal(result.years[0].podium[0].dip_name, "Real Historical Champion");
    assert(!JSON.stringify(result).includes("Unsafe fallback"));
  }
});

test("legacy champions and archive metadata remain stored snapshots with no data changes", () => {
  const winners = [legacy];
  const archives = [{ id: "historical-a", data: { archive_year: 2024, dip_name: "Original Dip", by: "Original Chef", notes: "Dairy", votes: 28, image: "/winners/original.jpg", place: 2, category: "Spiciest", award: "Silver", phone: "private" } }];
  const before = structuredClone({ winners, archives });
  const result = plain(resolveChampions(winners, archives, [dip("dip_a", { name: "A different chef" })]));
  assert.equal(result.has_unresolved, false);
  assert.deepEqual(result.years[0].podium[0], { id: "2025:0", dip_name: "Real Historical Champion", by: "Actual Chef", place: 1, award: "Champion", category: "People’s Choice", image: "/winners/2025.jpg" });
  assert.deepEqual(result.historicalDips[0], { id: "historical-a", dip_name: "Original Dip", by: "Original Chef", archive_year: 2024, notes: "Dairy", votes: 28, place: 2, award: "Silver", category: "Spiciest", image: "/winners/original.jpg" });
  assert.deepEqual({ winners, archives }, before);
});

test("single-winner root references preserve explicit year, place, award, category and image", () => {
  const result = plain(resolveChampions([{ id: "fall-event", data: { year: 2026, dip_id: "dip_a", place: 1, award: "Champion", category: "Judges’ Choice", image: "/winners/event.jpg" } }], [], [dip("dip_a")]));
  assert.equal(result.years[0].year, 2026);
  assert.equal(result.years[0].image, "/winners/event.jpg");
  assert.deepEqual(result.years[0].podium[0], { id: "fall-event:0", dip_id: "dip_a", dip_name: "Cowboy Dip", by: "Kim and Brian", place: 1, award: "Champion", category: "Judges’ Choice", image: "/winners/event.jpg" });
});

test("archived ID references use the exact dip and retain archived notes, votes and metadata", () => {
  const result = plain(resolveChampions([], [{ id: "archive", data: { archive_year: 2026, dip_id: "dip_b", notes: "Stored notes", votes: 6, image: "/winners/queso.jpg", place: 2 } }], [dip("dip_a"), dip("dip_b")]));
  assert.deepEqual(result.historicalDips[0], { id: "archive", dip_id: "dip_b", dip_name: "Smoked Queso", by: "Kim and Brian", archive_year: 2026, notes: "Stored notes", votes: 6, image: "/winners/queso.jpg", place: 2 });
});

test("ambiguous duplicate IDs and malformed references fail closed while valid history survives", () => {
  const result = resolveChampions([legacy, { id: "2026", data: { podium: [{ dip_id: "dip_a" }, { dip_id: "path/not-an-id" }, { dip_id: null }, { by: "Only the RSVP owner" }] } }], [], [dip("dip_a"), dip("dip_a", { dip_name: "Conflicting entry" })]);
  assert.equal(result.has_unresolved, true);
  assert.deepEqual(plain(result.years.map(year => year.year)), [2025]);
});

test("a current vote leader is never invented as a published champion", () => {
  assert.deepEqual(plain(resolveChampions([], [], [dip("dip_a"), dip("dip_b")])), { years: [], historicalDips: [], has_unresolved: false });
});

test("empty optional dip-ID fields preserve a valid legacy snapshot without a guessed join", () => {
  for (const dip_id of [undefined, null, "", "   "]) {
    const stored = { dip_id, place: 1, dip_name: "Stored historical winner", by: "Stored chef" };
    const result = resolveChampions([{ id: "2025", data: { podium: [stored] } }], [], [dip("dip_a", { name: "Different chef" })]);
    assert.equal(result.has_unresolved, false);
    assert.deepEqual(plain(result.years[0].podium[0]), { id: "2025:0", dip_name: "Stored historical winner", by: "Stored chef", place: 1 });
  }
});

test("podium entries never inherit a root winner ID or another entry's association", () => {
  const result = resolveChampions([{ id: "2026", data: { dip_id: "dip_b", podium: [
    { dip_id: "dip_a", place: 1 }, { place: 2, dip_name: "Stored separate result", by: "Recorded chef" },
  ] } }], [], [dip("dip_a"), dip("dip_b")]);
  assert.equal(result.has_unresolved, false);
  assert.deepEqual(plain(result.years[0].podium.map(entry => [entry.dip_id ?? null, entry.dip_name, entry.by])), [
    ["dip_a", "Cowboy Dip", "Kim and Brian"], [null, "Stored separate result", "Recorded chef"],
  ]);
});

test("unrenderable archived records show a generic review warning rather than false empty history", () => {
  const result = resolveChampions([{ id: "unknown-year", data: { dip_name: "Unknown year" } }], [{ id: "malformed", data: { archive_year: 2024, phone: "private" } }], []);
  assert.deepEqual(plain(result), { years: [], historicalDips: [], has_unresolved: true });
  assert.equal(resolveChampions([{ id: "2026", data: { podium: [] } }], [], []).has_unresolved, true);
});

test("the champions reader uses read-only queries and explicitly excludes private record fields", async () => {
  const db = {
    reads: [], competition: [dip("dip_b", { phone: "+12025550101", registration_id: "private-owner" })],
    collection(name) { return { async get() { db.reads.push(name); return { docs: (name === "winners" ? [{ id: "2026", data: () => ({ dip_id: "dip_b", phone: "private", uid: "private", notes: "private" }) }] : []) }; } }; },
    set() { throw new Error("Writes are forbidden"); }, update() { throw new Error("Writes are forbidden"); },
  };
  const result = await readChampions(db);
  assert.deepEqual(db.reads.sort(), ["competition", "historicalDips", "winners"]);
  assert.equal(result.years[0].podium[0].dip_name, "Smoked Queso");
  for (const secret of ["phone", "registration_id", "private-owner", "uid"]) assert(!JSON.stringify(result).includes(secret));
});

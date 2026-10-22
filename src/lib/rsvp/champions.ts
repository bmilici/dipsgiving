import type { Firestore } from "firebase-admin/firestore";
import { readCompetitionRecords, type CompetitionRecord } from "./dip-records";

export type ChampionEntry = {
  id: string; dip_id?: string; dip_name: string; by: string;
  place?: number; award?: string; category?: string; image?: string;
};
export type ChampionYear = { id: string; year: number; image?: string; podium: ChampionEntry[] };
export type ArchivedChampionDip = ChampionEntry & { archive_year: number; notes: string | null; votes: number | null };
export type ChampionsFeed = { years: ChampionYear[]; historicalDips: ArchivedChampionDip[]; has_unresolved: boolean };
type StoredRecord = { id: string; data: Record<string, unknown> };

const text = (value: unknown, max: number) => typeof value === "string" && value.trim() ? value.trim().slice(0, max) : undefined;
const yearValue = (value: unknown) => typeof value === "number" && Number.isInteger(value) && value >= 1000 && value <= 9999 ? value : undefined;
const yearFor = (data: Record<string, unknown>, id?: string) =>
  yearValue(data.archive_year) ?? yearValue(data.year) ?? (id && /^\d{4}$/.test(id) ? yearValue(Number(id)) : undefined);
const record = (value: unknown): Record<string, unknown> | undefined => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
function metadata(data: Record<string, unknown>) {
  const place = typeof data.place === "number" && Number.isSafeInteger(data.place) && data.place > 0 ? data.place : undefined;
  const award = text(data.award, 160), category = text(data.category, 160), image = text(data.image, 2048);
  return { ...(place === undefined ? {} : { place }), ...(award ? { award } : {}), ...(category ? { category } : {}), ...(image ? { image } : {}) };
}

/** Resolve only explicit dip IDs. Stored historical snapshots never need a join. */
export function resolveChampions(winners: StoredRecord[], archives: StoredRecord[], competition: CompetitionRecord[]): ChampionsFeed {
  let has_unresolved = false;
  const byId = new Map<string, CompetitionRecord[]>();
  for (const dip of competition) byId.set(dip.id, [...(byId.get(dip.id) || []), dip]);
  function entry(data: Record<string, unknown>, id: string, year: number): ChampionEntry | undefined {
    const meta = metadata(data);
    const hasReference = data.dip_id != null && !(typeof data.dip_id === "string" && !data.dip_id.trim());
    if (hasReference) {
      const dipId = typeof data.dip_id === "string" && data.dip_id && data.dip_id.length <= 1500 && !data.dip_id.includes("/") ? data.dip_id : undefined;
      const matches = dipId ? byId.get(dipId) : undefined;
      const dip = matches?.length === 1 ? matches[0] : undefined;
      const dipName = text(dip?.dip_name, 120), chef = text(dip?.name, 100);
      if (!dipId || !dip || dip.status !== "confirmed" || dip.year !== year || !dipName || !chef) {
        has_unresolved = true;
        return undefined;
      }
      return { id, dip_id: dipId, dip_name: dipName, by: chef, ...meta };
    }
    const dipName = text(data.dip_name, 120);
    if (!dipName) { has_unresolved = true; return undefined; }
    // No legacy guest-name or RSVP-ID matching: the stored result is the result.
    return { id, dip_name: dipName, by: text(data.by, 100) || "", ...meta };
  }

  const years: ChampionYear[] = [];
  for (const winner of winners) {
    const year = yearFor(winner.data, winner.id);
    if (year === undefined) { has_unresolved = true; continue; }
    let storedEntries: unknown[];
    if (Array.isArray(winner.data.podium)) storedEntries = winner.data.podium;
    else if (Object.hasOwn(winner.data, "dip_id") || Object.hasOwn(winner.data, "dip_name")) storedEntries = [winner.data];
    else { has_unresolved = true; continue; }
    const podium = storedEntries.flatMap((value, index) => {
      const stored = record(value);
      if (!stored) { has_unresolved = true; return []; }
      const resolved = entry(stored, `${winner.id}:${index}`, year);
      return resolved ? [resolved] : [];
    }).sort((a, b) => (a.place ?? Number.MAX_SAFE_INTEGER) - (b.place ?? Number.MAX_SAFE_INTEGER));
    if (podium.length) years.push({ id: winner.id, year, ...(text(winner.data.image, 2048) ? { image: text(winner.data.image, 2048) } : {}), podium });
    else has_unresolved = true;
  }

  const historicalDips: ArchivedChampionDip[] = [];
  for (const archived of archives) {
    const year = yearFor(archived.data);
    if (year === undefined) { has_unresolved = true; continue; }
    const resolved = entry(archived.data, archived.id, year);
    if (!resolved) continue;
    const votes = typeof archived.data.votes === "number" && Number.isFinite(archived.data.votes) ? archived.data.votes : null;
    historicalDips.push({ ...resolved, archive_year: year, notes: text(archived.data.notes, 1000) || null, votes });
  }
  years.sort((a, b) => b.year - a.year || a.id.localeCompare(b.id));
  historicalDips.sort((a, b) => b.archive_year - a.archive_year || a.dip_name.localeCompare(b.dip_name) || a.id.localeCompare(b.id));
  return { years, historicalDips, has_unresolved };
}

/** Read-only public projection; no registration association or phone is returned. */
export async function readChampions(db: Firestore): Promise<ChampionsFeed> {
  const [winners, archives, competition] = await Promise.all([
    db.collection("winners").get(), db.collection("historicalDips").get(), readCompetitionRecords(db),
  ]);
  return resolveChampions(
    winners.docs.map(doc => ({ id: doc.id, data: doc.data() })),
    archives.docs.map(doc => ({ id: doc.id, data: doc.data() })),
    competition,
  );
}

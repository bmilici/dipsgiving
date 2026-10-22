import { testingAssetPath } from "@/lib/testingMode";

export type PublicDip = {
  id: string;
  dip_name: string;
  name: string | null;
  notes: string | null;
  votes: number;
  year: number | null;
  created_at: unknown;
};

export type PublicDipFeed = { close: () => void; refresh: () => Promise<void> };
export type PublicDipScope = "all" | "current";

/** Read only the public dip projection; RSVP phone numbers never reach the browser. */
export async function fetchPublicDips(signal?: AbortSignal, scope: PublicDipScope = "all"): Promise<PublicDip[]> {
  const path = scope === "current" ? "/api/dips?event=current" : "/api/dips";
  const response = await fetch(testingAssetPath(path), {
    method: "GET", credentials: "same-origin", cache: "no-store", signal,
  });
  if (!response.ok) throw new Error("Dip list unavailable");
  const data: unknown = await response.json();
  if (!data || typeof data !== "object" || !Array.isArray((data as { dips?: unknown }).dips)) {
    throw new Error("Dip list unavailable");
  }

  return ((data as { dips: unknown[] }).dips).flatMap((value) => {
    if (!value || typeof value !== "object") return [];
    const row = value as Record<string, unknown>;
    if (typeof row.id !== "string" || !row.id || typeof row.dip_name !== "string" || !row.dip_name.trim()) return [];
    return [{
      id: row.id,
      dip_name: row.dip_name.trim(),
      name: typeof row.name === "string" ? row.name : null,
      notes: typeof row.notes === "string" ? row.notes : null,
      votes: typeof row.votes === "number" && Number.isFinite(row.votes) ? row.votes : 0,
      year: typeof row.year === "number" && Number.isInteger(row.year) ? row.year : null,
      created_at: row.created_at ?? null,
    }];
  });
}

/** Refresh visible pages every 10 seconds and immediately when guests return to a tab. */
export function watchPublicDips(
  onNext: (dips: PublicDip[]) => void,
  onError: (error: unknown) => void,
  scope: PublicDipScope = "all",
): PublicDipFeed {
  let closed = false;
  let pending = false;
  const controller = new AbortController();
  const refresh = async () => {
    if (closed || pending || document.visibilityState === "hidden") return;
    pending = true;
    try {
      const dips = await fetchPublicDips(controller.signal, scope);
      if (!closed) onNext(dips);
    } catch (error) {
      if (!closed) onError(error);
    } finally {
      pending = false;
    }
  };
  const resume = () => { void refresh(); };
  const interval = window.setInterval(resume, 10_000);
  document.addEventListener("visibilitychange", resume);
  void refresh();

  return {
    refresh,
    close() {
      closed = true;
      controller.abort();
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", resume);
    },
  };
}

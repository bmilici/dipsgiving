"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, X } from "lucide-react";

type AttackCost = {
  type: string;
  value?: number;
  description?: string;
};

type AttackEffect = {
  id: string;
  type: string;
  targetScope?: string;
  amount?: number;
  unit?: string;
  method?: string;
  notes?: string;
};

type Attack = {
  id: string;
  name: string;
  cost: AttackCost;
  effectText: string;
  effects: AttackEffect[];
};

type Card = {
  id: string;
  name: string;
  generation: number;
  imagePath: string;
  drinkemonType: string;
  hp: number;
  attacks: Attack[];
  isOpForm?: boolean;
  commonFormName?: string;
  gameplayReviewStatus?: string;
  virtualArtRegion?: ArtRegion;
};

type ViewMode = "original" | "virtual" | "compare";
type ArtRegion = { x: number; y: number; width: number; height: number };

const defaultArtRegion: ArtRegion = {
  x: 0.12748347355769235,
  y: 0.1497879390324718,
  width: 0.7441090745192307,
  height: 0.405,
};

function cardImageSrc(card: Card) {
  const path = card.imagePath.startsWith("/cards/")
    ? `/drinkemon${card.imagePath}`
    : card.imagePath;
  return encodeURI(path);
}

function costLabel(cost: AttackCost) {
  const labels: Record<string, string> = {
    seconds: "sec",
    shotgun: "Shotgun",
    full_beer: "Full Beer",
    half_beer: "Half Beer",
  };
  const value = cost.value === undefined ? "" : `${cost.value} `;
  return `${value}${labels[cost.type] || cost.type || "cost"}`.trim();
}

function effectLabel(effect: AttackEffect) {
  if (effect.type === "damage" && effect.amount !== undefined) return String(effect.amount);
  const amount = effect.amount !== undefined ? ` ${effect.amount}${effect.unit ? ` ${effect.unit}` : ""}` : "";
  const target = effect.targetScope ? ` • ${effect.targetScope.replaceAll("_", " ")}` : "";
  return `${effect.type.replaceAll("_", " ")}${amount}${target}`;
}

function attackEffectText(attack: Attack) {
  if (attack.effectText?.trim()) return attack.effectText;
  if (!attack.effects?.length) return "";
  return attack.effects.map(effectLabel).join(", ");
}

function isIncomplete(card: Card) {
  return !card.name || !card.drinkemonType || !card.hp || !card.attacks?.length;
}

function uniqueSorted(values: Array<string | number | undefined>) {
  return Array.from(new Set(values.filter(Boolean).map(String))).sort();
}

function VirtualCard({ card, compact = false, isCompare = false }: { card: Card; compact?: boolean; isCompare?: boolean }) {
  const incomplete = isIncomplete(card);
  const crop = card.virtualArtRegion || defaultArtRegion;

  // Use smaller sizes when in compare mode (side-by-side view)
  const textSize = isCompare ? "text-[7px]" : "text-[11px]";
  const headerTextSize = isCompare ? "text-[6px]" : "text-[10px]";
  const nameSize = isCompare ? "text-[8px]" : "text-xs";
  const hpSize = isCompare ? "text-[8px]" : "text-xs";
  const gridCols = isCompare ? "grid-cols-[28px_1fr_1fr]" : "grid-cols-[48px_1fr_1.4fr]";
  const gap = isCompare ? "gap-0.5" : "gap-1.5";
  const padding = isCompare ? "px-1 py-1" : "px-2 py-2";
  const rowPadding = isCompare ? "py-0.5" : "py-1.5";

  return (
    <article className={`flex flex-col overflow-hidden rounded-lg border-4 border-amber-600 bg-[#f5e6c8] shadow-lg ${compact ? "aspect-[2.5/3.5]" : "aspect-[2.5/3.5] max-w-sm"}`}>
      {/* Header - Type, Name, HP */}
      <header className={`flex items-center justify-between gap-0.5 bg-gradient-to-r from-amber-200 to-amber-100 ${isCompare ? "px-1 py-0.5" : "px-2 py-1"}`}>
        <span className={`rounded bg-emerald-600 px-1 py-0.5 ${headerTextSize} font-bold text-white`}>{card.drinkemonType || "Type"}</span>
        <strong className={`flex-1 text-center ${nameSize} font-black uppercase tracking-tight text-slate-900 truncate px-0.5`}>{card.name || "Unnamed"}</strong>
        <span className={`${hpSize} font-black text-red-600`}>HP:{card.hp || "-"}</span>
      </header>

      {/* Card Image - reduced height */}
      <div className={`relative ${isCompare ? "mx-1 mt-0.5" : "mx-2 mt-1"} aspect-[16/9] flex-shrink-0 overflow-hidden rounded border-2 border-amber-700/50 bg-slate-200`}>
        <img
          src={cardImageSrc(card)}
          alt=""
          className="absolute max-w-none object-cover"
          style={{
            left: `${(-crop.x / crop.width) * 100}%`,
            top: `${(-crop.y / crop.height) * 100}%`,
            width: `${100 / crop.width}%`,
            height: `${100 / crop.height}%`,
          }}
        />
      </div>

      {/* Attacks Section - takes remaining space */}
      <div className={`flex flex-1 flex-col ${padding} ${textSize}`}>
        {/* Table Header */}
        <div className={`grid ${gridCols} ${gap} border-b-2 border-amber-700/40 ${isCompare ? "pb-0.5" : "pb-1.5"} font-bold text-amber-800`}>
          <span>Cost</span>
          <span>Attack</span>
          <span>Effect</span>
        </div>

        {incomplete ? (
          <div className={`mt-1 rounded border border-amber-900/20 bg-white/50 p-1 ${textSize} font-semibold text-slate-700`}>
            Card data incomplete.
          </div>
        ) : (
          <div className="flex flex-1 flex-col justify-evenly">
            {card.attacks.slice(0, 3).map((attack, index) => (
              <div key={attack.id || index} className={`grid ${gridCols} ${gap} border-b border-amber-700/20 ${rowPadding}`}>
                <span className="text-slate-700">{costLabel(attack.cost)}</span>
                <span className="font-semibold text-slate-900 underline">{attack.name || `Attack ${index + 1}`}</span>
                <span className="text-slate-600 leading-snug">{attackEffectText(attack) || "-"}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </article>
  );
}

function CardDisplay({ card, viewMode }: { card: Card; viewMode: ViewMode }) {
  if (viewMode === "original") {
    return <img src={cardImageSrc(card)} alt={card.name} className="aspect-[2.5/3.5] w-full rounded-lg bg-orange-100 object-cover shadow-sm" />;
  }

  if (viewMode === "virtual") {
    return <VirtualCard card={card} compact />;
  }

  return (
    <div className="grid grid-cols-2 gap-3">
      <img src={cardImageSrc(card)} alt={card.name} className="aspect-[2.5/3.5] w-full rounded-lg bg-orange-100 object-cover shadow-sm" />
      <VirtualCard card={card} compact isCompare />
    </div>
  );
}

export default function DrinkemonPage() {
  const [cards, setCards] = useState<Card[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("virtual");
  const [generation, setGeneration] = useState("all");
  const [type, setType] = useState("all");
  const [form, setForm] = useState("all");
  const [reviewStatus, setReviewStatus] = useState("all");
  const [effectType, setEffectType] = useState("all");
  const [search, setSearch] = useState("");
  const [selectedCard, setSelectedCard] = useState<Card | null>(null);

  useEffect(() => {
    async function loadCards() {
      try {
        const response = await fetch("/drinkemon/data/cards.json", { cache: "no-store" });
        if (!response.ok) throw new Error(`Unable to load card database: ${response.status}`);
        const data = await response.json();
        const nextCards = Array.isArray(data) ? data : data.cards || [];
        setCards(nextCards);
      } catch (error) {
        setLoadError(error instanceof Error ? error.message : "Unable to load card database.");
      } finally {
        setIsLoading(false);
      }
    }

    loadCards();
  }, []);

  const filterOptions = useMemo(() => ({
    generations: uniqueSorted(cards.map((card) => card.generation)),
    types: uniqueSorted(cards.map((card) => card.drinkemonType)),
    reviewStatuses: uniqueSorted(cards.map((card) => card.gameplayReviewStatus || "unreviewed")),
    effectTypes: uniqueSorted(cards.flatMap((card) => card.attacks?.flatMap((attack) => attack.effects?.map((effect) => effect.type) || []) || [])),
  }), [cards]);

  const filteredCards = useMemo(() => {
    const query = search.trim().toLowerCase();
    return cards.filter((card) => {
      const matchesGeneration = generation === "all" || String(card.generation) === generation;
      const matchesType = type === "all" || card.drinkemonType === type;
      const matchesForm = form === "all" || (form === "op" ? card.isOpForm : !card.isOpForm);
      const matchesReview = reviewStatus === "all" || (card.gameplayReviewStatus || "unreviewed") === reviewStatus;
      const matchesEffect = effectType === "all" || card.attacks?.some((attack) => attack.effects?.some((effect) => effect.type === effectType));
      const attackNames = card.attacks?.map((attack) => attack.name).join(" ") || "";
      const matchesSearch = !query || `${card.name} ${attackNames}`.toLowerCase().includes(query);
      return matchesGeneration && matchesType && matchesForm && matchesReview && matchesEffect && matchesSearch;
    });
  }, [cards, effectType, form, generation, reviewStatus, search, type]);

  return (
    <main className="min-h-screen bg-gradient-to-b from-orange-50 via-amber-50 to-orange-50">
      <section className="mx-auto max-w-7xl px-4 py-8 sm:py-10 lg:px-6">
        <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="mb-2 text-sm font-black uppercase tracking-[0.22em] text-orange-600">Drinkemon</p>
            <h1 className="text-4xl font-black tracking-tight text-orange-950 sm:text-5xl">Card Gallery</h1>
            <p className="mt-3 max-w-2xl text-base font-medium text-orange-800/75">
              Browse the approved Gen 1 Drinkemon cards. Gameplay is not live yet; this is the public card database preview.
            </p>
          </div>
          <div className="inline-flex rounded-xl border border-orange-200 bg-white p-1 shadow-sm">
            {(["original", "virtual", "compare"] as ViewMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setViewMode(mode)}
                className={`rounded-lg px-4 py-2 text-sm font-black capitalize transition ${
                  viewMode === mode ? "bg-orange-700 text-amber-50" : "text-orange-800 hover:bg-orange-50"
                }`}
              >
                {mode}
              </button>
            ))}
          </div>
        </div>

        <section className="mb-6 rounded-2xl border border-orange-100 bg-white/90 p-4 shadow-sm">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[1.5fr_repeat(5,1fr)]">
            <label className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-orange-500" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search card or attack"
                className="h-11 w-full rounded-xl border border-orange-200 bg-orange-50/60 pl-10 pr-3 font-semibold text-orange-950 outline-none focus:border-orange-500"
              />
            </label>

            <FilterSelect label="Generation" value={generation} onChange={setGeneration} options={filterOptions.generations} allLabel="All Gen" />
            <FilterSelect label="Type" value={type} onChange={setType} options={filterOptions.types} allLabel="All Types" />
            <FilterSelect label="Form" value={form} onChange={setForm} options={["normal", "op"]} allLabel="All Forms" labels={{ normal: "Normal", op: "OP Form" }} />
            <FilterSelect label="Review" value={reviewStatus} onChange={setReviewStatus} options={filterOptions.reviewStatuses} allLabel="All Review" />
            <FilterSelect label="Effect" value={effectType} onChange={setEffectType} options={filterOptions.effectTypes} allLabel="All Effects" />
          </div>
        </section>

        <div className="mb-4 flex items-center justify-between text-sm font-bold text-orange-800/75">
          <span>{filteredCards.length} / {cards.length} cards</span>
          {isLoading ? <span>Loading cards...</span> : null}
        </div>

        {loadError ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-5 font-bold text-red-800">{loadError}</div>
        ) : null}

        {!isLoading && filteredCards.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-orange-300 bg-white/80 p-8 text-center font-bold text-orange-800">
            No Drinkemon cards match those filters.
          </div>
        ) : null}

        <section className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredCards.map((card) => (
            <button
              key={card.id}
              type="button"
              onClick={() => setSelectedCard(card)}
              className="group rounded-2xl border border-orange-100 bg-white p-3 text-left shadow-sm transition hover:-translate-y-1 hover:border-orange-300 hover:shadow-lg"
            >
              <CardDisplay card={card} viewMode={viewMode} />
              <div className="mt-3">
                <div className="flex items-start justify-between gap-3">
                  <h2 className="font-black text-orange-950">{card.name || "Unnamed Drinkemon"}</h2>
                  <span className="rounded-full bg-orange-100 px-2 py-1 text-xs font-black text-orange-700">Gen {card.generation}</span>
                </div>
                <p className="mt-1 text-sm font-bold text-orange-700/80">
                  {card.drinkemonType || "No type"} {card.isOpForm ? "• OP Form" : ""}
                </p>
              </div>
            </button>
          ))}
        </section>
      </section>

      {selectedCard ? (
        <CardModal card={selectedCard} viewMode={viewMode} onClose={() => setSelectedCard(null)} />
      ) : null}
    </main>
  );
}

function FilterSelect({
  allLabel,
  label,
  labels,
  onChange,
  options,
  value,
}: {
  allLabel: string;
  label: string;
  labels?: Record<string, string>;
  onChange: (value: string) => void;
  options: string[];
  value: string;
}) {
  return (
    <label className="grid gap-1">
      <span className="text-xs font-black uppercase tracking-wide text-orange-700/75">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 rounded-xl border border-orange-200 bg-orange-50/60 px-3 font-bold text-orange-950 outline-none focus:border-orange-500"
      >
        <option value="all">{allLabel}</option>
        {options.map((option) => (
          <option key={option} value={option}>{labels?.[option] || option}</option>
        ))}
      </select>
    </label>
  );
}

function CardModal({ card, onClose, viewMode }: { card: Card; onClose: () => void; viewMode: ViewMode }) {
  return (
    <div className="fixed inset-0 z-[100] overflow-y-auto bg-slate-950/70 p-4 backdrop-blur-sm">
      <div className="mx-auto my-6 max-w-5xl rounded-2xl bg-amber-50 shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-orange-200 bg-amber-50/95 px-4 py-3 backdrop-blur">
          <div>
            <h2 className="text-xl font-black text-orange-950">{card.name}</h2>
            <p className="text-sm font-bold text-orange-700">{card.drinkemonType || "No type"} • Gen {card.generation}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl bg-orange-100 p-2 text-orange-800 hover:bg-orange-200" aria-label="Close card detail">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid gap-6 p-4 lg:grid-cols-[minmax(280px,420px)_1fr]">
          <CardDisplay card={card} viewMode={viewMode} />
          <section className="rounded-2xl border border-orange-100 bg-white/90 p-4">
            <h3 className="mb-3 text-lg font-black text-orange-950">Card Data</h3>
            <dl className="mb-5 grid grid-cols-2 gap-3 text-sm">
              <div><dt className="font-black text-orange-700">HP</dt><dd className="font-bold text-orange-950">{card.hp || "-"}</dd></div>
              <div><dt className="font-black text-orange-700">Form</dt><dd className="font-bold text-orange-950">{card.isOpForm ? "OP Form" : "Normal"}</dd></div>
              <div><dt className="font-black text-orange-700">Review</dt><dd className="font-bold text-orange-950">{card.gameplayReviewStatus || "unreviewed"}</dd></div>
              <div><dt className="font-black text-orange-700">Common Form</dt><dd className="font-bold text-orange-950">{card.commonFormName || "-"}</dd></div>
            </dl>

            <h4 className="mb-2 font-black text-orange-950">Attacks</h4>
            <div className="grid gap-3">
              {card.attacks?.length ? card.attacks.map((attack, index) => (
                <div key={attack.id || index} className="rounded-xl border border-orange-100 bg-orange-50/70 p-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <strong className="text-orange-950">{attack.name || `Attack ${index + 1}`}</strong>
                    <span className="rounded-full bg-white px-2 py-1 text-xs font-black text-orange-700">{costLabel(attack.cost)}</span>
                  </div>
                  <p className="mt-2 text-sm font-semibold text-orange-900">{attackEffectText(attack) || "No effect text"}</p>
                </div>
              )) : (
                <p className="rounded-xl border border-dashed border-orange-200 p-4 text-sm font-bold text-orange-700">No structured attacks yet.</p>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

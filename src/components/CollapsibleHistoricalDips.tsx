"use client";

import { useEffect, useState, type ReactNode } from "react";

type Props = {
  id: string;
  children: ReactNode;
  showLabel?: string;
  hideLabel?: string;
};
type Phase = "closed" | "opening" | "open" | "closing";

/** Closed archives leave the reading and tab order as well as the visible page. */
export default function CollapsibleHistoricalDips({
  id,
  children,
  showLabel = "See the Dips That Never Got Their Glory",
  hideLabel = "Hide the 2025 Contenders",
}: Props) {
  const [phase, setPhase] = useState<Phase>("closed");
  const expanded = phase === "opening" || phase === "open";
  const visible = phase === "open";
  const closed = phase === "closed";
  const buttonId = `${id}-toggle`;
  const panelId = `${id}-panel`;

  useEffect(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (phase === "opening") {
      if (reducedMotion) { setPhase("open"); return; }
      // Let the newly mounted zero-height panel paint before expanding it.
      let expansionFrame: number | undefined;
      const firstFrame = window.requestAnimationFrame(() => {
        expansionFrame = window.requestAnimationFrame(() => setPhase("open"));
      });
      return () => {
        window.cancelAnimationFrame(firstFrame);
        if (expansionFrame !== undefined) window.cancelAnimationFrame(expansionFrame);
      };
    }
    if (phase === "closing") {
      if (reducedMotion) { setPhase("closed"); return; }
      // Also complete when a browser does not emit transitionend.
      const timer = window.setTimeout(() => setPhase("closed"), 360);
      return () => window.clearTimeout(timer);
    }
  }, [phase]);

  return <div className="min-w-0">
    <div className="flex justify-center">
      <button
        id={buttonId}
        type="button"
        aria-expanded={expanded}
        aria-controls={panelId}
        onClick={() => setPhase(current => current === "open" || current === "opening" ? "closing" : "opening")}
        className="inline-flex min-h-16 max-w-full items-center justify-center gap-2 rounded-lg px-4 py-2 text-center text-sm font-semibold text-forest transition-colors hover:bg-forest/5 hover:text-burnt-orange focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-forest motion-reduce:transition-none sm:min-h-12 sm:text-base"
      >
        <span>{expanded ? hideLabel : showLabel}</span>
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={`h-4 w-4 shrink-0 transition-transform duration-300 motion-reduce:transition-none ${expanded ? "rotate-180" : ""}`}>
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
    </div>
    <div
      id={panelId}
      role="region"
      aria-labelledby={buttonId}
      aria-hidden={!visible}
      inert={!visible}
      hidden={closed}
      style={closed ? { display: "none" } : undefined}
      onTransitionEnd={event => {
        if (event.target === event.currentTarget && phase === "closing") setPhase("closed");
      }}
      className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none ${visible ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}
    >
      <div className="min-h-0 overflow-hidden">
        {!closed && <div className="pt-6">{children}</div>}
      </div>
    </div>
  </div>;
}

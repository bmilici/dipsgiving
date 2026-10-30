import { testingAssetPath } from "@/lib/testingMode";

/** An intentionally unofficial chapter in the Dipsgiving history books. */
export default function VotingDisaster2025() {
  return (
    <section
      aria-labelledby="voting-disaster-2025-title"
      className="relative min-w-0 overflow-hidden rounded-3xl border-2 border-forest/30 bg-cream p-5 shadow-[5px_6px_0_0_rgba(50,79,60,0.12)] sm:p-8"
    >
      <div aria-hidden="true" className="absolute inset-x-0 top-0 h-2 bg-[repeating-linear-gradient(135deg,#324F3C_0px,#324F3C_12px,#E7AA42_12px,#E7AA42_24px)]" />
      <div className="grid min-w-0 items-center gap-5 pt-2 md:grid-cols-[minmax(0,0.85fr)_minmax(0,1.35fr)] md:gap-8">
        <figure className="mx-auto w-full max-w-72 sm:max-w-80">
          <img
            src={testingAssetPath("/winners/2025-rj-self-proclaimed.webp")}
            alt="RJ smiling in a white outfit; Dipsgiving 2025’s self-proclaimed champion."
            width={768}
            height={1024}
            loading="lazy"
            decoding="async"
            className="h-auto w-full rounded-2xl border border-forest/20 shadow-sm"
          />
          <figcaption className="mt-3 text-center text-sm font-semibold text-forest">Self-Proclaimed Champion: RJ</figcaption>
        </figure>
        <div className="min-w-0 space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <p className="festival-kicker text-forest">Dipsgiving 2025</p>
            <span className="inline-flex rounded-md border-2 border-forest/70 px-2.5 py-1.5 text-[0.65rem] font-bold leading-4 tracking-[0.12em] text-forest">NO OFFICIAL CHAMPION</span>
          </div>
          <h2 id="voting-disaster-2025-title" className="break-words font-display text-3xl leading-tight text-forest sm:text-4xl">
            The Great Voting Disaster of 2025
          </h2>
          <p className="text-base leading-7 text-espresso">
            Due to a catastrophic voting failure, no official Dipsgiving champion was crowned in 2025.
          </p>
          <p className="text-base leading-7 text-espresso">
            That said, <strong>RJ has self-proclaimed himself the winner.</strong>
          </p>
          <div className="space-y-1 border-t border-dashed border-forest/30 pt-4 text-sm leading-6 text-burnt-orange sm:text-base">
            <p><strong>Official Status:</strong> No winner.</p>
            <p><strong>RJ Status:</strong> Fully convinced he won.</p>
          </div>
        </div>
      </div>
    </section>
  );
}

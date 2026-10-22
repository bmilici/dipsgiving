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
        <img
          src={testingAssetPath("/illustrations/voting-disaster-2025.svg")}
          alt="A retro voting computer and broken trophy display ERROR 404: CHAMPION NOT FOUND."
          width={600}
          height={460}
          loading="lazy"
          decoding="async"
          className="mx-auto h-auto w-full max-w-72 sm:max-w-80"
        />
        <div className="min-w-0 space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <p className="festival-kicker text-forest">Dipsgiving 2025</p>
            <span className="inline-flex rounded-md border-2 border-forest/70 px-2.5 py-1.5 text-[0.65rem] font-bold leading-4 tracking-[0.12em] text-forest">NO OFFICIAL CHAMPION</span>
          </div>
          <h2 id="voting-disaster-2025-title" className="break-words font-display text-3xl leading-tight text-forest sm:text-4xl">
            The Great Voting Disaster of 2025
          </h2>
          <p className="text-base leading-7 text-espresso">
            The dips were delicious. The competition was fierce. Unfortunately, the person running the website was apparently not qualified to run an election.
          </p>
          <p className="border-t border-dashed border-forest/30 pt-4 text-sm font-bold leading-6 text-burnt-orange sm:text-base">
            Official Result: Everyone Lost. Especially IT.
          </p>
        </div>
      </div>
    </section>
  );
}

import Image from "next/image";

const sponsors = [
  { name: "Point Ybel Brewing", url: "https://pointybelbrew.com/", logo: "/sponsors/pointybelbrew.png" },
  { name: "One Fresh Hat", url: "https://www.onefreshhat.com/", logo: "/sponsors/onefreshhat.png" },
  { name: "A T Precision Pressure Washing", url: "https://atppw.com/", logo: "/sponsors/AT.png" },
];

export default function Sponsors() {
  return (
    <section className="bg-[#faf6ed] px-6 py-12 sm:px-8 sm:py-16" aria-labelledby="sponsors-heading">
      <div className="mx-auto max-w-6xl">
        <h2 id="sponsors-heading" className="text-center text-xs font-semibold uppercase tracking-[0.18em] text-[#706052]">Made even better by our sponsors</h2>
        <div className="mx-auto mt-8 grid max-w-2xl grid-cols-3 items-center gap-5 sm:gap-12">
          {sponsors.map(s => <a key={s.name} href={s.url} target="_blank" rel="noopener noreferrer" className="flex h-24 items-center justify-center rounded-lg bg-white/65 px-3 transition-colors hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#b74727]"><Image src={s.logo} alt={s.name} width={160} height={72} className="max-h-16 w-auto max-w-full object-contain" /></a>)}
        </div>
      </div>
    </section>
  );
}

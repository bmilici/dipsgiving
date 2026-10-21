import Image from "next/image";

export default function Sponsors() {
  const sponsors = [
    {
      name: "Point Ybel Brewing",
      url: "https://pointybelbrew.com/",
      logo: "/sponsors/pointybelbrew.png",
    },
    {
      name: "One Fresh Hat",
      url: "https://www.onefreshhat.com/",
      logo: "/sponsors/onefreshhat.png",
    },
    {
      name: "A T PRECISION PRESSURE WASHING 239-219-9513",
      url: "https://atppw.com/",
      logo: "/sponsors/AT.png",
    },
  ];

  return (
    <section className="bg-gradient-to-b from-amber-50 to-orange-50 py-10 sm:py-12">
      <div className="mx-auto max-w-5xl px-4 text-center">
        <p className="mb-1 text-xs font-medium uppercase tracking-widest text-orange-600">
          Thank You To
        </p>
        <h2 className="mb-6 text-xl font-semibold text-orange-900 sm:mb-8 sm:text-2xl">
          Our Sponsors
        </h2>

        <div className="mx-auto flex max-w-2xl flex-wrap items-center justify-center gap-4 sm:gap-8">
          {sponsors.map((s) => (
            <a
              key={s.name}
              href={s.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex h-28 w-32 items-center justify-center rounded-lg p-2 transition-colors hover:bg-white/70 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-orange-600 sm:h-32 sm:w-44 sm:p-3"
            >
              <span className="relative block h-full w-full">
                <Image
                  src={s.logo}
                  alt={s.name}
                  fill
                  sizes="(min-width: 640px) 152px, 112px"
                  className="object-contain opacity-90 transition-opacity group-hover:opacity-100"
                />
              </span>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}

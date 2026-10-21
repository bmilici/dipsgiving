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
    <section className="py-16 sm:py-20 bg-gradient-to-b from-amber-50 to-orange-50">
      <div className="mx-auto max-w-5xl px-4 text-center">
        <p className="mb-2 text-sm font-medium uppercase tracking-widest text-orange-600">
          Thank You To
        </p>
        <h2 className="text-3xl sm:text-4xl font-bold text-orange-900 mb-10">
          Our Sponsors
        </h2>

        <div className="flex flex-wrap items-center justify-center gap-8 sm:gap-12">
          {sponsors.map((s) => (
            <a
              key={s.name}
              href={s.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-center justify-center rounded-2xl bg-white p-6 shadow-sm border border-orange-100 hover:shadow-md hover:border-orange-200 transition-all"
            >
              <img
                src={s.logo}
                alt={s.name}
                className="h-24 sm:h-28 w-auto object-contain opacity-90 group-hover:opacity-100 transition-opacity"
              />
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}

export default function Sponsors() {
  const sponsors = [
    {
      name: "One Fresh Hat",
      url: "https://www.onefreshhat.com/",
      logo: "/sponsors/onefreshhat.png",
    },
     { name: "Point Ybel Brewing", url: "https://pointybelbrew.com/", logo: "/sponsors/pointybelbrew.png" },
  ];

  return (
    <section className="py-16 bg-amber-50 border-t border-amber-200">
      <div className="mx-auto max-w-5xl px-4 text-center space-y-8">
        <h2 className="text-3xl font-bold text-orange-900">Sponsors</h2>

        <div className="flex flex-wrap justify-center gap-10">
          {sponsors.map((s) => (
            <a
              key={s.name}
              href={s.url}
              target="_blank"
              rel="noopener noreferrer"
              className="transition hover:opacity-80"
            >
              <img
                src={s.logo}
                alt={s.name}
                className="h-32 object-contain"
              />
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}

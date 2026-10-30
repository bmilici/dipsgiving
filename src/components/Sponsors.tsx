import Image from "next/image";
import { HeartHandshake } from "lucide-react";
import { testingAssetPath } from "@/lib/testingMode";

const sponsorCategories = ["Prize Sponsors", "Event sponsors", "Good friends, good businesses"] as const;
type SponsorCategory = typeof sponsorCategories[number];
type Sponsor = { name: string; url: string; logo: string; category?: SponsorCategory };

const defaultSponsors: readonly Sponsor[] = [
  { name: "Amber Reyes, Broker Associate", url: "https://www.amberreyesrealtor.com/", category: "Prize Sponsors", logo: "/sponsors/amber-reyes-realtor.png" },
  { name: "smiLee Pediatric Dentistry & Orthodontics", url: "https://drsmilee.com/", category: "Event sponsors", logo: "/sponsors/smilee-logo.webp" },
  { name: "Point Ybel Brewing", url: "https://pointybelbrew.com/", category: "Event sponsors", logo: "/sponsors/pointybelbrew.png" },
  { name: "One Fresh Hat", url: "https://www.onefreshhat.com/", logo: "/sponsors/onefreshhat.png" },
  { name: "A T PRECISION PRESSURE WASHING 239-219-9513", url: "https://atppw.com/", logo: "/sponsors/AT.png" },
  { name: "Via Brio", url: "https://viabrioadvising.com/", category: "Good friends, good businesses", logo: "/sponsors/via-brio.webp" },
];

export default function Sponsors({ sponsors = defaultSponsors }: { sponsors?: readonly Sponsor[] }) {
  return (
    <section className="festival-section border-t border-border bg-background" aria-labelledby="sponsors-heading">
      <div className="festival-container">
        <div className="mb-8 text-center">
          <p className="festival-kicker">A little local love</p>
          <h2 id="sponsors-heading" className="mt-2 text-3xl text-forest sm:text-4xl">Good company. Great supporters.</h2>
        </div>
        {sponsors.length ? (
          <div className="mx-auto max-w-4xl space-y-10 sm:space-y-12">
            {sponsorCategories.map((category, index) => {
              const members = sponsors.filter(sponsor => (sponsor.category ?? "Good friends, good businesses") === category);
              if (!members.length) return null;
              return (
                <div key={category} role="group" aria-labelledby={`sponsor-category-${index}`}>
                  <h3 id={`sponsor-category-${index}`} className="mb-5 text-center text-2xl text-forest sm:text-3xl">{category}</h3>
                  <div className="flex flex-wrap justify-center gap-4 sm:gap-6">
                    {members.map(sponsor => (
                      <a key={sponsor.name} href={sponsor.url} target="_blank" rel="noopener noreferrer" className="festival-card festival-lift flex h-44 w-full max-w-xs items-center justify-center p-5 sm:h-48 sm:w-64 sm:p-6">
                        <Image src={testingAssetPath(sponsor.logo)} alt={sponsor.name} width={180} height={180} sizes="180px" className="h-32 w-full object-contain" loading="lazy" />
                      </a>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="festival-card mx-auto max-w-xl px-6 py-8 text-center">
            <HeartHandshake className="mx-auto mb-3 h-8 w-8 text-primary" aria-hidden="true" />
            <h3 className="text-xl text-forest">There’s room at the table.</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">Sponsor announcements will appear here. Thanks for being part of Dipsgiving.</p>
          </div>
        )}
      </div>
    </section>
  );
}

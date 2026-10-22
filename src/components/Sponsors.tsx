import Image from "next/image";
import { HeartHandshake } from "lucide-react";
import { testingAssetPath } from "@/lib/testingMode";

type Sponsor = { name: string; url: string; logo: string };

const defaultSponsors: readonly Sponsor[] = [
  { name: "Amber Reyes, Broker Associate", url: "https://www.amberreyesrealtor.com/", logo: "/sponsors/amber-reyes-realtor.png" },
  { name: "Point Ybel Brewing", url: "https://pointybelbrew.com/", logo: "/sponsors/pointybelbrew.png" },
  { name: "One Fresh Hat", url: "https://www.onefreshhat.com/", logo: "/sponsors/onefreshhat.png" },
  { name: "A T PRECISION PRESSURE WASHING 239-219-9513", url: "https://atppw.com/", logo: "/sponsors/AT.png" },
  { name: "smiLee Pediatric Dentistry & Orthodontics", url: "https://drsmilee.com/", logo: "/sponsors/smilee-logo.webp" },
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
          <div className="mx-auto grid max-w-5xl grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 lg:grid-cols-4">
            {sponsors.map(sponsor => (
              <a key={sponsor.name} href={sponsor.url} target="_blank" rel="noopener noreferrer" className="festival-card festival-lift flex h-44 items-center justify-center p-5 sm:h-48 sm:p-6">
                <Image src={testingAssetPath(sponsor.logo)} alt={sponsor.name} width={180} height={180} sizes="180px" className="h-32 w-full object-contain" loading="lazy" />
              </a>
            ))}
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

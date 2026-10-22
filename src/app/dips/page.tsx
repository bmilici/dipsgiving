"use client";

import { useEffect, useState } from "react";
import EmptyState from "@/components/EmptyState";
import { siteRoutes } from "@/lib/siteNavigation";
import { watchPublicDips, type PublicDip } from "@/lib/rsvp/public-dips";

export default function DipListPage() {
  const [dips, setDips] = useState<PublicDip[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const feed = watchPublicDips(
      (rows) => {
        setDips(rows);
        setError(null);
        setIsLoading(false);
      },
      () => {
        setError("Failed to load dips. Please try again later.");
        setIsLoading(false);
      },
      "current",
    );
    return () => feed.close();
  }, []);

  return (
    <main className="festival-page">
      <div className="festival-container">
        <header className="festival-page-heading">
          <p className="festival-kicker mb-3">Meet the competition</p>
          <h1 className="font-display text-4xl leading-tight text-foreground sm:text-5xl md:text-6xl">
            The Dip Lineup
          </h1>
          <p className="mt-4 text-base leading-relaxed text-muted-foreground">
            A little friendly competition. A whole lot of dip.
          </p>
        </header>

        {error && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-700">
            {error}
          </div>
        )}

        {isLoading && (
          <p className="py-8 text-center text-sm text-muted-foreground" role="status">
            Gathering the dip lineup…
          </p>
        )}

        {!isLoading && !error && dips.length === 0 ? (
          <EmptyState
            variant="dips"
            title="The Competition Is Heating Up!"
            description="But nobody has entered the dip arena yet. Be the first to bring the flavor!"
            action={{ href: siteRoutes.registerDip.href, label: "Register Your Dip" }}
          />
        ) : (
          <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {dips.map((d) => (
              <li
                key={d.id}
                className="festival-card festival-lift min-w-0 p-6"
              >
                <h2 className="break-words font-display text-2xl leading-snug text-foreground">
                  {d.dip_name}
                </h2>
                <div className="mt-2 text-sm text-muted-foreground">
                  {d.name ? `by ${d.name}` : "by RSVP’d guest"}
                </div>
                {d.notes && (
                  <div className="mt-4 border-t border-border pt-4 text-sm leading-relaxed text-muted-foreground">{d.notes}</div>
                )} 
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}

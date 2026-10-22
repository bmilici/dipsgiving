"use client";

import { useEffect } from "react";
import { Trophy } from "lucide-react";
import InlineRegisterForm from "../../../components/InlineRegisterForm";
import PhoneRsvpForm from "@/components/PhoneRsvpForm";
import { isRsvpLookupTestingEnabled } from "@/lib/rsvp/testing";
import { isTestingMode } from "@/lib/testingMode";

export default function RegisterDipPage() {
  // open the form in “dip-only” mode
  useEffect(() => {
    if (isTestingMode && !isRsvpLookupTestingEnabled) {
      window.dispatchEvent(new CustomEvent("open-dip-only"));
    }
  }, []);

  return (
    <main className="festival-page festival-registration festival-registration--dip">
      <section className="festival-container">
        <header className="festival-page-heading">
          <div className="festival-registration-icon mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border border-gold/60 bg-gold/25 text-forest">
            <Trophy className="h-8 w-8" aria-hidden="true" strokeWidth={1.5} />
          </div>
          <p className="festival-kicker mb-3">Bring your best</p>
          <h1 className="font-display text-4xl leading-tight text-foreground sm:text-5xl md:text-6xl">
            Enter the Dip Showdown!
          </h1>
          <p className="mt-5 text-base leading-relaxed text-muted-foreground">
            Give your contender a name and a place in the lineup. Before submitting, check the registered dips below to make sure no one has already entered the same dip. Let’s keep the table diverse!
          </p>
        </header>

        {!isTestingMode || isRsvpLookupTestingEnabled ? <PhoneRsvpForm initialMode="lookup" /> : <InlineRegisterForm />}
      </section>
    </main>
  );
}

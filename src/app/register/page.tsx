"use client";

import { CalendarDays } from "lucide-react";
import InlineRegisterForm from "../../components/InlineRegisterForm";

export default function RegisterPage() {
  return (
    <main className="festival-page festival-registration festival-registration--rsvp">
      <section className="festival-container">
        <header className="festival-page-heading">
          <div className="festival-registration-icon mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border border-forest/20 bg-forest/10 text-forest">
            <CalendarDays className="h-8 w-8" aria-hidden="true" strokeWidth={1.5} />
          </div>
          <p className="festival-kicker mb-3">A seat at the table</p>
          <h1 className="font-display text-4xl leading-tight text-foreground sm:text-5xl md:text-6xl">
            You’re Invited to Dipsgiving!
          </h1>
          <p className="mt-5 text-base leading-relaxed text-muted-foreground">
            Tell us who’s coming and how many seats to save. Bringing a dip? You can add it with your RSVP—just check the lineup below first to keep the table full of variety.
          </p>
        </header>

        <InlineRegisterForm />
      </section>
    </main>
  );
}

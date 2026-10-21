"use client";

import { useEffect } from "react";
import InlineRegisterForm from "../../../components/InlineRegisterForm";

export default function RegisterDipPage() {
  // open the form in “dip-only” mode
  useEffect(() => {
    window.dispatchEvent(new CustomEvent("open-dip-only"));
  }, []);

  return (
    <main className="festival-page">
      <section className="festival-container">
        <header className="festival-page-heading mx-auto mb-10 max-w-2xl">
          <p className="festival-kicker mb-3">Bring your best</p>
          <h1 className="font-display text-4xl leading-tight text-foreground sm:text-5xl md:text-6xl">
            Add Your Dip
          </h1>
          <p className="mt-5 text-base leading-relaxed text-muted-foreground">
            Before submitting your dip, please check the Dip List below to make sure no one has already registered the same dip. Let’s keep the table diverse!
          </p>
        </header>

        <InlineRegisterForm />
      </section>
    </main>
  );
}

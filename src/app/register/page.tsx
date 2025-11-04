"use client";

import Link from "next/link";
import InlineRegisterForm from "../../components/InlineRegisterForm";

export default function RegisterPage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-orange-50 to-amber-50">
      <section className="mx-auto max-w-4xl px-4 py-10">
        <h2 className="mb-4 text-3xl font-bold text-orange-900 text-center">
          RSVP for Dipsgiving
        </h2>

        <p className="mb-6 text-center text-orange-800/80">
          Before submitting your dip, please check the Dip List below to make sure no one has already registered the same dip. Let’s keep the table diverse!
        </p>

        <InlineRegisterForm />
      </section>
    </main>
  );
}

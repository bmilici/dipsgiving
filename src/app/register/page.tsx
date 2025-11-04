"use client";

import Link from "next/link";
import InlineRegisterForm from "../../components/InlineRegisterForm"; // ← relative path

export default function RegisterPage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-orange-50 to-amber-50">

      <p className="text-center text-orange-800/80 mb-6">
        Before submitting your dip, please check the{" "}
        <a
          href="/dips"
          className="font-semibold text-orange-700 hover:text-orange-900 underline underline-offset-4"
        >
          Dip List
        </a>{" "}
        to make sure no one has already registered the same dip. Let’s keep the table diverse!
      </p>

      <section className="mx-auto max-w-4xl px-4 py-10">
        <h2 className="mb-6 text-3xl font-bold text-orange-900 text-center">
          RSVP for Dipsgiving
        </h2>
        <InlineRegisterForm />
      </section>
    </main>
  );
}

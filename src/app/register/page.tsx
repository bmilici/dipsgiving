"use client";

import Link from "next/link";
import InlineRegisterForm from "../../components/InlineRegisterForm"; // ← relative path

export default function RegisterPage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-orange-50 to-amber-50">

      <section className="mx-auto max-w-4xl px-4 py-10">
        <h2 className="mb-6 text-3xl font-bold text-orange-900 text-center">
          RSVP for Dipsgiving
        </h2>
        <InlineRegisterForm />
      </section>
    </main>
  );
}

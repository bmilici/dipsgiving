"use client";

import Link from "next/link";
import InlineRegisterForm from "@/components/InlineRegisterForm";

export default function RegisterPage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-orange-50 to-amber-50">
      <header className="sticky top-0 z-20 border-b border-orange-200/60 bg-white/70 backdrop-blur">
        <nav className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Link href="/" className="text-lg font-semibold text-orange-900">
            Dipsgiving
          </Link>
        </nav>
      </header>

      <section className="mx-auto max-w-3xl px-4 py-14">
        <h1 className="mb-6 text-center text-4xl font-bold text-orange-900">
          Register
        </h1>
        <p className="mb-10 text-center text-orange-700/80">
          One form per dip. If you’re not bringing a dip, leave that option
          unchecked—we still want to know you’re coming!
        </p>

        <InlineRegisterForm />
      </section>

      <footer className="border-t border-orange-200/60 bg-white/60 py-8">
        <p className="text-center text-sm text-orange-800/70">
          dipsgiving.com • © {new Date().getFullYear()}
        </p>
      </footer>
    </main>
  );
}

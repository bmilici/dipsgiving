"use client";

import Link from "next/link";
import Sponsors from "@/components/Sponsors";
import { useEventSettings } from "@/lib/eventSettings";
import { ArrowUpRight, MapPin, MessageCircle } from "lucide-react";

const steps = [
  { number: "01", title: "Bring a dip.", description: "Your signature recipe or a new contender. Register each dip separately so everyone can find it." },
  { number: "02", title: "Taste everything.", description: "Grab some dippers, discover a new favorite, and settle in for a good time." },
  { number: "03", title: "Crown a champion.", description: "When voting opens, pick your favorites and help decide who takes home the bragging rights." },
];

export default function Page() {
  const eventSettings = useEventSettings();
  return (
    <main className="bg-[#faf6ed] text-[#35291f]">
      <section className="mx-auto max-w-6xl px-6 pb-20 pt-16 sm:px-8 sm:pb-28 sm:pt-24">
        <div className="max-w-3xl">
          <p className="mb-5 text-xs font-semibold uppercase tracking-[0.22em] text-[#9b4a2c]">{eventSettings.eventNumberLabel} · Fort Myers, Florida</p>
          <h1 className="text-5xl font-extrabold leading-[1.06] tracking-tight sm:text-7xl">{eventSettings.eventName}</h1>
          <p className="mt-6 max-w-lg text-lg leading-relaxed text-[#706052] sm:text-xl">Bring a bathing suit and a dip. We have the booze and dippers.</p>
          <div className="mt-7 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm font-medium sm:text-base" aria-label="Event date, time, and city">
            <span>{eventSettings.dateLabel}</span><span aria-hidden="true" className="text-[#bda68b]">/</span><span>{eventSettings.timeLabel}</span><span aria-hidden="true" className="text-[#bda68b]">/</span><span>Fort Myers</span>
          </div>
          <div className="mt-9 flex flex-wrap items-center gap-x-7 gap-y-5">
            <Link href="/register" className="inline-flex items-center gap-6 rounded-full bg-[#b74727] px-7 py-4 font-semibold text-white transition-colors hover:bg-[#94391f] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#b74727]">RSVP Now <ArrowUpRight className="h-4 w-4" /></Link>
            <Link href="/register/dip" className="border-b border-[#a38c75] pb-1 text-sm font-semibold transition-colors hover:text-[#b74727]">Register your dip</Link>
          </div>
        </div>
      </section>

      <section className="border-y border-[#ded3c2]" aria-labelledby="how-it-works">
        <div className="mx-auto max-w-6xl px-6 py-16 sm:px-8 sm:py-20">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#9b4a2c]">The recipe for a good time</p>
          <h2 id="how-it-works" className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">A little friendly dip-petition.</h2>
          <div className="mt-10 grid gap-9 sm:grid-cols-3 sm:gap-10">
            {steps.map(step => <div key={step.number}><span className="text-xs font-semibold tracking-widest text-[#9b4a2c]">{step.number}</span><h3 className="mt-4 text-xl font-bold">{step.title}</h3><p className="mt-3 text-sm leading-7 text-[#706052]">{step.description}</p></div>)}
          </div>
        </div>
      </section>

      <section className="bg-[#173f3b] text-[#faf6ed]" aria-labelledby="details-heading">
        <div className="mx-auto grid max-w-6xl gap-10 px-6 py-16 sm:px-8 sm:py-20 lg:grid-cols-[1fr_1.5fr] lg:gap-20">
          <div><p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#d9b883]">Make yourself at home</p><h2 id="details-heading" className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">See you by<br className="hidden lg:block" /> the dip table.</h2></div>
          <div className="grid gap-8 sm:grid-cols-2">
            <a href="https://maps.google.com/?q=10600+Highgrove+Place+Fort+Myers+Florida+33913" target="_blank" rel="noopener noreferrer" className="group border-t border-white/25 pt-5"><MapPin className="mb-4 h-5 w-5 text-[#d9b883]" /><h3 className="font-semibold">The place</h3><p className="mt-3 text-sm leading-7 text-[#d4ded7]">10600 Highgrove Place<br />Fort Myers, Florida 33913</p><p className="mt-3 text-sm text-[#d9b883]">Gate code: 18445</p><span className="mt-5 inline-flex items-center gap-2 text-sm font-semibold group-hover:underline">Get directions <ArrowUpRight className="h-4 w-4" /></span></a>
            <a href="sms:+13016611626" className="group border-t border-white/25 pt-5"><MessageCircle className="mb-4 h-5 w-5 text-[#d9b883]" /><h3 className="font-semibold">A question or two?</h3><p className="mt-3 text-sm leading-7 text-[#d4ded7]">Erika has you covered.<br />(301) 661-1626</p><span className="mt-5 inline-flex items-center gap-2 text-sm font-semibold group-hover:underline">Send Erika a text <ArrowUpRight className="h-4 w-4" /></span></a>
          </div>
        </div>
      </section>
      <Sponsors />
      <footer className="border-t border-[#ded3c2] px-6 py-7"><div className="mx-auto flex max-w-6xl flex-wrap justify-between gap-3 text-xs text-[#706052]"><span className="font-semibold">Dipsgiving</span><span>Good dips. Great company. · {new Date().getFullYear()}</span></div></footer>
    </main>
  );
}

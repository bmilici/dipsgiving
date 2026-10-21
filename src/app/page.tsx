"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, CalendarDays, Clock3, MapPin, MessageCircle, Soup, Star, Trophy, Vote } from "lucide-react";
import EventCountdown from "@/components/EventCountdown";
import Sponsors from "@/components/Sponsors";
import { useEventSettings } from "@/lib/eventSettings";

const quickLinks = [
  { href: "/dips", label: "The Dip Lineup", description: "Check out the competition.", Icon: Soup, number: "01" },
  { href: "/vote", label: "Cast Your Vote", description: "Every dip deserves a shot at glory.", Icon: Vote, number: "02" },
  { href: "/winners", label: "Hall of Fame", description: "Legends are made one dip at a time.", Icon: Trophy, number: "03" },
];

export default function Page() {
  const eventSettings = useEventSettings();
  const annualLabel = eventSettings.eventNumberLabel.trim();
  const eventName = eventSettings.eventName.trim();
  const repeatedPrefix = `${annualLabel} `;
  const heroTitle = annualLabel && eventName.toLowerCase().startsWith(repeatedPrefix.toLowerCase())
    ? eventName.slice(repeatedPrefix.length).trim() || eventName
    : eventName;

  return (
    <main>
      <section className="festival-paper relative border-b border-border" aria-labelledby="hero-heading">
        <div className="festival-container grid items-center gap-4 pb-9 pt-10 sm:pb-14 sm:pt-16 lg:grid-cols-[1.15fr_1fr] lg:gap-0 lg:pb-16 lg:pt-20">
          <div className="festival-entrance relative z-10 text-center lg:text-left">
            <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/5 px-4 py-2 text-xs font-bold uppercase tracking-[0.16em] text-orange-700">
              <Star className="h-3.5 w-3.5 fill-current" aria-hidden="true" /> {annualLabel} <Star className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
            </p>
            <h1 id="hero-heading" className="break-words font-display text-[clamp(2.6rem,7.2vw,5.75rem)] leading-[1] tracking-[-0.045em] text-forest uppercase">{heroTitle}</h1>
            <p className="mt-4 font-display text-[clamp(1.5rem,3vw,2.25rem)] leading-tight text-primary">The Ultimate Dip Showdown</p>
            <p className="mx-auto mt-5 max-w-md text-base leading-7 text-muted-foreground sm:text-lg lg:mx-0">Bring a bathing suit and a dip. We have the booze and dippers.</p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm font-semibold text-forest lg:justify-start">
              <span className="inline-flex items-center gap-2"><CalendarDays className="h-4 w-4 text-primary" aria-hidden="true" />{eventSettings.dateLabel}</span>
              <span className="inline-flex items-center gap-2"><Clock3 className="h-4 w-4 text-primary" aria-hidden="true" />{eventSettings.timeLabel} ET</span>
            </div>
            <div className="mx-auto mt-8 flex max-w-md flex-col gap-3 min-[400px]:flex-row min-[400px]:justify-center lg:mx-0 lg:justify-start">
              <Link href="/register" className="festival-button">RSVP NOW <ArrowUpRight className="h-4 w-4 shrink-0" aria-hidden="true" /></Link>
              <Link href="/register/dip" className="festival-button-secondary">REGISTER YOUR DIP</Link>
            </div>
          </div>
          <div className="festival-entrance relative mx-auto w-full max-w-[470px] lg:max-w-none">
            <Image src="/illustrations/dip-table.svg" alt="Illustrated bowls of queso, buffalo chicken dip, and green dip with tortilla chips on a picnic cloth" width={600} height={550} priority sizes="(min-width: 1024px) 46vw, (min-width: 640px) 470px, 92vw" className="h-auto w-full" />
            <div aria-hidden="true" className="absolute right-[2%] top-[8%] flex h-24 w-24 rotate-12 flex-col items-center justify-center rounded-full border-2 border-forest bg-gold text-center font-display text-lg leading-tight text-forest shadow-[3px_3px_0_#324F3C] sm:h-28 sm:w-28 sm:text-xl">Big dips.<br />Bigger<br />bragging rights.</div>
          </div>
        </div>
      </section>

      <EventCountdown />

      <section className="bg-background py-12 sm:py-16" aria-labelledby="competition-heading">
        <div className="festival-container">
          <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
            <div><p className="festival-kicker">A little friendly competition</p><h2 id="competition-heading" className="mt-2 text-3xl text-forest sm:text-4xl">Every dip has its day.</h2></div>
            <span className="text-sm text-muted-foreground">Find your next favorite.</span>
          </div>
          <div className="grid gap-4 md:grid-cols-3 sm:gap-5">
            {quickLinks.map(({ href, label, description, Icon, number }) => (
              <Link key={href} href={href} className="festival-card festival-lift group flex flex-col p-6 sm:p-7">
                <div className="mb-6 flex items-center justify-between"><span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gold/25 text-forest"><Icon className="h-6 w-6" aria-hidden="true" /></span><span aria-hidden="true" className="text-xs font-bold tracking-widest text-primary/80">{number}</span></div>
                <h3 className="text-2xl text-forest">{label}</h3>
                <p className="mb-6 mt-2 flex-1 text-sm leading-6 text-muted-foreground">{description}</p>
                <span className="flex items-center justify-between border-t border-border pt-4 text-xs font-bold uppercase tracking-wider text-primary">Take a look <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1 motion-reduce:transform-none" aria-hidden="true" /></span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-forest py-14 text-cream sm:py-20" aria-labelledby="details-heading">
        <div className="festival-container grid gap-10 lg:grid-cols-[1fr_1.05fr] lg:gap-20">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.17em] text-cream">Come hungry. Leave legendary.</p>
            <h2 id="details-heading" className="mt-4 max-w-lg text-4xl leading-tight sm:text-5xl">Good dips.<br />Great company.</h2>
            <p className="mt-5 max-w-lg text-base leading-7 text-cream/85">An annual gathering of friends, favorite recipes, and a little friendly competition. Bring a dip, taste the lineup, and help crown the crowd’s favorites when voting opens.</p>
            <p className="mt-4 max-w-lg text-sm leading-7 text-cream/85">RSVP to let us know you’re coming, and register each dip separately. Check the dip list first so we can keep the table full of variety.</p>
            <Link href="/register" className="mt-6 inline-flex min-h-11 items-center gap-3 font-semibold text-cream underline decoration-gold/50 underline-offset-8 hover:decoration-gold">Save your spot <ArrowUpRight className="h-4 w-4" aria-hidden="true" /></Link>
          </div>
          <div className="grid gap-6 sm:grid-cols-2">
            <div className="border-t border-cream/25 pt-5 sm:col-span-2">
              <span className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-cream"><CalendarDays className="h-4 w-4" aria-hidden="true" /> Mark your calendar</span>
              <p className="mt-3 font-display text-2xl">{eventSettings.dateLabel}</p>
              <p className="mt-1 text-sm text-cream/85">Starting at {eventSettings.timeLabel} · Eastern Time</p>
            </div>
            <a href="https://maps.google.com/?q=10600+Highgrove+Place+Fort+Myers+Florida+33913" target="_blank" rel="noopener noreferrer" className="group border-t border-cream/25 pt-5">
              <span className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-cream"><MapPin className="h-4 w-4" aria-hidden="true" /> The place</span>
              <p className="mt-3 text-sm leading-7">10600 Highgrove Place<br />Fort Myers, Florida 33913</p>
              <span className="mt-3 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-cream group-hover:underline">Get directions <ArrowUpRight className="h-4 w-4" aria-hidden="true" /></span>
            </a>
            <a href="sms:+13016611626" className="group border-t border-cream/25 pt-5">
              <span className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-cream"><MessageCircle className="h-4 w-4" aria-hidden="true" /> Questions?</span>
              <p className="mt-3 text-sm leading-7">Contact Erika<br />(301) 661-1626</p>
              <span className="mt-3 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-cream group-hover:underline">Send a text <ArrowUpRight className="h-4 w-4" aria-hidden="true" /></span>
            </a>
          </div>
        </div>
      </section>
      <Sponsors />
    </main>
  );
}

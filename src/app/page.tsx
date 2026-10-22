"use client";

import { Suspense } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, CalendarDays, Clock3, MapPin, MessageCircle, Soup, Trophy, Vote } from "lucide-react";
import EventCountdown from "@/components/EventCountdown";
import Sponsors from "@/components/Sponsors";
import RegistrationSuccessNotice from "@/components/RegistrationSuccessNotice";
import { useEventSettings } from "@/lib/eventSettings";
import { testingAssetPath } from "@/lib/testingMode";
import { siteRoutes } from "@/lib/siteNavigation";

const quickLinks = [
  { ...siteRoutes.dips, description: "Check out the competition.", Icon: Soup, number: "01" },
  { ...siteRoutes.vote, description: "Every dip deserves a shot at glory.", Icon: Vote, number: "02" },
  { ...siteRoutes.winners, description: "Legends are made one dip at a time.", Icon: Trophy, number: "03" },
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
      <Suspense fallback={null}><RegistrationSuccessNotice /></Suspense>
      <section className="festival-paper relative border-b border-border" aria-labelledby="hero-heading">
        <div className="festival-container festival-hero-layout">
          <div className="festival-entrance festival-hero-copy">
            <p className="festival-anniversary-badge">
              {annualLabel}
            </p>
            <h1 id="hero-heading" className="festival-hero-title font-display text-forest uppercase">{heroTitle}</h1>
            <p className="mt-4 font-display text-[clamp(1.5rem,3vw,2.25rem)] leading-tight text-primary text-balance">The Ultimate Dip Showdown</p>
            <p className="mx-auto mt-4 max-w-md text-base leading-7 text-muted-foreground sm:text-lg lg:mx-0">Bring a bathing suit and a dip. We have the booze and dippers.</p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm font-semibold text-forest lg:justify-start">
              <span className="inline-flex items-center gap-2"><CalendarDays className="h-4 w-4 text-primary" aria-hidden="true" />{eventSettings.dateLabel}</span>
              <span className="inline-flex items-center gap-2"><Clock3 className="h-4 w-4 text-primary" aria-hidden="true" />{eventSettings.timeLabel} ET</span>
            </div>
            <div className="festival-hero-actions">
              <Link href={siteRoutes.rsvp.href} className="festival-button">{siteRoutes.rsvp.label} <ArrowUpRight className="h-4 w-4 shrink-0" aria-hidden="true" /></Link>
              <Link href={siteRoutes.registerDip.href} className="festival-button-secondary">{siteRoutes.registerDip.label}</Link>
            </div>
          </div>
          <div className="festival-entrance festival-hero-art">
            <Image src={testingAssetPath("/illustrations/dip-table.svg")} alt="Illustrated bowls of queso, buffalo chicken dip, and green dip with tortilla chips on a picnic cloth" width={600} height={510} priority sizes="(min-width: 1280px) 540px, (min-width: 1024px) 46vw, (min-width: 640px) 500px, 92vw" className="relative z-10 h-auto w-full" />
            <div aria-hidden="true" className="festival-hero-stamp">Big dips.<br />Bigger<br />bragging rights.</div>
          </div>
        </div>
      </section>

      <EventCountdown />

      <section className="festival-section bg-background" aria-labelledby="competition-heading">
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

      <section className="festival-section bg-forest text-cream" aria-labelledby="details-heading">
        <div className="festival-container grid gap-10 lg:grid-cols-[1fr_1.05fr] lg:gap-20">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.17em] text-cream">Come hungry. Leave legendary.</p>
            <h2 id="details-heading" className="mt-4 max-w-lg text-4xl leading-tight sm:text-5xl">Good dips.<br />Great company.</h2>
            <p className="mt-5 max-w-lg text-base leading-7 text-cream/85">An annual gathering of friends, favorite recipes, and a little friendly competition. Bring a dip, taste the lineup, and help crown the crowd’s favorites when voting opens.</p>
            <p className="mt-4 max-w-lg text-sm leading-7 text-cream/85">RSVP to let us know you’re coming, and register each dip separately. Check the dip list first so we can keep the table full of variety.</p>
            <Link href={siteRoutes.rsvp.href} className="mt-6 inline-flex min-h-11 items-center gap-3 rounded-md font-semibold text-cream underline decoration-gold/50 underline-offset-8 hover:decoration-gold focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-gold">{siteRoutes.rsvp.label} <ArrowUpRight className="h-4 w-4" aria-hidden="true" /></Link>
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

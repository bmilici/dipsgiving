"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { siteRoutes } from "@/lib/siteNavigation";
import { isTestingMode } from "@/lib/testingMode";

const messages = {
  rsvp_pending: { title: "You're on the list!", message: "Your RSVP is confirmed and your dip is marked as TBD. Return to Register Dip with the same phone number when you've decided what to bring." },
  rsvp_none: { title: "You're on the list!", message: "Your RSVP is confirmed. If you change your mind, return to Register Dip with the same phone number to add a dip." },
  dip_confirmed: { title: "Your dip is officially in the competition!", message: "Your dip is saved and has been added to the lineup." },
  dip_added: { title: "Another contender enters the showdown!", message: "Your additional dip is saved. Your RSVP and party size have not changed." },
  dip_pending: { title: "Your dip is marked as TBD!", message: "Your pending dip is saved. Return to Register Dip with the same phone number to confirm it when you're ready." },
  dip_updated: { title: "Your dip is updated!", message: "Your changes are saved. Your other dips, RSVP, and party size have not changed." },
} as const;

export default function RegistrationSuccessNotice() {
  const searchParams = useSearchParams();
  const kind = searchParams.get("registered");
  if (isTestingMode || !kind || !Object.hasOwn(messages, kind)) return null;
  const notice = messages[kind as keyof typeof messages];

  return <section className="festival-container py-5" role="status" aria-live="polite" aria-atomic="true">
    <div className="festival-card space-y-3 border border-forest/20 p-5 sm:p-6">
      <h2 className="font-display text-2xl text-forest">{notice.title}</h2>
      <p className="text-sm leading-relaxed text-muted-foreground">{notice.message}</p>
      <div className="flex flex-wrap gap-x-5 gap-y-2">
        <Link href={siteRoutes.registerDip.href} className="inline-flex min-h-11 items-center rounded-md text-sm font-semibold text-orange-700 underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary">{siteRoutes.registerDip.label}</Link>
        <Link href={siteRoutes.dips.href} className="inline-flex min-h-11 items-center rounded-md text-sm font-semibold text-orange-700 underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary">{siteRoutes.dips.label}</Link>
      </div>
    </div>
  </section>;
}

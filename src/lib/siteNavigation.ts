export const TESTING_BASE_PATH = "/testing";

// Keep Link destinations relative to the application. Next.js adds basePath in
// testing builds, so callers must not prepend /testing to these destinations.
export const siteRoutes = {
  home: { href: "/", label: "Home" },
  rsvp: { href: "/register", label: "RSVP" },
  registerDip: { href: "/register/dip", label: "Register Dip" },
  dips: { href: "/dips", label: "Dip List" },
  vote: { href: "/vote", label: "Vote" },
  winners: { href: "/winners", label: "Champions" },
} as const;

export const siteNavigation = [
  siteRoutes.home,
  siteRoutes.rsvp,
  siteRoutes.registerDip,
  siteRoutes.dips,
  siteRoutes.vote,
  siteRoutes.winners,
] as const;

/** usePathname strips basePath; accept prefixed paths defensively as well. */
export function normalizeSitePathname(pathname: string): string {
  const path = pathname.split(/[?#]/, 1)[0].replace(/^\/testing(?=\/|$)/i, "");
  return path.replace(/\/+$/, "") || "/";
}

export function isSiteRouteActive(pathname: string, href: string): boolean {
  return normalizeSitePathname(pathname) === normalizeSitePathname(href);
}

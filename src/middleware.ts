import { NextRequest, NextResponse } from "next/server";
import { isTestingMode } from "@/lib/testingMode";
import { siteNavigation, TESTING_BASE_PATH } from "@/lib/siteNavigation";
import { isRsvpLookupTestingEnabled } from "@/lib/rsvp/testing";

const reviewPages = new Set<string>(siteNavigation.map(({ href }) => href));
const publicAsset = /^(?:\/(?:illustrations|sponsors|winners)\/[^?]+\.(?:avif|gif|ico|jpe?g|png|svg|webp)|\/(?:favicon[^/]*\.(?:ico|png|svg)|apple-touch-icon\.png|og-image(?:-5th-2026)?\.png|web-app-manifest-[^/]+\.png|site\.webmanifest))$/i;

// Match the raw URL rather than Next's case-insensitive redirect rules. Only
// legacy preview casing changes; the main site's pages and APIs pass through.
export function middleware(request: NextRequest) {
  const url = new URL(request.url);
  const prefix = url.pathname.match(/^\/testing(?=\/|$|\.txt$)/i)?.[0];

  if (prefix && prefix !== "/testing") {
    url.pathname = `${TESTING_BASE_PATH}${url.pathname.slice(prefix.length)}`;
    if (isTestingMode) url.pathname = url.pathname.replace(/\/+$/, "");
    return NextResponse.redirect(url, 308);
  }

  // Preserve production middleware behavior, including all normal pages, APIs,
  // static export rewrites and request methods, when this is not a preview.
  if (!isTestingMode) return NextResponse.next();

  const pathname = url.pathname.replace(/\/+$/, "") || "/";
  if (!prefix && reviewPages.has(pathname)) {
    url.pathname = pathname === "/" ? TESTING_BASE_PATH : `${TESTING_BASE_PATH}${pathname}`;
    return NextResponse.redirect(url, 307);
  }

  const page = prefix ? pathname.slice(prefix.length) || "/" : pathname;
  if (prefix && page === "/api/dips") {
    if (!["GET", "HEAD"].includes(request.method)) {
      return new NextResponse("The testing preview is read-only.", { status: 405, headers: { Allow: "GET, HEAD" } });
    }
    return NextResponse.next();
  }
  if (prefix && page === "/api/rsvp" && isRsvpLookupTestingEnabled) {
    if (!["GET", "HEAD", "POST"].includes(request.method)) {
      return new NextResponse("Method not allowed.", { status: 405, headers: { Allow: "GET, HEAD, POST" } });
    }
    return NextResponse.next();
  }
  const isAsset = prefix && (page.startsWith("/_next/") || publicAsset.test(page));
  if (!prefix || (!reviewPages.has(page) && !isAsset)) {
    return new NextResponse("This page is not included in the Dipsgiving testing preview.", { status: 404 });
  }
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new NextResponse("The testing preview is read-only.", { status: 405, headers: { Allow: "GET, HEAD" } });
  }
  if (url.pathname !== pathname && reviewPages.has(page)) {
    url.pathname = pathname;
    return NextResponse.redirect(url, 308);
  }

  return NextResponse.next();
}

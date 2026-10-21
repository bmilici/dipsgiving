import { NextRequest, NextResponse } from "next/server";
import { isTestingMode } from "@/lib/testingMode";

const reviewPages = new Set(["/", "/register", "/register/dip", "/dips", "/vote", "/winners"]);
const publicAsset = /^(?:\/(?:illustrations|sponsors|winners)\/[^?]+\.(?:avif|gif|ico|jpe?g|png|svg|webp)|\/(?:favicon[^/]*\.(?:ico|png|svg)|web-app-manifest-[^/]+\.png|site\.webmanifest))$/i;

// Do not add a matcher: Next prefixes explicit middleware matchers with basePath,
// which would prevent us from safely redirecting old /Testing bookmarks and /.
export function middleware(request: NextRequest) {
  if (!isTestingMode) return NextResponse.next();

  const url = new URL(request.url);
  const pathname = url.pathname;
  const testingPrefix = pathname.match(/^\/testing(?=\/|$)/i)?.[0];

  if (testingPrefix && testingPrefix !== "/testing") {
    url.pathname = `/testing${pathname.slice(testingPrefix.length)}`;
    return NextResponse.redirect(url, 308);
  }

  if (!testingPrefix && reviewPages.has(pathname)) {
    url.pathname = pathname === "/" ? "/testing" : `/testing${pathname}`;
    return NextResponse.redirect(url, 307);
  }

  // Keep this review deployment limited to the six guest-facing pages. Existing
  // admin tools and unrelated projects keep their normal code and remain closed.
  const page = testingPrefix ? pathname.slice(testingPrefix.length) || "/" : pathname;
  const isAsset = testingPrefix && (page.startsWith("/_next/") || publicAsset.test(page));
  if (!testingPrefix || (!reviewPages.has(page) && !isAsset)) {
    return new NextResponse("This page is not included in the Dipsgiving design preview.", { status: 404 });
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    return new NextResponse("The design preview is read-only.", { status: 405, headers: { Allow: "GET, HEAD" } });
  }

  return NextResponse.next();
}

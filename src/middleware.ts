import { NextRequest, NextResponse } from "next/server";

// Match the raw URL rather than Next's case-insensitive redirect rules. Only
// legacy preview casing changes; the main site's pages and APIs pass through.
export function middleware(request: NextRequest) {
  const url = new URL(request.url);
  const prefix = url.pathname.match(/^\/testing(?=\/|$|\.txt$)/i)?.[0];

  if (prefix && prefix !== "/testing") {
    url.pathname = `/testing${url.pathname.slice(prefix.length)}`;
    return NextResponse.redirect(url, 308);
  }

  return NextResponse.next();
}

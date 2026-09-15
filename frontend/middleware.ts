import { NextRequest, NextResponse } from "next/server";

// Redirect-to-login gate for PUBLIC_MODE deployments. This is UX only --
// the real enforcement is server-side in FastAPI (every endpoint depends on
// auth.require_role), so a missing/expired cookie here just means "bounce
// to the login page early" rather than "flash locked content then fail".
const PUBLIC_MODE = process.env.NEXT_PUBLIC_PUBLIC_MODE === "true";
const SESSION_COOKIE = "gotleaks_session";
const PUBLIC_PATHS = ["/login"];

export function middleware(request: NextRequest) {
  if (!PUBLIC_MODE) return NextResponse.next();

  const { pathname } = request.nextUrl;
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) return NextResponse.next();

  const hasCookie = request.cookies.has(SESSION_COOKIE);
  if (!hasCookie) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

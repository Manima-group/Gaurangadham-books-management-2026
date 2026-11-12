import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

export function middleware(req: NextRequest) {
  const hasSession = !!getSessionCookie(req);
  const { pathname } = req.nextUrl;
  const open = pathname === "/login" || pathname === "/offline" || pathname === "/sw.js" || pathname === "/manifest.webmanifest";
  if (!hasSession && !open) {
    return NextResponse.redirect(new URL("/login", req.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next|favicon.ico|favicon.svg|icons|brand|covers|sw.js|manifest.webmanifest|.*\\.(?:png|jpg|svg|webp|js|woff2?)).*)"],
};

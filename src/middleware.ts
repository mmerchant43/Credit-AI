// Every page and API route requires a valid signed session cookie except the
// login page and the login API itself. Runs on the Edge runtime — session
// verification uses Web Crypto only (see lib/session.ts).
import { NextRequest, NextResponse } from "next/server";
import { verifySession, SESSION_COOKIE } from "@/lib/session";

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname === "/login" || pathname === "/api/login") return NextResponse.next();

  const secret = process.env.AUTH_SECRET;
  const session = secret ? await verifySession(req.cookies.get(SESSION_COOKIE)?.value, secret) : null;
  if (session) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createSessionToken, SESSION_COOKIE, SESSION_TTL_HOURS } from "@/lib/session";

export const dynamic = "force-dynamic";

const Body = z.object({
  name: z.string().min(1),
  password: z.string().min(1),
});

export async function POST(req: NextRequest) {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "AUTH_SECRET is not configured on the server." }, { status: 500 });
  }
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter your name and the team password." }, { status: 400 });
  }
  const body = parsed.data;

  // Two shared team passwords decide the role — same model as the Industrial site.
  let role: "ANALYST" | "ADMIN" | null = null;
  if (process.env.ADMIN_PASSWORD && body.password === process.env.ADMIN_PASSWORD) role = "ADMIN";
  else if (process.env.ANALYST_PASSWORD && body.password === process.env.ANALYST_PASSWORD) role = "ANALYST";
  if (!role) {
    return NextResponse.json({ error: "Wrong password." }, { status: 401 });
  }

  const token = await createSessionToken(body.name, role, secret);
  const res = NextResponse.json({ ok: true, role });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_HOURS * 3600,
  });
  return res;
}

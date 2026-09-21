import { NextResponse } from "next/server";
import { currentSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

// Reads the signed cookie only — no database hit (currentUser() upserts a
// User row and belongs on WRITE paths, not on a call fired every page load).
export async function GET() {
  const session = await currentSession();
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  return NextResponse.json({ name: session.name, role: session.role });
}

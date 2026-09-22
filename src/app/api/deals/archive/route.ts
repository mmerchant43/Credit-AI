import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { currentUser } from "@/lib/auth";

// ✕ a deal analysis off the homepage (Mason, 9/22/26). Archived, never
// hard-deleted; the subject comp in the database is untouched.
export async function POST(req: Request) {
  try {
    await currentUser();
    const { id } = (await req.json()) as { id?: string };
    if (!id) return NextResponse.json({ error: "Bad request." }, { status: 400 });
    await prisma.dealAnalysis.update({ where: { id }, data: { archived: true, pinned: false } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("POST /api/deals/archive", e);
    return NextResponse.json({ error: "Could not remove." }, { status: 500 });
  }
}

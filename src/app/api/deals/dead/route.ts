import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { currentUser } from "@/lib/auth";

// Mark a deal analysis DEAD, or revive it (Mason, 9/25/26). Unlike ✕
// (archive), a dead deal stays on the homepage — badged and sorted below
// the live ones — because a dead deal is still a data point.
export async function POST(req: Request) {
  try {
    await currentUser();
    const { id, dead } = (await req.json()) as { id?: string; dead?: boolean };
    if (!id || typeof dead !== "boolean") {
      return NextResponse.json({ error: "Bad request." }, { status: 400 });
    }
    await prisma.dealAnalysis.update({
      where: { id },
      data: { dead, ...(dead ? { pinned: false } : {}) },
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("POST /api/deals/dead", e);
    return NextResponse.json({ error: "Could not update." }, { status: 500 });
  }
}

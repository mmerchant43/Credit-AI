import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { currentUser } from "@/lib/auth";

// Star / unstar a deal analysis for the homepage's Pinned Deals section.
export async function POST(req: Request) {
  try {
    await currentUser();
    const { id, pinned } = (await req.json()) as { id?: string; pinned?: boolean };
    if (!id || typeof pinned !== "boolean") {
      return NextResponse.json({ error: "Bad request." }, { status: 400 });
    }
    await prisma.dealAnalysis.update({ where: { id }, data: { pinned } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("POST /api/deals/pin", e);
    return NextResponse.json({ error: "Could not update." }, { status: 500 });
  }
}

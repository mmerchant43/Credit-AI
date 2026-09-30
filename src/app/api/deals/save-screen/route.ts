import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { currentUser } from "@/lib/auth";

// Auto-save the analysis screen state (Mason, 9/30/26): whatever was last
// on the URL — radius, boundary, criteria, removed comps — is stored so
// reopening the deal from the homepage restores the exact filtered view.
export async function POST(req: Request) {
  try {
    await currentUser();
    const { id, params } = (await req.json()) as { id?: string; params?: string };
    if (!id || typeof params !== "string" || params.length > 4000) {
      return NextResponse.json({ error: "Bad request." }, { status: 400 });
    }
    await prisma.dealAnalysis.update({
      where: { id },
      data: { screenParams: params || null },
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("POST /api/deals/save-screen", e);
    return NextResponse.json({ error: "Could not save." }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { currentUser } from "@/lib/auth";

// Resolve a duplicate-comp flag (Mason, 9/21/26):
//  archive — the chosen rows disappear from every screen (archived, never
//            hard-deleted, per house doctrine)
//  approve — the rows are genuinely different deals; stop flagging them
export async function POST(req: Request) {
  try {
    const user = await currentUser();
    const { action, ids } = (await req.json()) as { action?: string; ids?: string[] };
    if (!Array.isArray(ids) || ids.length === 0 || ids.length > 50) {
      return NextResponse.json({ error: "No comps given." }, { status: 400 });
    }
    if (action === "archive") {
      await prisma.creditComp.updateMany({
        where: { id: { in: ids } },
        data: { archived: true, outcomeNote: `Archived as duplicate by ${user.name}` },
      });
    } else if (action === "approve") {
      await prisma.creditComp.updateMany({
        where: { id: { in: ids } },
        data: { dupApproved: true },
      });
    } else {
      return NextResponse.json({ error: "Unknown action." }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("POST /api/comps/duplicates", e);
    return NextResponse.json({ error: "Could not update." }, { status: 500 });
  }
}

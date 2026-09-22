import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { currentUser } from "@/lib/auth";

// One-click delete from the comps table (Mason, 9/22/26). House doctrine:
// nothing is ever hard-deleted — the row is archived and drops out of every
// screen, table, and analysis, recoverable from the database if ever needed.
export async function POST(req: Request) {
  try {
    const user = await currentUser();
    const { id } = (await req.json()) as { id?: string };
    if (!id || typeof id !== "string") {
      return NextResponse.json({ error: "No comp given." }, { status: 400 });
    }
    const existing = await prisma.creditComp.findUnique({ where: { id }, select: { outcomeNote: true } });
    await prisma.creditComp.update({
      where: { id },
      data: {
        archived: true,
        outcomeNote: [existing?.outcomeNote, `Removed by ${user.name}`].filter(Boolean).join(" · ").slice(0, 2000),
      },
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("POST /api/comps/archive", e);
    return NextResponse.json({ error: "Could not remove the comp." }, { status: 500 });
  }
}

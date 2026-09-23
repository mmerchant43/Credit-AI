import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { runScreen, summarize, excludeSameName, type Screenable, type TraceRow } from "@/lib/screen";
import { ensureCoords } from "@/lib/geo";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Analyze straight from the comps table (Mason, 9/23/26): the chosen comp
// becomes the SUBJECT of a full deal analysis. With no compIds, it is
// screened against the whole database exactly like a new deal (1-mile
// default). With compIds, those comps ARE the comparison set — hand-picked,
// screening bypassed. No AI writeup (there's no OM text on this path).
export async function POST(req: Request) {
  try {
    const user = await currentUser();
    const { subjectId, compIds } = (await req.json()) as { subjectId?: string; compIds?: string[] };
    if (!subjectId || !Array.isArray(compIds) || compIds.length > 200) {
      return NextResponse.json({ error: "Bad request." }, { status: 400 });
    }
    const subject = await prisma.creditComp.findUnique({ where: { id: subjectId } });
    if (!subject || subject.archived) {
      return NextResponse.json({ error: "Subject comp not found." }, { status: 404 });
    }

    let matchedIds: string[];
    let trace: TraceRow[];
    let locationMode: string;
    let candidatesScreened: number;
    let matchedFull: Awaited<ReturnType<typeof prisma.creditComp.findMany>>;

    if (compIds.length > 0) {
      // Hand-picked comp set — the analyst chose these, so no screening.
      matchedFull = await prisma.creditComp.findMany({
        where: { id: { in: compIds, not: subjectId }, archived: false },
      });
      // Preserve the click order.
      matchedFull = compIds
        .map((id) => matchedFull.find((m) => m.id === id))
        .filter((m): m is NonNullable<typeof m> => Boolean(m));
      matchedIds = matchedFull.map((m) => m.id);
      trace = matchedFull.map((m) => ({
        compId: m.id,
        name: m.propertyName ?? m.dealName ?? "—",
        passed: true,
        failedAt: null,
        checks: [{ filter: "Hand-picked", passed: true, reason: `selected by ${user.name} on the comps page` }],
      }));
      locationMode = "hand-picked";
      candidatesScreened = matchedFull.length;
    } else {
      // Same default screen as a new deal: 1-mile radius + the other filters.
      const comps = excludeSameName(
        subject as unknown as Screenable,
        (await prisma.creditComp.findMany({
          where: { archived: false, id: { not: subject.id } },
        })) as unknown as (Screenable & { id: string })[]
      );
      await ensureCoords([subject, ...comps] as unknown as Parameters<typeof ensureCoords>[0]);
      const screen = runScreen(subject as unknown as Screenable, comps as unknown as Screenable[], {
        location: "radius",
        radiusMiles: 1,
      });
      matchedIds = screen.matched.map((m) => m.id);
      trace = screen.trace;
      locationMode = screen.locationMode;
      candidatesScreened = screen.candidatesScreened;
      matchedFull = await prisma.creditComp.findMany({ where: { id: { in: matchedIds } } });
      matchedFull = matchedIds
        .map((id) => matchedFull.find((m) => m.id === id))
        .filter((m): m is NonNullable<typeof m> => Boolean(m));
    }

    const stats = summarize(
      subject as unknown as Record<string, unknown>,
      matchedFull as unknown as Record<string, unknown>[]
    );

    // A fresh analysis supersedes older analyses of the same subject
    // (archived, never hard-deleted — same rule as /api/deals).
    await prisma.dealAnalysis.updateMany({
      where: { subjectId: subject.id, archived: false },
      data: { archived: true, pinned: false },
    });
    const analysis = await prisma.dealAnalysis.create({
      data: {
        subjectId: subject.id,
        locationMode,
        matchedCount: matchedIds.length,
        snapshot: JSON.parse(JSON.stringify({
          matchedIds,
          trace,
          stats,
          candidatesScreened,
          writeup: null,
          writeupSections: null,
          omRentComps: [],
          omSalesComps: [],
          fromOmUpload: false,
        })),
        createdBy: user.name,
      },
    });
    return NextResponse.json({ analysisId: analysis.id });
  } catch (e) {
    console.error("POST /api/deals/from-comps", e);
    return NextResponse.json({ error: "Could not build the analysis." }, { status: 500 });
  }
}

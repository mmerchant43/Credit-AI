import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { compInputSchema, toCompData } from "@/lib/compInput";
import { runScreen, summarize, type Screenable } from "@/lib/screen";

// New Deal Analysis: save the subject deal (AUTO-ADDED to the comp database —
// Mason, 9/21/26), screen it against every other comp with the five filters,
// snapshot the result, and return the analysis id.
export async function POST(req: Request) {
  try {
    const user = await currentUser();
    const parsed = compInputSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid input." },
        { status: 400 }
      );
    }
    if (!parsed.data.category) {
      return NextResponse.json({ error: "Category is required for a deal analysis." }, { status: 400 });
    }
    if (!parsed.data.classificationEvidence) {
      return NextResponse.json({ error: "Classification evidence is required — the Filter 5 row needs the reasoning." }, { status: 400 });
    }

    const { data, metricYears } = toCompData(parsed.data);

    // 1. Auto-add the subject to the comp database (outcome: Screened).
    const subject = await prisma.creditComp.create({
      data: {
        ...data,
        outcome: "SCREENED",
        notes: [data.notes, `Classification evidence: ${parsed.data.classificationEvidence}`]
          .filter(Boolean).join("\n"),
        enteredById: user.id,
        metricYears: { create: metricYears },
      },
    });

    // 2. Screen it against every other active comp.
    const comps = await prisma.creditComp.findMany({
      where: { archived: false, id: { not: subject.id } },
    });
    const screen = runScreen(subject as unknown as Screenable, comps as unknown as Screenable[]);
    const matchedFull = comps.filter((c) => screen.matched.some((m) => m.id === c.id));
    const stats = summarize(
      subject as unknown as Record<string, unknown>,
      matchedFull as unknown as Record<string, unknown>[]
    );

    // 3. Snapshot the analysis so it re-renders exactly as computed today.
    const analysis = await prisma.dealAnalysis.create({
      data: {
        subjectId: subject.id,
        locationMode: screen.locationMode,
        matchedCount: screen.matched.length,
        snapshot: JSON.parse(JSON.stringify({
          matchedIds: screen.matched.map((m) => m.id),
          trace: screen.trace,
          stats,
          candidatesScreened: screen.candidatesScreened,
          classificationEvidence: parsed.data.classificationEvidence,
        })),
        createdBy: user.name,
      },
    });

    return NextResponse.json({ analysisId: analysis.id, subjectId: subject.id });
  } catch (e) {
    console.error("POST /api/deals", e);
    return NextResponse.json({ error: "Could not run the analysis." }, { status: 500 });
  }
}

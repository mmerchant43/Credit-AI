import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { compInputSchema, toCompData } from "@/lib/compInput";
import { runScreen, summarize, type Screenable } from "@/lib/screen";

export const maxDuration = 60;

// Short analyst-style writeup of the subject deal for the analysis header
// (Mason, 9/21/26). Best-effort: no key or an API hiccup just means no
// writeup — the analysis itself never depends on it.
async function generateWriteup(fields: Record<string, unknown>, evidence: string): Promise<string | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        max_tokens: 300,
        messages: [{
          role: "user",
          content:
            "You are a real-estate private equity credit analyst. Write a 2-3 sentence plain-prose deal summary for the top of an internal comp analysis: what the asset is, where, what is being requested, and the key credit facts. Use ONLY the facts below — never invent, compute, or embellish a number. No headers, no bullets, no preamble.\n\nDEAL FACTS (null = not stated):\n" +
            JSON.stringify(fields) +
            "\n\nCLASSIFICATION EVIDENCE:\n" + evidence,
        }],
      }),
      signal: AbortSignal.timeout(25000),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { content?: { type: string; text?: string }[] };
    const text = body.content?.find((c) => c.type === "text")?.text?.trim();
    return text && text.length > 20 ? text.slice(0, 1200) : null;
  } catch {
    return null;
  }
}

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

    // 3. Short AI writeup for the analysis header (best-effort).
    const writeup = await generateWriteup(
      { ...data, metricYears },
      parsed.data.classificationEvidence ?? ""
    );

    // 4. Snapshot the analysis so it re-renders exactly as computed today.
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
          writeup,
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

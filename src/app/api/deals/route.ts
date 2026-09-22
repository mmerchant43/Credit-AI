import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { compInputSchema, toCompData } from "@/lib/compInput";
import { runScreen, summarize, excludeSameName, type Screenable } from "@/lib/screen";

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
// OM lease/sales comps ride along for DISPLAY ONLY — they live in the
// analysis snapshot and are never written to the comp database (Mason, 9/21/26).
function sanitizeOmComps(raw: unknown, keys: string[]): Record<string, unknown>[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 30).flatMap((row) => {
    if (typeof row !== "object" || row === null) return [];
    const r = row as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const k of keys) {
      const v = r[k];
      if (typeof v === "string") out[k] = v.slice(0, 200);
      else if (typeof v === "number" && isFinite(v)) out[k] = v;
      else if (typeof v === "boolean") out[k] = v;
      else out[k] = null;
    }
    return out.name ? [out] : [];
  });
}
const RENT_KEYS = ["name", "city", "state", "units", "yearBuilt", "occupancyPct", "avgRent", "rentPsf", "isSubject"];
const SALE_KEYS = ["name", "city", "state", "units", "yearBuilt", "salePrice", "pricePerUnit", "capRate", "saleDate", "isSubject"];

export async function POST(req: Request) {
  try {
    const user = await currentUser();
    const raw = (await req.json()) as Record<string, unknown>;
    const omRentComps = sanitizeOmComps(raw.omRentComps, RENT_KEYS);
    const omSalesComps = sanitizeOmComps(raw.omSalesComps, SALE_KEYS);
    const parsed = compInputSchema.safeParse(raw);
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

    // Subject-only exception to verbatim-or-null (Mason, 9/21/26): when the
    // OM doesn't state loan/unit or loan PSF, derive them for the SUBJECT so
    // its charts populate — plain division, flagged in notes as computed.
    const derived: string[] = [];
    if (data.loanPerUnit == null && data.loanAmount != null && data.units != null && data.units > 0) {
      data.loanPerUnit = Math.round(data.loanAmount / data.units);
      derived.push(`Loan/Unit $${data.loanPerUnit.toLocaleString()} computed (loan ÷ units)`);
    }
    if (data.loanPerSf == null && data.loanAmount != null && data.sizeSf != null && data.sizeSf > 0) {
      data.loanPerSf = Math.round((data.loanAmount / data.sizeSf) * 100) / 100;
      derived.push(`Loan PSF $${data.loanPerSf.toLocaleString()} computed (loan ÷ NRA)`);
    }
    if (data.tpcPerUnit == null && data.totalProjectCost != null && data.units != null && data.units > 0) {
      data.tpcPerUnit = Math.round(data.totalProjectCost / data.units);
      derived.push(`TPC/Unit $${data.tpcPerUnit.toLocaleString()} computed (total cost ÷ units)`);
    }
    if (derived.length) {
      data.notes = [data.notes, `Derived for subject (not OM-stated): ${derived.join("; ")}`]
        .filter(Boolean).join("\n");
    }

    // 1. Auto-add the subject to the comp database (outcome: Screened) —
    //    WITHOUT creating duplicates (Mason, 9/21/26): re-analyzing a deal
    //    with exactly the same property name + city updates the existing row
    //    in place (newer stated values win; nothing is blanked out).
    const notesFinal = [data.notes, `Classification evidence: ${parsed.data.classificationEvidence}`]
      .filter(Boolean).join("\n");
    const existing = await prisma.creditComp.findFirst({
      where: {
        archived: false,
        propertyName: { equals: data.propertyName, mode: "insensitive" },
        city: { equals: data.city ?? "", mode: "insensitive" },
      },
      orderBy: { createdAt: "desc" },
    });

    let subject;
    if (existing) {
      // Never clobber workflow state the analysis flow doesn't know about:
      // outcome (QUOTED/CLOSED/... set via Add-a-Comp) and a hand-curated
      // market label survive a re-analysis untouched.
      const freshValues = Object.fromEntries(
        Object.entries(data).filter(
          ([k, v]) => v != null && k !== "notes" && k !== "outcome" && k !== "market"
        )
      );
      subject = await prisma.creditComp.update({
        where: { id: existing.id },
        data: {
          ...freshValues,
          notes: [existing.notes, `Re-analyzed (values refreshed, no duplicate created): ${notesFinal}`]
            .filter(Boolean).join("\n").slice(0, 8000),
          enteredById: user.id,
        },
      });
      if (metricYears.length) {
        await prisma.compMetricYear.deleteMany({ where: { compId: subject.id } });
        await prisma.compMetricYear.createMany({
          data: metricYears.map((m) => ({ compId: subject.id, ...m })),
        });
      }
    } else {
      subject = await prisma.creditComp.create({
        data: {
          ...data,
          outcome: "SCREENED",
          notes: notesFinal,
          enteredById: user.id,
          metricYears: { create: metricYears },
        },
      });
    }

    // 2. Screen it against every other active comp — never against a comp
    //    with exactly the subject's own name (same asset).
    const comps = excludeSameName(
      subject as unknown as Screenable,
      await prisma.creditComp.findMany({
        where: { archived: false, id: { not: subject.id } },
      }) as unknown as Screenable[]
    );
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
          omRentComps,
          omSalesComps,
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

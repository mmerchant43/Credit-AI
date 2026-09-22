import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { compInputSchema, toCompData } from "@/lib/compInput";
import { runScreen, summarize, excludeSameName, type Screenable } from "@/lib/screen";
import { ensureCoords } from "@/lib/geo";

export const maxDuration = 300; // first save on a fresh DB geocodes the whole pool

// Analyst-style writeup of the subject deal for the analysis header, in
// three sections (Mason, 9/22/26): the Deal, the Sponsor, and the Ask.
// Best-effort: no key or an API hiccup just means no writeup — the analysis
// itself never depends on it.
export interface WriteupSections { deal: string; sponsor: string; ask: string }

async function generateWriteup(
  fields: Record<string, unknown>,
  evidence: string
): Promise<WriteupSections | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        max_tokens: 600,
        messages: [{
          role: "user",
          content:
            'You are a real-estate private equity credit analyst writing the header of an internal comp analysis. Use ONLY the facts below — never invent, compute, or embellish a number. Respond with ONLY a JSON object (no fence, no commentary): {"deal": "...", "sponsor": "...", "ask": "..."}.\n' +
            "- deal: 1-2 sentences — what the asset is (units, stories, class, vintage), where, and its current state (occupancy for existing assets).\n" +
            "- sponsor: 2-3 sentences — a short PROFILE of the sponsor/borrower, not just the name: who they are, track record, portfolio size, equity in this deal — whatever the facts below state (see sponsorDescription when present).\n" +
            "- ask: 2-3 sentences — the requested proceeds and what the proceeds will be used for. Mention cash-in, cash-neutral, or cash-out ONLY when the stated facts clearly establish it (e.g. new loan vs existing payoff, equity contributed or returned); when they don't, say NOTHING about cash-in/neutral/out — do not mention that the OM omits it.\n\n" +
            "DEAL FACTS (null = not stated):\n" + JSON.stringify(fields) +
            "\n\nCLASSIFICATION EVIDENCE:\n" + evidence,
        }],
      }),
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { content?: { type: string; text?: string }[] };
    const text = body.content?.find((c) => c.type === "text")?.text ?? "";
    const json = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
    const parsed = JSON.parse(json) as Partial<WriteupSections>;
    if (!parsed.deal || !parsed.ask) return null;
    return {
      deal: String(parsed.deal).slice(0, 800),
      sponsor: String(parsed.sponsor ?? "Not stated in the OM.").slice(0, 800),
      ask: String(parsed.ask).slice(0, 800),
    };
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
    const sponsorDescription =
      typeof raw.sponsorDescription === "string" ? raw.sponsorDescription.trim().slice(0, 600) : null;
    // In-place coverage from the OM (Mason, 9/22/26: debt yield in the stats
    // means the IN-PLACE figure). Percent in → fraction stored.
    const num = (v: unknown) => (typeof v === "number" && isFinite(v) ? v : null);
    const dscrInPlace = num(raw.dscrInPlace);
    const dyInPlace = num(raw.dyInPlace) != null ? (num(raw.dyInPlace) as number) / 100 : null;
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
    if (dscrInPlace != null || dyInPlace != null) {
      metricYears.unshift({ yearLabel: "In-Place", dscr: dscrInPlace, debtYieldPct: dyInPlace });
      // The scalar (used by the stats section) prefers in-place.
      if (dyInPlace != null) data.debtYieldPct = dyInPlace;
      if (dscrInPlace != null) data.dscr = dscrInPlace;
    }

    // Subject-only exception to verbatim-or-null (Mason, 9/21/26): when the
    // OM doesn't state loan/unit or loan PSF, derive them for the SUBJECT so
    // its charts populate — plain division, flagged in notes as computed.
    const derived: string[] = [];
    if (data.totalProjectCost == null && data.loanAmount != null && data.loanAmount > 0 && data.ltcPct != null && data.ltcPct > 0.05 && data.ltcPct <= 1) {
      data.totalProjectCost = Math.round(data.loanAmount / data.ltcPct);
      derived.push(`TPC $${data.totalProjectCost.toLocaleString()} computed (loan ÷ LTC)`);
    }
    if (data.ltcPct == null && data.loanAmount != null && data.loanAmount > 0 && data.totalProjectCost != null && data.totalProjectCost > 0) {
      const r = data.loanAmount / data.totalProjectCost;
      if (r > 0.30 && r < 1.05) { // senior-debt plausibility band
        data.ltcPct = Math.round(r * 10000) / 10000;
        derived.push(`LTC ${(data.ltcPct * 100).toFixed(1)}% computed (loan ÷ TPC)`);
      }
    }
    if (data.loanPerUnit == null && data.loanAmount != null && data.loanAmount > 0 && data.units != null && data.units > 0) {
      data.loanPerUnit = Math.round(data.loanAmount / data.units);
      derived.push(`Loan/Unit $${data.loanPerUnit.toLocaleString()} computed (loan ÷ units)`);
    }
    if (data.loanPerSf == null && data.loanAmount != null && data.loanAmount > 0 && data.sizeSf != null && data.sizeSf > 0) {
      data.loanPerSf = Math.round((data.loanAmount / data.sizeSf) * 100) / 100;
      derived.push(`Loan PSF $${data.loanPerSf.toLocaleString()} computed (loan ÷ NRA)`);
    }
    if (data.tpcPerUnit == null && data.totalProjectCost != null && data.totalProjectCost > 0 && data.units != null && data.units > 0) {
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
      const freshValues: Record<string, unknown> = Object.fromEntries(
        Object.entries(data).filter(
          ([k, v]) => v != null && k !== "notes" && k !== "outcome" && k !== "market"
        )
      );
      // A changed zip means the old pin is wrong — clear coords so they
      // re-geocode (audit fix, 9/22/26).
      if (freshValues.zip && freshValues.zip !== existing.zip) {
        freshValues.lat = null;
        freshValues.lon = null;
        freshValues.geoPrecision = null;
      }
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
    //    with exactly the subject's own name (same asset). Default screen is
    //    a 1-MILE RADIUS (Mason, 9/22/26) — coords are zip-centroid cached,
    //    so this is one lookup for the subject and cache hits for the rest.
    const comps = excludeSameName(
      subject as unknown as Screenable,
      await prisma.creditComp.findMany({
        where: { archived: false, id: { not: subject.id } },
      }) as unknown as Screenable[]
    );
    await ensureCoords([subject as unknown as Screenable & { id: string }, ...(comps as (Screenable & { id: string })[])]);
    const screen = runScreen(subject as unknown as Screenable, comps as unknown as Screenable[], {
      location: "radius",
      radiusMiles: 1,
    });
    const matchedFull = comps.filter((c) => screen.matched.some((m) => m.id === c.id));
    const stats = summarize(
      subject as unknown as Record<string, unknown>,
      matchedFull as unknown as Record<string, unknown>[]
    );

    // 3. Short AI writeup for the analysis header (best-effort).
    const writeup = await generateWriteup(
      { ...data, metricYears, sponsorDescription },
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
          writeup: writeup ? [writeup.deal, writeup.sponsor, writeup.ask].join(" ") : null,
          writeupSections: writeup,
          omRentComps,
          omSalesComps,
          fromOmUpload: raw.fromOmUpload === true,
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

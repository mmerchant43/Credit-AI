import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";

// OM text → structured deal fields, using the Anthropic API server-side.
// The browser extracts the PDF's text (no big file ever hits this function)
// and posts it here; we return fields shaped exactly like the manual form,
// so the same validation and unit conversion applies either way.
// Big OMs legitimately take a couple of minutes to read — give the function
// real time (requires Vercel Fluid Compute, the default on new projects).
export const maxDuration = 300;

const EXTRACTION_PROMPT = `You are a real-estate private equity credit analyst extracting deal facts from a multifamily Offering Memorandum (debt/financing package). Extract the subject deal's facts from the OM text below.

IRON RULES:
- VERBATIM-OR-NULL: every value must be stated in the text. NEVER compute, derive, or back into a value (no loan/units math, no LTV from loan and value). Not stated => null.
- Occupancy is CURRENT / IN-PLACE only, never stabilized or projected. A construction deal has null occupancy.
- If the OM quotes a range for a figure, use null and mention the range in "notes".
- category: "BRIDGE_REFI" if the property is BUILT AND EXISTS (C of O, rent roll, T-12, in-place occupancy, maturing loan, lease-up refi, construction takeout). "CONSTRUCTION" if NOT BUILT / to be built (cost budget, GC fees, completion timeline, entitlements, yield-on-cost, no rent roll). Decide from evidence, not keywords.
- classificationEvidence: 1-2 sentences of the evidence behind the category call. Required.
- ALL PERCENT VALUES AS PERCENTS (65 not 0.65): occupancyPct, ratePct, ltvPct, ltcPct, impliedCapPct, stabilizedCapPct, dy0-dy3. DSCR as a plain multiple (1.25).
- dscr0/dy0 = Year 1 (or the OM's single/UW figure), dscr1/dy1 = Year 2, dscr2/dy2 = Year 3, dscr3/dy3 = Stabilized. Only years the OM states.
- Dollar amounts as plain numbers ("$53.0M" => 53000000).
- TOTAL PROJECT COST: hunt hard for it under any of its names — total project cost, total development cost, total capitalization, total uses, total deal cost, sponsor's total cost/basis (purchase price + capex for existing assets), or the stated total valuation of the deal. Use the total the OM itself presents; say in "notes" which label you used. tpcPerUnit: use the stated figure, or DIVIDE totalProjectCost by units (mark "computed" in notes) — this division is sanctioned.
- DEBT YIELD: most OMs state it somewhere — loan-metrics tables, sensitivity grids, sources-and-uses commentary, or a "NOI / Loan" row. Search the whole text before giving up. If the OM states NOI and the loan amount for the same year but no debt yield, you may compute NOI ÷ loan (mark "computed" in notes).

Respond with ONLY a JSON object (no markdown fence, no commentary). To keep the response compact, OMIT every key whose value would be null — both top-level keys and comp-table row keys (propertyName, city, state, category, classificationEvidence must always be present). The full key set (include only when stated): sponsorDescription (1-3 sentences profiling the sponsor/borrower from the OM: who they are, track record, portfolio size, equity invested in this deal — null only if the OM says nothing beyond the name), propertyName, address, city, state (2-letter), zip, market ("City, ST" metro), submarket, units, stories, sizeSf, yearBuilt, occupancyPct, category, classificationEvidence, loanAmount, loanPerUnit, loanPerSf, rateType ("FIXED"|"FLOATING"|null), indexName, spreadBps, ratePct, termMonths, ioMonths, ltvPct, ltcPct, totalProjectCost, tpcPerUnit, impliedCapPct, stabilizedCapPct, dscr0, dy0, dscr1, dy1, dscr2, dy2, dscr3, dy3, borrowerSponsor, brokerage, sourceNote (e.g. "OM dated Jun-26"), notes (ranges, ambiguities, caveats), omRentComps, omSalesComps.

omRentComps: the OM's rent/lease comparables table — it may be labeled Rent Comparables, Lease Comps, Competitive Set, Market Rent Survey, or similar — as an array (max 12 rows; if the table is longer, keep the subject row plus the first 11 comps), each {"name","city","state","units","yearBuilt","occupancyPct","avgRent","rentPsf","isSubject"} — avgRent = average monthly rent per unit in dollars, rentPsf in dollars, occupancyPct AS PERCENT. When the table includes the subject property's own row, include it with "isSubject": true. null if the OM has no such table.
omSalesComps: the OM's sales comparables table as an array (max 12 rows, same rule), each {"name","city","state","units","yearBuilt","salePrice","pricePerUnit","capRate","saleDate","isSubject"} — capRate AS PERCENT, saleDate as the OM states it ("Mar-25"). null if none. These arrays are display-only and must be verbatim from the OM's own comp tables. Keep "notes" and "classificationEvidence" CONCISE (2-3 sentences each) so the full JSON always fits.

OM TEXT:
`;

export async function POST(req: Request) {
  try {
    await currentUser();
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "OM extraction isn't configured yet — add ANTHROPIC_API_KEY in Vercel → Settings → Environment Variables and redeploy." },
        { status: 503 }
      );
    }
    const { text, fileName, mode } = (await req.json()) as { text?: string; fileName?: string; mode?: string };
    if (!text || text.trim().length < 500) {
      return NextResponse.json(
        { error: "Couldn't read enough text from that PDF — it may be a scanned document. Enter the deal manually instead." },
        { status: 400 }
      );
    }

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        max_tokens: 14000, // full field set + two comp tables, with generous headroom
        messages: [{ role: "user", content: EXTRACTION_PROMPT + text.slice(0, 180000) }],
      }),
      signal: AbortSignal.timeout(280000),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error("anthropic error", res.status, detail.slice(0, 300));
      if (res.status === 401 || res.status === 403) {
        return NextResponse.json(
          { error: "The extraction service rejected the API key — check ANTHROPIC_API_KEY in Vercel → Settings → Environment Variables and redeploy. Enter the deal manually in the meantime." },
          { status: 502 }
        );
      }
      if (res.status === 429 || res.status === 529) {
        return NextResponse.json(
          { error: "The extraction service is busy right now — wait a minute and try the upload again." },
          { status: 502 }
        );
      }
      return NextResponse.json({ error: `Extraction service error (${res.status}). Try again, or enter the deal manually.` }, { status: 502 });
    }
    const body = (await res.json()) as { content?: { type: string; text?: string }[]; stop_reason?: string };
    if (body.stop_reason === "max_tokens") {
      return NextResponse.json(
        { error: "The OM's comp tables were too large to extract in full — try again, or enter the deal manually." },
        { status: 502 }
      );
    }
    const raw = body.content?.find((c) => c.type === "text")?.text ?? "";
    const jsonText = raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1);
    let fields: Record<string, unknown>;
    try {
      fields = JSON.parse(jsonText);
    } catch {
      return NextResponse.json({ error: "The extraction came back malformed. Try again, or enter the deal manually." }, { status: 502 });
    }
    // Evidence is only load-bearing for a deal analysis (the Filter 5 row);
    // a plain comp add shouldn't fail extraction over it.
    const needsEvidence = mode !== "comp";
    if (!fields.propertyName || !fields.city || !fields.state || !fields.category || (needsEvidence && !fields.classificationEvidence)) {
      return NextResponse.json(
        { error: "The OM text didn't yield the required basics (property, city, state, category). Enter the deal manually." },
        { status: 422 }
      );
    }
    if (fileName) {
      fields.sourceNote = [fields.sourceNote, `OM file: ${fileName}`].filter(Boolean).join(" · ");
    }
    // Drop nulls so downstream validation treats them as "not stated".
    for (const k of Object.keys(fields)) if (fields[k] == null) delete fields[k];
    return NextResponse.json({ fields });
  } catch (e) {
    console.error("POST /api/extract", e);
    return NextResponse.json({ error: "Extraction failed. Try again, or enter the deal manually." }, { status: 500 });
  }
}

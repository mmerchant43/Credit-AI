import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { summarize } from "@/lib/screen";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Edit a comp's metrics after the fact (Mason, 9/30/26) — from the comp
// detail popup or an analysis's subject card. Everything downstream
// updates: null derived metrics are re-backed-into from the new inputs
// (sanctioned derivations only), coordinates re-geocode when the address/
// zip changed, EVERY saved analysis snapshot that includes this comp gets
// its stats recomputed, and the edited fields are recorded so the seed
// never overwrites them on later deploys.

const NUM_FIELDS = new Set([
  "units", "stories", "sizeSf", "yearBuilt", "loanAmount", "loanPerUnit", "loanPerSf",
  "spreadBps", "termMonths", "ioMonths", "totalProjectCost", "tpcPerUnit", "dscr",
]);
// UI sends these AS PERCENT (65 = 65%); stored as fractions.
const PCT_FIELDS = new Set([
  "occupancyPct", "ratePct", "ltvPct", "ltcPct", "debtYieldPct", "impliedCapPct", "stabilizedCapPct",
]);
const STR_FIELDS = new Set([
  "propertyName", "address", "city", "state", "zip", "borrowerSponsor",
]);

export async function POST(req: Request) {
  try {
    const user = await currentUser();
    const { id, fields } = (await req.json()) as { id?: string; fields?: Record<string, unknown> };
    if (!id || !fields || typeof fields !== "object") {
      return NextResponse.json({ error: "Bad request." }, { status: 400 });
    }
    const comp = await prisma.creditComp.findUnique({ where: { id } });
    if (!comp) return NextResponse.json({ error: "Comp not found." }, { status: 404 });

    // Sanitize: only whitelisted fields; blank/null → null (never zero).
    // Invalid values are REJECTED with their names, never silently dropped.
    const INT_FIELDS = new Set(["units", "stories", "sizeSf", "yearBuilt", "spreadBps", "termMonths", "ioMonths"]);
    const data: Record<string, unknown> = {};
    const touched: string[] = [];
    const rejected: string[] = [];
    for (const [k, raw] of Object.entries(fields)) {
      if (NUM_FIELDS.has(k)) {
        let v = raw === "" || raw == null ? null : Number(raw);
        if (v !== null && (!isFinite(v) || v < 0)) { rejected.push(k); continue; }
        if (v !== null && INT_FIELDS.has(k)) v = Math.round(v); // Int columns
        data[k] = v; touched.push(k);
      } else if (PCT_FIELDS.has(k)) {
        const v = raw === "" || raw == null ? null : Number(raw);
        if (v !== null && (!isFinite(v) || v < 0 || v > 200)) { rejected.push(k); continue; }
        data[k] = v === null ? null : v / 100; touched.push(k);
      } else if (STR_FIELDS.has(k)) {
        const v = typeof raw === "string" ? raw.trim().slice(0, 200) : "";
        data[k] = v || null; touched.push(k);
      }
    }
    if (rejected.length > 0) {
      return NextResponse.json(
        { error: `Invalid value${rejected.length > 1 ? "s" : ""} for: ${rejected.join(", ")} — numbers must be positive (percents 0–200). Nothing was saved.` },
        { status: 400 }
      );
    }
    if (touched.length === 0) return NextResponse.json({ error: "Nothing to save." }, { status: 400 });

    // Only fields whose value ACTUALLY changed count — numeric comparison at
    // 1e-6 tolerance, because percent fields round-trip through the UI with
    // float dust (0.0685 → "6.85" → 0.06849999…) and must NOT be falsely
    // marked as edited (audit fix, 9/30/26). Untouched fields are then
    // dropped from the write entirely so stored values stay bit-identical.
    const changed = touched.filter((k) => {
      const before = (comp as unknown as Record<string, unknown>)[k] ?? null;
      const after = data[k] ?? null;
      if (typeof before === "number" && typeof after === "number") return Math.abs(before - after) > 1e-6;
      return after !== before;
    });
    for (const k of touched) if (!changed.includes(k)) delete data[k];
    if (changed.length === 0) return NextResponse.json({ ok: true, refreshedAnalyses: 0 });

    // Address/zip change → coordinates re-geocode lazily from scratch.
    if ((changed.includes("zip") || changed.includes("address"))) {
      data.lat = null; data.lon = null; data.geoPrecision = null;
    }

    // Sanctioned derivations refill NULLS only — a blanked field comes back
    // recomputed from the new inputs; a typed value is never overwritten.
    const merged = { ...(comp as unknown as Record<string, number | null>), ...(data as Record<string, number | null>) };
    const notes: string[] = [];
    const derivedKeys: string[] = [];
    const put = (k: string, v: number, msg: string) => { data[k] = v; merged[k] = v; notes.push(msg); derivedKeys.push(k); };
    const { loanAmount: la, units: un, sizeSf: sf, totalProjectCost: tpc, ltcPct: ltc } = merged;
    if (merged.totalProjectCost == null && la && ltc && ltc > 0.05 && ltc <= 1)
      put("totalProjectCost", Math.round(la / ltc), "TPC re-derived (loan ÷ LTC)");
    if (merged.ltcPct == null && la && tpc && la / tpc > 0.30 && la / tpc < 1.05)
      put("ltcPct", Math.round((la / tpc) * 10000) / 10000, "LTC re-derived (loan ÷ TPC)");
    if (merged.loanPerUnit == null && la && un) put("loanPerUnit", Math.round(la / un), "Loan/Unit re-derived");
    if (merged.loanPerSf == null && la && sf) put("loanPerSf", Math.round((la / sf) * 100) / 100, "Loan PSF re-derived");
    if (merged.tpcPerUnit == null && merged.totalProjectCost && un)
      put("tpcPerUnit", Math.round((merged.totalProjectCost as number) / un), "TPC/Unit re-derived");

    const editNote = `Metrics edited by ${user.name} on ${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" })}: ${changed.join(", ")}${notes.length ? ` (${notes.join("; ")})` : ""}.`;
    await prisma.creditComp.update({
      where: { id },
      data: {
        ...data,
        // Lock what the user changed AND what was re-derived from it, so a
        // later seed re-import can't put stale values back.
        editedFields: [...new Set([...(comp.editedFields ?? []), ...changed, ...derivedKeys])].slice(0, 60),
        // Keep the NEWEST notes when trimming (audit fix, 9/30/26).
        notes: (() => {
          const combined = [comp.notes, editNote].filter(Boolean).join("\n");
          return combined.length > 8000 ? combined.slice(combined.length - 8000) : combined;
        })(),
      },
    });

    // Refresh every saved snapshot this comp participates in — subject or
    // matched comp — so saved views agree with the new numbers.
    const analyses = await prisma.dealAnalysis.findMany({ where: { archived: false } });
    let refreshed = 0;
    for (const a of analyses) {
      const snap = a.snapshot as { matchedIds?: string[]; stats?: unknown } | null;
      if (!snap) continue;
      const involved = a.subjectId === id || (snap.matchedIds ?? []).includes(id);
      if (!involved) continue;
      const matched = await prisma.creditComp.findMany({
        where: { id: { in: snap.matchedIds ?? [] }, archived: false },
      });
      const ordered = (snap.matchedIds ?? [])
        .map((mid) => matched.find((m) => m.id === mid))
        .filter((m): m is NonNullable<typeof m> => Boolean(m));
      const subject = a.subjectId
        ? await prisma.creditComp.findUnique({ where: { id: a.subjectId } })
        : null;
      const stats = summarize(
        (subject ?? {}) as unknown as Record<string, unknown>,
        ordered as unknown as Record<string, unknown>[]
      );
      await prisma.dealAnalysis.update({
        where: { id: a.id },
        data: { snapshot: JSON.parse(JSON.stringify({ ...(a.snapshot as object), stats })) },
      });
      refreshed++;
    }

    return NextResponse.json({ ok: true, refreshedAnalyses: refreshed });
  } catch (e) {
    console.error("POST /api/comps/edit", e);
    return NextResponse.json({ error: "Could not save the edits." }, { status: 500 });
  }
}

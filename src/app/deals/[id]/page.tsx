import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { DASH, fmtMoney, fmtPct, fmtX, CATEGORY_LABELS } from "@/lib/format";
import { runScreen, summarize, type Screenable, type StatRow, type TraceRow } from "@/lib/screen";
import { ensureCoords } from "@/lib/geo";
import RadiusSlider from "@/components/RadiusSlider";

export const dynamic = "force-dynamic";

// A saved deal analysis. Default view renders the snapshot exactly as saved;
// moving the radius slider re-screens the live database within N miles of the
// subject (zip-centroid distance) — Mason, 9/21/26.

const COMP_COLS: { key: string; label: string; kind: "usd" | "pct" | "x" | "num" }[] = [
  { key: "loanAmount", label: "Loan Amount", kind: "usd" },
  { key: "loanPerUnit", label: "$/Unit", kind: "usd" },
  { key: "loanPerSf", label: "$/SF", kind: "usd" },
  { key: "ltcPct", label: "LTC", kind: "pct" },
  { key: "ltvPct", label: "LTV", kind: "pct" },
  { key: "dscr", label: "DSCR", kind: "x" },
  { key: "debtYieldPct", label: "Debt Yield", kind: "pct" },
  { key: "totalProjectCost", label: "TPC", kind: "usd" },
  { key: "tpcPerUnit", label: "TPC/Unit", kind: "usd" },
  { key: "impliedCapPct", label: "Cap Rate", kind: "pct" },
];

function fmtBy(kind: string, v: number | null | undefined) {
  if (v == null) return DASH;
  if (kind === "usd") return fmtMoney(v);
  if (kind === "pct") return fmtPct(v, 1);
  if (kind === "x") return fmtX(v);
  return String(v);
}

function RangeBar({ row }: { row: StatRow }) {
  if (row.min == null) return <span className="text-xs text-slate-400">no comp values</span>;
  // Both indicators share one coordinate system: [-0.15, 1.15] mapped onto [0, 1].
  const pos = row.position != null ? Math.max(0, Math.min(1, (row.position + 0.15) / 1.3)) : null;
  const med = row.medianPosition != null ? (row.medianPosition + 0.15) / 1.3 : null;
  return (
    <div className="relative h-4 w-full min-w-[140px]">
      <div className="absolute top-1/2 -translate-y-1/2 h-1.5 w-full rounded-full bg-navy/20" />
      {med != null && (
        <div className="absolute top-1/2 -translate-y-1/2 h-3 w-0.5 bg-navy" style={{ left: `${med * 100}%` }} />
      )}
      {pos != null && (
        <div
          className={`absolute top-1/2 -translate-y-1/2 h-3 w-3 rounded-full border-2 border-white shadow ${row.outside ? "bg-red-500" : "bg-accent"}`}
          style={{ left: `calc(${pos * 100}% - 6px)` }}
          title={row.outside ? "outside comp range" : "within comp range"}
        />
      )}
    </div>
  );
}

export default async function DealAnalysisPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { radius?: string };
}) {
  const analysis = await prisma.dealAnalysis.findUnique({
    where: { id: params.id },
    include: { subject: { include: { metricYears: true } } },
  });
  if (!analysis) notFound();
  const s = analysis.subject;

  const radius = Math.min(Math.max(Number(searchParams?.radius ?? 0) || 0, 0), 100);

  const savedSnap = analysis.snapshot as unknown as {
    matchedIds: string[];
    trace: TraceRow[];
    stats: StatRow[];
    candidatesScreened: number;
    classificationEvidence?: string;
  };

  let view: {
    matchedIds: string[];
    trace: TraceRow[];
    stats: StatRow[];
    candidatesScreened: number;
    modeLabel: string;
    matchedCount: number;
  };

  if (radius > 0) {
    // Live re-screen within the radius, against today's database.
    const comps = await prisma.creditComp.findMany({
      where: { archived: false, id: { not: s.id } },
    });
    await ensureCoords([s, ...comps]);
    const screen = runScreen(
      s as unknown as Screenable,
      comps as unknown as Screenable[],
      radius
    );
    const matchedSet = new Set(screen.matched.map((m) => m.id));
    const matchedFull = comps.filter((c) => matchedSet.has(c.id));
    const stats = summarize(
      s as unknown as Record<string, unknown>,
      matchedFull as unknown as Record<string, unknown>[]
    );
    view = {
      matchedIds: screen.matched.map((m) => m.id),
      trace: screen.trace,
      stats,
      candidatesScreened: screen.candidatesScreened,
      modeLabel: `${radius}-mile radius (live)`,
      matchedCount: screen.matched.length,
    };
  } else {
    view = {
      matchedIds: savedSnap.matchedIds,
      trace: savedSnap.trace,
      stats: savedSnap.stats,
      candidatesScreened: savedSnap.candidatesScreened,
      modeLabel:
        { zip: "same zip", city: "same city (radius fallback)", none: "no database comps", radius: "radius" }[
          analysis.locationMode
        ] ?? analysis.locationMode,
      matchedCount: analysis.matchedCount,
    };
  }

  const matched = await prisma.creditComp.findMany({
    where: { id: { in: view.matchedIds } },
    include: { metricYears: true },
  });
  const rows = [
    { r: s, isSubject: true },
    ...view.matchedIds
      .map((id) => ({ r: matched.find((m) => m.id === id), isSubject: false }))
      .filter((x) => x.r),
  ] as { r: typeof s; isSubject: boolean }[];

  return (
    <div className="space-y-8 pb-10">
      <div className="section-head">
        <h2>Deal Analysis — {s.propertyName ?? s.dealName ?? "Subject"}</h2>
        <div className="rule" />
        <Link href="/deals/new" className="btn text-sm">+ New Analysis</Link>
      </div>

      {/* Subject snapshot */}
      <section className="card human p-4">
        <div className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
          <span><b className="font-display">{s.propertyName ?? DASH}</b> · {[s.city, s.state].filter(Boolean).join(", ")}{s.zip ? ` ${s.zip}` : ""}</span>
          <span>Category: <b>{s.category ? CATEGORY_LABELS[s.category] : DASH}</b></span>
          <span>Units: <b>{s.units ?? DASH}</b></span>
          <span>Stories: <b>{s.stories ?? DASH}</b></span>
          <span>Vintage: <b>{s.yearBuilt ?? DASH}</b></span>
          <span>Occupancy: <b>{s.category === "CONSTRUCTION" ? DASH : fmtPct(s.occupancyPct, 1)}</b></span>
        </div>
        {savedSnap.classificationEvidence && (
          <p className="text-xs text-slate-600 mt-2"><b>Classification evidence:</b> {savedSnap.classificationEvidence}</p>
        )}
        <p className="text-xs text-slate-500 mt-2">
          Screened {view.candidatesScreened} database comp{view.candidatesScreened === 1 ? "" : "s"} via {view.modeLabel} →{" "}
          <b>{view.matchedCount} match{view.matchedCount === 1 ? "" : "es"}</b> · saved by {analysis.createdBy ?? DASH} · this deal was added to the comp database automatically.
        </p>
      </section>

      {/* Radius control */}
      <Suspense>
        <RadiusSlider />
      </Suspense>

      {/* Comparison table */}
      <section>
        <div className="section-head"><h2>Comparison</h2><div className="rule" /></div>
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-slate-500 uppercase tracking-wide border-b border-slate-200">
                <th className="px-3 py-2 text-left">Property</th>
                <th className="px-3 py-2 text-left">Location</th>
                <th className="px-3 py-2 text-center">Vintage</th>
                <th className="px-3 py-2 text-center">Units</th>
                {COMP_COLS.map((c) => <th key={c.key} className="px-3 py-2 text-right">{c.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map(({ r, isSubject }) => (
                <tr key={r.id} className={`border-b border-slate-100 ${isSubject ? "human font-medium" : "hover:bg-slate-50"}`}>
                  <td className="px-3 py-2">{isSubject ? "▸ " : ""}{r.propertyName ?? r.dealName ?? DASH}{isSubject ? " (Subject)" : ""}</td>
                  <td className="px-3 py-2 text-xs text-slate-600">{[r.city, r.state].filter(Boolean).join(", ")}{r.zip ? ` ${r.zip}` : ""}</td>
                  <td className="px-3 py-2 text-center tabular-nums">{r.yearBuilt ?? DASH}</td>
                  <td className="px-3 py-2 text-center tabular-nums">{r.units ?? DASH}</td>
                  {COMP_COLS.map((c) => {
                    const suppress = c.key === "debtYieldPct" && r.category === "CONSTRUCTION";
                    return (
                      <td key={c.key} className="px-3 py-2 text-right tabular-nums">
                        {suppress ? DASH : fmtBy(c.kind, (r as unknown as Record<string, number | null>)[c.key])}
                      </td>
                    );
                  })}
                </tr>
              ))}
              {view.matchedCount === 0 && (
                <tr><td colSpan={14} className="px-3 py-6 text-center text-slate-400">
                  {radius > 0
                    ? `No comps within ${radius} miles passed the five filters — widen the radius.`
                    : "No database comps passed the five filters — the subject stands alone above."}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Summary stats & subject placement */}
      {view.matchedCount > 0 && (
        <section>
          <div className="section-head"><h2>Summary Statistics & Subject Placement</h2><div className="rule" /></div>
          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-slate-500 uppercase tracking-wide border-b border-slate-200">
                  <th className="px-3 py-2 text-left">Metric</th>
                  <th className="px-3 py-2 text-right">Subject</th>
                  <th className="px-3 py-2 text-right">Min</th>
                  <th className="px-3 py-2 text-right">Median</th>
                  <th className="px-3 py-2 text-right">Max</th>
                  <th className="px-3 py-2 text-left w-56">Placement</th>
                </tr>
              </thead>
              <tbody>
                {view.stats.map((row) => (
                  <tr key={row.key} className="border-b border-slate-100">
                    <td className="px-3 py-2">{row.label}{row.outside && <span className="badge bg-red-50 text-red-700 border-red-200 ml-2">outside range</span>}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium">{fmtBy(row.kind, row.subject)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtBy(row.kind, row.min)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtBy(row.kind, row.median)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtBy(row.kind, row.max)}</td>
                    <td className="px-3 py-2"><RangeBar row={row} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Screening trace */}
      <section>
        <div className="section-head"><h2>Comps Screened</h2><div className="rule" /></div>
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-slate-500 uppercase tracking-wide border-b border-slate-200">
                <th className="px-3 py-2 text-left">Candidate</th>
                <th className="px-3 py-2 text-center">Result</th>
                <th className="px-3 py-2 text-left">Detail</th>
              </tr>
            </thead>
            <tbody>
              {view.trace.map((t) => {
                const last = t.checks[t.checks.length - 1];
                return (
                  <tr key={t.compId} className="border-b border-slate-100">
                    <td className="px-3 py-2">{t.name}</td>
                    <td className="px-3 py-2 text-center">
                      {t.passed
                        ? <span className="badge bg-emerald-50 text-emerald-700 border-emerald-200">match</span>
                        : <span className="badge bg-slate-100 text-slate-500 border-slate-200">stopped at {t.failedAt}</span>}
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-500">{last ? `${last.filter}: ${last.reason}` : DASH}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { DASH, fmtMoney, fmtPct, fmtX, CATEGORY_LABELS } from "@/lib/format";
import {
  runScreen, summarize, excludeSameName, DEFAULT_CRITERIA,
  type Criteria, type Screenable, type StatRow, type TraceRow,
} from "@/lib/screen";
import { ensureCoords, ensureAddressCoords } from "@/lib/geo";
import CriteriaPanel from "@/components/CriteriaPanel";
import DealMap, { type MapPoint, type UnmappedComp } from "@/components/DealMap";
import MetricStrip from "@/components/MetricStrip";
import { RemoveCompButton, UndoRemoveButton } from "@/components/CompRemove";

export const dynamic = "force-dynamic";

// A saved deal analysis. The five screening criteria are adjustable from the
// popup (auto-opens on a fresh deal); any change re-screens the live database
// immediately. With no criteria in the URL, the saved snapshot renders.

// Trimmed to the essentials per Mason (9/21/26) — the metric detail lives in
// the Subject vs. Comps charts below.
const COMP_COLS: { key: string; label: string; kind: "usd" | "pct" | "x" | "num" }[] = [
  { key: "loanAmount", label: "Loan Amount", kind: "usd" },
];

function fmtBy(kind: string, v: number | null | undefined) {
  if (v == null) return DASH;
  if (kind === "usd") return fmtMoney(v);
  if (kind === "pct") return fmtPct(v, 1);
  if (kind === "x") return fmtX(v);
  return String(v);
}

type Params = { [k: string]: string | string[] | undefined };
const one = (p: Params, k: string) => (Array.isArray(p[k]) ? p[k]?.[0] : p[k]) as string | undefined;

function parseCriteria(p: Params): { criteria: Criteria; anySet: boolean } {
  const loc = one(p, "loc");
  const radius = Number(one(p, "radius") ?? 0) || 0;
  const vin = one(p, "vin");
  const occ = one(p, "occ");
  const cat = one(p, "cat");
  const typ = one(p, "typ");

  const anySet = Boolean(loc || radius > 0 || vin || occ || cat || typ);
  const criteria: Criteria = {
    location: loc === "off" ? "off" : loc === "radius" || radius > 0 ? "radius" : "auto",
    radiusMiles: radius > 0 ? Math.min(radius, 25) : null,
    propertyType: typ !== "off",
    vintageYears: vin === "off" ? null : vin != null && vin !== "" ? Math.max(0, Number(vin) || 0) : DEFAULT_CRITERIA.vintageYears,
    occupancyPts: occ === "off" ? null : occ != null && occ !== "" ? Math.max(0, Number(occ) || 0) : DEFAULT_CRITERIA.occupancyPts,
    category: cat !== "off",
  };
  return { criteria, anySet };
}

export default async function DealAnalysisPage({
  params, searchParams,
}: { params: { id: string }; searchParams?: Params }) {
  const analysis = await prisma.dealAnalysis.findUnique({
    where: { id: params.id },
    include: { subject: { include: { metricYears: true } } },
  });
  if (!analysis) notFound();
  const s = analysis.subject;

  const { criteria, anySet: criteriaSet } = parseCriteria(searchParams ?? {});
  const excluded = new Set(
    (one(searchParams ?? {}, "x") ?? "").split(",").filter(Boolean)
  );
  // Any adjustment — criteria or removed comps — switches to a live recompute
  // so the stats and charts always agree with what's shown.
  const anySet = criteriaSet || excluded.size > 0;

  const savedSnap = analysis.snapshot as unknown as {
    matchedIds: string[];
    trace: TraceRow[];
    stats: StatRow[];
    candidatesScreened: number;
    classificationEvidence?: string;
    writeup?: string;
    writeupSections?: { deal: string; sponsor: string; ask: string } | null;
    omRentComps?: {
      name: string; city: string | null; state: string | null; units: number | null;
      yearBuilt: number | null; occupancyPct: number | null; avgRent: number | null;
      rentPsf: number | null; isSubject: boolean | null;
    }[];
    omSalesComps?: {
      name: string; city: string | null; state: string | null; units: number | null;
      yearBuilt: number | null; salePrice: number | null; pricePerUnit: number | null;
      capRate: number | null; saleDate: string | null; isSubject: boolean | null;
    }[];
    fromOmUpload?: boolean;
  };

  let view: {
    matchedIds: string[]; trace: TraceRow[]; stats: StatRow[];
    candidatesScreened: number; modeLabel: string; matchedCount: number; live: boolean;
  };

  if (anySet) {
    const comps = excludeSameName(
      s as unknown as Screenable,
      (await prisma.creditComp.findMany({
        where: { archived: false, id: { not: s.id } },
      })) as unknown as (Screenable & { id: string })[]
    ) as unknown as Awaited<ReturnType<typeof prisma.creditComp.findMany>>;
    if (criteria.location === "radius" && criteria.radiusMiles) await ensureCoords([s, ...comps]);
    const screen = runScreen(s as unknown as Screenable, comps as unknown as Screenable[], criteria);
    const kept = screen.matched.filter((m) => !excluded.has(m.id));
    const keptSet = new Set(kept.map((m) => m.id));
    const matchedFull = comps.filter((c) => keptSet.has(c.id));
    const stats = summarize(
      s as unknown as Record<string, unknown>,
      matchedFull as unknown as Record<string, unknown>[]
    );
    const modeLabel =
      criteria.location === "off" || (criteria.location === "radius" && !criteria.radiusMiles)
        ? "custom criteria (location off, live)"
      : criteria.location === "radius" ? `${criteria.radiusMiles}-mile radius (live)`
      : { zip: "same zip (live)", city: "same city (live)", none: "no database comps (live)" }[screen.locationMode] ?? "live";
    view = {
      matchedIds: kept.map((m) => m.id),
      trace: screen.trace, stats,
      candidatesScreened: screen.candidatesScreened,
      modeLabel, matchedCount: kept.length, live: true,
    };
  } else {
    view = {
      matchedIds: savedSnap.matchedIds, trace: savedSnap.trace, stats: savedSnap.stats,
      candidatesScreened: savedSnap.candidatesScreened,
      modeLabel:
        { zip: "same zip", city: "same city (fallback)", none: "no database comps", radius: "radius" }[analysis.locationMode] ?? analysis.locationMode,
      matchedCount: analysis.matchedCount, live: false,
    };
  }

  const matched = await prisma.creditComp.findMany({
    where: { id: { in: view.matchedIds } },
    include: { metricYears: true },
  });
  const orderedMatched = view.matchedIds
    .map((id) => matched.find((m) => m.id === id))
    .filter((m): m is NonNullable<typeof m> => Boolean(m));
  const rows = [{ r: s, isSubject: true }, ...orderedMatched.map((r) => ({ r, isSubject: false }))];

  const avail = {
    zip: Boolean(s.zip),
    yearBuilt: s.yearBuilt != null,
    occupancy: s.category !== "CONSTRUCTION" && s.occupancyPct != null,
    category: Boolean(s.category),
  };

  // ── Map data: subject + matched comps, upgraded to address-level pins
  //    where a street address exists; zip centroids otherwise. ──
  const mapRows = [s, ...orderedMatched];
  await ensureCoords(mapRows);
  await ensureAddressCoords(mapRows);
  const mapPoints: MapPoint[] = mapRows
    .filter((r) => r.lat != null && r.lon != null)
    .map((r) => ({
      id: r.id,
      name: r.propertyName ?? r.dealName ?? "—",
      lat: r.lat as number,
      lon: r.lon as number,
      isSubject: r.id === s.id,
      precision: r.geoPrecision ?? "zip",
      detail: [[r.city, r.state].filter(Boolean).join(", "), r.zip, fmtMoney(r.loanAmount)].filter(Boolean).join(" · "),
    }));
  const unmapped: UnmappedComp[] = mapRows
    .filter((r) => r.lat == null || r.lon == null || !r.address)
    .map((r) => ({
      id: r.id,
      name: (r.propertyName ?? r.dealName ?? "—") + (r.id === s.id ? " (Subject)" : ""),
      location: [r.city, r.state].filter(Boolean).join(", ") || "location unknown",
      hasAddress: Boolean(r.address),
    }))
    .filter((u) => !u.hasAddress || mapPoints.every((p) => p.id !== u.id));

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
          <span><b className="font-display">{s.propertyName ?? DASH}</b></span>
          <span>Location: <b>{[s.city, s.state].filter(Boolean).join(", ") || DASH}{s.zip ? ` ${s.zip}` : ""}</b></span>
          <span>Category: <b>{s.category ? CATEGORY_LABELS[s.category] : DASH}</b></span>
          <span>Units: <b>{s.units ?? DASH}</b></span>
          <span>Stories: <b>{s.stories ?? DASH}</b></span>
          <span>Vintage: <b>{s.yearBuilt ?? DASH}</b></span>
          <span>Occupancy: <b>{s.category === "CONSTRUCTION" ? DASH : fmtPct(s.occupancyPct, 1)}</b></span>
        </div>
        {savedSnap.writeupSections ? (
          <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3">
            {([
              ["The Deal", savedSnap.writeupSections.deal],
              ["The Sponsor", savedSnap.writeupSections.sponsor],
              ["The Ask", savedSnap.writeupSections.ask],
            ] as const).map(([label, text]) => (
              <div key={label}>
                <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">{label}</div>
                <p className="font-display text-[17px] leading-relaxed text-ink/90">{text}</p>
              </div>
            ))}
          </div>
        ) : savedSnap.writeup ? (
          <p className="font-display text-lg leading-relaxed text-ink/90 mt-3">{savedSnap.writeup}</p>
        ) : null}
      </section>

      {/* Screening criteria (popup on new deals; summary bar always) */}
      <Suspense>
        <CriteriaPanel avail={avail} />
      </Suspense>

      {/* Map — subject + matched comps */}
      <DealMap
        points={mapPoints}
        unmapped={unmapped}
        radiusMiles={criteria.location === "radius" ? criteria.radiusMiles : null}
      />

      {/* Comparison table */}
      <section>
        <div className="section-head">
          <h2>Comparison</h2>
          <div className="rule" />
          <span className="text-xs text-slate-500 whitespace-nowrap">
            {view.candidatesScreened} screened via {view.modeLabel} → <b>{view.matchedCount} match{view.matchedCount === 1 ? "" : "es"}</b>
          </span>
          <Suspense><UndoRemoveButton /></Suspense>
        </div>
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-slate-500 uppercase tracking-wide border-b border-slate-200">
                <th className="px-3 py-2 text-left">Property</th>
                <th className="px-3 py-2 text-left">Location</th>
                <th className="px-3 py-2 text-center">Category</th>
                <th className="px-3 py-2 text-center">Vintage</th>
                <th className="px-3 py-2 text-center">Units</th>
                {COMP_COLS.map((c) => <th key={c.key} className="px-3 py-2 text-right">{c.label}</th>)}
                <th className="px-1 py-2" aria-label="remove" />
              </tr>
            </thead>
            <tbody>
              {rows.map(({ r, isSubject }) => (
                <tr key={r.id} className={`border-b border-slate-100 ${isSubject ? "human font-medium" : "hover:bg-slate-50"}`}>
                  <td className="px-3 py-2">{isSubject ? "▸ " : ""}{r.propertyName ?? r.dealName ?? DASH}{isSubject ? " (Subject)" : ""}</td>
                  <td className="px-3 py-2 text-xs text-slate-600">{[r.city, r.state].filter(Boolean).join(", ")}{r.zip ? ` ${r.zip}` : ""}</td>
                  <td className="px-3 py-2 text-center text-xs text-slate-500">{r.category ? CATEGORY_LABELS[r.category] ?? DASH : DASH}</td>
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
                  <td className="px-1 py-2 text-center">
                    {!isSubject && (
                      <Suspense>
                        <RemoveCompButton compId={r.id} name={r.propertyName ?? r.dealName ?? "comp"} />
                      </Suspense>
                    )}
                  </td>
                </tr>
              ))}
              {view.matchedCount === 0 && (
                <tr><td colSpan={7} className="px-3 py-6 text-center text-slate-400">
                  No comps passed the current criteria — loosen or switch off a filter in “Adjust Criteria”.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Subject vs. comps — line charts */}
      {view.matchedCount > 0 && (
        <section>
          <div className="section-head"><h2>Subject vs. Comps</h2><div className="rule" /></div>
          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-slate-500 uppercase tracking-wide border-b border-slate-200">
                  <th className="px-3 py-2 text-left">Metric</th>
                  <th className="px-3 py-2 text-right">Subject</th>
                  <th className="px-3 py-2 text-right">Min</th>
                  <th className="px-3 py-2 text-right">Median</th>
                  <th className="px-3 py-2 text-right">Max</th>
                  <th className="px-3 py-2 text-center" title="comps (navy) · median (tick) · subject (gold)">Distribution</th>
                </tr>
              </thead>
              <tbody>
                {view.stats.map((row) => {
                  const values = orderedMatched
                    .map((c) => (c as unknown as Record<string, number | null>)[row.key])
                    .filter((v): v is number => typeof v === "number" && isFinite(v));
                  return (
                    <tr key={row.key} className="border-b border-slate-100">
                      <td className="px-3 py-2">{row.label}{row.outside && <span className="badge bg-red-50 text-red-700 border-red-200 ml-2">outside range</span>}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-medium">{fmtBy(row.kind, row.subject)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmtBy(row.kind, row.min)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmtBy(row.kind, row.median)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmtBy(row.kind, row.max)}</td>
                      <td className="px-3 py-2">
                        <MetricStrip kind={row.kind} values={values} subject={row.subject} median={row.median} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* OM lease comps — display-only, straight from the subject's OM, never in the database */}
      {(savedSnap.omRentComps?.length ?? 0) > 0 && (
        <section>
          <div className="section-head">
            <h2>Lease Comps</h2>
            <div className="rule" />
            <span className="text-xs text-slate-400 whitespace-nowrap">from the subject&apos;s OM · not stored as database comps</span>
          </div>
          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-slate-500 uppercase tracking-wide border-b border-slate-200">
                  <th className="px-3 py-2 text-left">Property</th>
                  <th className="px-3 py-2 text-left">Location</th>
                  <th className="px-3 py-2 text-center">Units</th>
                  <th className="px-3 py-2 text-center">Vintage</th>
                  <th className="px-3 py-2 text-center">Occupancy</th>
                  <th className="px-3 py-2 text-right">Avg Rent</th>
                  <th className="px-3 py-2 text-right">Rent PSF</th>
                </tr>
              </thead>
              <tbody>
                {savedSnap.omRentComps!.map((r, i) => (
                  <tr key={i} className={`border-b border-slate-100 ${r.isSubject ? "human font-medium" : "hover:bg-slate-50"}`}>
                    <td className="px-3 py-2">{r.isSubject ? "▸ " : ""}{r.name}{r.isSubject ? " (Subject)" : ""}</td>
                    <td className="px-3 py-2 text-xs text-slate-600">{[r.city, r.state].filter(Boolean).join(", ") || DASH}</td>
                    <td className="px-3 py-2 text-center tabular-nums">{r.units ?? DASH}</td>
                    <td className="px-3 py-2 text-center tabular-nums">{r.yearBuilt ?? DASH}</td>
                    <td className="px-3 py-2 text-center tabular-nums">{r.occupancyPct != null ? `${r.occupancyPct.toFixed(1)}%` : DASH}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.avgRent != null ? fmtMoney(r.avgRent) : DASH}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.rentPsf != null ? `$${r.rentPsf.toFixed(2)}` : DASH}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* OM sales comps — display-only, straight from the subject's OM, never in the database */}
      {(savedSnap.omSalesComps?.length ?? 0) > 0 && (
        <section>
          <div className="section-head">
            <h2>Sales Comps</h2>
            <div className="rule" />
            <span className="text-xs text-slate-400 whitespace-nowrap">from the subject&apos;s OM · not stored as database comps</span>
          </div>
          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-slate-500 uppercase tracking-wide border-b border-slate-200">
                  <th className="px-3 py-2 text-left">Property</th>
                  <th className="px-3 py-2 text-left">Location</th>
                  <th className="px-3 py-2 text-center">Units</th>
                  <th className="px-3 py-2 text-center">Vintage</th>
                  <th className="px-3 py-2 text-right">Sale Price</th>
                  <th className="px-3 py-2 text-right">$/Unit</th>
                  <th className="px-3 py-2 text-center">Cap Rate</th>
                  <th className="px-3 py-2 text-center">Sale Date</th>
                </tr>
              </thead>
              <tbody>
                {savedSnap.omSalesComps!.map((r, i) => (
                  <tr key={i} className={`border-b border-slate-100 ${r.isSubject ? "human font-medium" : "hover:bg-slate-50"}`}>
                    <td className="px-3 py-2">{r.isSubject ? "▸ " : ""}{r.name}{r.isSubject ? " (Subject)" : ""}</td>
                    <td className="px-3 py-2 text-xs text-slate-600">{[r.city, r.state].filter(Boolean).join(", ") || DASH}</td>
                    <td className="px-3 py-2 text-center tabular-nums">{r.units ?? DASH}</td>
                    <td className="px-3 py-2 text-center tabular-nums">{r.yearBuilt ?? DASH}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.salePrice != null ? fmtMoney(r.salePrice) : DASH}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.pricePerUnit != null ? fmtMoney(r.pricePerUnit) : DASH}</td>
                    <td className="px-3 py-2 text-center tabular-nums">{r.capRate != null ? `${r.capRate.toFixed(2)}%` : DASH}</td>
                    <td className="px-3 py-2 text-center">{r.saleDate ?? DASH}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Honest silence-breaker: OM was read but had no comp tables */}
      {savedSnap.fromOmUpload &&
        (savedSnap.omRentComps?.length ?? 0) === 0 &&
        (savedSnap.omSalesComps?.length ?? 0) === 0 && (
          <p className="text-xs text-slate-400">
            No rent or sales comparables tables were found in this OM, so there are no Lease Comps /
            Sales Comps sections for this deal.
          </p>
        )}

      {/* Screening trace — failed candidates stay out of the way unless opened */}
      <section>
        <details className="card">
          <summary className="px-4 py-3 text-sm text-slate-600 cursor-pointer select-none">
            {view.trace.filter((t) => !t.passed).length} comp{view.trace.filter((t) => !t.passed).length === 1 ? "" : "s"} didn&apos;t
            pass the criteria — click to see which filter stopped each one
          </summary>
          <div className="overflow-x-auto border-t border-slate-100">
            <table className="w-full text-sm">
              <tbody>
                {view.trace.filter((t) => !t.passed).map((t) => {
                  const last = t.checks[t.checks.length - 1];
                  return (
                    <tr key={t.compId} className="border-b border-slate-100">
                      <td className="px-4 py-1.5">{t.name}</td>
                      <td className="px-3 py-1.5 text-center">
                        <span className="badge bg-slate-100 text-slate-500 border-slate-200">stopped at {t.failedAt}</span>
                      </td>
                      <td className="px-3 py-1.5 text-xs text-slate-500">{last ? `${last.filter}: ${last.reason}` : DASH}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </details>
      </section>
    </div>
  );
}

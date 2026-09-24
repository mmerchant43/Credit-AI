import Link from "next/link";
import { Fragment, Suspense } from "react";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { DASH, fmtMoney, fmtPct, fmtX, CATEGORY_LABELS } from "@/lib/format";
import {
  runScreen, summarize, excludeSameName, statValue, DEFAULT_CRITERIA,
  type Criteria, type Screenable, type StatRow, type TraceRow,
} from "@/lib/screen";
import { ensureCoords, ensureAddressCoords } from "@/lib/geo";
import CriteriaPanel from "@/components/CriteriaPanel";
import DealMap, { type MapPoint, type UnmappedComp } from "@/components/DealMap";
import MetricStrip from "@/components/MetricStrip";
import MetricBars from "@/components/MetricBars";
import StatsViewToggle from "@/components/StatsViewToggle";
import { RemoveCompButton, UndoRemoveButton } from "@/components/CompRemove";

export const dynamic = "force-dynamic";
// First view of an analysis geocodes its pins (Census/zip lookups) before
// rendering — give it the same Fluid-Compute headroom as /api/extract.
export const maxDuration = 300;

// A saved deal analysis. The screening criteria sit inline above the map
// (location = the radius control ON the map); any change re-screens the live
// database immediately. With no criteria in the URL, the saved snapshot renders.

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

// ── OM comp-table footer math (Mason, 9/22/26): comp average + subject
//    percentage comparison. Averages are across comp rows only (subject
//    excluded); a column with no comp values stays a dash. ──
const avgOf = (vals: (number | null | undefined)[]): number | null => {
  const v = vals.filter((x): x is number => typeof x === "number" && isFinite(x));
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};
/** Unit-weighted average (Mason, 9/22/26): Σ(value × units) / Σ(units) over
 *  rows where both are stated; falls back to the simple average when no row
 *  carries a weight. */
const wavgOf = (pairs: [number | null | undefined, number | null | undefined][]): number | null => {
  const usable = pairs.filter(
    ([v, w]) => typeof v === "number" && isFinite(v) && typeof w === "number" && isFinite(w) && (w as number) > 0
  ) as [number, number][];
  if (usable.length === 0) return avgOf(pairs.map(([v]) => v));
  const totW = usable.reduce((a, [, w]) => a + w, 0);
  return usable.reduce((a, [v, w]) => a + v * w, 0) / totW;
};
/** "+4.2%" / "−8.0%" — the subject's percentage difference vs. the comp average. */
const pctVs = (subject: number | null | undefined, average: number | null): string => {
  if (subject == null || average == null || average === 0) return DASH;
  const d = ((subject - average) / Math.abs(average)) * 100;
  return `${d >= 0 ? "+" : "−"}${Math.abs(d).toFixed(1)}%`;
};
/** "+5 yrs" / "−3 yrs" — vintage difference vs. the (rounded) comp average. */
const yrsVs = (subject: number | null | undefined, average: number | null): string => {
  if (subject == null || average == null) return DASH;
  const d = subject - Math.round(average);
  return `${d >= 0 ? "+" : "−"}${Math.abs(d)} yrs`;
};
/** "+0.14%" — percentage-POINT difference for rate metrics (cap rate,
 *  occupancy), displayed with a % sign per Mason (9/22/26). */
const ptsVs = (subject: number | null | undefined, average: number | null, decimals: number): string => {
  if (subject == null || average == null) return DASH;
  const d = subject - average;
  return `${d >= 0 ? "+" : "−"}${Math.abs(d).toFixed(decimals)}%`;
};

type Params = { [k: string]: string | string[] | undefined };
const one = (p: Params, k: string) => (Array.isArray(p[k]) ? p[k]?.[0] : p[k]) as string | undefined;

function parseCriteria(p: Params): { criteria: Criteria; anySet: boolean } {
  const loc = one(p, "loc");
  const radius = Number(one(p, "radius") ?? 0) || 0;
  const vin = one(p, "vin");
  const occ = one(p, "occ");
  const cat = one(p, "cat");
  const typ = one(p, "typ");
  // Drawn boundary (Mason, 9/22/26): "lat,lon;lat,lon;..." vertices.
  const polygon = (one(p, "poly") ?? "")
    .split(";")
    .map((pair) => pair.split(",").map(Number))
    .filter((c): c is number[] => c.length === 2 && c.every((n) => Number.isFinite(n)))
    .map((c) => [c[0], c[1]] as [number, number]);
  const hasPoly = polygon.length >= 3;

  const anySet = Boolean(loc || radius > 0 || hasPoly || vin || occ || cat || typ);
  // Default location screen is a 1-mile radius (Mason, 9/22/26); a drawn
  // boundary replaces the circle when present.
  const criteria: Criteria = {
    location: loc === "off" ? "off" : hasPoly ? "polygon" : "radius",
    radiusMiles: radius > 0 ? Math.min(radius, 100) : 1,
    polygon: hasPoly ? polygon : null,
    propertyType: typ !== "off",
    vintageYears: vin === "off" ? null : vin != null && vin !== "" ? Math.max(0, Number(vin) || 0) : DEFAULT_CRITERIA.vintageYears,
    occupancyPts: occ === "off" ? null : occ != null && occ !== "" ? Math.max(0, Number(occ) || 0) : DEFAULT_CRITERIA.occupancyPts,
    category: cat !== "off",
  };
  return { criteria, anySet };
}

// ── The Subject vs. Comps table, in two flavors (Mason, 9/23/26): the
//    Distribution column holds either the range strip or, toggled, a
//    vertical bar chart per deal in the SAME cell — same table, taller rows.
function StatsTable({
  mode, rows, comps, hasSubject, subjectName,
}: {
  mode: "strips" | "bars";
  rows: StatRow[];
  comps: Record<string, unknown>[]; // orderedMatched — numbering source
  hasSubject: boolean;
  subjectName: string;
}) {
  return (
    <div className="card overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-slate-500 uppercase tracking-wide border-b border-slate-200">
            <th className="px-3 py-2 text-left">Metric</th>
            <th className="px-3 py-2 text-right">Subject</th>
            <th className="px-3 py-2 text-right">Min</th>
            <th className="px-3 py-2 text-right">Median</th>
            <th className="px-3 py-2 text-right">Max</th>
            <th className="px-3 py-2 text-center w-[45%] min-w-[380px]"
              title={mode === "strips" ? "comps (navy) · median (tick) · subject (gold)" : "one bar per deal — subject (gold, S) · comps (navy, numbered)"}>
              Distribution
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.filter((row) => row.key !== "impliedCapPct").map((row) => {
            const values = comps
              .map((c) => statValue(c, row.key))
              .filter((v): v is number => v != null);
            return (
              <Fragment key={row.key}>
              {/* Two parts per Mason (9/22/26): Cost Basis, then Loan Amount. */}
              {(row.key === "totalProjectCost" || row.key === "loanAmount") && (
                <tr className="bg-slate-50 border-b border-slate-200">
                  <td colSpan={6} className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    {row.key === "totalProjectCost" ? "Total Cost Basis" : "Loan Amount"}
                  </td>
                </tr>
              )}
              <tr className="border-b border-slate-100">
                <td className="px-3 py-2">{row.label}{
                  // Range flag (Mason, 9/22/26): every metric with a
                  // subject value and a comp range gets one — green
                  // within, red below/above.
                  row.subject != null && row.min != null && row.max != null && (
                    row.subject < row.min
                      ? <span className="badge bg-red-50 text-red-700 border-red-200 ml-2">below range</span>
                      : row.subject > row.max
                        ? <span className="badge bg-red-50 text-red-700 border-red-200 ml-2">above range</span>
                        : <span className="badge bg-green-50 text-green-700 border-green-200 ml-2">within range</span>
                  )
                }</td>
                <td className="px-3 py-2 text-right tabular-nums font-medium">{fmtBy(row.kind, row.subject)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtBy(row.kind, row.min)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtBy(row.kind, row.median)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtBy(row.kind, row.max)}</td>
                <td className="px-3 py-2">
                  {mode === "strips" ? (
                    <MetricStrip kind={row.kind} values={values} subject={row.subject} median={row.median} />
                  ) : (
                    <MetricBars
                      kind={row.kind}
                      h={130}
                      items={[
                        ...(hasSubject ? [{ label: "S", name: subjectName, value: row.subject, isSubject: true }] : []),
                        ...comps.map((c, i) => ({
                          label: String(i + 1),
                          name: String(c.propertyName ?? c.dealName ?? `Comp ${i + 1}`),
                          value: statValue(c, row.key),
                          isSubject: false,
                        })),
                      ]}
                    />
                  )}
                </td>
              </tr>
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
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
    setLabel?: string | null;
    projectedRents?: { avgRent: number | null; rentPsf: number | null } | null;
  };

  let view: {
    matchedIds: string[]; trace: TraceRow[]; stats: StatRow[];
    candidatesScreened: number; modeLabel: string; matchedCount: number; live: boolean;
  };

  if (anySet && s) {
    const comps = excludeSameName(
      s as unknown as Screenable,
      (await prisma.creditComp.findMany({
        where: { archived: false, id: { not: s.id } },
      })) as unknown as (Screenable & { id: string })[]
    ) as unknown as Awaited<ReturnType<typeof prisma.creditComp.findMany>>;
    if ((criteria.location === "radius" && criteria.radiusMiles) || criteria.location === "polygon")
      await ensureCoords([s, ...comps]);
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
      : criteria.location === "polygon" ? "drawn boundary (live)"
      : criteria.location === "radius" ? `${criteria.radiusMiles}-mile radius (live)`
      : { zip: "same zip (live)", city: "same city (live)", none: "no database comps (live)" }[screen.locationMode] ?? "live";
    view = {
      matchedIds: kept.map((m) => m.id),
      trace: screen.trace, stats,
      candidatesScreened: screen.candidatesScreened,
      modeLabel, matchedCount: kept.length, live: true,
    };
  } else if (anySet && !s) {
    // Subject-less comp set (Mason, 9/23/26): no screening to re-run —
    // ✕ removals just shrink the saved set, stats recomputed live.
    const keptIds = (savedSnap.matchedIds ?? []).filter((id) => !excluded.has(id));
    const keptFull = await prisma.creditComp.findMany({
      where: { id: { in: keptIds }, archived: false },
    });
    view = {
      matchedIds: keptIds,
      trace: (savedSnap.trace ?? []).filter((tr) => !excluded.has(tr.compId)),
      stats: summarize({}, keptFull as unknown as Record<string, unknown>[]),
      candidatesScreened: savedSnap.candidatesScreened ?? keptIds.length,
      modeLabel: "hand-picked comps (live)",
      matchedCount: keptIds.length,
      live: true,
    };
  } else {
    view = {
      matchedIds: savedSnap.matchedIds ?? [], trace: savedSnap.trace ?? [], stats: savedSnap.stats ?? [],
      candidatesScreened: savedSnap.candidatesScreened ?? 0,
      modeLabel:
        { zip: "same zip", city: "same city (fallback)", none: "no database comps", radius: "radius", "hand-picked": "hand-picked comps" }[analysis.locationMode] ?? analysis.locationMode,
      matchedCount: analysis.matchedCount, live: false,
    };
  }

  // archived: false — a comp deleted from the database drops out of saved
  // analyses too (audit fix, 9/22/26).
  const matched = await prisma.creditComp.findMany({
    where: { id: { in: view.matchedIds }, archived: false },
    include: { metricYears: true },
  });
  const orderedMatched = view.matchedIds
    .map((id) => matched.find((m) => m.id === id))
    .filter((m): m is NonNullable<typeof m> => Boolean(m));
  if (!view.live) view.matchedCount = orderedMatched.length;
  const rows = [...(s ? [{ r: s, isSubject: true }] : []), ...orderedMatched.map((r) => ({ r, isSubject: false }))];

  const avail = {
    zip: Boolean(s?.zip),
    yearBuilt: s?.yearBuilt != null,
    occupancy: s != null && s.category !== "CONSTRUCTION" && s.occupancyPct != null,
    category: Boolean(s?.category),
  };

  // ── Map data: subject + matched comps. Comps get a pin ONLY at exact,
  //    address-level precision — a city/zip centroid is not a location, so
  //    no dot (Mason, 9/22/26); those comps are flagged below the map with
  //    an address box instead. The subject keeps its pin at any precision
  //    (it anchors the radius/boundary tools; its popup says "approximate"). ──
  const mapRows = s ? [s, ...orderedMatched] : [...orderedMatched];
  await ensureCoords(mapRows);
  await ensureAddressCoords(mapRows);
  // Pin labels match the Comparison table: S = subject, 1..N = comp order.
  const numById = new Map<string, string>(orderedMatched.map((m, i) => [m.id, String(i + 1)]));
  const mapPoints: MapPoint[] = mapRows
    .filter((r) => r.lat != null && r.lon != null && (r.id === s?.id || r.geoPrecision === "address"))
    .map((r) => ({
      id: r.id,
      name: r.propertyName ?? r.dealName ?? "—",
      lat: r.lat as number,
      lon: r.lon as number,
      isSubject: r.id === s?.id,
      precision: r.geoPrecision ?? "zip",
      detail: [[r.city, r.state].filter(Boolean).join(", "), r.zip, fmtMoney(r.loanAmount)].filter(Boolean).join(" · "),
      label: r.id === s?.id ? "S" : numById.get(r.id) ?? "•",
    }));
  // Everything not on the map gets flagged with an inline address box —
  // save an address and the pin appears (Mason, 9/22/26).
  const unmapped: UnmappedComp[] = mapRows
    .filter((r) => r.lat == null || r.lon == null || !r.address || r.geoPrecision !== "address")
    .map((r) => ({
      id: r.id,
      name: (r.propertyName ?? r.dealName ?? "—") + (r.id === s?.id ? " (Subject)" : ""),
      location: [r.city, r.state].filter(Boolean).join(", ") || "location unknown",
      hasAddress: Boolean(r.address),
    }))
    .filter((u) => !u.hasAddress || mapPoints.every((p) => p.id !== u.id));

  return (
    <div className="space-y-8 pb-10">
      <div className="section-head">
        <h2>Deal Analysis — {s ? s.propertyName ?? s.dealName ?? "Subject" : savedSnap.setLabel ?? "Comp Set"}</h2>
        <div className="rule" />
        <Link href="/deals/new" className="btn text-sm">+ New Analysis</Link>
      </div>

      {/* Subject snapshot — absent on a subject-less comp set */}
      {s && (
      <section className="card human p-4">
        <div className="flex flex-wrap gap-x-8 gap-y-2 text-base">
          <span><b className="font-display text-lg">{s.propertyName ?? DASH}</b></span>
          <span>Location: <b>{[s.city, s.state].filter(Boolean).join(", ") || DASH}{s.zip ? ` ${s.zip}` : ""}</b></span>
          <span>Category: <b>{s.category ? CATEGORY_LABELS[s.category] : DASH}</b></span>
          <span>Units: <b>{s.units ?? DASH}</b></span>
          <span>Stories: <b>{s.stories ?? DASH}</b></span>
          <span>Vintage: <b>{s.yearBuilt ?? DASH}</b></span>
          <span>Occupancy: <b>{s.category === "CONSTRUCTION" ? "0% (not built yet)" : fmtPct(s.occupancyPct, 1)}</b></span>
          {/* Projected rents live in the Lease Comps subject row, not here (Mason, 9/23/26). */}
          {s.omLink && (
            <a href={s.omLink} target="_blank" rel="noopener noreferrer" className="text-accent underline font-medium">
              Open OM ↗
            </a>
          )}
        </div>
        {savedSnap.writeupSections ? (
          <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-4">
            {([
              ["The Deal", savedSnap.writeupSections.deal],
              ["The Sponsor", savedSnap.writeupSections.sponsor],
              ["The Ask", savedSnap.writeupSections.ask],
            ] as const).map(([label, text]) => (
              <div key={label}>
                <div className="text-sm font-bold uppercase tracking-wide text-slate-600 mb-1.5">{label}</div>
                <p className="font-display text-[17px] leading-relaxed text-ink/90">{text}</p>
              </div>
            ))}
          </div>
        ) : savedSnap.writeup ? (
          <p className="font-display text-lg leading-relaxed text-ink/90 mt-3">{savedSnap.writeup}</p>
        ) : null}
      </section>

      )}

      {/* Screening criteria — subject-relative, so hidden on a comp set */}
      {s && (
        <Suspense>
          <CriteriaPanel avail={avail} />
        </Suspense>
      )}

      {/* Map — subject + matched comps; radius control lives on the map.
          The ring only renders when it reflects the match set on screen
          (legacy zip/city snapshots draw no ring until you interact). */}
      <Suspense>
        <DealMap
          points={mapPoints}
          unmapped={unmapped}
          radiusMiles={
            s == null
              ? null
              : view.live
                ? (criteria.location === "radius" ? criteria.radiusMiles : null)
                : (analysis.locationMode === "radius" ? criteria.radiusMiles : null)
          }
          polygon={s != null && view.live && criteria.location === "polygon" ? criteria.polygon ?? null : null}
        />
      </Suspense>

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
                <th className="px-2 py-2 text-center w-10">#</th>
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
                  <td className="px-2 py-2 text-center">
                    {/* Numbered by comp order (numById) — stays 1-based and
                        aligned with map pins/bars even with no subject row. */}
                    <span
                      className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold text-white ${isSubject ? "bg-accent" : "bg-navy"}`}
                      title={isSubject ? "Subject — gold pin on the map" : `Comp ${numById.get(r.id)} — navy pin ${numById.get(r.id)} on the map`}
                    >
                      {isSubject ? "S" : numById.get(r.id)}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    {r.propertyName ?? r.dealName ?? DASH}{isSubject ? " (Subject)" : ""}
                    {r.omLink && (
                      <a href={r.omLink} target="_blank" rel="noopener noreferrer"
                        className="ml-1.5 text-slate-300 hover:text-accent" title="Open the OM in a new tab">↗</a>
                    )}
                  </td>
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
                <tr><td colSpan={8} className="px-3 py-6 text-center text-slate-400">
                  No comps passed the current criteria — loosen a filter in the Screening panel above, or widen the radius on the map.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Subject vs. comps — distribution strips, flippable to per-deal
          vertical bars (Mason, 9/23/26): subject gold, comps Crow navy. */}
      {view.matchedCount > 0 && (
        <section>
          <div className="section-head"><h2>{s ? "Subject vs. Comps" : "Comp Set Metrics"}</h2><div className="rule" /></div>
          <StatsViewToggle
            table={<StatsTable mode="strips" rows={view.stats} comps={orderedMatched as unknown as Record<string, unknown>[]} hasSubject={s != null} subjectName={s?.propertyName ?? s?.dealName ?? "Subject"} />}
            bars={<StatsTable mode="bars" rows={view.stats} comps={orderedMatched as unknown as Record<string, unknown>[]} hasSubject={s != null} subjectName={s?.propertyName ?? s?.dealName ?? "Subject"} />}
          />
        </section>
      )}

      {/* OM lease comps — display-only, straight from the subject's OM, never
          in the database. On an OM-uploaded deal the section ALWAYS shows,
          with an honest empty note when the OM had no such table (Mason, 9/23/26). */}
      {((savedSnap.omRentComps?.length ?? 0) > 0 || savedSnap.fromOmUpload) && (
        <section>
          <div className="section-head">
            <h2>Lease Comps</h2>
            <div className="rule" />
            <span className="text-xs text-slate-400 whitespace-nowrap">from the subject&apos;s OM · not stored as database comps</span>
          </div>
          {(savedSnap.omRentComps?.length ?? 0) === 0 ? (
            <div className="card p-4 text-sm text-slate-500">
              No lease comparables were found in this OM.
            </div>
          ) : (
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
                {savedSnap.omRentComps!.filter((r) => !r.isSubject).map((r, i) => (
                  <tr key={i} className={`border-b border-slate-100 ${r.isSubject ? "human font-medium" : "hover:bg-slate-50"}`}>
                    <td className="px-3 py-2">{r.name}{r.isSubject ? " (Subject)" : ""}</td>
                    <td className="px-3 py-2 text-xs text-slate-600">{[r.city, r.state].filter(Boolean).join(", ") || DASH}</td>
                    <td className="px-3 py-2 text-center tabular-nums">{r.units ?? DASH}</td>
                    <td className="px-3 py-2 text-center tabular-nums">{r.yearBuilt ?? DASH}</td>
                    <td className="px-3 py-2 text-center tabular-nums">{r.occupancyPct != null ? `${r.occupancyPct.toFixed(1)}%` : DASH}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.avgRent != null ? fmtMoney(r.avgRent) : DASH}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.rentPsf != null ? `$${r.rentPsf.toFixed(2)}` : DASH}</td>
                  </tr>
                ))}
                {(() => {
                  const comps = savedSnap.omRentComps!.filter((r) => !r.isSubject);
                  // Projected / pro-forma rents from the OM fill the SUBJECT
                  // row here (Mason, 9/23/26) — construction subjects have no
                  // in-place rent, so the projection is the rent that belongs
                  // in this comparison. If the OM's comp table had no subject
                  // row at all, one is synthesized from the deal record.
                  const proj = savedSnap.projectedRents;
                  const subjRow = savedSnap.omRentComps!.find((r) => r.isSubject);
                  const subj = subjRow
                    ? { ...subjRow, avgRent: subjRow.avgRent ?? proj?.avgRent ?? null, rentPsf: subjRow.rentPsf ?? proj?.rentPsf ?? null }
                    : proj
                      ? {
                          name: s?.propertyName ?? s?.dealName ?? "Subject",
                          city: s?.city ?? null, state: s?.state ?? null,
                          units: s?.units ?? null, yearBuilt: s?.yearBuilt ?? null,
                          // omRentComps occupancy is AS PERCENT; the deal record stores a fraction.
                          occupancyPct: !s || s.category === "CONSTRUCTION" || s.occupancyPct == null ? null : s.occupancyPct * 100,
                          avgRent: proj.avgRent, rentPsf: proj.rentPsf, isSubject: true,
                        }
                      : undefined;
                  // Averages ROUNDED TO DISPLAY PRECISION before the deltas are
                  // computed, so the % row always agrees with the numbers shown
                  // (Mason, 9/22/26).
                  const round2 = (v: number | null) => (v == null ? null : Math.round(v * 100) / 100);
                  const round1 = (v: number | null) => (v == null ? null : Math.round(v * 10) / 10);
                  const round0 = (v: number | null) => (v == null ? null : Math.round(v));
                  const a = {
                    units: round0(avgOf(comps.map((r) => r.units))),
                    yearBuilt: round0(avgOf(comps.map((r) => r.yearBuilt))),
                    occ: round1(avgOf(comps.map((r) => r.occupancyPct))),
                    rent: round0(wavgOf(comps.map((r) => [r.avgRent, r.units]))), // unit-weighted
                    psf: round2(wavgOf(comps.map((r) => [r.rentPsf, r.units]))), // unit-weighted
                  };
                  if (comps.length === 0) return null;
                  return (
                    <>
                      <tr className="machine border-b border-slate-200 font-medium">
                        <td className="px-3 py-2">Comp Average ({comps.length})</td>
                        <td className="px-3 py-2" />
                        <td className="px-3 py-2 text-center tabular-nums">{a.units != null ? Math.round(a.units) : DASH}</td>
                        <td className="px-3 py-2 text-center tabular-nums">{a.yearBuilt != null ? Math.round(a.yearBuilt) : DASH}</td>
                        <td className="px-3 py-2 text-center tabular-nums">{a.occ != null ? `${a.occ.toFixed(1)}%` : DASH}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{a.rent != null ? fmtMoney(a.rent) : DASH}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{a.psf != null ? `$${a.psf.toFixed(2)}` : DASH}</td>
                      </tr>
                      {subj && (
                        <>
                          <tr className="human font-medium border-b border-slate-200">
                            <td className="px-3 py-2">{subj.name} (Subject)</td>
                            <td className="px-3 py-2" />
                            <td className="px-3 py-2 text-center tabular-nums">{subj.units ?? DASH}</td>
                            <td className="px-3 py-2 text-center tabular-nums">{subj.yearBuilt ?? DASH}</td>
                            <td className="px-3 py-2 text-center tabular-nums">{subj.occupancyPct != null ? `${subj.occupancyPct.toFixed(1)}%` : DASH}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{subj.avgRent != null ? fmtMoney(subj.avgRent) : DASH}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{subj.rentPsf != null ? `$${subj.rentPsf.toFixed(2)}` : DASH}</td>
                          </tr>
                          <tr className="bg-accent/10 font-semibold text-[#7A6234]">
                            <td className="px-3 py-2 text-xs uppercase tracking-wide">vs. Comp Average</td>
                            <td className="px-3 py-2" />
                            <td className="px-3 py-2 text-center tabular-nums">{pctVs(subj.units, a.units)}</td>
                            <td className="px-3 py-2 text-center tabular-nums">{yrsVs(subj.yearBuilt, a.yearBuilt)}</td>
                            <td className="px-3 py-2 text-center tabular-nums">{ptsVs(subj.occupancyPct, a.occ, 1)}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{pctVs(subj.avgRent, a.rent)}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{pctVs(subj.rentPsf, a.psf)}</td>
                          </tr>
                        </>
                      )}
                    </>
                  );
                })()}
              </tbody>
            </table>
          </div>
          )}
        </section>
      )}

      {/* OM sales comps — same always-show rule as Lease Comps (Mason, 9/23/26) */}
      {((savedSnap.omSalesComps?.length ?? 0) > 0 || savedSnap.fromOmUpload) && (
        <section>
          <div className="section-head">
            <h2>Sales Comps</h2>
            <div className="rule" />
            <span className="text-xs text-slate-400 whitespace-nowrap">from the subject&apos;s OM · not stored as database comps</span>
          </div>
          {(savedSnap.omSalesComps?.length ?? 0) === 0 ? (
            <div className="card p-4 text-sm text-slate-500">
              No sales comparables were found in this OM.
            </div>
          ) : (
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
                {savedSnap.omSalesComps!.filter((r) => !r.isSubject).map((r, i) => (
                  <tr key={i} className={`border-b border-slate-100 ${r.isSubject ? "human font-medium" : "hover:bg-slate-50"}`}>
                    <td className="px-3 py-2">{r.name}{r.isSubject ? " (Subject)" : ""}</td>
                    <td className="px-3 py-2 text-xs text-slate-600">{[r.city, r.state].filter(Boolean).join(", ") || DASH}</td>
                    <td className="px-3 py-2 text-center tabular-nums">{r.units ?? DASH}</td>
                    <td className="px-3 py-2 text-center tabular-nums">{r.yearBuilt ?? DASH}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.salePrice != null ? fmtMoney(r.salePrice) : DASH}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.pricePerUnit != null ? fmtMoney(r.pricePerUnit) : DASH}</td>
                    <td className="px-3 py-2 text-center tabular-nums">{r.capRate != null ? `${r.capRate.toFixed(2)}%` : DASH}</td>
                    <td className="px-3 py-2 text-center">{r.saleDate ?? DASH}</td>
                  </tr>
                ))}
                {(() => {
                  const comps = savedSnap.omSalesComps!.filter((r) => !r.isSubject);
                  const subj = savedSnap.omSalesComps!.find((r) => r.isSubject);
                  const roundS2 = (v: number | null) => (v == null ? null : Math.round(v * 100) / 100);
                  const roundS0 = (v: number | null) => (v == null ? null : Math.round(v));
                  const a = {
                    units: roundS0(avgOf(comps.map((r) => r.units))),
                    yearBuilt: roundS0(avgOf(comps.map((r) => r.yearBuilt))),
                    price: roundS0(avgOf(comps.map((r) => r.salePrice))),
                    ppu: roundS0(wavgOf(comps.map((r) => [r.pricePerUnit, r.units]))), // unit-weighted
                    cap: roundS2(avgOf(comps.map((r) => r.capRate))),
                  };
                  if (comps.length === 0) return null;
                  return (
                    <>
                      <tr className="machine border-b border-slate-200 font-medium">
                        <td className="px-3 py-2">Comp Average ({comps.length})</td>
                        <td className="px-3 py-2" />
                        <td className="px-3 py-2 text-center tabular-nums">{a.units != null ? Math.round(a.units) : DASH}</td>
                        <td className="px-3 py-2 text-center tabular-nums">{a.yearBuilt != null ? Math.round(a.yearBuilt) : DASH}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{a.price != null ? fmtMoney(a.price) : DASH}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{a.ppu != null ? fmtMoney(a.ppu) : DASH}</td>
                        <td className="px-3 py-2 text-center tabular-nums">{a.cap != null ? `${a.cap.toFixed(2)}%` : DASH}</td>
                        <td className="px-3 py-2" />
                      </tr>
                      {subj && (
                        <>
                          <tr className="human font-medium border-b border-slate-200">
                            <td className="px-3 py-2">{subj.name} (Subject)</td>
                            <td className="px-3 py-2" />
                            <td className="px-3 py-2 text-center tabular-nums">{subj.units ?? DASH}</td>
                            <td className="px-3 py-2 text-center tabular-nums">{subj.yearBuilt ?? DASH}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{subj.salePrice != null ? fmtMoney(subj.salePrice) : DASH}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{subj.pricePerUnit != null ? fmtMoney(subj.pricePerUnit) : DASH}</td>
                            <td className="px-3 py-2 text-center tabular-nums">{subj.capRate != null ? `${subj.capRate.toFixed(2)}%` : DASH}</td>
                            <td className="px-3 py-2" />
                          </tr>
                          <tr className="bg-accent/10 font-semibold text-[#7A6234]">
                            <td className="px-3 py-2 text-xs uppercase tracking-wide">vs. Comp Average</td>
                            <td className="px-3 py-2" />
                            <td className="px-3 py-2 text-center tabular-nums">{pctVs(subj.units, a.units)}</td>
                            <td className="px-3 py-2 text-center tabular-nums">{yrsVs(subj.yearBuilt, a.yearBuilt)}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{pctVs(subj.salePrice, a.price)}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{pctVs(subj.pricePerUnit, a.ppu)}</td>
                            <td className="px-3 py-2 text-center tabular-nums">{ptsVs(subj.capRate, a.cap, 2)}</td>
                            <td className="px-3 py-2" />
                          </tr>
                        </>
                      )}
                    </>
                  );
                })()}
              </tbody>
            </table>
          </div>
          )}
        </section>
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

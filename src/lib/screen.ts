// The five-filter comp screen, as deterministic code — ported from the
// team's original Python pipeline and updated to the two-category scheme.
// Every candidate gets a trace row saying exactly where it passed or stopped.
//
// Location ladder: same 5-digit zip → same city+state fallback (stands in
// for the original 3-mile radius until comps carry coordinates) → nothing.
// The other four filters are never relaxed.

export const VINTAGE_TOLERANCE = 3; // subject year built ± 3
export const OCCUPANCY_TOLERANCE = 0.10; // ± 10 points (fractions: 0.10)

export type LocationMode = "zip" | "city" | "radius" | "none";

export interface Screenable {
  id: string;
  propertyName: string | null;
  dealName: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  lat?: number | null; // zip-centroid coords (radius mode)
  lon?: number | null;
  propertyType: string;
  yearBuilt: number | null;
  occupancyPct: number | null; // fraction, current/in-place only
  category: string | null; // BRIDGE_REFI | CONSTRUCTION
}

export interface Check {
  filter: string;
  passed: boolean;
  reason: string;
}

export interface TraceRow {
  compId: string;
  name: string;
  passed: boolean;
  failedAt: string | null;
  checks: Check[];
}

const zip5 = (z: string | null | undefined) => (z ?? "").trim().slice(0, 5);
const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();

function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3958.7613;
  const p1 = (lat1 * Math.PI) / 180, p2 = (lat2 * Math.PI) / 180;
  const dp = p2 - p1, dl = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function fLocationRadius(subject: Screenable, comp: Screenable, radiusMiles: number): Check {
  if (subject.lat == null || subject.lon == null)
    return { filter: "1. Location", passed: false, reason: "subject has no coordinates (zip unknown)" };
  if (comp.lat == null || comp.lon == null)
    return { filter: "1. Location", passed: false, reason: "no coordinates on record (zip missing or unknown)" };
  const d = haversine(subject.lat, subject.lon, comp.lat, comp.lon);
  return {
    filter: "1. Location",
    passed: d <= radiusMiles,
    reason: `${d.toFixed(1)} mi from subject (zip centroids, limit ${radiusMiles} mi)`,
  };
}

function fLocation(subject: Screenable, comp: Screenable, mode: LocationMode): Check {
  if (mode === "zip") {
    const s = zip5(subject.zip), c = zip5(comp.zip);
    if (!s || !c) return { filter: "1. Location", passed: false, reason: "no zip on record" };
    return { filter: "1. Location", passed: s === c, reason: `zip ${c} vs subject ${s}` };
  }
  const sc = norm(subject.city), cc = norm(comp.city);
  const ss = norm(subject.state), cs = norm(comp.state);
  if (!sc || !cc) return { filter: "1. Location", passed: false, reason: "no city on record" };
  return {
    filter: "1. Location",
    passed: sc === cc && ss === cs,
    reason: `${comp.city}, ${comp.state} vs subject ${subject.city}, ${subject.state} (city fallback)`,
  };
}

function fPropertyType(subject: Screenable, comp: Screenable): Check {
  return {
    filter: "2. Property type",
    passed: subject.propertyType === comp.propertyType,
    reason: `${comp.propertyType} vs subject ${subject.propertyType}`,
  };
}

function fVintage(subject: Screenable, comp: Screenable): Check {
  if (subject.yearBuilt == null || comp.yearBuilt == null)
    return { filter: "3. Vintage", passed: false, reason: "no year built / delivery on record" };
  const delta = Math.abs(comp.yearBuilt - subject.yearBuilt);
  return {
    filter: "3. Vintage",
    passed: delta <= VINTAGE_TOLERANCE,
    reason: `${comp.yearBuilt} vs subject ${subject.yearBuilt} (Δ${delta}, limit ±${VINTAGE_TOLERANCE})`,
  };
}

function fOccupancy(subject: Screenable, comp: Screenable): Check {
  // Not applicable when the subject is Construction — no in-place occupancy
  // exists, and a stabilized assumption is never used.
  if (subject.category === "CONSTRUCTION")
    return { filter: "4. Occupancy", passed: true, reason: "n/a — subject is pre-delivery" };
  if (subject.occupancyPct == null)
    return { filter: "4. Occupancy", passed: true, reason: "n/a — subject occupancy not disclosed" };
  if (comp.occupancyPct == null)
    return { filter: "4. Occupancy", passed: false, reason: "no current occupancy on record" };
  const delta = Math.abs(comp.occupancyPct - subject.occupancyPct);
  return {
    filter: "4. Occupancy",
    passed: delta <= OCCUPANCY_TOLERANCE + 1e-9,
    reason: `${(comp.occupancyPct * 100).toFixed(1)}% vs subject ${(subject.occupancyPct * 100).toFixed(1)}% (Δ${(delta * 100).toFixed(1)}pt, limit ±10pt)`,
  };
}

function fCategory(subject: Screenable, comp: Screenable): Check {
  if (!comp.category) return { filter: "5. Category", passed: false, reason: "unclassified" };
  return {
    filter: "5. Category",
    passed: comp.category === subject.category,
    reason: `${comp.category === "BRIDGE_REFI" ? "Bridge / Refi" : "Construction"} vs subject ${subject.category === "BRIDGE_REFI" ? "Bridge / Refi" : "Construction"}`,
  };
}

function screenPass(subject: Screenable, comps: Screenable[], mode: LocationMode, radiusMiles?: number) {
  const matched: Screenable[] = [];
  const trace: TraceRow[] = [];
  for (const comp of comps) {
    const checks: Check[] = [];
    let failedAt: string | null = null;
    for (const fn of [
      () => (mode === "radius" && radiusMiles != null
        ? fLocationRadius(subject, comp, radiusMiles)
        : fLocation(subject, comp, mode)),
      () => fPropertyType(subject, comp),
      () => fVintage(subject, comp),
      () => fOccupancy(subject, comp),
      () => fCategory(subject, comp),
    ]) {
      const check = fn();
      checks.push(check);
      if (!check.passed) { failedAt = check.filter; break; } // hard cutoff
    }
    trace.push({
      compId: comp.id,
      name: comp.propertyName ?? comp.dealName ?? "—",
      passed: failedAt === null,
      failedAt,
      checks,
    });
    if (failedAt === null) matched.push(comp);
  }
  return { matched, trace };
}

/** Default ladder: zip first; only if that yields nothing, widen to same
 *  city+state; if that is also empty, stop — no further fallback.
 *  With radiusMiles set (the analysis page's slider), the location filter is
 *  instead a hard distance cutoff on zip-centroid coordinates. */
export function runScreen(subject: Screenable, comps: Screenable[], radiusMiles?: number) {
  if (radiusMiles != null && radiusMiles > 0) {
    const { matched, trace } = screenPass(subject, comps, "radius", radiusMiles);
    return { matched, trace, locationMode: "radius" as LocationMode, candidatesScreened: comps.length };
  }
  let { matched, trace } = screenPass(subject, comps, "zip");
  let mode: LocationMode = "zip";
  if (matched.length === 0) {
    const widened = screenPass(subject, comps, "city");
    if (widened.matched.length > 0) {
      matched = widened.matched; trace = widened.trace; mode = "city";
    } else {
      mode = "none";
    }
  }
  return { matched, trace, locationMode: mode, candidatesScreened: comps.length };
}

// ── Cross-comp aggregates — the ONLY computed numbers in the system ──
export interface StatRow {
  key: string;
  label: string;
  kind: "usd" | "pct" | "x" | "num";
  subject: number | null;
  min: number | null;
  max: number | null;
  median: number | null;
  mean: number | null;
  position: number | null; // 0..1 within [min,max], clamped to [-0.15, 1.15]
  medianPosition: number | null;
  outside: boolean;
}

export const STAT_METRICS: { key: string; label: string; kind: StatRow["kind"] }[] = [
  { key: "loanAmount", label: "Loan Amount (Total)", kind: "usd" },
  { key: "loanPerUnit", label: "Loan Amount / Unit", kind: "usd" },
  { key: "loanPerSf", label: "Loan Amount PSF", kind: "usd" },
  { key: "ltcPct", label: "Loan to Cost", kind: "pct" },
  { key: "ltvPct", label: "Loan to Value", kind: "pct" },
  { key: "debtYieldPct", label: "Debt Yield", kind: "pct" },
  { key: "totalProjectCost", label: "Total Project Cost", kind: "usd" },
  { key: "tpcPerUnit", label: "Total Project Cost / Unit", kind: "usd" },
  { key: "impliedCapPct", label: "Implied / Stabilized Cap Rate", kind: "pct" },
];

const median = (v: number[]) => {
  const s = [...v].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export function summarize(subject: Record<string, unknown>, matched: Record<string, unknown>[]): StatRow[] {
  return STAT_METRICS
    // Debt yield is a projection on an unbuilt asset — suppressed for Construction subjects.
    .filter((m) => !(m.key === "debtYieldPct" && subject.category === "CONSTRUCTION"))
    .map((m) => {
      const vals = matched
        .map((c) => c[m.key])
        .filter((v): v is number => typeof v === "number" && isFinite(v));
      const sv = typeof subject[m.key] === "number" ? (subject[m.key] as number) : null;
      const row: StatRow = {
        key: m.key, label: m.label, kind: m.kind, subject: sv,
        min: null, max: null, median: null, mean: null,
        position: null, medianPosition: null, outside: false,
      };
      if (vals.length) {
        row.min = Math.min(...vals);
        row.max = Math.max(...vals);
        row.median = median(vals);
        row.mean = vals.reduce((a, b) => a + b, 0) / vals.length;
        const span = row.max - row.min;
        row.medianPosition = span === 0 ? 0.5 : (row.median - row.min) / span;
        if (sv != null) {
          row.outside = sv < row.min || sv > row.max;
          row.position = Math.max(-0.15, Math.min(1.15, span === 0 ? 0.5 : (sv - row.min) / span));
        }
      }
      return row;
    });
}

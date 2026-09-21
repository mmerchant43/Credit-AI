// The five-filter comp screen, as deterministic code — with ADJUSTABLE
// criteria (Mason, 9/21/26): each filter can be tuned or switched off, and a
// filter that isn't populated — turned off, or missing its datum on the
// SUBJECT — is not applied. A comp missing the datum for vintage/occupancy/
// category passes with an honest "not stated" note; LOCATION is the one hard
// gate — a comp whose whereabouts are unknown fails a location screen
// (Mason, 9/21/26). Every candidate still gets a full trace row.

export const VINTAGE_TOLERANCE = 3; // default: subject year built ± 3
export const OCCUPANCY_TOLERANCE_PTS = 10; // default: ± 10 percentage points

export type LocationMode = "zip" | "city" | "radius" | "off" | "none";

/** The five criteria. null / false / "off" = filter not applied. */
export interface Criteria {
  location: "auto" | "radius" | "off"; // auto = same zip → same city ladder
  radiusMiles: number | null; // used when location === "radius"
  propertyType: boolean;
  vintageYears: number | null; // ± years
  occupancyPts: number | null; // ± percentage points
  category: boolean;
}

export const DEFAULT_CRITERIA: Criteria = {
  location: "auto",
  radiusMiles: null,
  propertyType: true,
  vintageYears: VINTAGE_TOLERANCE,
  occupancyPts: OCCUPANCY_TOLERANCE_PTS,
  category: true,
};

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
const na = (filter: string, reason: string): Check => ({ filter, passed: true, reason });

function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3958.7613;
  const p1 = (lat1 * Math.PI) / 180, p2 = (lat2 * Math.PI) / 180;
  const dp = p2 - p1, dl = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

const F1 = "1. Location", F2 = "2. Property type", F3 = "3. Vintage", F4 = "4. Occupancy", F5 = "5. Category";

function fLocation(subject: Screenable, comp: Screenable, mode: LocationMode, radiusMiles: number | null): Check {
  if (mode === "off") return na(F1, "filter off");
  if (mode === "radius") {
    if (radiusMiles == null || radiusMiles <= 0) return na(F1, "no radius set — not applied");
    if (subject.lat == null || subject.lon == null)
      return na(F1, "subject has no coordinates (zip not stated) — not applied");
    // Location is a hard geographic gate: a comp whose whereabouts are unknown
    // cannot be inside the radius (Mason, 9/21/26 — v8's leniency here let
    // no-zip comps from random cities into radius screens).
    if (comp.lat == null || comp.lon == null)
      return { filter: F1, passed: false, reason: "no coordinates on record (zip missing or unknown)" };
    const d = haversine(subject.lat, subject.lon, comp.lat, comp.lon);
    return { filter: F1, passed: d <= radiusMiles, reason: `${d.toFixed(1)} mi from subject (zip centroids, limit ${radiusMiles} mi)` };
  }
  if (mode === "zip") {
    const s = zip5(subject.zip), c = zip5(comp.zip);
    if (!s) return na(F1, "subject zip not stated — not applied");
    if (!c) return { filter: F1, passed: false, reason: "no zip on record" };
    return { filter: F1, passed: s === c, reason: `zip ${c} vs subject ${s}` };
  }
  // city fallback
  const sc = norm(subject.city), cc = norm(comp.city);
  if (!sc) return na(F1, "subject city not stated — not applied");
  if (!cc) return { filter: F1, passed: false, reason: "no city on record" };
  return {
    filter: F1,
    passed: sc === cc && norm(subject.state) === norm(comp.state),
    reason: `${comp.city}, ${comp.state} vs subject ${subject.city}, ${subject.state} (city fallback)`,
  };
}

function fPropertyType(subject: Screenable, comp: Screenable, on: boolean): Check {
  if (!on) return na(F2, "filter off");
  return { filter: F2, passed: subject.propertyType === comp.propertyType, reason: `${comp.propertyType} vs subject ${subject.propertyType}` };
}

function fVintage(subject: Screenable, comp: Screenable, tol: number | null): Check {
  if (tol == null) return na(F3, "filter off");
  if (subject.yearBuilt == null) return na(F3, "subject year built not stated — not applied");
  if (comp.yearBuilt == null) return na(F3, "year built not stated on comp — not applied");
  const delta = Math.abs(comp.yearBuilt - subject.yearBuilt);
  return { filter: F3, passed: delta <= tol, reason: `${comp.yearBuilt} vs subject ${subject.yearBuilt} (Δ${delta}, limit ±${tol})` };
}

function fOccupancy(subject: Screenable, comp: Screenable, tolPts: number | null): Check {
  if (tolPts == null) return na(F4, "filter off");
  if (subject.category === "CONSTRUCTION") return na(F4, "n/a — subject is pre-delivery");
  if (subject.occupancyPct == null) return na(F4, "subject occupancy not stated — not applied");
  if (comp.occupancyPct == null) return na(F4, "occupancy not stated on comp — not applied");
  const tol = tolPts / 100;
  const delta = Math.abs(comp.occupancyPct - subject.occupancyPct);
  return {
    filter: F4,
    passed: delta <= tol + 1e-9,
    reason: `${(comp.occupancyPct * 100).toFixed(1)}% vs subject ${(subject.occupancyPct * 100).toFixed(1)}% (Δ${(delta * 100).toFixed(1)}pt, limit ±${tolPts}pt)`,
  };
}

function fCategory(subject: Screenable, comp: Screenable, on: boolean): Check {
  if (!on) return na(F5, "filter off");
  if (!subject.category) return na(F5, "subject unclassified — not applied");
  if (!comp.category) return na(F5, "comp unclassified — not applied");
  const label = (c: string) => (c === "BRIDGE_REFI" ? "Bridge / Refi" : "Construction");
  return { filter: F5, passed: comp.category === subject.category, reason: `${label(comp.category)} vs subject ${label(subject.category)}` };
}

function screenPass(subject: Screenable, comps: Screenable[], mode: LocationMode, c: Criteria) {
  const matched: Screenable[] = [];
  const trace: TraceRow[] = [];
  for (const comp of comps) {
    const checks: Check[] = [];
    let failedAt: string | null = null;
    for (const fn of [
      () => fLocation(subject, comp, mode, c.radiusMiles),
      () => fPropertyType(subject, comp, c.propertyType),
      () => fVintage(subject, comp, c.vintageYears),
      () => fOccupancy(subject, comp, c.occupancyPts),
      () => fCategory(subject, comp, c.category),
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

/** Screen with the given criteria (defaults = the original doctrine).
 *  location "auto": zip first; only if that yields nothing, same city+state;
 *  if that is also empty, stop. "radius": hard distance cutoff. "off": all
 *  comps pass location. */
export function runScreen(subject: Screenable, comps: Screenable[], criteria?: Partial<Criteria> | number) {
  // Back-compat: a bare number is a radius (v5.0 call sites).
  const c: Criteria =
    typeof criteria === "number"
      ? { ...DEFAULT_CRITERIA, location: "radius", radiusMiles: criteria }
      : { ...DEFAULT_CRITERIA, ...(criteria ?? {}) };

  if (c.location === "radius" || c.location === "off") {
    // Radius mode without a committed radius value applies no location filter.
    const mode: LocationMode =
      c.location === "radius" && (c.radiusMiles ?? 0) > 0 ? "radius" : "off";
    const { matched, trace } = screenPass(subject, comps, mode, c);
    return { matched, trace, locationMode: mode, candidatesScreened: comps.length, criteria: c };
  }
  // auto ladder — skipped entirely when the subject has no zip AND no city
  let { matched, trace } = screenPass(subject, comps, "zip", c);
  let mode: LocationMode = "zip";
  if (matched.length === 0) {
    const widened = screenPass(subject, comps, "city", c);
    if (widened.matched.length > 0) {
      matched = widened.matched; trace = widened.trace; mode = "city";
    } else {
      mode = "none";
    }
  }
  return { matched, trace, locationMode: mode, candidatesScreened: comps.length, criteria: c };
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

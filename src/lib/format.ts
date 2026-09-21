// Display helpers. Doctrine: a value the source never stated renders as an
// em dash — nothing is derived or backed into (see comp-analysis doctrine).
export const DASH = "—";

export const fmtMoney = (v: number | null | undefined) =>
  v == null ? DASH : "$" + Math.round(v).toLocaleString();

export const fmtNum = (v: number | null | undefined) =>
  v == null ? DASH : Math.round(v).toLocaleString();

/** Percents are stored as fractions (0.0685) and displayed as 6.85%. */
export const fmtPct = (v: number | null | undefined, digits = 2) =>
  v == null ? DASH : (v * 100).toFixed(digits) + "%";

export const fmtX = (v: number | null | undefined) =>
  v == null ? DASH : v.toFixed(2) + "x";

export const fmtDate = (d: Date | string | null | undefined) => {
  if (!d) return DASH;
  const dt = typeof d === "string" ? new Date(d) : d;
  if (isNaN(dt.getTime())) return DASH;
  return `${dt.toLocaleString("en-US", { month: "short", timeZone: "UTC" })}-${String(dt.getUTCFullYear()).slice(2)}`;
};

export const PROPERTY_TYPE_LABELS: Record<string, string> = {
  MULTIFAMILY: "Multifamily", OFFICE: "Office", RETAIL: "Retail",
  HOTEL: "Hotel", SELF_STORAGE: "Self Storage", SENIOR_HOUSING: "Senior Housing",
  STUDENT_HOUSING: "Student Housing", MIXED_USE: "Mixed Use", LAND: "Land", OTHER: "Other", UNKNOWN: DASH,
};

export const CATEGORY_LABELS: Record<string, string> = {
  EXISTING_MEZZANINE: "A — Existing Mezz",
  EXISTING_STRETCH_SENIOR: "B — Stretch Senior",
  CONSTRUCTION_BRIDGE: "C — Construction",
  CONSTRUCTION_LOAN: "D — Construction",
  GROUND_UP_EQUITY: "GE — Ground-Up Equity",
};

export const POSITION_LABELS: Record<string, string> = {
  MEZZANINE: "Mezzanine", STRETCH_SENIOR: "Stretch Senior", WHOLE_LOAN: "Whole Loan",
  PREFERRED_EQUITY: "Preferred Equity", LP_EQUITY: "LP Equity", OTHER: "Other",
};

export const OUTCOME_LABELS: Record<string, string> = {
  SCREENED: "Screened", QUOTED: "Quoted", CLOSED: "Closed", PASSED: "Passed", LOST: "Lost",
};

// Parses the DealForm payload into Prisma-ready data. One converter for both
// the Add-a-Comp and New Deal Analysis endpoints so the rules never drift:
// percents arrive as percents and are stored as fractions; blanks become
// null (verbatim-or-null); per-year DSCR/DY rows are only created when the
// year has at least one stated value.
import { z } from "zod";

const YEAR_LABELS = ["Year 1", "Year 2", "Year 3", "Stabilized"];

// null (JSON from the OM-upload path) and "" (empty form fields) both mean
// "not stated" — they must become undefined, never 0 via Number(null).
const blankToUndef = (v: unknown) =>
  v == null || (typeof v === "string" && v.trim() === "") ? undefined : v;
const optNum = z.preprocess(blankToUndef, z.coerce.number().finite().optional());
const optInt = z.preprocess(blankToUndef, z.coerce.number().int().optional());
// Coerce and TRUNCATE rather than reject — a model that writes a verbose
// note or a numeric zip must never fail the whole save after a 2-minute
// extraction (audit fix, 9/22/26).
const optStr = z.preprocess(
  (v) => (blankToUndef(v) == null ? undefined : String(v).trim().slice(0, 2000)),
  z.string().optional()
);

export const compInputSchema = z.object({
  propertyName: z.preprocess((v) => String(v ?? "").trim().slice(0, 300), z.string().min(1, "Property name is required")),
  dealName: optStr,
  address: optStr,
  city: z.preprocess((v) => String(v ?? "").trim().slice(0, 120), z.string().min(1, "City is required")),
  state: z.preprocess((v) => String(v ?? "").trim().slice(0, 30), z.string().min(2, "State is required")),
  zip: optStr,
  market: optStr,
  submarket: optStr,
  units: optInt,
  stories: optInt,
  sizeSf: optInt,
  yearBuilt: optInt,
  occupancyPct: optNum, // percent in, fraction out

  category: z.enum(["BRIDGE_REFI", "CONSTRUCTION"]).or(z.literal("")).optional(),
  crowPosition: z.enum(["MEZZANINE", "STRETCH_SENIOR", "WHOLE_LOAN", "PREFERRED_EQUITY", "LP_EQUITY", "OTHER"]).or(z.literal("")).optional(),
  classificationEvidence: optStr,

  loanAmount: optNum,
  loanPerUnit: optNum,
  loanPerSf: optNum,
  rateType: z.enum(["FIXED", "FLOATING"]).or(z.literal("")).optional(),
  indexName: optStr,
  spreadBps: optInt,
  ratePct: optNum,
  termMonths: optInt,
  ioMonths: optInt,
  originationDate: optStr,

  ltvPct: optNum,
  ltcPct: optNum,
  totalProjectCost: optNum,
  tpcPerUnit: optNum,
  impliedCapPct: optNum,
  stabilizedCapPct: optNum,

  dscr0: optNum, dy0: optNum,
  dscr1: optNum, dy1: optNum,
  dscr2: optNum, dy2: optNum,
  dscr3: optNum, dy3: optNum,

  borrowerSponsor: optStr,
  brokerage: optStr,
  outcome: z.enum(["SCREENED", "QUOTED", "CLOSED", "PASSED", "LOST"]).or(z.literal("")).optional(),
  outcomeNote: optStr,
  sourceNote: optStr,
  omLink: optStr,
  notes: optStr,
});

export type CompInput = z.infer<typeof compInputSchema>;

const frac = (pct: number | undefined) => (pct == null ? null : pct / 100);

export function toCompData(input: CompInput) {
  const data = {
    propertyName: input.propertyName,
    dealName: input.dealName ?? null,
    address: input.address ?? null,
    city: input.city,
    state: input.state.length <= 2 ? input.state.toUpperCase() : input.state,
    zip: input.zip ?? null,
    market: input.market ?? `${input.city}, ${input.state.toUpperCase()}`,
    submarket: input.submarket ?? null,
    propertyType: "MULTIFAMILY" as const,
    units: input.units ?? null,
    stories: input.stories ?? null,
    sizeSf: input.sizeSf ?? null,
    yearBuilt: input.yearBuilt ?? null,
    occupancyPct: frac(input.occupancyPct),

    category: input.category || null,
    crowPosition: input.crowPosition || null,

    loanAmount: input.loanAmount ?? null,
    loanPerUnit: input.loanPerUnit ?? null,
    loanPerSf: input.loanPerSf ?? null,
    rateType: input.rateType || null,
    indexName: input.indexName ?? null,
    spreadBps: input.spreadBps ?? null,
    ratePct: frac(input.ratePct),
    termMonths: input.termMonths ?? null,
    ioMonths: input.ioMonths ?? null,
    originationDate: input.originationDate ? new Date(input.originationDate) : null,

    ltvPct: frac(input.ltvPct),
    ltcPct: frac(input.ltcPct),
    totalProjectCost: input.totalProjectCost ?? null,
    tpcPerUnit: input.tpcPerUnit ?? null,
    impliedCapPct: frac(input.impliedCapPct),
    stabilizedCapPct: frac(input.stabilizedCapPct),

    // Legacy single-value columns mirror Year 1 for table display.
    dscr: input.dscr0 ?? null,
    debtYieldPct: frac(input.dy0),

    borrowerSponsor: input.borrowerSponsor ?? null,
    brokerage: input.brokerage ?? null,
    outcome: input.outcome || "SCREENED",
    outcomeNote: input.outcomeNote ?? null,
    sourceNote: input.sourceNote ?? null,
    omLink: input.omLink ?? null,
    notes: input.notes ?? null,
  };

  const metricYears = YEAR_LABELS.map((yearLabel, i) => ({
    yearLabel,
    dscr: (input as Record<string, unknown>)[`dscr${i}`] as number | undefined ?? null,
    debtYieldPct: frac((input as Record<string, unknown>)[`dy${i}`] as number | undefined),
  })).filter((m) => m.dscr != null || m.debtYieldPct != null);

  return { data, metricYears };
}

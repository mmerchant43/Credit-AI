import Link from "next/link";
import { Suspense } from "react";
import { prisma } from "@/lib/db";
import {
  DASH, fmtMoney, fmtNum, fmtPct, fmtX, fmtDate,
  PROPERTY_TYPE_LABELS, CATEGORY_LABELS, POSITION_LABELS, OUTCOME_LABELS,
} from "@/lib/format";
import CompFilters from "@/components/CompFilters";

export const dynamic = "force-dynamic";

type Params = Record<string, string | string[] | undefined>;

const num = (p: Params, k: string): number | undefined => {
  const v = Array.isArray(p[k]) ? p[k]?.[0] : p[k];
  if (v == null || v === "") return undefined;
  const n = Number(v);
  return isFinite(n) ? n : undefined;
};
const str = (p: Params, k: string): string | undefined => {
  const v = Array.isArray(p[k]) ? p[k]?.[0] : p[k];
  return v?.trim() || undefined;
};
const range = (min?: number, max?: number) =>
  min == null && max == null ? undefined : { ...(min != null ? { gte: min } : {}), ...(max != null ? { lte: max } : {}) };
// LTV / LTC / Debt Yield are stored as fractions; users type percents.
const pctRange = (min?: number, max?: number) =>
  range(min != null ? min / 100 : undefined, max != null ? max / 100 : undefined);

function buildWhere(p: Params) {
  const where: Record<string, unknown> = { archived: false };

  const stories = range(num(p, "storiesMin"), num(p, "storiesMax"));
  if (stories) where.stories = stories;

  const state = str(p, "state");
  if (state) where.state = { equals: state, mode: "insensitive" };
  const city = str(p, "city");
  if (city) where.city = { contains: city, mode: "insensitive" };
  const zip = str(p, "zip");
  if (zip) where.zip = { startsWith: zip.slice(0, 5) };

  const loan = range(num(p, "loanMin"), num(p, "loanMax"));
  if (loan) where.loanAmount = loan;
  const ltv = pctRange(num(p, "ltvMin"), num(p, "ltvMax"));
  if (ltv) where.ltvPct = ltv;
  const ltc = pctRange(num(p, "ltcMin"), num(p, "ltcMax"));
  if (ltc) where.ltcPct = ltc;
  const psf = range(num(p, "psfMin"), num(p, "psfMax"));
  if (psf) where.loanPerSf = psf;
  const perUnit = range(num(p, "perUnitMin"), num(p, "perUnitMax"));
  if (perUnit) where.loanPerUnit = perUnit;

  // DSCR / Debt Yield filter against the chosen projection year's stated value.
  const dscr = range(num(p, "dscrMin"), num(p, "dscrMax"));
  if (dscr) {
    where.metricYears = {
      some: { yearLabel: str(p, "dscrYear") ?? "Year 1", dscr },
    };
  }
  const dy = pctRange(num(p, "dyMin"), num(p, "dyMax"));
  if (dy) {
    const existing = (where.metricYears as { some: Record<string, unknown> } | undefined)?.some;
    const dyCond = { yearLabel: str(p, "dyYear") ?? "Year 1", debtYieldPct: dy };
    // Both DSCR and DY filters set: each must hold on its own chosen year.
    if (existing) {
      where.AND = [{ metricYears: { some: existing } }, { metricYears: { some: dyCond } }];
      delete where.metricYears;
    } else {
      where.metricYears = { some: dyCond };
    }
  }
  return where;
}

export default async function CompsPage({ searchParams }: { searchParams: Params }) {
  const where = buildWhere(searchParams);
  const filtered = Object.keys(searchParams).length > 0;
  const [comps, total] = await Promise.all([
    prisma.creditComp.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 250,
      include: { metricYears: { orderBy: { yearLabel: "asc" } } },
    }),
    prisma.creditComp.count({ where: { archived: false } }),
  ]);

  return (
    <div className="space-y-5 pb-6">
      <div className="section-head">
        <h2>Credit Comps</h2>
        <div className="rule" />
        <Link href="/comps/new" className="btn btn-primary text-sm">+ Add a Comp</Link>
      </div>

      <Suspense>
        <CompFilters />
      </Suspense>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-slate-500 uppercase tracking-wide border-b border-slate-200">
              <th className="px-3 py-2 text-left">Property</th>
              <th className="px-3 py-2 text-left">Location</th>
              <th className="px-3 py-2 text-center">Category</th>
              <th className="px-3 py-2 text-center">Units</th>
              <th className="px-3 py-2 text-center">Stories</th>
              <th className="px-3 py-2 text-center">Vintage</th>
              <th className="px-3 py-2 text-right">Loan Amount</th>
              <th className="px-3 py-2 text-right">$/Unit</th>
              <th className="px-3 py-2 text-right">$/SF</th>
              <th className="px-3 py-2 text-center">LTV</th>
              <th className="px-3 py-2 text-center">LTC</th>
              <th className="px-3 py-2 text-center">DSCR</th>
              <th className="px-3 py-2 text-center">Debt Yield</th>
              <th className="px-3 py-2 text-center">Outcome</th>
            </tr>
          </thead>
          <tbody>
            {comps.map((c) => {
              const firstYear = c.metricYears.find((m) => m.dscr != null || m.debtYieldPct != null);
              const dscrShown = c.dscr ?? firstYear?.dscr ?? null;
              const dyShown = c.debtYieldPct ?? firstYear?.debtYieldPct ?? null;
              return (
                <tr key={c.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="px-3 py-2">
                    <span className="font-medium">{c.propertyName ?? c.dealName ?? c.address ?? "N/A"}</span>
                    {c.borrowerSponsor && <div className="text-xs text-slate-400">{c.borrowerSponsor}</div>}
                  </td>
                  <td className="px-3 py-2 text-slate-600 text-xs">
                    {[c.city, c.state].filter(Boolean).join(", ") || c.market}{c.zip ? ` ${c.zip}` : ""}
                  </td>
                  <td className="px-3 py-2 text-center text-xs text-slate-500">{c.category ? CATEGORY_LABELS[c.category] ?? DASH : DASH}</td>
                  <td className="px-3 py-2 text-center tabular-nums">{c.units ?? DASH}</td>
                  <td className="px-3 py-2 text-center tabular-nums">{c.stories ?? DASH}</td>
                  <td className="px-3 py-2 text-center tabular-nums">{c.yearBuilt ?? DASH}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(c.loanAmount)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(c.loanPerUnit)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(c.loanPerSf)}</td>
                  <td className="px-3 py-2 text-center tabular-nums">{fmtPct(c.ltvPct, 1)}</td>
                  <td className="px-3 py-2 text-center tabular-nums">{fmtPct(c.ltcPct, 1)}</td>
                  <td className="px-3 py-2 text-center tabular-nums" title={c.metricYears.map((m) => `${m.yearLabel}: DSCR ${m.dscr ?? "—"}`).join(" · ")}>
                    {fmtX(dscrShown)}
                  </td>
                  <td className="px-3 py-2 text-center tabular-nums" title={c.metricYears.map((m) => `${m.yearLabel}: DY ${m.debtYieldPct != null ? (m.debtYieldPct * 100).toFixed(2) + "%" : "—"}`).join(" · ")}>
                    {fmtPct(dyShown, 1)}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <span className="badge bg-slate-100 text-slate-600 border-slate-200">{OUTCOME_LABELS[c.outcome] ?? c.outcome}</span>
                  </td>
                </tr>
              );
            })}
            {comps.length === 0 && (
              <tr>
                <td colSpan={14} className="px-3 py-8 text-center text-slate-400">
                  {filtered
                    ? "No comps match these filters. Blanks drop out of filtered views — try widening a range."
                    : "No comps yet — they arrive automatically with the next deploy, or add one now."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-slate-400">
        {fmtNum(comps.length)} shown{filtered ? ` of ${fmtNum(total)}` : ""} · hover DSCR / Debt Yield for the year-by-year values · every metric is verbatim from its source — an em dash means the source never stated it.
      </p>
    </div>
  );
}

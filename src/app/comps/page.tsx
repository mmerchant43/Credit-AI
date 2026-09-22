import Link from "next/link";
import { Suspense } from "react";
import { prisma } from "@/lib/db";
import {
  DASH, fmtMoney, fmtNum, fmtPct, fmtX, fmtDate,
  CATEGORY_LABELS,
} from "@/lib/format";
import CompFilters from "@/components/CompFilters";
import DuplicateAlert, { DupBadge, type DupRow } from "@/components/DuplicateAlert";
import CompDetail, { type CompFull } from "@/components/CompDetail";
import ArchiveComp from "@/components/ArchiveComp";

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

// Filter set per Mason (9/21-22/26): Deal Name search, Category, Stories range, State, City, Zip.
function buildWhere(p: Params) {
  const where: Record<string, unknown> = { archived: false };

  const name = str(p, "name");
  if (name) {
    where.OR = [
      { propertyName: { contains: name, mode: "insensitive" } },
      { dealName: { contains: name, mode: "insensitive" } },
    ];
  }

  const category = str(p, "category");
  if (category === "BRIDGE_REFI" || category === "CONSTRUCTION") where.category = category;

  const stories = range(num(p, "storiesMin"), num(p, "storiesMax"));
  if (stories) where.stories = stories;

  const state = str(p, "state");
  if (state) where.state = { equals: state, mode: "insensitive" };
  const city = str(p, "city");
  if (city) where.city = { contains: city, mode: "insensitive" };
  const zip = str(p, "zip");
  if (zip) where.zip = { startsWith: zip.slice(0, 5) };

  return where;
}

export default async function CompsPage({ searchParams }: { searchParams: Params }) {
  const where = buildWhere(searchParams);
  const filtered = Object.keys(searchParams).length > 0;
  const [comps, total, dupCandidates] = await Promise.all([
    prisma.creditComp.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 250,
      include: { metricYears: { orderBy: { yearLabel: "asc" } } },
    }),
    prisma.creditComp.count({ where: { archived: false } }),
    prisma.creditComp.findMany({
      where: { archived: false, dupApproved: false },
      select: { id: true, propertyName: true, city: true, state: true, loanAmount: true, sourceNote: true, createdAt: true },
    }),
  ]);

  // Same property name + city (case-insensitive) appearing more than once → flag.
  const byKey = new Map<string, typeof dupCandidates>();
  for (const c of dupCandidates) {
    const key = `${(c.propertyName ?? "").trim().toLowerCase()}|${(c.city ?? "").trim().toLowerCase()}`;
    if (!c.propertyName) continue;
    const arr = byKey.get(key) ?? [];
    arr.push(c);
    byKey.set(key, arr);
  }
  const dupGroups: DupRow[][] = [...byKey.values()]
    .filter((rows) => rows.length > 1)
    .map((rows) =>
      rows.map((r) => ({
        id: r.id,
        name: r.propertyName ?? "—",
        location: [r.city, r.state].filter(Boolean).join(", "),
        loan: fmtMoney(r.loanAmount),
        source: r.sourceNote ?? "manual / analysis entry",
        created: r.createdAt.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      }))
    );
  // Row id → its duplicate group, so each DUP? badge opens just its own copies.
  const dupGroupById = new Map<string, DupRow[]>();
  for (const g of dupGroups) for (const r of g) dupGroupById.set(r.id, g);

  const toFull = (c: (typeof comps)[number]): CompFull => ({
    id: c.id,
    propertyName: c.propertyName,
    address: c.address, city: c.city, state: c.state, zip: c.zip,
    market: c.market, submarket: c.submarket,
    category: c.category, crowPosition: c.crowPosition,
    units: c.units, stories: c.stories, sizeSf: c.sizeSf,
    yearBuilt: c.yearBuilt, occupancyPct: c.occupancyPct,
    loanAmount: c.loanAmount, loanPerUnit: c.loanPerUnit, loanPerSf: c.loanPerSf,
    rateType: c.rateType, indexName: c.indexName, spreadBps: c.spreadBps,
    ratePct: c.ratePct, termMonths: c.termMonths, ioMonths: c.ioMonths,
    ltvPct: c.ltvPct, ltcPct: c.ltcPct, dscr: c.dscr, debtYieldPct: c.debtYieldPct,
    totalProjectCost: c.totalProjectCost, tpcPerUnit: c.tpcPerUnit,
    impliedCapPct: c.impliedCapPct, stabilizedCapPct: c.stabilizedCapPct,
    borrowerSponsor: c.borrowerSponsor, brokerage: c.brokerage,
    outcome: c.outcome, outcomeNote: c.outcomeNote,
    sourceNote: c.sourceNote, notes: c.notes,
    omLink: c.omLink,
    originationDate: c.originationDate ? fmtDate(c.originationDate) : null,
    metricYears: c.metricYears.map((m) => ({ yearLabel: m.yearLabel, dscr: m.dscr, debtYieldPct: m.debtYieldPct })),
  });

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

      <DuplicateAlert groups={dupGroups} />

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
              <th className="px-1 py-2" aria-label="delete" />
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
                    <CompDetail comp={toFull(c)} />
                    {c.omLink && (
                      <a href={c.omLink} target="_blank" rel="noopener noreferrer"
                        className="ml-1.5 text-slate-300 hover:text-accent" title="Open the OM in a new tab">↗</a>
                    )}
                    {dupGroupById.has(c.id) && <DupBadge group={dupGroupById.get(c.id)!} />}
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
                  <td className="px-1 py-2 text-center">
                    <ArchiveComp id={c.id} name={c.propertyName ?? c.dealName ?? "comp"} />
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

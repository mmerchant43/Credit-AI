import Link from "next/link";
import { prisma } from "@/lib/db";
import {
  DASH, fmtMoney, fmtNum, fmtPct, fmtX, fmtDate,
  PROPERTY_TYPE_LABELS, CATEGORY_LABELS, POSITION_LABELS, OUTCOME_LABELS,
} from "@/lib/format";

export const dynamic = "force-dynamic";

// The comp database — every deal the team has underwritten, newest first.
// Shell version: a straight table. Search, filters (the five-filter screen),
// and click-through detail pages come next.
export default async function CompsPage() {
  const comps = await prisma.creditComp.findMany({
    where: { archived: false },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return (
    <div className="space-y-5 pb-6">
      <div className="section-head">
        <h2>Credit Comps</h2>
        <div className="rule" />
        <Link href="/comps/new" className="btn btn-primary text-sm">+ Add a Comp</Link>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-slate-500 uppercase tracking-wide border-b border-slate-200">
              <th className="px-3 py-2 text-left">Property</th>
              <th className="px-3 py-2 text-left">Market</th>
              <th className="px-3 py-2 text-center">Type</th>
              <th className="px-3 py-2 text-center">Category</th>
              <th className="px-3 py-2 text-center">Position</th>
              <th className="px-3 py-2 text-right">Loan Amount</th>
              <th className="px-3 py-2 text-center">LTV</th>
              <th className="px-3 py-2 text-center">LTC</th>
              <th className="px-3 py-2 text-center">DSCR</th>
              <th className="px-3 py-2 text-center">Debt Yield</th>
              <th className="px-3 py-2 text-center">Originated</th>
              <th className="px-3 py-2 text-center">Outcome</th>
            </tr>
          </thead>
          <tbody>
            {comps.map((c) => (
              <tr key={c.id} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="px-3 py-2">
                  <span className="font-medium">{c.propertyName ?? c.dealName ?? c.address ?? "N/A"}</span>
                  {c.borrowerSponsor && <div className="text-xs text-slate-400">{c.borrowerSponsor}</div>}
                </td>
                <td className="px-3 py-2 text-slate-600">{c.market}</td>
                <td className="px-3 py-2 text-center text-xs text-slate-500">{PROPERTY_TYPE_LABELS[c.propertyType] ?? DASH}</td>
                <td className="px-3 py-2 text-center text-xs text-slate-500">{c.category ? CATEGORY_LABELS[c.category] ?? DASH : DASH}</td>
                <td className="px-3 py-2 text-center text-xs text-slate-500">{c.crowPosition ? POSITION_LABELS[c.crowPosition] ?? DASH : DASH}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(c.loanAmount)}</td>
                <td className="px-3 py-2 text-center tabular-nums">{fmtPct(c.ltvPct, 1)}</td>
                <td className="px-3 py-2 text-center tabular-nums">{fmtPct(c.ltcPct, 1)}</td>
                <td className="px-3 py-2 text-center tabular-nums">{fmtX(c.dscr)}</td>
                <td className="px-3 py-2 text-center tabular-nums">{fmtPct(c.debtYieldPct, 1)}</td>
                <td className="px-3 py-2 text-center tabular-nums">{fmtDate(c.originationDate)}</td>
                <td className="px-3 py-2 text-center">
                  <span className="badge bg-slate-100 text-slate-600 border-slate-200">{OUTCOME_LABELS[c.outcome] ?? c.outcome}</span>
                </td>
              </tr>
            ))}
            {comps.length === 0 && (
              <tr>
                <td colSpan={12} className="px-3 py-8 text-center text-slate-400">
                  No comps yet. The database starts empty — add deals one at a time, or (coming next)
                  import the team's Multifamily OM Index workbook in one motion.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-slate-400">
        {fmtNum(comps.length)} shown · every metric is verbatim from its source — an em dash means the source never stated it.
      </p>
    </div>
  );
}

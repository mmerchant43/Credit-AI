"use client";

// Click a deal's name anywhere in the comps table → every metric on one
// screen (Mason, 9/22/26). Pure display; an em dash means the source never
// stated it.
import { useState } from "react";
import { DASH, fmtMoney, fmtPct, fmtX, CATEGORY_LABELS, POSITION_LABELS, OUTCOME_LABELS } from "@/lib/format";

export interface CompFull {
  id: string;
  propertyName: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  market: string;
  submarket: string | null;
  category: string | null;
  crowPosition: string | null;
  units: number | null;
  stories: number | null;
  sizeSf: number | null;
  yearBuilt: number | null;
  occupancyPct: number | null;
  loanAmount: number | null;
  loanPerUnit: number | null;
  loanPerSf: number | null;
  rateType: string | null;
  indexName: string | null;
  spreadBps: number | null;
  ratePct: number | null;
  termMonths: number | null;
  ioMonths: number | null;
  ltvPct: number | null;
  ltcPct: number | null;
  dscr: number | null;
  debtYieldPct: number | null;
  totalProjectCost: number | null;
  tpcPerUnit: number | null;
  impliedCapPct: number | null;
  stabilizedCapPct: number | null;
  borrowerSponsor: string | null;
  brokerage: string | null;
  outcome: string;
  outcomeNote: string | null;
  sourceNote: string | null;
  notes: string | null;
  originationDate: string | null; // pre-formatted server-side
  metricYears: { yearLabel: string; dscr: number | null; debtYieldPct: number | null }[];
}

function Item({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{k}</div>
      <div className="text-sm tabular-nums">{v}</div>
    </div>
  );
}

function Block({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div>
      <div className="font-display text-base border-b border-accent/30 mb-2 pb-0.5">{title}</div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-3">{children}</div>
    </div>
  );
}

export default function CompDetail({ comp }: { comp: CompFull }) {
  const [open, setOpen] = useState(false);
  const c = comp;
  const s = (v: string | null | undefined) => v ?? DASH;

  return (
    <>
      <button
        type="button"
        className="font-medium text-left hover:text-accent hover:underline"
        onClick={() => setOpen(true)}
        title="Open all metrics"
      >
        {c.propertyName ?? "N/A"}
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy/40 p-4" onClick={() => setOpen(false)}>
          <div className="card bg-white p-6 w-full max-w-3xl max-h-[85vh] overflow-y-auto space-y-5 text-left" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="font-display text-2xl">{c.propertyName ?? DASH}</h3>
                <p className="text-sm text-slate-500">
                  {[c.address, [c.city, c.state].filter(Boolean).join(", "), c.zip].filter(Boolean).join(" · ") || DASH}
                </p>
              </div>
              <button type="button" className="btn btn-primary text-sm shrink-0" onClick={() => setOpen(false)}>Done</button>
            </div>

            <Block title="Property & Market">
              <Item k="Market" v={s(c.market)} />
              <Item k="Submarket" v={s(c.submarket)} />
              <Item k="Category" v={c.category ? CATEGORY_LABELS[c.category] ?? DASH : DASH} />
              <Item k="Crow Position" v={c.crowPosition ? POSITION_LABELS[c.crowPosition] ?? DASH : DASH} />
              <Item k="Units" v={c.units != null ? String(c.units) : DASH} />
              <Item k="Stories" v={c.stories != null ? String(c.stories) : DASH} />
              <Item k="NRA (SF)" v={c.sizeSf != null ? c.sizeSf.toLocaleString() : DASH} />
              <Item k="Year Built / Delivery" v={c.yearBuilt != null ? String(c.yearBuilt) : DASH} />
              <Item k="Current Occupancy" v={fmtPct(c.occupancyPct, 1)} />
            </Block>

            <Block title="Loan">
              <Item k="Loan Amount" v={fmtMoney(c.loanAmount)} />
              <Item k="Loan / Unit" v={fmtMoney(c.loanPerUnit)} />
              <Item k="Loan PSF" v={c.loanPerSf != null ? `$${c.loanPerSf.toFixed(2)}` : DASH} />
              <Item k="Rate Type" v={s(c.rateType)} />
              <Item k="Index" v={s(c.indexName)} />
              <Item k="Spread" v={c.spreadBps != null ? `${c.spreadBps} bps` : DASH} />
              <Item k="All-in Rate" v={fmtPct(c.ratePct, 2)} />
              <Item k="Term" v={c.termMonths != null ? `${c.termMonths} mo` : DASH} />
              <Item k="IO" v={c.ioMonths != null ? `${c.ioMonths} mo` : DASH} />
              <Item k="Originated" v={s(c.originationDate)} />
            </Block>

            <Block title="Credit Metrics">
              <Item k="LTV" v={fmtPct(c.ltvPct, 1)} />
              <Item k="LTC" v={fmtPct(c.ltcPct, 1)} />
              <Item k="DSCR" v={fmtX(c.dscr)} />
              <Item k="Debt Yield" v={fmtPct(c.debtYieldPct, 2)} />
              <Item k="Total Project Cost" v={fmtMoney(c.totalProjectCost)} />
              <Item k="TPC / Unit" v={fmtMoney(c.tpcPerUnit)} />
              <Item k="Implied Cap" v={fmtPct(c.impliedCapPct, 2)} />
              <Item k="Stabilized Cap" v={fmtPct(c.stabilizedCapPct, 2)} />
            </Block>

            {c.metricYears.length > 0 && (
              <div>
                <div className="font-display text-base border-b border-accent/30 mb-2 pb-0.5">DSCR & Debt Yield by Year</div>
                <table className="text-sm">
                  <thead>
                    <tr className="text-[11px] uppercase tracking-wide text-slate-400">
                      <th className="pr-6 text-left font-semibold">Year</th>
                      <th className="pr-6 text-right font-semibold">DSCR</th>
                      <th className="text-right font-semibold">Debt Yield</th>
                    </tr>
                  </thead>
                  <tbody>
                    {c.metricYears.map((m) => (
                      <tr key={m.yearLabel}>
                        <td className="pr-6 py-0.5">{m.yearLabel}</td>
                        <td className="pr-6 py-0.5 text-right tabular-nums">{fmtX(m.dscr)}</td>
                        <td className="py-0.5 text-right tabular-nums">{fmtPct(m.debtYieldPct, 2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <Block title="Parties & Provenance">
              <Item k="Sponsor" v={s(c.borrowerSponsor)} />
              <Item k="Brokerage" v={s(c.brokerage)} />
              <Item k="Outcome" v={OUTCOME_LABELS[c.outcome] ?? c.outcome} />
              <Item k="Source" v={s(c.sourceNote)} />
            </Block>

            {(c.notes || c.outcomeNote) && (
              <div>
                <div className="font-display text-base border-b border-accent/30 mb-2 pb-0.5">Notes</div>
                <p className="text-xs text-slate-600 whitespace-pre-wrap">{[c.outcomeNote, c.notes].filter(Boolean).join("\n")}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

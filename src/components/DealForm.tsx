"use client";

// One form, two jobs: "comp" mode saves a past deal into the database;
// "deal" mode saves a new subject deal, which is AUTO-ADDED to the comp
// database and screened against it (Mason, 9/21/26 — no separate entry step).
// Percent fields are typed as percents (65, not 0.65); the API converts.
// Verbatim-or-null: leave anything the source doesn't state blank.
import { useState } from "react";
import { useRouter } from "next/navigation";

const YEAR_LABELS = ["Year 1", "Year 2", "Year 3", "Stabilized"];

function Field({ label, name, type = "text", step, placeholder, required }: {
  label: string; name: string; type?: string; step?: string; placeholder?: string; required?: boolean;
}) {
  return (
    <div>
      <label className="label">{label}{required && <span className="text-red-500"> *</span>}</label>
      <input className="field" name={name} type={type} step={step ?? (type === "number" ? "any" : undefined)}
        placeholder={placeholder} required={required} />
    </div>
  );
}

function Select({ label, name, options, required, defaultValue }: {
  label: string; name: string; options: [string, string][]; required?: boolean; defaultValue?: string;
}) {
  return (
    <div>
      <label className="label">{label}{required && <span className="text-red-500"> *</span>}</label>
      <select className="field" name={name} required={required} defaultValue={defaultValue ?? ""}>
        <option value="">—</option>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </div>
  );
}

function Section({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <section className="card p-4">
      <h3 className="font-display text-lg mb-3">{title}</h3>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">{children}</div>
    </section>
  );
}

export default function DealForm({ mode }: { mode: "comp" | "deal" }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true); setError(null);
    const data = Object.fromEntries(new FormData(e.currentTarget).entries());
    try {
      const res = await fetch(mode === "deal" ? "/api/deals" : "/api/comps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Something went wrong.");
      router.push(mode === "deal" ? `/deals/${body.analysisId}?new=1` : "/comps");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 pb-8">
      <Section title="Property & Market">
        <Field label="Property Name" name="propertyName" required />
        <Field label="Address" name="address" />
        <Field label="City" name="city" required />
        <Field label="State" name="state" placeholder="TX" required />
        <Field label="Zip Code" name="zip" placeholder="5-digit" />
        <Field label="Market" name="market" placeholder="defaults to City, State" />
        <Field label="Submarket" name="submarket" />
        <Field label="Units" name="units" type="number" step="1" />
        <Field label="Stories" name="stories" type="number" step="1" />
        <Field label="NRA (SF)" name="sizeSf" type="number" step="1" />
        <Field label="Year Built / Delivery" name="yearBuilt" type="number" step="1" />
        <Field label="Current Occupancy (%)" name="occupancyPct" type="number" placeholder="in-place only — blank if pre-delivery" />
      </Section>

      <Section title="Classification">
        <Select label="Category" name="category" required options={[
          ["BRIDGE_REFI", "Bridge / Refi — built and exists"],
          ["CONSTRUCTION", "Construction — not built / to be built"],
        ]} />
        <Select label="Crow Position (internal — never from the OM)" name="crowPosition" options={[
          ["MEZZANINE", "Mezzanine"], ["STRETCH_SENIOR", "Stretch Senior"], ["WHOLE_LOAN", "Whole Loan"],
          ["PREFERRED_EQUITY", "Preferred Equity"], ["LP_EQUITY", "LP Equity"], ["OTHER", "Other"],
        ]} />
        {mode === "deal" && (
          <div className="col-span-2 md:col-span-4">
            <label className="label">Classification Evidence<span className="text-red-500"> *</span></label>
            <textarea className="field" name="classificationEvidence" rows={2} required
              placeholder="Stage + its evidence (e.g. no C of O, hard-cost budget, completion timeline → Construction)" />
          </div>
        )}
      </Section>

      <Section title="Loan Request & Terms (verbatim from the source)">
        <Field label="Loan Amount — total / requested ($)" name="loanAmount" type="number" />
        <Field label="Loan Amount / Unit ($)" name="loanPerUnit" type="number" />
        <Field label="Loan Amount PSF ($)" name="loanPerSf" type="number" />
        <Select label="Rate Type" name="rateType" options={[["FIXED", "Fixed"], ["FLOATING", "Floating"]]} />
        <Field label="Index" name="indexName" placeholder="SOFR" />
        <Field label="Spread (bps)" name="spreadBps" type="number" step="1" />
        <Field label="All-in Rate (%)" name="ratePct" type="number" />
        <Field label="Term (months)" name="termMonths" type="number" step="1" />
        <Field label="IO (months)" name="ioMonths" type="number" step="1" />
        {mode === "comp" && <Field label="Origination Date" name="originationDate" type="date" />}
      </Section>

      <Section title="Credit Metrics (verbatim — blank if not stated)">
        <Field label="LTV (%)" name="ltvPct" type="number" />
        <Field label="LTC (%)" name="ltcPct" type="number" />
        <Field label="Total Project Cost ($)" name="totalProjectCost" type="number" />
        <Field label="TPC / Unit ($)" name="tpcPerUnit" type="number" />
        <Field label="Implied Cap Rate (%)" name="impliedCapPct" type="number" />
        <Field label="Stabilized Cap Rate (%)" name="stabilizedCapPct" type="number" />
        <div className="col-span-2 md:col-span-4">
          <span className="label">DSCR & Debt Yield by projection year — as the OM quotes them</span>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {YEAR_LABELS.map((y, i) => (
              <div key={y} className="border border-slate-200 rounded-sm p-2 space-y-1.5">
                <div className="text-xs font-semibold text-slate-500">{y}</div>
                <input className="field" type="number" step="any" name={`dscr${i}`} placeholder="DSCR (e.g. 1.25)" />
                <input className="field" type="number" step="any" name={`dy${i}`} placeholder="Debt Yield %" />
              </div>
            ))}
          </div>
        </div>
      </Section>

      <Section title="Parties & Notes">
        <Field label="Borrower / Sponsor" name="borrowerSponsor" />
        <Field label="Brokerage" name="brokerage" />
        {mode === "comp" && (
          <Select label="Outcome" name="outcome" defaultValue="SCREENED" options={[
            ["SCREENED", "Screened"], ["QUOTED", "Quoted"], ["CLOSED", "Closed"], ["PASSED", "Passed"], ["LOST", "Lost"],
          ]} />
        )}
        <Field label="Source Note" name="sourceNote" placeholder="e.g. OM dated 6/26" />
        <Field label="OM Link (SharePoint)" name="omLink" />
        <div className="col-span-2 md:col-span-4">
          <label className="label">Notes</label>
          <textarea className="field" name="notes" rows={2} />
        </div>
      </Section>

      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex items-center gap-3">
        <button className="btn btn-primary" disabled={busy}>
          {busy ? "Saving…" : mode === "deal" ? "Run Analysis & Save" : "Save Comp"}
        </button>
        {mode === "deal" && (
          <span className="text-xs text-slate-400">
            Saving also adds this deal to the comp database automatically (outcome: Screened).
          </span>
        )}
      </div>
    </form>
  );
}

"use client";

// Edit a comp's metrics after the fact (Mason, 9/30/26) — opens from the
// comp detail popup and from an analysis's subject card. Percent fields
// are entered AS PERCENTS (65 = 65%). Blank = not stated (never zero).
// Tip shown in the modal: blank a derived field (like Loan/Unit) and save,
// and it comes back recomputed from the new inputs.
import { useState } from "react";
import { useRouter } from "next/navigation";

export interface EditableComp {
  id: string;
  propertyName: string | null;
  address: string | null; city: string | null; state: string | null; zip: string | null;
  borrowerSponsor: string | null;
  units: number | null; stories: number | null; sizeSf: number | null; yearBuilt: number | null;
  occupancyPct: number | null; // fraction in
  loanAmount: number | null; loanPerUnit: number | null; loanPerSf: number | null;
  ratePct: number | null; spreadBps: number | null; termMonths: number | null; ioMonths: number | null;
  ltvPct: number | null; ltcPct: number | null; dscr: number | null; debtYieldPct: number | null;
  totalProjectCost: number | null; tpcPerUnit: number | null;
  impliedCapPct: number | null; stabilizedCapPct: number | null;
}

const pctOut = (v: number | null) => (v == null ? "" : String(Math.round(v * 10000) / 100));
const numOut = (v: number | null) => (v == null ? "" : String(v));

export default function EditComp({ comp, label = "Edit metrics" }: { comp: EditableComp; label?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [f, setF] = useState<Record<string, string>>({});

  function init() {
    setF({
      propertyName: comp.propertyName ?? "", address: comp.address ?? "", city: comp.city ?? "",
      state: comp.state ?? "", zip: comp.zip ?? "", borrowerSponsor: comp.borrowerSponsor ?? "",
      units: numOut(comp.units), stories: numOut(comp.stories), sizeSf: numOut(comp.sizeSf),
      yearBuilt: numOut(comp.yearBuilt), occupancyPct: pctOut(comp.occupancyPct),
      loanAmount: numOut(comp.loanAmount), loanPerUnit: numOut(comp.loanPerUnit), loanPerSf: numOut(comp.loanPerSf),
      ratePct: pctOut(comp.ratePct), spreadBps: numOut(comp.spreadBps),
      termMonths: numOut(comp.termMonths), ioMonths: numOut(comp.ioMonths),
      ltvPct: pctOut(comp.ltvPct), ltcPct: pctOut(comp.ltcPct), dscr: numOut(comp.dscr),
      debtYieldPct: pctOut(comp.debtYieldPct), totalProjectCost: numOut(comp.totalProjectCost),
      tpcPerUnit: numOut(comp.tpcPerUnit), impliedCapPct: pctOut(comp.impliedCapPct),
      stabilizedCapPct: pctOut(comp.stabilizedCapPct),
    });
    setError(null);
    setOpen(true);
  }

  async function save() {
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/comps/edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: comp.id, fields: f }),
      });
      const body = await res.json().catch(() => ({} as { error?: string }));
      if (!res.ok) throw new Error(body.error ?? `Failed (${res.status}).`);
      setOpen(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed.");
    } finally {
      setBusy(false);
    }
  }

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setF((p) => ({ ...p, [k]: e.target.value }));
  // Plain render helper (NOT a component) — keeps input identity stable
  // across keystrokes, so focus never drops.
  const field = (k: string, l: string, hint?: string, wide?: boolean) => (
    <label key={k} className={`block ${wide ? "col-span-2" : ""}`}>
      <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{l}{hint ? <span className="normal-case font-normal text-slate-400"> {hint}</span> : null}</span>
      <input className="field w-full !py-1 mt-0.5" value={f[k] ?? ""} onChange={set(k)} />
    </label>
  );

  return (
    <>
      <button type="button" className="btn text-xs" onClick={init}>{label}</button>
      {open && (
        <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-navy/40 p-4" onClick={() => setOpen(false)}>
          <div className="card bg-white p-6 w-full max-w-3xl max-h-[88vh] overflow-y-auto space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-display text-xl">Edit — {comp.propertyName ?? "Comp"}</h3>
              <button type="button" className="btn text-xs" onClick={() => setOpen(false)}>Cancel</button>
            </div>
            <p className="text-xs text-slate-500">
              Blank = not stated (never zero). Percents as percents (65 = 65%). Blank a derived field
              (Loan/Unit, Loan PSF, TPC/Unit, LTC) and save — it comes back recomputed from the new inputs.
              Saving also refreshes every saved analysis this comp appears in.
            </p>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-3">
              {field("propertyName", "Property", undefined, true)}
              {field("borrowerSponsor", "Sponsor", undefined, true)}
              {field("address", "Address", undefined, true)}
              {field("city", "City")}
              {field("state", "State")}
              {field("zip", "Zip")}
              {field("units", "Units")}
              {field("stories", "Stories")}
              {field("sizeSf", "NRA (SF)")}
              {field("yearBuilt", "Vintage")}
              {field("occupancyPct", "Occupancy", "%")}
              {field("loanAmount", "Loan Amount", "$")}
              {field("loanPerUnit", "Loan / Unit", "$")}
              {field("loanPerSf", "Loan PSF", "$")}
              {field("ratePct", "All-in Rate", "%")}
              {field("spreadBps", "Spread", "bps")}
              {field("termMonths", "Term", "mos")}
              {field("ioMonths", "IO", "mos")}
              {field("ltvPct", "LTV", "%")}
              {field("ltcPct", "LTC", "%")}
              {field("dscr", "DSCR", "x")}
              {field("debtYieldPct", "Debt Yield", "%")}
              {field("totalProjectCost", "Total Cost Basis", "$")}
              {field("tpcPerUnit", "Cost Basis / Unit", "$")}
              {field("impliedCapPct", "Implied Cap", "%")}
              {field("stabilizedCapPct", "Stabilized Cap", "%")}
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn text-xs" disabled={busy} onClick={() => setOpen(false)}>Cancel</button>
              <button type="button"
                className="btn text-xs !bg-accent !text-white !border-accent hover:!bg-[#8F7743]"
                disabled={busy} onClick={() => void save()}>
                {busy ? "Saving…" : "Save & update everything"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

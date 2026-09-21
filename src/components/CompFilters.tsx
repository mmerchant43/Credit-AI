"use client";

// The comps filter bar — Mason's spec (9/21/26): stories range, state, city,
// zip, loan amount range, LTV/LTC ranges, DSCR and Debt Yield with a
// projection-year picker, loan PSF range, loan per unit range.
// Plain GET form: the URL is the filter state, so views are shareable.
import { useRouter, useSearchParams } from "next/navigation";
import { useRef } from "react";

const YEAR_OPTIONS = ["In-Place", "Year 1", "Year 2", "Year 3", "Year 4", "Year 5", "Stabilized"];

function Range({ name, label, step, placeholderMin, placeholderMax, defaults }: {
  name: string; label: string; step?: string;
  placeholderMin?: string; placeholderMax?: string;
  defaults: URLSearchParams;
}) {
  return (
    <div>
      <span className="label">{label}</span>
      <div className="flex items-center gap-1">
        <input className="field" type="number" step={step ?? "any"} name={`${name}Min`}
          placeholder={placeholderMin ?? "min"} defaultValue={defaults.get(`${name}Min`) ?? ""} />
        <span className="text-slate-400 text-xs">–</span>
        <input className="field" type="number" step={step ?? "any"} name={`${name}Max`}
          placeholder={placeholderMax ?? "max"} defaultValue={defaults.get(`${name}Max`) ?? ""} />
      </div>
    </div>
  );
}

export default function CompFilters() {
  const router = useRouter();
  const params = useSearchParams();
  const defaults = new URLSearchParams(params.toString());
  const formRef = useRef<HTMLFormElement>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const q = new URLSearchParams();
    for (const [k, v] of data.entries()) {
      const s = String(v).trim();
      if (s) q.set(k, s);
    }
    router.push(`/comps${q.toString() ? `?${q}` : ""}`);
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} className="card p-4">
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
        <Range name="stories" label="Stories" step="1" defaults={defaults} />
        <div>
          <span className="label">State</span>
          <input className="field" name="state" placeholder="e.g. TX" defaultValue={defaults.get("state") ?? ""} />
        </div>
        <div>
          <span className="label">City</span>
          <input className="field" name="city" placeholder="e.g. Dallas" defaultValue={defaults.get("city") ?? ""} />
        </div>
        <div>
          <span className="label">Zip Code</span>
          <input className="field" name="zip" placeholder="5-digit" defaultValue={defaults.get("zip") ?? ""} />
        </div>
        <Range name="loan" label="Loan Amount ($)" placeholderMin="$ min" placeholderMax="$ max" defaults={defaults} />
        <Range name="ltv" label="LTV (%)" placeholderMin="% min" placeholderMax="% max" defaults={defaults} />
        <Range name="ltc" label="LTC (%)" placeholderMin="% min" placeholderMax="% max" defaults={defaults} />
        <div>
          <span className="label">DSCR — year, then range</span>
          <div className="flex items-center gap-1">
            <select className="field" name="dscrYear" defaultValue={defaults.get("dscrYear") ?? "Year 1"}>
              {YEAR_OPTIONS.map((y) => <option key={y}>{y}</option>)}
            </select>
            <input className="field" type="number" step="any" name="dscrMin" placeholder="min"
              defaultValue={defaults.get("dscrMin") ?? ""} />
            <input className="field" type="number" step="any" name="dscrMax" placeholder="max"
              defaultValue={defaults.get("dscrMax") ?? ""} />
          </div>
        </div>
        <div>
          <span className="label">Debt Yield — year, then range (%)</span>
          <div className="flex items-center gap-1">
            <select className="field" name="dyYear" defaultValue={defaults.get("dyYear") ?? "Year 1"}>
              {YEAR_OPTIONS.map((y) => <option key={y}>{y}</option>)}
            </select>
            <input className="field" type="number" step="any" name="dyMin" placeholder="% min"
              defaultValue={defaults.get("dyMin") ?? ""} />
            <input className="field" type="number" step="any" name="dyMax" placeholder="% max"
              defaultValue={defaults.get("dyMax") ?? ""} />
          </div>
        </div>
        <Range name="psf" label="Loan Amount PSF ($)" placeholderMin="$ min" placeholderMax="$ max" defaults={defaults} />
        <Range name="perUnit" label="Loan Amount / Unit ($)" placeholderMin="$ min" placeholderMax="$ max" defaults={defaults} />
      </div>
      <div className="flex items-center gap-2 mt-4">
        <button type="submit" className="btn btn-primary text-sm">Apply Filters</button>
        <button type="button" className="btn text-sm" onClick={() => { formRef.current?.reset(); router.push("/comps"); }}>
          Clear
        </button>
        <span className="text-xs text-slate-400 ml-2">
          Comps missing a filtered value drop out of that view — blanks are never treated as zero.
        </span>
      </div>
    </form>
  );
}

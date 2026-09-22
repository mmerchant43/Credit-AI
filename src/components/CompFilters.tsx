"use client";

// The comps filter bar — trimmed per Mason (9/21/26): Category, Stories
// range, State, City, Zip. Nothing else.
// Plain GET form: the URL is the filter state, so views are shareable.
import { useRouter, useSearchParams } from "next/navigation";
import { useRef } from "react";

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
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <div>
          <span className="label">Deal Name</span>
          <input className="field" name="name" placeholder="search…" defaultValue={defaults.get("name") ?? ""} />
        </div>
        <div>
          <span className="label">Category</span>
          <select className="field" name="category" defaultValue={defaults.get("category") ?? ""}>
            <option value="">All</option>
            <option value="BRIDGE_REFI">Bridge / Refi</option>
            <option value="CONSTRUCTION">Construction</option>
          </select>
        </div>
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

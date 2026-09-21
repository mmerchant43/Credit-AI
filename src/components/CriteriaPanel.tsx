"use client";

// The five screening criteria as an adjustable popup (Mason, 9/21/26).
// Opens automatically when a deal is first saved (?new=1); every change
// re-screens the comps immediately (the URL is the criteria state, so a
// view is shareable). A criterion left blank or switched off is simply not
// applied — and a criterion whose subject datum is missing never applies.
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

export interface SubjectAvailability {
  zip: boolean;
  yearBuilt: boolean;
  occupancy: boolean; // false also when subject is Construction
  category: boolean;
}

function currentParams(params: URLSearchParams) {
  return {
    loc: params.get("loc") ?? "auto",
    radius: params.get("radius") ?? "3",
    vin: params.get("vin") ?? "3",
    occ: params.get("occ") ?? "10",
    cat: params.get("cat") ?? "on",
    typ: params.get("typ") ?? "on",
  };
}

export default function CriteriaPanel({ avail }: { avail: SubjectAvailability }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const c = currentParams(params);

  // Pop open on first landing after a new deal is saved.
  useEffect(() => {
    if (params.get("new") === "1") setOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function push(update: Partial<Record<string, string>>) {
    const q = new URLSearchParams(params.toString());
    q.delete("new");
    for (const [k, v] of Object.entries(update)) {
      if (v == null || v === "") q.delete(k);
      else q.set(k, v);
    }
    // Defaults don't need to live in the URL — a clean URL renders the saved snapshot.
    if (q.get("loc") === "auto") q.delete("loc");
    if (q.get("cat") === "on") q.delete("cat");
    if (q.get("typ") === "on") q.delete("typ");
    if (q.get("vin") === "3") q.delete("vin");
    if (q.get("occ") === "10") q.delete("occ");
    if (q.get("loc") !== "radius") q.delete("radius");
    startTransition(() => router.replace(`${pathname}${q.toString() ? `?${q}` : ""}`, { scroll: false }));
  }

  const summary: string[] = [];
  summary.push(
    c.loc === "off" ? "Location: off"
    : c.loc === "radius" ? `Location: ${c.radius} mi radius`
    : "Location: zip → city");
  summary.push(c.typ === "off" ? "Type: off" : "Type: match");
  summary.push(c.vin === "off" || c.vin === "" ? "Vintage: off" : `Vintage: ±${c.vin} yrs`);
  summary.push(c.occ === "off" || c.occ === "" ? "Occupancy: off" : `Occupancy: ±${c.occ} pts`);
  summary.push(c.cat === "off" ? "Category: off" : "Category: same bucket");

  return (
    <>
      <div className="card p-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
        <span className="label !mb-0">Screening criteria</span>
        {summary.map((s) => <span key={s}>{s}</span>)}
        {isPending && <span className="text-slate-400">re-screening…</span>}
        <button type="button" className="btn text-xs ml-auto" onClick={() => setOpen(true)}>Adjust Criteria</button>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy/40 p-4" onClick={() => setOpen(false)}>
          <div className="card bg-white p-6 w-full max-w-lg space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-display text-xl">Screening Criteria</h3>
              <button type="button" className="btn text-sm" onClick={() => setOpen(false)}>Done</button>
            </div>
            <p className="text-xs text-slate-500">
              Changes apply immediately. A criterion switched off — or missing its value on the
              subject — is not applied. Comps missing a value for an applied criterion are kept,
              not knocked out.
            </p>

            {/* 1. Location */}
            <div className="space-y-1.5">
              <span className="label">1 · Location {!avail.zip && <em className="normal-case font-normal">(subject has no zip — zip/radius modes won't apply)</em>}</span>
              <div className="flex items-center gap-2">
                <select className="field !w-44" value={c.loc}
                  onChange={(e) => {
                    const v = e.target.value;
                    // Entering radius mode applies the shown default immediately;
                    // leaving it clears the radius so no stale filter lingers.
                    push(v === "radius" ? { loc: "radius", radius: c.radius } : { loc: v === "auto" ? "" : v, radius: "" });
                  }}>
                  <option value="auto">Same zip → same city</option>
                  <option value="radius">Radius (miles)</option>
                  <option value="off">Off</option>
                </select>
                {c.loc === "radius" && (
                  <>
                    <input type="range" min={0.5} max={25} step={0.5} className="w-40 accent-[#A78C52]"
                      defaultValue={c.radius}
                      onMouseUp={(e) => push({ radius: (e.target as HTMLInputElement).value })}
                      onTouchEnd={(e) => push({ radius: (e.target as HTMLInputElement).value })} />
                    <span className="text-sm tabular-nums">{c.radius} mi</span>
                  </>
                )}
              </div>
            </div>

            {/* 2. Property type */}
            <div className="space-y-1.5">
              <span className="label">2 · Property type must match</span>
              <select className="field !w-44" value={c.typ} onChange={(e) => push({ typ: e.target.value === "on" ? "" : e.target.value })}>
                <option value="on">On</option>
                <option value="off">Off</option>
              </select>
            </div>

            {/* 3. Vintage */}
            <div className="space-y-1.5">
              <span className="label">3 · Vintage (± years) {!avail.yearBuilt && <em className="normal-case font-normal">(subject year built not stated — won't apply)</em>}</span>
              <div className="flex items-center gap-2">
                <input className="field !w-24" type="number" min={0} step={1}
                  key={`vin-${c.vin}`}
                  defaultValue={c.vin === "off" ? "" : c.vin}
                  placeholder="off"
                  onBlur={(e) => push({ vin: e.target.value === "" ? "off" : e.target.value })}
                  onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
                <span className="text-xs text-slate-400">blank = off · applies when you click away</span>
              </div>
            </div>

            {/* 4. Occupancy */}
            <div className="space-y-1.5">
              <span className="label">4 · Occupancy (± points) {!avail.occupancy && <em className="normal-case font-normal">(n/a for this subject — won't apply)</em>}</span>
              <div className="flex items-center gap-2">
                <input className="field !w-24" type="number" min={0} step={1}
                  key={`occ-${c.occ}`}
                  defaultValue={c.occ === "off" ? "" : c.occ}
                  placeholder="off"
                  onBlur={(e) => push({ occ: e.target.value === "" ? "off" : e.target.value })}
                  onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
                <span className="text-xs text-slate-400">blank = off · applies when you click away</span>
              </div>
            </div>

            {/* 5. Category */}
            <div className="space-y-1.5">
              <span className="label">5 · Category must match (Bridge/Refi vs Construction)</span>
              <select className="field !w-44" value={c.cat} onChange={(e) => push({ cat: e.target.value === "on" ? "" : e.target.value })}>
                <option value="on">On</option>
                <option value="off">Off</option>
              </select>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-100">
              <button type="button" className="btn text-xs" onClick={() => push({ loc: "", radius: "", vin: "", occ: "", cat: "", typ: "", x: "" })}>
                Reset to defaults
              </button>
              <span className="text-xs text-slate-400">{isPending ? "re-screening…" : "criteria applied"}</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

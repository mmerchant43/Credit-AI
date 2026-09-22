"use client";

// The screening criteria, inline on the page (Mason, 9/22/26 — no popup).
// Location moved onto the map itself: set a radius there, or leave it off
// for the default same-zip → same-city screen. Every change re-screens
// immediately (the URL is the criteria state, so a view is shareable).
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useTransition } from "react";

export interface SubjectAvailability {
  zip: boolean;
  yearBuilt: boolean;
  occupancy: boolean; // false also when subject is Construction
  category: boolean;
}

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${on ? "bg-accent" : "bg-slate-300"}`}
    >
      <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform ${on ? "translate-x-6" : "translate-x-1"}`} />
    </button>
  );
}

export default function CriteriaPanel({ avail }: { avail: SubjectAvailability }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const c = {
    radius: params.get("radius") ?? "",
    poly: params.get("poly") ?? "",
    vin: params.get("vin") ?? "3",
    occ: params.get("occ") ?? "10",
    cat: params.get("cat") ?? "on",
    typ: params.get("typ") ?? "on",
  };

  function push(update: Partial<Record<string, string>>) {
    const q = new URLSearchParams(params.toString());
    q.delete("new");
    for (const [k, v] of Object.entries(update)) {
      if (v == null || v === "") q.delete(k);
      else q.set(k, v);
    }
    // Defaults don't need to live in the URL — a clean URL renders the saved snapshot.
    if (q.get("cat") === "on") q.delete("cat");
    if (q.get("typ") === "on") q.delete("typ");
    if (q.get("vin") === "3") q.delete("vin");
    if (q.get("occ") === "10") q.delete("occ");
    startTransition(() => router.replace(`${pathname}${q.toString() ? `?${q}` : ""}`, { scroll: false }));
  }

  const colTitle = "text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1.5";
  const hint = "text-xs text-slate-400";

  return (
    <div className="card p-4">
      <div className="flex items-center gap-3 mb-3">
        <span className="label !mb-0">Screening Criteria</span>
        <div className="flex-1 border-t border-accent/30" />
        <span className={hint}>{isPending ? "re-screening…" : "changes apply instantly"}</span>
        <button type="button" className="btn text-xs"
          onClick={() => push({ radius: "", loc: "", poly: "", vin: "", occ: "", cat: "", typ: "", x: "" })}>
          Reset
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-x-6 gap-y-4">
        <div>
          <div className={colTitle}>Location</div>
          <div className="text-sm font-medium">
            {c.poly ? "drawn boundary" : Number(c.radius) > 0 ? `${c.radius} mi radius` : "1 mi radius"}
          </div>
          <div className={hint}>adjust on the map</div>
        </div>

        <div>
          <div className={colTitle}>Vintage</div>
          <div className="flex items-center gap-2">
            <Toggle on={c.vin !== "off"} label="Vintage filter" onChange={(v) => push({ vin: v ? "3" : "off" })} />
            {c.vin !== "off" && (
              <>
                <input className="field !w-14 text-center !py-1" type="number" min={0} step={1}
                  key={`vin-${c.vin}`} defaultValue={c.vin}
                  onBlur={(e) => push({ vin: e.target.value === "" ? "off" : e.target.value })}
                  onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
                <span className={hint}>± yrs</span>
              </>
            )}
          </div>
          {!avail.yearBuilt && <div className={hint}>subject year unknown — won&apos;t apply</div>}
        </div>

        <div>
          <div className={colTitle}>Occupancy</div>
          <div className="flex items-center gap-2">
            <Toggle on={c.occ !== "off"} label="Occupancy filter" onChange={(v) => push({ occ: v ? "10" : "off" })} />
            {c.occ !== "off" && (
              <>
                <input className="field !w-14 text-center !py-1" type="number" min={0} step={1}
                  key={`occ-${c.occ}`} defaultValue={c.occ}
                  onBlur={(e) => push({ occ: e.target.value === "" ? "off" : e.target.value })}
                  onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
                <span className={hint}>± pts</span>
              </>
            )}
          </div>
          {!avail.occupancy && <div className={hint}>n/a for this subject</div>}
        </div>

        <div>
          <div className={colTitle}>Same Category</div>
          <div className="flex items-center gap-2">
            <Toggle on={c.cat !== "off"} label="Category filter" onChange={(v) => push({ cat: v ? "" : "off" })} />
            <span className={hint}>{c.cat !== "off" ? "on" : "off"}</span>
          </div>
        </div>

        <div>
          <div className={colTitle}>Same Property Type</div>
          <div className="flex items-center gap-2">
            <Toggle on={c.typ !== "off"} label="Property type filter" onChange={(v) => push({ typ: v ? "" : "off" })} />
            <span className={hint}>{c.typ !== "off" ? "on" : "off"}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

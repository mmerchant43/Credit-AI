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

  const group = "flex items-center gap-2";
  const label = "text-sm font-medium whitespace-nowrap";
  const hint = "text-xs text-slate-400 whitespace-nowrap";

  return (
    <div className="card p-4">
      <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
        <span className="label !mb-0">Screening</span>

        <div className={group}>
          <span className={label}>Location</span>
          <span className={hint}>
            {Number(c.radius) > 0 ? `${c.radius} mi radius — adjust on the map` : "same zip → same city · set a radius on the map"}
          </span>
        </div>

        <div className={group}>
          <span className={label}>Vintage</span>
          <Toggle on={c.vin !== "off"} label="Vintage filter" onChange={(v) => push({ vin: v ? "3" : "off" })} />
          {c.vin !== "off" && (
            <>
              <span className={hint}>±</span>
              <input className="field !w-14 text-center" type="number" min={0} step={1}
                key={`vin-${c.vin}`} defaultValue={c.vin}
                onBlur={(e) => push({ vin: e.target.value === "" ? "off" : e.target.value })}
                onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
              <span className={hint}>yrs</span>
            </>
          )}
          {!avail.yearBuilt && <span className={hint}>(subject year unknown — won&apos;t apply)</span>}
        </div>

        <div className={group}>
          <span className={label}>Occupancy</span>
          <Toggle on={c.occ !== "off"} label="Occupancy filter" onChange={(v) => push({ occ: v ? "10" : "off" })} />
          {c.occ !== "off" && (
            <>
              <span className={hint}>±</span>
              <input className="field !w-14 text-center" type="number" min={0} step={1}
                key={`occ-${c.occ}`} defaultValue={c.occ}
                onBlur={(e) => push({ occ: e.target.value === "" ? "off" : e.target.value })}
                onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
              <span className={hint}>pts</span>
            </>
          )}
          {!avail.occupancy && <span className={hint}>(n/a for this subject)</span>}
        </div>

        <div className={group}>
          <span className={label}>Same category</span>
          <Toggle on={c.cat !== "off"} label="Category filter" onChange={(v) => push({ cat: v ? "" : "off" })} />
        </div>

        <div className={group}>
          <span className={label}>Same property type</span>
          <Toggle on={c.typ !== "off"} label="Property type filter" onChange={(v) => push({ typ: v ? "" : "off" })} />
        </div>

        <button type="button" className="btn text-xs ml-auto"
          onClick={() => push({ radius: "", loc: "", vin: "", occ: "", cat: "", typ: "", x: "" })}>
          Reset
        </button>
        <span className={hint}>{isPending ? "re-screening…" : ""}</span>
      </div>
    </div>
  );
}

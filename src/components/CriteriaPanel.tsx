"use client";

// The five screening criteria as an adjustable popup (Mason, 9/21/26).
// Opens automatically when a deal is first saved (?new=1); every change
// re-screens the comps immediately (the URL is the criteria state, so a
// view is shareable). A criterion switched off — or missing its value on
// the subject — is not applied.
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

function Row({ title, hint, children }: { title: string; hint?: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3 border-b border-slate-100 last:border-0">
      <div>
        <div className="text-sm font-medium">{title}</div>
        {hint && <div className="text-xs text-slate-400">{hint}</div>}
      </div>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  );
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

  const summary = [
    c.loc === "off" ? "Location off" : c.loc === "radius" ? `${c.radius} mi radius` : "Zip → city",
    c.typ === "off" ? null : "Type",
    c.vin === "off" ? null : `Vintage ±${c.vin}y`,
    c.occ === "off" ? null : `Occ ±${c.occ}pt`,
    c.cat === "off" ? null : "Category",
  ].filter(Boolean);

  const seg = (active: boolean) =>
    `px-3 py-1 text-xs rounded-full transition-colors ${active ? "bg-navy text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`;

  return (
    <>
      <div className="card p-3 flex flex-wrap items-center gap-2 text-xs text-slate-600">
        <span className="label !mb-0">Screening</span>
        {summary.map((s) => (
          <span key={s as string} className="badge bg-slate-50 text-slate-600 border-slate-200 normal-case">{s}</span>
        ))}
        {isPending && <span className="text-slate-400">re-screening…</span>}
        <button type="button" className="btn text-xs ml-auto" onClick={() => setOpen(true)}>Adjust Criteria</button>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy/40 p-4" onClick={() => setOpen(false)}>
          <div className="card bg-white p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-1">
              <h3 className="font-display text-xl">Screening Criteria</h3>
              <button type="button" className="btn btn-primary text-sm" onClick={() => setOpen(false)}>Done</button>
            </div>
            <p className="text-xs text-slate-400 mb-2">Changes apply instantly — anything off or unknown is simply skipped.</p>

            <Row title="Location" hint={!avail.zip ? "subject has no zip — zip & radius won't apply" : undefined}>
              <div className="flex items-center gap-1">
                <button type="button" className={seg(c.loc === "auto")} onClick={() => push({ loc: "", radius: "" })}>Zip → city</button>
                <button type="button" className={seg(c.loc === "radius")} onClick={() => push({ loc: "radius", radius: c.radius })}>Radius</button>
                <button type="button" className={seg(c.loc === "off")} onClick={() => push({ loc: "off", radius: "" })}>Off</button>
              </div>
            </Row>
            {c.loc === "radius" && (
              <div className="flex items-center gap-3 py-2 pl-1 border-b border-slate-100">
                <input type="range" min={0.5} max={25} step={0.5} className="flex-1 accent-[#A78C52]"
                  defaultValue={c.radius}
                  onMouseUp={(e) => push({ radius: (e.target as HTMLInputElement).value })}
                  onTouchEnd={(e) => push({ radius: (e.target as HTMLInputElement).value })} />
                <span className="text-sm tabular-nums w-14 text-right">{c.radius} mi</span>
              </div>
            )}

            <Row title="Vintage" hint={!avail.yearBuilt ? "subject year built unknown — won't apply" : "± years from the subject"}>
              <Toggle on={c.vin !== "off"} label="Vintage filter" onChange={(v) => push({ vin: v ? "3" : "off" })} />
              {c.vin !== "off" && (
                <input className="field !w-16 text-center" type="number" min={0} step={1}
                  key={`vin-${c.vin}`} defaultValue={c.vin}
                  onBlur={(e) => push({ vin: e.target.value === "" ? "off" : e.target.value })}
                  onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
              )}
            </Row>

            <Row title="Occupancy" hint={!avail.occupancy ? "n/a for this subject — won't apply" : "± points from the subject"}>
              <Toggle on={c.occ !== "off"} label="Occupancy filter" onChange={(v) => push({ occ: v ? "10" : "off" })} />
              {c.occ !== "off" && (
                <input className="field !w-16 text-center" type="number" min={0} step={1}
                  key={`occ-${c.occ}`} defaultValue={c.occ}
                  onBlur={(e) => push({ occ: e.target.value === "" ? "off" : e.target.value })}
                  onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
              )}
            </Row>

            <Row title="Same category" hint="Bridge/Refi with Bridge/Refi · Construction with Construction">
              <Toggle on={c.cat !== "off"} label="Category filter" onChange={(v) => push({ cat: v ? "" : "off" })} />
            </Row>

            <Row title="Same property type" hint="multifamily with multifamily">
              <Toggle on={c.typ !== "off"} label="Property type filter" onChange={(v) => push({ typ: v ? "" : "off" })} />
            </Row>

            <div className="flex items-center justify-between pt-3">
              <button type="button" className="btn text-xs"
                onClick={() => push({ loc: "", radius: "", vin: "", occ: "", cat: "", typ: "", x: "" })}>
                Reset to defaults
              </button>
              <span className="text-xs text-slate-400">{isPending ? "re-screening…" : "applied"}</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

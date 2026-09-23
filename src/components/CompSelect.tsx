"use client";

// Select comps on the /comps page and run a full deal analysis on them
// (Mason, 9/23/26): checkboxes on every row + a floating action bar.
// - ONE comp selected → it becomes the subject and is screened against the
//   whole database, exactly like a freshly entered deal (1-mile default).
// - SEVERAL selected → pick which one is the subject; the OTHERS become the
//   hand-picked comp set (screening bypassed — you chose the comps).
// The two client islands share a module-level store, synced with
// useSyncExternalStore so every checkbox and the bar re-render together.
import { useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";

const store = {
  ids: [] as string[], // selection in click order
  names: new Map<string, string>(),
  version: 0,
  listeners: new Set<() => void>(),
};
function emit() {
  store.version++;
  store.listeners.forEach((l) => l());
}
function subscribe(l: () => void) {
  store.listeners.add(l);
  return () => { store.listeners.delete(l); };
}
// The server snapshot is always 0 (nothing selected at render time), which
// matches the client's initial state — no hydration mismatch.
function useSelectionVersion() {
  return useSyncExternalStore(subscribe, () => store.version, () => 0);
}
function clearSelection() {
  store.ids = [];
  store.names.clear();
  emit();
}

export function SelectComp({ id, name }: { id: string; name: string }) {
  useSelectionVersion();
  const on = store.ids.includes(id);
  return (
    <input
      type="checkbox"
      className="h-4 w-4 accent-[#A78C52] cursor-pointer align-middle"
      checked={on}
      aria-label={`Select ${name} for analysis`}
      onClick={(e) => e.stopPropagation()}
      onChange={() => {
        if (on) store.ids = store.ids.filter((x) => x !== id);
        else { store.ids = [...store.ids, id]; store.names.set(id, name); }
        emit();
      }}
    />
  );
}

export function AnalyzeSelectedBar() {
  useSelectionVersion();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [subjectId, setSubjectId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const n = store.ids.length;
  if (n === 0) return null;

  async function run(subject: string, compIds: string[]) {
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/deals/from-comps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subjectId: subject, compIds }),
      });
      const body = await res.json().catch(() => ({} as { analysisId?: string; error?: string }));
      if (!res.ok || !body.analysisId) throw new Error(body.error ?? `Failed (${res.status}).`);
      clearSelection();
      router.push(`/deals/${body.analysisId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed.");
      setBusy(false);
    }
  }

  function onAnalyze() {
    if (n === 1) void run(store.ids[0], []);
    else { setSubjectId(store.ids[0]); setOpen(true); }
  }

  return (
    <>
      <div className="card p-3 flex items-center gap-3 border-accent/40 bg-accent/5 sticky top-2 z-20">
        <span className="badge bg-accent/15 text-[#7A6234] border-accent/30">{n} selected</span>
        <span className="text-sm text-slate-600">
          {n === 1
            ? "Analyze this deal against the whole database — same flow as a new deal."
            : "Analyze one as the subject; the rest become its hand-picked comp set."}
        </span>
        {error && <span className="text-sm text-red-600">{error}</span>}
        <button type="button" className="btn text-xs ml-auto" disabled={busy} onClick={clearSelection}>
          Clear
        </button>
        <button
          type="button"
          className="btn text-xs !bg-accent !text-white !border-accent hover:!bg-[#8F7743]"
          disabled={busy}
          onClick={onAnalyze}
        >
          {busy ? "Building analysis…" : "Analyze"}
        </button>
      </div>

      {open && (
        <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-navy/40 p-4" onClick={() => setOpen(false)}>
          <div className="card bg-white p-6 w-full max-w-lg space-y-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-display text-xl">Which one is the subject?</h3>
            <p className="text-xs text-slate-500">
              The subject is analyzed; the other {n - 1} selected comp{n - 1 === 1 ? "" : "s"} become its comparison set.
            </p>
            <div className="space-y-1.5 max-h-64 overflow-y-auto">
              {store.ids.map((id) => (
                <label key={id} className="flex items-center gap-2 text-sm cursor-pointer px-2 py-1.5 rounded hover:bg-slate-50">
                  <input
                    type="radio"
                    name="subject"
                    className="accent-[#A78C52]"
                    checked={subjectId === id}
                    onChange={() => setSubjectId(id)}
                  />
                  {store.names.get(id) ?? id}
                </label>
              ))}
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" className="btn text-xs" disabled={busy} onClick={() => setOpen(false)}>Cancel</button>
              <button
                type="button"
                className="btn text-xs !bg-accent !text-white !border-accent hover:!bg-[#8F7743]"
                disabled={busy || !subjectId}
                onClick={() => subjectId && void run(subjectId, store.ids.filter((x) => x !== subjectId))}
              >
                {busy ? "Building analysis…" : "Analyze"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

"use client";

// Select comps on the /comps page and analyze them together (Mason,
// 9/23/26): checkboxes on every row + a floating action bar. The selection
// lands on the standard analysis page as a SUBJECT-LESS comp set — no gold
// row, no screening; the analyst chose the comps.
// The client islands share a module-level store, synced with
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const n = store.ids.length;
  if (n === 0) return null;

  // Subject-less comp set (Mason, 9/23/26): the selection lands on the
  // standard analysis page as-is — no subject, no picker popup.
  async function run() {
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/deals/from-comps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ compIds: store.ids }),
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

  return (
    <div className="card p-3 flex items-center gap-3 border-accent/40 bg-accent/5 sticky top-2 z-20">
      <span className="badge bg-accent/15 text-[#7A6234] border-accent/30">{n} selected</span>
      <span className="text-sm text-slate-600">
        Analyze {n === 1 ? "this deal" : `these ${n} deals`} side by side — the standard analysis view, no subject.
      </span>
      {error && <span className="text-sm text-red-600">{error}</span>}
      <button type="button" className="btn text-xs ml-auto" disabled={busy} onClick={clearSelection}>
        Clear
      </button>
      <button
        type="button"
        className="btn text-xs !bg-accent !text-white !border-accent hover:!bg-[#8F7743]"
        disabled={busy}
        onClick={() => void run()}
      >
        {busy ? "Building analysis…" : "Analyze"}
      </button>
    </div>
  );
}

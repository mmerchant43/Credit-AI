"use client";

// One-click comp removal from an analysis view (Mason, 9/21/26): the ✕
// removes the comp immediately (stats and charts recompute without it), and
// Undo restores the most recently removed. Removal lives in the URL — the
// database is never touched, and a clean URL restores everything.
import { useRouter, useSearchParams, usePathname } from "next/navigation";

function useExcluded() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const excluded = (params.get("x") ?? "").split(",").filter(Boolean);
  function setExcluded(ids: string[]) {
    const q = new URLSearchParams(params.toString());
    q.delete("new");
    if (ids.length) q.set("x", ids.join(","));
    else q.delete("x");
    router.replace(`${pathname}${q.toString() ? `?${q}` : ""}`, { scroll: false });
  }
  return { excluded, setExcluded };
}

export function RemoveCompButton({ compId, name }: { compId: string; name: string }) {
  const { excluded, setExcluded } = useExcluded();
  return (
    <button
      type="button"
      title={`Remove ${name} from this analysis`}
      aria-label={`Remove ${name} from this analysis`}
      className="text-slate-300 hover:text-red-600 font-bold px-1 leading-none"
      onClick={() => setExcluded([...excluded, compId])}
    >
      ✕
    </button>
  );
}

export function UndoRemoveButton() {
  const { excluded, setExcluded } = useExcluded();
  if (excluded.length === 0) return null;
  return (
    <button type="button" className="btn text-xs" onClick={() => setExcluded(excluded.slice(0, -1))}>
      ↩ Undo remove ({excluded.length})
    </button>
  );
}

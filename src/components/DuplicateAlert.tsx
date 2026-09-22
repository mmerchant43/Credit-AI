"use client";

// Duplicate-comp review (Mason, 9/21-22/26): the banner popup reviews every
// flagged group; each row's DUP? badge opens the SAME resolver scoped to
// just that property's copies. Remove archives (never hard-deletes);
// "Not duplicates" approves the group and stops the flagging.
import { useState } from "react";
import { useRouter } from "next/navigation";

export interface DupRow {
  id: string;
  name: string;
  location: string;
  loan: string;
  source: string;
  created: string;
}

function useResolver() {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function act(action: "archive" | "approve", ids: string[], busyKey: string, after?: () => void) {
    setBusy(busyKey); setError(null);
    try {
      const res = await fetch("/api/comps/duplicates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ids }),
      });
      const body = await res.json().catch(() => ({} as { error?: string }));
      if (!res.ok) throw new Error(body.error ?? `Failed (${res.status}).`);
      after?.();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed.");
    } finally {
      setBusy(null);
    }
  }
  return { busy, error, act };
}

function GroupCard({ rows, gi, busy, act, onResolved }: {
  rows: DupRow[]; gi: string;
  busy: string | null;
  act: ReturnType<typeof useResolver>["act"];
  onResolved?: () => void;
}) {
  return (
    <div className="border border-slate-200 rounded-sm">
      <div className="flex items-center justify-between px-3 py-2 bg-slate-50 border-b border-slate-200">
        <span className="text-sm font-medium">{rows[0]?.name} · {rows[0]?.location}</span>
        <button
          type="button"
          className="btn text-xs"
          disabled={busy !== null}
          onClick={() => act("approve", rows.map((r) => r.id), `a${gi}`, onResolved)}
        >
          {busy === `a${gi}` ? "Saving…" : "Not duplicates — keep all"}
        </button>
      </div>
      {rows.map((r) => (
        <div key={r.id} className="flex items-center gap-3 px-3 py-2 border-b border-slate-100 last:border-0 text-sm">
          <span className="flex-1">{r.source}</span>
          <span className="tabular-nums text-slate-600">{r.loan}</span>
          <span className="text-xs text-slate-400">{r.created}</span>
          <button
            type="button"
            className="btn btn-danger text-xs"
            disabled={busy !== null}
            onClick={() => act("archive", [r.id], r.id)}
          >
            {busy === r.id ? "Removing…" : "Remove"}
          </button>
        </div>
      ))}
    </div>
  );
}

/** Row-level DUP? badge — opens the resolver for just this property's copies. */
export function DupBadge({ group }: { group: DupRow[] }) {
  const [open, setOpen] = useState(false);
  const { busy, error, act } = useResolver();
  return (
    <>
      <button
        type="button"
        className="badge bg-amber-100 text-amber-800 border-amber-300 ml-1.5 cursor-pointer hover:bg-amber-200"
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}
        title="Review this property's duplicates"
      >
        dup?
      </button>
      {open && (
        <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-navy/40 p-4" onClick={() => setOpen(false)}>
          <div className="card bg-white p-6 w-full max-w-2xl max-h-[80vh] overflow-y-auto space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-display text-xl">Duplicates — {group[0]?.name}</h3>
              <button type="button" className="btn btn-primary text-sm" onClick={() => setOpen(false)}>Done</button>
            </div>
            <p className="text-xs text-slate-500">
              These are the copies the flag refers to. Remove archives a copy (recoverable);
              &ldquo;Not duplicates&rdquo; keeps them all and stops flagging.
            </p>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <GroupCard rows={group} gi="badge" busy={busy} act={act} onResolved={() => setOpen(false)} />
          </div>
        </div>
      )}
    </>
  );
}

export default function DuplicateAlert({ groups }: { groups: DupRow[][] }) {
  const [open, setOpen] = useState(false);
  const { busy, error, act } = useResolver();
  if (groups.length === 0) return null;

  return (
    <>
      <div className="card p-3 flex items-center gap-3 border-amber-300 bg-amber-50">
        <span className="badge bg-amber-100 text-amber-800 border-amber-300">possible duplicates</span>
        <span className="text-sm text-amber-900">
          {groups.length} propert{groups.length === 1 ? "y appears" : "ies appear"} more than once in the database.
        </span>
        <button type="button" className="btn text-xs ml-auto" onClick={() => setOpen(true)}>Review</button>
      </div>

      {open && (
        <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-navy/40 p-4" onClick={() => setOpen(false)}>
          <div className="card bg-white p-6 w-full max-w-2xl max-h-[80vh] overflow-y-auto space-y-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-display text-xl">Possible Duplicates</h3>
              <button type="button" className="btn btn-primary text-sm" onClick={() => setOpen(false)}>Done</button>
            </div>
            <p className="text-xs text-slate-500">
              Removing archives the row (recoverable — nothing is ever hard-deleted). Approving keeps
              every copy and stops flagging the group.
            </p>
            {error && <p className="text-sm text-red-600">{error}</p>}
            {groups.map((rows, gi) => (
              <div key={gi}>
                <GroupCard rows={rows} gi={String(gi)} busy={busy} act={act} />
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

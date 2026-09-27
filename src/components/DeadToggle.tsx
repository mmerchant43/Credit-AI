"use client";

// Mark a deal DEAD / revive it (Mason, 9/25/26). Alive → a quiet "mark
// dead" action; dead → a red DEAD badge that revives on click. Failures
// are surfaced, never silent.
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function DeadToggle({ id, dead, name }: { id: string; dead: boolean; name: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function toggle() {
    setBusy(true);
    try {
      const res = await fetch("/api/deals/dead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, dead: !dead }),
      });
      if (res.ok) router.refresh();
      else alert(`Could not update ${name} — please try again.`);
    } catch {
      alert(`Could not update ${name} — please try again.`);
    } finally {
      setBusy(false);
    }
  }
  return dead ? (
    <button
      type="button"
      className="badge bg-red-50 text-red-700 border-red-200 cursor-pointer hover:bg-red-100 whitespace-nowrap"
      title={`${name} is dead — click to revive`}
      disabled={busy}
      onClick={toggle}
    >
      {busy ? "…" : "DEAD"}
    </button>
  ) : (
    <button
      type="button"
      className="text-[11px] text-slate-300 hover:text-red-600 whitespace-nowrap px-1"
      title={`Mark ${name} dead (it stays listed, badged)`}
      disabled={busy}
      onClick={toggle}
    >
      {busy ? "…" : "mark dead"}
    </button>
  );
}

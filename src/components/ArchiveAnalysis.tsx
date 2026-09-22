"use client";

// The ✕ on a homepage deal row: removes the analysis from the lists
// immediately (archived, never hard-deleted; the comp database is untouched).
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ArchiveAnalysis({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function remove() {
    setBusy(true);
    try {
      const res = await fetch("/api/deals/archive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (res.ok) router.refresh();
    } finally {
      setBusy(false);
    }
  }
  return (
    <button
      type="button"
      title={`Remove ${name} from this list`}
      aria-label={`Remove ${name} from this list`}
      disabled={busy}
      className="text-slate-300 hover:text-red-600 font-bold px-1 leading-none disabled:opacity-40"
      onClick={remove}
    >
      {busy ? "…" : "✕"}
    </button>
  );
}

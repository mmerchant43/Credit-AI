"use client";

// The ✕ at the end of each comps-table row: deletes the deal immediately
// (archived, never hard-deleted — recoverable from the database).
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ArchiveComp({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function remove() {
    setBusy(true);
    try {
      const res = await fetch("/api/comps/archive", {
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
      title={`Delete ${name}`}
      aria-label={`Delete ${name}`}
      disabled={busy}
      className="text-slate-300 hover:text-red-600 font-bold px-1 leading-none disabled:opacity-40"
      onClick={remove}
    >
      {busy ? "…" : "✕"}
    </button>
  );
}

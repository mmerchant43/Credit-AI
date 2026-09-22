"use client";

// The homepage star: gold = pinned (appears under Pinned Deals), outline =
// not. One click toggles it.
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function PinStar({ id, pinned }: { id: string; pinned: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function toggle() {
    setBusy(true);
    try {
      const res = await fetch("/api/deals/pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, pinned: !pinned }),
      });
      if (res.ok) router.refresh();
    } finally {
      setBusy(false);
    }
  }
  return (
    <button
      type="button"
      title={pinned ? "Unpin from homepage" : "Pin to homepage"}
      aria-label={pinned ? "Unpin deal" : "Pin deal"}
      aria-pressed={pinned}
      disabled={busy}
      onClick={toggle}
      className={`text-lg leading-none px-1 disabled:opacity-40 ${pinned ? "text-accent" : "text-slate-300 hover:text-accent"}`}
    >
      {pinned ? "★" : "☆"}
    </button>
  );
}

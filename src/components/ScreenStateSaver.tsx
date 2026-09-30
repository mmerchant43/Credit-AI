"use client";

// Invisible auto-saver (Mason, 9/30/26): whenever the analysis URL's
// screening state CHANGES after mount (radius, boundary, criteria toggles,
// removed comps), it is written to the analysis after a short debounce, so
// opening the deal from the homepage restores the same filtered view.
// The first render never saves — merely arriving at a clean URL must not
// wipe a saved state; only an actual adjustment (or Reset) writes.
import { useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";

export default function ScreenStateSaver({ id }: { id: string }) {
  const params = useSearchParams();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSent = useRef<string | null>(null);

  useEffect(() => {
    const q = new URLSearchParams(params.toString());
    q.delete("new"); // transient flag, never part of the screen state
    q.sort();
    const current = q.toString();
    if (lastSent.current === null) { lastSent.current = current; return; } // mount — observe only
    if (current === lastSent.current) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      lastSent.current = current;
      void fetch("/api/deals/save-screen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, params: current }),
      }).catch(() => {});
    }, 800);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [params, id]);

  return null;
}

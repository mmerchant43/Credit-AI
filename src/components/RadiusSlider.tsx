"use client";

// Radius control for a deal analysis (Mason, 9/21/26): drag to re-screen the
// comp database live within N miles of the subject (zip-centroid distance).
// 0 / "Saved" restores the analysis exactly as it was saved (zip → city ladder).
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";

export default function RadiusSlider() {
  const router = useRouter();
  const params = useSearchParams();
  const current = Number(params.get("radius") ?? 0) || 0;
  const [value, setValue] = useState(current);
  const [isPending, startTransition] = useTransition();

  function apply(v: number) {
    startTransition(() => {
      router.replace(v > 0 ? `?radius=${v}` : "?", { scroll: false });
    });
  }

  return (
    <div className="card p-4 flex flex-wrap items-center gap-4">
      <span className="label !mb-0">Comp radius</span>
      <input
        type="range"
        min={0}
        max={25}
        step={0.5}
        value={value}
        onChange={(e) => setValue(Number(e.target.value))}
        onMouseUp={() => apply(value)}
        onTouchEnd={() => apply(value)}
        onKeyUp={(e) => {
          if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"].includes(e.key)) apply(value);
        }}
        className="w-64 accent-[#A78C52]"
        aria-label="Comp radius in miles"
      />
      <span className="text-sm tabular-nums font-medium w-28">
        {value === 0 ? "Saved view" : `${value} mile${value === 1 ? "" : "s"}`}
      </span>
      {isPending && <span className="text-xs text-slate-400">re-screening…</span>}
      <span className="text-xs text-slate-400">
        0 = the saved zip→city screen · distances use zip centroids, so comps without a zip drop out.
      </span>
    </div>
  );
}

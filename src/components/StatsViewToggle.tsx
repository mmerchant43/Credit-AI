"use client";

// Flip the Subject vs. Comps section between the distribution strips and
// per-deal vertical bar charts (Mason, 9/23/26). Both views arrive fully
// server-rendered; this island only decides which one shows.
import { useState, type ReactNode } from "react";

export default function StatsViewToggle({ table, bars }: { table: ReactNode; bars: ReactNode }) {
  const [view, setView] = useState<"table" | "bars">("table");
  const btn = (active: boolean) =>
    `px-2.5 py-1 text-xs font-semibold ${active ? "bg-accent text-white" : "bg-white text-slate-500 hover:text-slate-700"}`;
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <div className="flex rounded-md overflow-hidden border border-slate-300">
          <button type="button" className={btn(view === "table")} onClick={() => setView("table")}>
            Distribution
          </button>
          <button type="button" className={`${btn(view === "bars")} border-l border-slate-300`} onClick={() => setView("bars")}>
            Bar Charts
          </button>
        </div>
      </div>
      {view === "table" ? table : bars}
    </div>
  );
}

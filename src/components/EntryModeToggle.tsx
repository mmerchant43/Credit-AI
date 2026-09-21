"use client";

// Upload-vs-manual toggle used by both Add a Comp and New Deal Analysis
// (Mason, 9/21/26): OM upload is the primary path, manual entry one click away.
import { useState } from "react";
import OmUpload from "./OmUpload";
import DealForm from "./DealForm";

export default function EntryModeToggle({ mode }: { mode: "comp" | "deal" }) {
  const [entry, setEntry] = useState<"upload" | "manual">("upload");
  return (
    <div className="space-y-4">
      <div className="flex gap-0 border border-slate-300 rounded-sm overflow-hidden w-fit">
        <button
          type="button"
          onClick={() => setEntry("upload")}
          className={`px-4 py-1.5 text-sm ${entry === "upload" ? "bg-navy text-white" : "bg-white text-ink hover:bg-slate-50"}`}
        >
          Upload an OM
        </button>
        <button
          type="button"
          onClick={() => setEntry("manual")}
          className={`px-4 py-1.5 text-sm border-l border-slate-300 ${entry === "manual" ? "bg-navy text-white" : "bg-white text-ink hover:bg-slate-50"}`}
        >
          Enter manually
        </button>
      </div>
      {entry === "upload" ? <OmUpload mode={mode} /> : <DealForm mode={mode} />}
    </div>
  );
}

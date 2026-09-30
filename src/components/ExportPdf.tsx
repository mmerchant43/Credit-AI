"use client";

// Direct PDF download (Mason, 9/30/26): builds the PDF in the browser and
// saves it to Downloads — no print dialog. The page is temporarily put in
// "pdf-mode" (the same tidy layout the print path uses), the map re-renders
// at report width via the existing beforeprint hook, html2pdf.js rasterizes
// it, and everything is restored. The browser print dialog remains as a
// fallback link.
import { useState } from "react";

declare global {
  interface Window {
    html2pdf?: () => {
      set: (opts: Record<string, unknown>) => { from: (el: HTMLElement) => { save: () => Promise<void> } };
    };
  }
}

const H2P_SRC = "https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js";

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.html2pdf) return resolve();
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("PDF library failed to load.")));
      return;
    }
    const s = document.createElement("script");
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("PDF library failed to load — check the connection and try again."));
    document.head.appendChild(s);
    // Never hang the button: give the load 20s, then fail visibly.
    setTimeout(() => reject(new Error("PDF library took too long to load — try again.")), 20000);
  });
}

export default function ExportPdf({ name }: { name: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function download() {
    setBusy(true); setError(null);
    const rootEl = document.getElementById("analysis-report");
    try {
      if (!rootEl) throw new Error("Nothing to export.");
      await loadScript(H2P_SRC);
      if (!window.html2pdf) throw new Error("PDF library failed to load.");
      // Same tidy layout as printing, applied as a class so the rasterizer
      // sees it; the map re-renders at report width via the print hook.
      document.documentElement.classList.add("pdf-mode");
      window.dispatchEvent(new Event("beforeprint"));
      await new Promise((r) => setTimeout(r, 1200)); // let map tiles settle
      const file = `${(name || "deal-analysis").replace(/[^\w\- ]+/g, "").trim() || "deal-analysis"} - Comp Analysis.pdf`;
      await window
        .html2pdf()
        .set({
          margin: [8, 8, 10, 8],
          filename: file,
          image: { type: "jpeg", quality: 0.95 },
          html2canvas: { scale: 2, useCORS: true, logging: false },
          jsPDF: { unit: "mm", format: "letter", orientation: "portrait" },
          pagebreak: { mode: ["css", "legacy"] },
        })
        .from(rootEl)
        .save();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed — try again, or use the print dialog below.");
    } finally {
      document.documentElement.classList.remove("pdf-mode");
      window.dispatchEvent(new Event("afterprint"));
      setBusy(false);
    }
  }

  return (
    <div className="card p-4 flex items-center gap-4 print-hide">
      <div className="flex-1">
        <div className="text-sm font-medium">Export this analysis as a PDF</div>
        <div className="text-xs text-slate-500">
          Downloads a formatted PDF — the map as arranged and whichever metrics view is showing (flip to
          Bar Charts first if that&apos;s what you want).{" "}
          <button type="button" className="underline hover:text-slate-700" disabled={busy} onClick={() => window.print()}>
            Or use the browser&apos;s print dialog
          </button>{" "}
          (turn off &ldquo;Headers and footers&rdquo; there).
        </div>
        {error && <div className="text-xs text-red-600 mt-1">{error}</div>}
      </div>
      <button
        type="button"
        className="btn !bg-accent !text-white !border-accent hover:!bg-[#8F7743] text-sm whitespace-nowrap"
        disabled={busy}
        onClick={() => void download()}
      >
        {busy ? "Building PDF…" : "Download PDF"}
      </button>
    </div>
  );
}

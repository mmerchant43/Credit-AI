"use client";

// One-click PDF export (Mason, 9/30/26): a print-tuned stylesheet turns
// the analysis page into a tight report — subject card, map, metrics with
// whichever Distribution/Bar Charts view is showing, comp tables — and
// the browser's dialog saves it as a PDF.
export default function ExportPdf() {
  return (
    <div className="card p-4 flex items-center gap-4 print-hide">
      <div className="flex-1">
        <div className="text-sm font-medium">Export this analysis as a PDF</div>
        <div className="text-xs text-slate-500">
          Prints the page as a compact report — the map and whichever metrics view is showing (flip to Bar
          Charts first if that&apos;s what you want). In the dialog choose &ldquo;Save as PDF&rdquo;.
        </div>
      </div>
      <button
        type="button"
        className="btn !bg-accent !text-white !border-accent hover:!bg-[#8F7743] text-sm"
        onClick={() => window.print()}
      >
        Export PDF
      </button>
    </div>
  );
}

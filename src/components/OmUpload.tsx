"use client";

// Upload an OM → the browser extracts the PDF's text (pdf.js — the file
// itself never leaves the machine), the server reads the deal facts out of
// it, and the record saves in one motion. mode "deal" runs the five-filter
// screen and lands on the analysis; mode "comp" saves straight to the
// database. Verbatim-or-null throughout — anything the OM doesn't state
// stays blank, exactly like the manual form.
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

const PDFJS_VERSION = "4.10.38"; // keep in lockstep with package.json
const KEYWORDS = /DSCR|debt service|debt yield|loan request|loan amount|sources\s*(&|and)\s*uses|unit mix|stories|occupancy|year built|delivery|LTV|LTC|loan-to|rent roll|financing|capitalization|total project cost|sponsor|cap rate|per unit|per square foot|PSF|comparabl|competitive set|rent survey|comp set|recent sales|sale price|comps/i;

async function pdfToText(file: File, onProgress: (msg: string) => void): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${PDFJS_VERSION}/build/pdf.worker.min.mjs`;
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const total = doc.numPages;
  const pageText = async (n: number) => {
    const page = await doc.getPage(n);
    const content = await page.getTextContent();
    return (content.items as { str?: string }[]).map((i) => i.str ?? "").join(" ");
  };
  const parts: string[] = [];
  const kept: number[] = [];
  for (let n = 1; n <= total; n++) {
    if (n % 10 === 0) onProgress(`Reading page ${n} of ${total}…`);
    const txt = await pageText(n);
    if (n <= 18 || (kept.length < 48 && KEYWORDS.test(txt))) {
      kept.push(n);
      parts.push(`--- PAGE ${n} ---\n${txt}`);
    }
    if (kept.length >= 48 && n > 18) break;
  }
  return parts.join("\n").slice(0, 170000);
}

export default function OmUpload({ mode }: { mode: "comp" | "deal" }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleFile(file: File) {
    setBusy(true); setError(null);
    try {
      setStatus("Reading the PDF…");
      const text = await pdfToText(file, setStatus);
      if (text.trim().length < 500) {
        throw new Error("Couldn't read text from that PDF — it may be a scanned document. Enter the deal manually instead.");
      }
      setStatus("Extracting the deal facts…");
      const ex = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, fileName: file.name, mode }),
      });
      const exBody = await ex.json();
      if (!ex.ok) throw new Error(exBody.error ?? "Extraction failed.");

      setStatus(mode === "deal" ? "Screening the comp database…" : "Saving the comp…");
      const save = await fetch(mode === "deal" ? "/api/deals" : "/api/comps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...exBody.fields, fromOmUpload: true }),
      });
      const saveBody = await save.json();
      if (!save.ok) throw new Error(saveBody.error ?? "Could not save.");
      router.push(mode === "deal" ? `/deals/${saveBody.analysisId}?new=1` : "/comps");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setStatus(null);
      setBusy(false);
    }
  }

  return (
    <div className="card p-8 text-center space-y-3">
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f); }}
      />
      {busy ? (
        <>
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
          <p className="text-sm text-slate-600">{status}</p>
          <p className="text-xs text-slate-400">Large OMs can take up to a minute.</p>
        </>
      ) : (
        <>
          <p className="font-display text-lg">Upload the Offering Memorandum</p>
          <p className="text-sm text-slate-500 max-w-md mx-auto">
            Drop in the OM PDF — the deal facts are read out of it (verbatim-or-null, nothing derived
            {mode === "deal" ? "), the five-filter screen runs against the database, and the deal is added automatically." : ") and saved to the database as a comp."}
          </p>
          <button type="button" className="btn btn-primary" onClick={() => inputRef.current?.click()}>
            Choose PDF…
          </button>
          {error && <p className="text-sm text-red-600 max-w-md mx-auto">{error}</p>}
        </>
      )}
    </div>
  );
}

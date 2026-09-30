"use client";

// Native PDF report (Mason, 9/30/26, rebuilt after the rasterize-the-page
// approach dropped the SVG charts): the PDF is DRAWN — crisp text, real
// tables, real bar charts — from the same data the page renders, with the
// map snapshotted tile-by-tile from exactly what's on screen (same view,
// same pins, same ring). Page 1: deal header, map, comparison table.
// Page 2: Subject vs. Comps — its own page, gold subject bar, navy comps.
import { useState } from "react";

export interface ExportMetric {
  label: string;
  kind: "usd" | "pct" | "x" | "num";
  group: string | null; // "Total Cost Basis" | "Loan Amount" before this row
  subject: number | null;
  min: number | null;
  median: number | null;
  max: number | null;
  bars: { label: string; name: string; value: number | null; isSubject: boolean }[];
}
export interface ExportCompRow {
  num: string; // "S" | "1"...
  isSubject: boolean;
  name: string;
  location: string;
  category: string;
  vintage: string;
  units: string;
  loan: string;
}
export interface ExportData {
  name: string;
  subjectLine: string;
  screenedLine: string;
  comps: ExportCompRow[];
  metrics: ExportMetric[];
}

declare global {
  interface Window { jspdf?: { jsPDF: new (opts?: Record<string, unknown>) => JsPdfDoc } }
}
interface JsPdfDoc {
  setFont: (f: string, s?: string) => void;
  setFontSize: (n: number) => void;
  setTextColor: (r: number, g: number, b: number) => void;
  setDrawColor: (r: number, g: number, b: number) => void;
  setFillColor: (r: number, g: number, b: number) => void;
  setLineWidth: (n: number) => void;
  text: (t: string, x: number, y: number, o?: Record<string, unknown>) => void;
  line: (x1: number, y1: number, x2: number, y2: number) => void;
  rect: (x: number, y: number, w: number, h: number, style?: string) => void;
  roundedRect: (x: number, y: number, w: number, h: number, rx: number, ry: number, style?: string) => void;
  circle: (x: number, y: number, r: number, style?: string) => void;
  addImage: (data: string, fmt: string, x: number, y: number, w: number, h: number) => void;
  addPage: () => void;
  save: (name: string) => void;
  splitTextToSize: (t: string, w: number) => string[];
}

const JSPDF_SRC = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
const NAVY: [number, number, number] = [27, 42, 74];
const GOLD: [number, number, number] = [167, 140, 82];
const GOLD_DARK: [number, number, number] = [122, 98, 52];
const SLATE: [number, number, number] = [100, 116, 139];
const LINE: [number, number, number] = [226, 232, 240];
const INK: [number, number, number] = [30, 41, 59];

function loadScript(src: string, ready: () => boolean): Promise<void> {
  return new Promise((resolve, reject) => {
    if (ready()) return resolve();
    const done = () => (ready() ? resolve() : reject(new Error("PDF library failed to initialize.")));
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) { existing.addEventListener("load", done); existing.addEventListener("error", () => reject(new Error("PDF library failed to load."))); }
    else {
      const s = document.createElement("script");
      s.src = src; s.onload = done;
      s.onerror = () => reject(new Error("PDF library failed to load — check the connection and try again."));
      document.head.appendChild(s);
    }
    setTimeout(() => reject(new Error("PDF library took too long to load — try again.")), 20000);
  });
}

const fmtFull = (kind: string, v: number | null): string => {
  if (v == null) return "—";
  if (kind === "usd") return `$${Math.round(v).toLocaleString("en-US")}`;
  if (kind === "pct") return `${(v * 100).toFixed(1)}%`;
  if (kind === "x") return `${v.toFixed(2)}x`;
  return String(v);
};
const fmtShort = (kind: string, v: number): string => {
  if (kind === "usd") {
    if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
    if (Math.abs(v) >= 1_000) return `$${Math.round(v / 1000)}K`;
    return `$${Math.round(v)}`;
  }
  if (kind === "pct") return `${(v * 100).toFixed(1)}%`;
  if (kind === "x") return `${v.toFixed(2)}x`;
  return String(v);
};

/** Faithful map snapshot: draws the on-screen Leaflet container — loaded
 *  tiles, the vector overlay (radius ring / boundary), and the numbered
 *  pins — onto a canvas at 2×. Returns null if nothing usable is there. */
async function snapshotMap(): Promise<{ data: string; w: number; h: number } | null> {
  const cont = document.querySelector<HTMLElement>("#analysis-report .leaflet-container");
  if (!cont) return null;
  const rect = cont.getBoundingClientRect();
  if (rect.width < 50 || rect.height < 50) return null;
  const scale = 2;
  const cv = document.createElement("canvas");
  cv.width = Math.round(rect.width * scale);
  cv.height = Math.round(rect.height * scale);
  const ctx = cv.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = "#f7f5f0";
  ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.scale(scale, scale);

  // 1. tiles (CORS-loaded, so the canvas stays exportable)
  cont.querySelectorAll<HTMLImageElement>("img.leaflet-tile").forEach((img) => {
    if (!img.complete || img.naturalWidth === 0) return;
    const r = img.getBoundingClientRect();
    try { ctx.drawImage(img, r.left - rect.left, r.top - rect.top, r.width, r.height); } catch { /* skip */ }
  });

  // 2. vector overlay (ring / drawn boundary) — rasterize the overlay SVG
  const svgEl = cont.querySelector<SVGSVGElement>(".leaflet-overlay-pane svg");
  if (svgEl) {
    try {
      const ser = new XMLSerializer().serializeToString(svgEl);
      const url = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(ser);
      const im = new Image();
      await new Promise<void>((res) => { im.onload = () => res(); im.onerror = () => res(); im.src = url; });
      if (im.naturalWidth > 0) {
        const r = svgEl.getBoundingClientRect();
        ctx.drawImage(im, r.left - rect.left, r.top - rect.top, r.width, r.height);
      }
    } catch { /* ring skipped */ }
  }

  // 3. pins — the divIcon circles, redrawn from their computed styles
  cont.querySelectorAll<HTMLElement>(".leaflet-marker-icon").forEach((marker) => {
    const inner = marker.firstElementChild as HTMLElement | null;
    if (!inner) return;
    const st = getComputedStyle(inner);
    if (st.cursor === "ew-resize") return; // the radius drag handle — not a pin
    const r = inner.getBoundingClientRect();
    const cx = r.left - rect.left + r.width / 2;
    const cy = r.top - rect.top + r.height / 2;
    const rad = Math.min(r.width, r.height) / 2;
    ctx.beginPath();
    ctx.arc(cx, cy, rad, 0, Math.PI * 2);
    ctx.fillStyle = st.backgroundColor || "#1B2A4A";
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#ffffff";
    ctx.stroke();
    const label = (inner.textContent || "").trim();
    if (label) {
      ctx.fillStyle = "#ffffff";
      ctx.font = `700 ${Math.round(rad)}px Helvetica, Arial, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(label, cx, cy + 0.5);
    }
  });

  try {
    return { data: cv.toDataURL("image/jpeg", 0.92), w: rect.width, h: rect.height };
  } catch {
    return null; // tainted canvas (stale non-CORS tiles) — PDF notes it
  }
}

function drawBars(doc: JsPdfDoc, m: ExportMetric, x: number, y: number, w: number, h: number) {
  const items = [...m.bars].sort((a, b) => {
    const av = a.value != null && isFinite(a.value) ? a.value : Infinity;
    const bv = b.value != null && isFinite(b.value) ? b.value : Infinity;
    return av - bv;
  });
  const vals = items.map((i) => i.value).filter((v): v is number => v != null && isFinite(v));
  if (vals.length === 0) return;
  const max = Math.max(...vals);
  if (max <= 0) return; // nothing drawable — avoid NaN bar heights
  const TOP = 12, BOT = 10;
  const chartH = h - TOP - BOT;
  const n = items.length;
  const slot = w / n;
  const barW = Math.min(26, Math.max(6, slot * 0.66));
  doc.setDrawColor(...LINE);
  doc.setLineWidth(0.75);
  doc.line(x, y + h - BOT, x + w, y + h - BOT);
  items.forEach((it, i) => {
    const cx = x + slot * i + slot / 2;
    doc.setFontSize(6.5);
    if (it.value == null || !isFinite(it.value)) {
      doc.setTextColor(...SLATE);
      doc.text("—", cx, y + h - BOT - 3, { align: "center" });
    } else {
      const bh = Math.max(1.5, (it.value / max) * chartH);
      const stagger = n > 7 && i % 2 === 1 ? 6 : 0;
      if (it.isSubject) doc.setFillColor(...GOLD); else doc.setFillColor(...NAVY);
      doc.roundedRect(cx - barW / 2, y + h - BOT - bh, barW, bh, 1, 1, "F");
      if (it.isSubject) doc.setTextColor(...GOLD_DARK); else doc.setTextColor(...SLATE);
      doc.text(fmtShort(m.kind, it.value), cx, y + h - BOT - bh - 2.5 - stagger, { align: "center" });
    }
    if (it.isSubject) doc.setTextColor(...GOLD_DARK); else doc.setTextColor(...SLATE);
    doc.setFontSize(6.5);
    doc.text(it.label, cx, y + h - 2.5, { align: "center" });
  });
}

export default function ExportPdf({ data }: { data: ExportData }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function download() {
    setBusy(true); setError(null);
    try {
      await loadScript(JSPDF_SRC, () => Boolean(window.jspdf?.jsPDF));
      const doc = new window.jspdf!.jsPDF({ unit: "pt", format: "letter" });
      const W = 612, M = 36, CW = W - 2 * M;
      let y = M + 8;

      // ── header ──
      doc.setFont("helvetica", "bold"); doc.setFontSize(16); doc.setTextColor(...NAVY);
      doc.text(`Deal Analysis — ${data.name}`, M, y);
      y += 8;
      doc.setDrawColor(...GOLD); doc.setLineWidth(1); doc.line(M, y, W - M, y);
      y += 14;
      doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(...INK);
      for (const ln of doc.splitTextToSize(data.subjectLine, CW)) { doc.text(ln, M, y); y += 12; }
      doc.setTextColor(...SLATE); doc.setFontSize(8);
      doc.text(data.screenedLine, M, y); y += 14;

      // ── map ──
      const snap = await snapshotMap();
      if (snap) {
        const mw = CW;
        const mh = Math.min(300, (snap.h / snap.w) * mw);
        doc.setDrawColor(...LINE); doc.setLineWidth(0.75);
        doc.rect(M - 1, y - 1, mw + 2, mh + 2);
        doc.addImage(snap.data, "JPEG", M, y, mw, mh);
        y += mh + 8;
        doc.setFontSize(7); doc.setTextColor(...SLATE);
        doc.text("subject (gold, S) · comps (navy, numbered to match the table)", M, y);
        y += 14;
      } else {
        doc.setFontSize(8); doc.setTextColor(...SLATE);
        doc.text("(map unavailable in this export)", M, y); y += 14;
      }

      // ── comparison table ──
      doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(...NAVY);
      doc.text("Comparison", M, y); y += 6;
      doc.setDrawColor(...GOLD); doc.setLineWidth(0.75); doc.line(M, y, W - M, y); y += 12;
      const cols = [
        { w: 22, k: "num", h: "#", align: "center" },
        { w: 168, k: "name", h: "PROPERTY", align: "left" },
        { w: 128, k: "location", h: "LOCATION", align: "left" },
        { w: 72, k: "category", h: "CATEGORY", align: "left" },
        { w: 46, k: "vintage", h: "VINTAGE", align: "center" },
        { w: 40, k: "units", h: "UNITS", align: "center" },
        { w: 64, k: "loan", h: "LOAN", align: "right" },
      ] as const;
      const colX = (idx: number) => M + cols.slice(0, idx).reduce((a, c) => a + c.w, 0);
      const cellX = (idx: number) => {
        const c = cols[idx];
        return c.align === "left" ? colX(idx) + 2 : c.align === "right" ? colX(idx) + c.w - 2 : colX(idx) + c.w / 2;
      };
      doc.setFontSize(7); doc.setTextColor(...SLATE); doc.setFont("helvetica", "bold");
      cols.forEach((c, i) => doc.text(c.h, cellX(i), y, { align: c.align }));
      y += 4; doc.setDrawColor(...LINE); doc.line(M, y, W - M, y); y += 10;
      const rowH = 13;
      for (const row of data.comps) {
        if (y > 792 - M - 10) { doc.addPage(); y = M + 10; }
        if (row.isSubject) {
          doc.setFillColor(247, 242, 231);
          doc.rect(M, y - 9, CW, rowH, "F");
        }
        doc.setFont("helvetica", row.isSubject ? "bold" : "normal");
        doc.setFontSize(8);
        doc.setTextColor(...(row.isSubject ? GOLD_DARK : INK));
        cols.forEach((c, i) => {
          const raw = (row as unknown as Record<string, string>)[c.k] ?? "—";
          const txt = c.k === "name" && raw.length > 42 ? raw.slice(0, 41) + "…" : raw;
          doc.text(txt, cellX(i), y, { align: c.align });
        });
        y += 3; doc.setDrawColor(...LINE); doc.setLineWidth(0.5); doc.line(M, y, W - M, y); y += 10;
      }

      // ── page 2: Subject vs. Comps, its own page ──
      doc.addPage();
      y = M + 8;
      doc.setFont("helvetica", "bold"); doc.setFontSize(14); doc.setTextColor(...NAVY);
      doc.text(data.metrics.some((m) => m.bars.some((b) => b.isSubject)) ? "Subject vs. Comps" : "Comp Set Metrics", M, y);
      y += 7;
      doc.setDrawColor(...GOLD); doc.setLineWidth(1); doc.line(M, y, W - M, y); y += 16;

      const blockH = 96;
      for (const m of data.metrics) {
        if (m.group) {
          if (y + 14 > 792 - M) { doc.addPage(); y = M + 10; }
          doc.setFillColor(248, 250, 252);
          doc.rect(M, y - 8, CW, 13, "F");
          doc.setFont("helvetica", "bold"); doc.setFontSize(7.5); doc.setTextColor(...SLATE);
          doc.text(m.group.toUpperCase(), M + 4, y);
          y += 14;
        }
        if (y + blockH > 792 - M) { doc.addPage(); y = M + 10; }
        // left: label + numbers
        doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(...INK);
        doc.text(m.label, M, y + 4);
        const belowOrAbove =
          m.subject != null && m.min != null && m.max != null
            ? m.subject < m.min ? "BELOW RANGE" : m.subject > m.max ? "ABOVE RANGE" : "WITHIN RANGE"
            : null;
        if (belowOrAbove) {
          const bad = belowOrAbove !== "WITHIN RANGE";
          doc.setFontSize(6.5);
          doc.setTextColor(...(bad ? [185, 28, 28] as [number, number, number] : [21, 128, 61] as [number, number, number]));
          doc.text(belowOrAbove, M, y + 15);
        }
        doc.setFont("helvetica", "normal"); doc.setFontSize(8);
        const stats: [string, string, boolean][] = [
          ["Subject", fmtFull(m.kind, m.subject), true],
          ["Min", fmtFull(m.kind, m.min), false],
          ["Median", fmtFull(m.kind, m.median), false],
          ["Max", fmtFull(m.kind, m.max), false],
        ];
        let sy = y + 30;
        for (const [k, v, strong] of stats) {
          doc.setTextColor(...SLATE); doc.setFont("helvetica", "normal");
          doc.text(k, M, sy);
          doc.setTextColor(...INK); doc.setFont("helvetica", strong ? "bold" : "normal");
          doc.text(v, M + 118, sy, { align: "right" });
          sy += 11;
        }
        // right: bars
        drawBars(doc, m, M + 150, y - 6, CW - 150, blockH - 10);
        y += blockH;
        doc.setDrawColor(...LINE); doc.setLineWidth(0.5); doc.line(M, y - 12, W - M, y - 12);
      }

      const file = `${(data.name || "deal-analysis").replace(/[^\w\- ]+/g, "").trim() || "deal-analysis"} - Comp Analysis.pdf`;
      doc.save(file);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed — try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card p-4 flex items-center gap-4 print-hide">
      <div className="flex-1">
        <div className="text-sm font-medium">Export this analysis as a PDF</div>
        <div className="text-xs text-slate-500">
          Downloads a formatted report — the map exactly as arranged above, the comparison table, and the
          bar charts on their own page.
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

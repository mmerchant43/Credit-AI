// Per-metric vertical bar chart (Mason, 9/23/26): one bar per deal — the
// SUBJECT in gold ("S"), each comp in Crow navy, numbered 1..N to match the
// Comparison table and the map pins. Pure SVG, server-rendered.
import { fmtShort } from "./MetricStrip";

export interface BarItem {
  label: string; // "S" for the subject, "1".."N" for comps
  value: number | null;
  isSubject: boolean;
}

export default function MetricBars({
  kind, items,
}: {
  kind: "usd" | "pct" | "x" | "num";
  items: BarItem[];
}) {
  const vals = items.map((i) => i.value).filter((v): v is number => v != null && isFinite(v));
  if (vals.length === 0)
    return <div className="text-center text-xs text-slate-400 py-8">no values</div>;

  const W = 420, H = 200, PAD = 14, TOP = 30, BOT = 20;
  const n = items.length;
  const slot = (W - PAD * 2) / n;
  const barW = Math.min(36, Math.max(8, slot * 0.68));
  const max = Math.max(...vals);
  const chartH = H - TOP - BOT;
  const hOf = (v: number) => (max <= 0 ? 0 : Math.max(2, (v / max) * chartH));
  const xOf = (i: number) => PAD + slot * i + (slot - barW) / 2;
  // Value labels stagger between two heights when bars are packed tight,
  // so neighbors never overlap.
  const staggered = n > 7;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img"
      aria-label={items.map((it) => `${it.label}: ${it.value != null ? fmtShort(kind, it.value) : "—"}`).join(", ")}>
      {/* baseline */}
      <line x1={PAD} y1={H - BOT} x2={W - PAD} y2={H - BOT} stroke="#CBD5E1" strokeWidth={1} />
      {items.map((it, i) => {
        const cx = xOf(i) + barW / 2;
        if (it.value == null || !isFinite(it.value)) {
          return (
            <g key={i}>
              <text x={cx} y={H - BOT - 5} textAnchor="middle" fontSize={10} fill="#CBD5E1">—</text>
              <text x={cx} y={H - 6} textAnchor="middle" fontSize={9.5} fill="#94A3B8">{it.label}</text>
            </g>
          );
        }
        const h = hOf(it.value);
        const y = H - BOT - h;
        const labelY = y - 5 - (staggered && i % 2 === 1 ? 11 : 0);
        return (
          <g key={i}>
            <rect x={xOf(i)} y={y} width={barW} height={h} rx={2}
              fill={it.isSubject ? "#A78C52" : "#1B2A4A"} fillOpacity={it.isSubject ? 1 : 0.85}>
              <title>{`${it.isSubject ? "Subject" : `Comp ${it.label}`}: ${fmtShort(kind, it.value)}`}</title>
            </rect>
            <text x={cx} y={labelY} textAnchor="middle" fontSize={9.5}
              fill={it.isSubject ? "#8F7743" : "#475569"} fontWeight={it.isSubject ? 700 : 500}>
              {fmtShort(kind, it.value)}
            </text>
            <text x={cx} y={H - 6} textAnchor="middle" fontSize={9.5}
              fill={it.isSubject ? "#8F7743" : "#94A3B8"} fontWeight={it.isSubject ? 700 : 400}>
              {it.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

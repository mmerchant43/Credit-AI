// Per-metric line chart: every comp plotted as a dot on the value line,
// navy median tick, gold subject dot (red when outside the comp range).
// Pure SVG, server-rendered — no client JS.

function fmtShort(kind: string, v: number): string {
  if (kind === "usd") {
    if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
    if (Math.abs(v) >= 1_000) return `$${Math.round(v / 1000)}K`;
    return `$${Math.round(v)}`;
  }
  if (kind === "pct") return `${(v * 100).toFixed(1)}%`;
  if (kind === "x") return `${v.toFixed(2)}x`;
  return String(v);
}

export default function MetricStrip({
  kind, values, subject, median,
}: {
  kind: "usd" | "pct" | "x" | "num";
  values: number[]; // comp values
  subject: number | null;
  median: number | null;
}) {
  if (values.length === 0) return <span className="text-xs text-slate-400">no comp values</span>;

  const W = 260, H = 34, PAD = 14, MID = 17;
  let lo = Math.min(...values, ...(subject != null ? [subject] : []));
  let hi = Math.max(...values, ...(subject != null ? [subject] : []));
  if (lo === hi) { lo -= Math.abs(lo) * 0.05 + 1; hi += Math.abs(hi) * 0.05 + 1; }
  const x = (v: number) => PAD + ((v - lo) / (hi - lo)) * (W - 2 * PAD);

  const cLo = Math.min(...values), cHi = Math.max(...values);
  const outside = subject != null && (subject < cLo || subject > cHi);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img"
      aria-label={`Comp range ${fmtShort(kind, cLo)} to ${fmtShort(kind, cHi)}${subject != null ? `, subject ${fmtShort(kind, subject)}` : ""}`}>
      {/* axis */}
      <line x1={PAD} y1={MID} x2={W - PAD} y2={MID} stroke="#CBD5E1" strokeWidth={1} />
      {/* comp range band */}
      <line x1={x(cLo)} y1={MID} x2={x(cHi)} y2={MID} stroke="#1B2A4A" strokeOpacity={0.25} strokeWidth={5} strokeLinecap="round" />
      {/* comp dots */}
      {values.map((v, i) => (
        <circle key={i} cx={x(v)} cy={MID} r={3} fill="#1B2A4A" fillOpacity={0.55} />
      ))}
      {/* median tick */}
      {median != null && <line x1={x(median)} y1={MID - 7} x2={x(median)} y2={MID + 7} stroke="#1B2A4A" strokeWidth={2} />}
      {/* subject */}
      {subject != null && (
        <>
          <circle cx={x(subject)} cy={MID} r={5.5} fill={outside ? "#DC2626" : "#A78C52"} stroke="#fff" strokeWidth={1.5} />
          <text x={Math.min(Math.max(x(subject), 20), W - 20)} y={7} textAnchor="middle" fontSize={8.5}
            fill={outside ? "#DC2626" : "#8F7743"} fontWeight={600}>
            {fmtShort(kind, subject)}
          </text>
        </>
      )}
      {/* endpoint labels */}
      <text x={PAD} y={H - 2} textAnchor="start" fontSize={8} fill="#94A3B8">{fmtShort(kind, cLo)}</text>
      <text x={W - PAD} y={H - 2} textAnchor="end" fontSize={8} fill="#94A3B8">{fmtShort(kind, cHi)}</text>
    </svg>
  );
}

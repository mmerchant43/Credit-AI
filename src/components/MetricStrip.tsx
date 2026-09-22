// Per-metric line chart: every comp plotted as a dot on the value line,
// navy median tick, gold subject dot. Pure SVG, server-rendered — no client
// JS. The subject stays GOLD whatever the range (Mason, 9/22/26 — the
// within/below/above badge on the metric row carries the flag now), and the
// strip fills its column at a taller, larger-type scale so the distribution
// is actually readable.

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
  if (values.length === 0)
    return <div className="text-center text-xs text-slate-400">no comp values</div>;

  const W = 420, H = 58, PAD = 20, MID = 30;
  let lo = Math.min(...values, ...(subject != null ? [subject] : []));
  let hi = Math.max(...values, ...(subject != null ? [subject] : []));
  if (lo === hi) { lo -= Math.abs(lo) * 0.05 + 1; hi += Math.abs(hi) * 0.05 + 1; }
  const x = (v: number) => PAD + ((v - lo) / (hi - lo)) * (W - 2 * PAD);

  const cLo = Math.min(...values), cHi = Math.max(...values);

  return (
    // width 100% + viewBox: the SVG scales with its column, so everything
    // inside (dots, type) renders larger — no more squinting.
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img"
      aria-label={`Comp range ${fmtShort(kind, cLo)} to ${fmtShort(kind, cHi)}${subject != null ? `, subject ${fmtShort(kind, subject)}` : ""}`}>
      {/* axis */}
      <line x1={PAD} y1={MID} x2={W - PAD} y2={MID} stroke="#CBD5E1" strokeWidth={1} />
      {/* comp range band */}
      <line x1={x(cLo)} y1={MID} x2={x(cHi)} y2={MID} stroke="#1B2A4A" strokeOpacity={0.25} strokeWidth={6} strokeLinecap="round" />
      {/* comp dots */}
      {values.map((v, i) => (
        <circle key={i} cx={x(v)} cy={MID} r={3.5} fill="#1B2A4A" fillOpacity={0.55} />
      ))}
      {/* median tick */}
      {median != null && <line x1={x(median)} y1={MID - 9} x2={x(median)} y2={MID + 9} stroke="#1B2A4A" strokeWidth={2} />}
      {/* subject — always gold */}
      {subject != null && (
        <>
          <circle cx={x(subject)} cy={MID} r={6.5} fill="#A78C52" stroke="#fff" strokeWidth={2} />
          <text x={Math.min(Math.max(x(subject), 28), W - 28)} y={13} textAnchor="middle" fontSize={12}
            fill="#8F7743" fontWeight={600}>
            {fmtShort(kind, subject)}
          </text>
        </>
      )}
      {/* endpoint labels */}
      <text x={PAD} y={H - 4} textAnchor="start" fontSize={10.5} fill="#94A3B8">{fmtShort(kind, cLo)}</text>
      <text x={W - PAD} y={H - 4} textAnchor="end" fontSize={10.5} fill="#94A3B8">{fmtShort(kind, cHi)}</text>
    </svg>
  );
}

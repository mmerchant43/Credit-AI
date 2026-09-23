import { prisma } from "@/lib/db";
import { fmtMoney, CATEGORY_LABELS } from "@/lib/format";
import { ensureCoords } from "@/lib/geo";
import NationalMap, { type NationalPoint } from "@/components/NationalMap";

export const dynamic = "force-dynamic";
// First visit may geocode zips for comps never mapped before.
export const maxDuration = 300;

// The Comp Map (Mason, 9/23/26): every mappable comp in the database on one
// interactive US map, reached from its homepage tile. Address-level pins
// where known; zip centroids otherwise (marked approximate in the popup —
// at national scale a centroid reads true). Comps with no zip at all can't
// be placed and are counted below the map.
export default async function CompMapPage() {
  const comps = await prisma.creditComp.findMany({ where: { archived: false } });
  await ensureCoords(comps);

  const points: NationalPoint[] = comps
    .filter((c) => c.lat != null && c.lon != null)
    .map((c) => ({
      id: c.id,
      name: c.propertyName ?? c.dealName ?? "—",
      detail: [
        [c.city, c.state].filter(Boolean).join(", "),
        c.loanAmount != null ? fmtMoney(c.loanAmount) : null,
        c.category ? CATEGORY_LABELS[c.category] ?? null : null,
      ].filter(Boolean).join(" · "),
      lat: c.lat as number,
      lon: c.lon as number,
      precision: c.geoPrecision ?? "zip",
      // Filter fields (Mason, 9/23/26) — filtering happens client-side, so
      // the dots update instantly.
      category: c.category,
      state: c.state,
      yearBuilt: c.yearBuilt,
      loanAmount: c.loanAmount,
      debtYieldPct: c.debtYieldPct,
      units: c.units,
    }));
  const unmappable = comps.length - points.length;

  return (
    <div className="space-y-5 pb-6">
      <div className="section-head">
        <h2>Comp Map</h2>
        <div className="rule" />
        <span className="text-xs text-slate-400 whitespace-nowrap">
          {points.length} of {comps.length} comps mapped
          {unmappable > 0 ? ` · ${unmappable} without a usable zip` : ""} · click a dot for the deal
        </span>
      </div>
      <NationalMap points={points} />
    </div>
  );
}

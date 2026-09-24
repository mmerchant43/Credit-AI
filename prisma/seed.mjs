// Build-time comp import — runs on every Vercel deploy (see package.json).
// Upserts every record in comps-seed.json by its stable sourceKey, so the
// extracted OM comps are continuously stored in the database: redeploying
// updates existing rows in place and adds new ones. Rows added by the team
// through the site (no sourceKey) are never touched. Nothing is deleted.
import { PrismaClient } from "@prisma/client";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const seedPath = join(here, "comps-seed.json");

if (!existsSync(seedPath)) {
  console.log("seed: no comps-seed.json — skipping import");
  process.exit(0);
}

let records;
try {
  records = JSON.parse(readFileSync(seedPath, "utf8"));
} catch (e) {
  console.error("seed: comps-seed.json is unreadable — skipping import:", e.message);
  process.exit(0); // a bad seed file must not block the site from deploying
}
const prisma = new PrismaClient();

// OM links (Mason, 9/22/26): set OM_BASE_URL in Vercel to the web URL of the
// "Multifamily Comps - 2026" folder (SharePoint/OneDrive), and every imported
// comp gets a clickable link to its own OM composed from that base + omPath.
const OM_BASE = (process.env.OM_BASE_URL ?? "").replace(/\/+$/, "");

let created = 0, updated = 0, failed = 0;
for (const r of records) {
  const { sourceKey, metricYears = [], omPath, ...fields } = r;
  if (!sourceKey) { failed++; continue; }
  if (fields.omLink == null && OM_BASE && omPath) {
    fields.omLink = `${OM_BASE}/${omPath.split("/").map(encodeURIComponent).join("/")}`;
  }
  // Sanctioned derivations (Mason, 9/22/26): metrics may be backed into from
  // stated figures when the OM doesn't quote them directly — same math as
  // subject properties. Order matters: totals first, then ratios, then
  // per-unit/per-SF.
  if (fields.totalProjectCost == null && fields.loanAmount > 0 && fields.ltcPct > 0.05 && fields.ltcPct <= 1) {
    fields.totalProjectCost = Math.round(fields.loanAmount / fields.ltcPct);
  }
  if (fields.ltcPct == null && fields.loanAmount > 0 && fields.totalProjectCost > 0) {
    const r = fields.loanAmount / fields.totalProjectCost;
    if (r > 0.30 && r < 1.05) fields.ltcPct = Math.round(r * 10000) / 10000; // senior-debt plausibility band
  }
  if (fields.loanPerSf == null && fields.loanAmount > 0 && fields.sizeSf > 0) {
    fields.loanPerSf = Math.round((fields.loanAmount / fields.sizeSf) * 100) / 100;
  }
  if (fields.loanPerUnit == null && fields.loanAmount > 0 && fields.units > 0) {
    fields.loanPerUnit = Math.round(fields.loanAmount / fields.units);
  }
  if (fields.tpcPerUnit == null && fields.totalProjectCost > 0 && fields.units > 0) {
    fields.tpcPerUnit = Math.round(fields.totalProjectCost / fields.units);
  }
  try {
    const existing = await prisma.creditComp.findUnique({ where: { sourceKey } });
    // If the seed changes a row's zip or address and doesn't itself carry
    // coordinates, clear the old ones (and any failed-geocode sentinel) so
    // the site re-geocodes from the new location (Mason, 9/23/26).
    if (
      existing && fields.lat == null &&
      ((fields.zip ?? null) !== (existing.zip ?? null) || (fields.address ?? null) !== (existing.address ?? null))
    ) {
      fields.lat = null;
      fields.lon = null;
      fields.geoPrecision = null;
    }
    const comp = existing
      ? await prisma.creditComp.update({ where: { sourceKey }, data: fields })
      : await prisma.creditComp.create({ data: { ...fields, sourceKey } });
    existing ? updated++ : created++;
    // Per-year metrics: replace wholesale so the seed file stays the source of truth.
    await prisma.compMetricYear.deleteMany({ where: { compId: comp.id } });
    if (metricYears.length) {
      await prisma.compMetricYear.createMany({
        data: metricYears.map((m) => ({
          compId: comp.id,
          yearLabel: m.yearLabel,
          dscr: m.dscr ?? null,
          debtYieldPct: m.debtYieldPct ?? null,
        })),
      });
    }
  } catch (e) {
    failed++;
    console.error(`seed: FAILED ${r.propertyName ?? sourceKey}: ${e.message}`);
  }
}
console.log(`seed: ${created} created, ${updated} updated, ${failed} failed of ${records.length}`);
await prisma.$disconnect();
// A partially failed seed should not block the site from deploying.
process.exit(0);

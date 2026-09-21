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

let created = 0, updated = 0, failed = 0;
for (const r of records) {
  const { sourceKey, metricYears = [], ...fields } = r;
  if (!sourceKey) { failed++; continue; }
  try {
    const existing = await prisma.creditComp.findUnique({ where: { sourceKey } });
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

// Zip-centroid geocoding for the radius filter. Coordinates come from
// zippopotam.us (free, public, US zip centroids), are written back onto the
// comp row the first time they're needed, and are never fetched twice.
// A comp with no zip (or an unknown zip) simply has no coordinates and drops
// out of a radius screen with an honest trace reason.
import { prisma } from "./db";

const EARTH_RADIUS_MI = 3958.7613;

export function haversineMiles(
  lat1: number, lon1: number, lat2: number, lon2: number
): number {
  const p1 = (lat1 * Math.PI) / 180;
  const p2 = (lat2 * Math.PI) / 180;
  const dp = p2 - p1;
  const dl = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * EARTH_RADIUS_MI * Math.asin(Math.sqrt(a));
}

const zip5 = (z: string | null | undefined) => (z ?? "").trim().slice(0, 5);

async function fetchZip(zip: string): Promise<[number, number] | null> {
  try {
    // Results persist onto the comp row, so each zip is fetched at most once.
    const res = await fetch(`https://api.zippopotam.us/us/${zip}`, {
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { places?: { latitude: string; longitude: string }[] };
    const p = body.places?.[0];
    if (!p) return null;
    const lat = Number(p.latitude), lon = Number(p.longitude);
    return isFinite(lat) && isFinite(lon) ? [lat, lon] : null;
  } catch {
    return null;
  }
}

export interface Geocodable {
  id: string;
  zip: string | null;
  lat: number | null;
  lon: number | null;
}

/** Fill in missing lat/lon (from zip) on the given rows, persisting what it
 *  learns so each zip is only ever looked up once. Mutates and returns rows. */
export async function ensureCoords<T extends Geocodable>(rows: T[]): Promise<T[]> {
  const need = rows.filter((r) => (r.lat == null || r.lon == null) && zip5(r.zip).length === 5);
  if (need.length === 0) return rows;

  // One lookup per distinct zip, limited concurrency.
  const zips = [...new Set(need.map((r) => zip5(r.zip)))];
  const coords = new Map<string, [number, number] | null>();
  const CONCURRENCY = 8;
  for (let i = 0; i < zips.length; i += CONCURRENCY) {
    const chunk = zips.slice(i, i + CONCURRENCY);
    const results = await Promise.all(chunk.map((z) => fetchZip(z)));
    chunk.forEach((z, j) => coords.set(z, results[j]));
  }

  const updates: { id: string; lat: number; lon: number }[] = [];
  for (const r of need) {
    const c = coords.get(zip5(r.zip));
    if (c) {
      r.lat = c[0];
      r.lon = c[1];
      updates.push({ id: r.id, lat: c[0], lon: c[1] });
    }
  }
  // Persist quietly; a failed write just means we geocode again next time.
  try {
    await Promise.all(
      updates.map((u) =>
        prisma.creditComp.update({ where: { id: u.id }, data: { lat: u.lat, lon: u.lon } })
      )
    );
  } catch {
    /* non-fatal */
  }
  return rows;
}

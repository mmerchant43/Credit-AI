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
  geoPrecision?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
}

/** Street-address geocoding via the US Census geocoder (free, no key).
 *  Returns [lat, lon] for a real street match, else null. */
export async function geocodeAddress(
  address: string, city: string, state: string, zip?: string | null
): Promise<[number, number] | null> {
  try {
    const oneline = [address, city, state, zip ?? ""].filter(Boolean).join(", ");
    const url =
      "https://geocoding.geo.census.gov/geocoder/locations/onelineaddress" +
      `?address=${encodeURIComponent(oneline)}&benchmark=Public_AR_Current&format=json`;
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return null;
    const body = (await res.json()) as {
      result?: { addressMatches?: { coordinates?: { x: number; y: number } }[] };
    };
    const c = body.result?.addressMatches?.[0]?.coordinates;
    if (!c || !isFinite(c.x) || !isFinite(c.y)) return null;
    return [c.y, c.x]; // Census returns x=lon, y=lat
  } catch {
    return null;
  }
}

/** Upgrade rows to address-level coordinates where a street address exists
 *  (used for the map's pins — screening keeps the cheaper zip centroids).
 *  Persists lat/lon/geoPrecision; failures are silent and retried next time. */
export async function ensureAddressCoords<T extends Geocodable>(rows: T[]): Promise<T[]> {
  // "address-failed" is a persisted sentinel: Census couldn't match the
  // address, so don't re-fire the 6s lookup on every page view. Editing the
  // address via /api/comps/set-address re-geocodes and clears it.
  const need = rows.filter(
    (r) =>
      r.geoPrecision !== "address" &&
      r.geoPrecision !== "address-failed" &&
      r.address && r.city && r.state
  );
  const CONCURRENCY = 5;
  for (let i = 0; i < need.length; i += CONCURRENCY) {
    const chunk = need.slice(i, i + CONCURRENCY);
    const results = await Promise.all(
      chunk.map((r) => geocodeAddress(r.address!, r.city!, r.state!, r.zip))
    );
    await Promise.all(
      chunk.map(async (r, j) => {
        const c = results[j];
        try {
          if (c) {
            r.lat = c[0];
            r.lon = c[1];
            r.geoPrecision = "address";
            await prisma.creditComp.update({
              where: { id: r.id },
              data: { lat: c[0], lon: c[1], geoPrecision: "address" },
            });
          } else {
            // Keep any zip-centroid coords; just stop retrying the address.
            r.geoPrecision = "address-failed";
            await prisma.creditComp.update({
              where: { id: r.id },
              data: { geoPrecision: "address-failed" },
            });
          }
        } catch { /* non-fatal */ }
      })
    );
  }
  return rows;
}

/** Fill in missing lat/lon (from zip) on the given rows, persisting what it
 *  learns so each zip is only ever looked up once. Mutates and returns rows. */
export async function ensureCoords<T extends Geocodable>(rows: T[]): Promise<T[]> {
  // "zip-failed" sentinel: an unknown zip stops re-firing 4s lookups on
  // every screen (fixing the zip via set-address clears it).
  const need = rows.filter(
    (r) =>
      (r.lat == null || r.lon == null) &&
      zip5(r.zip).length === 5 &&
      r.geoPrecision !== "zip-failed"
  );
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
  const failures: string[] = [];
  for (const r of need) {
    const c = coords.get(zip5(r.zip));
    if (c) {
      r.lat = c[0];
      r.lon = c[1];
      if (!r.geoPrecision) r.geoPrecision = "zip";
      updates.push({ id: r.id, lat: c[0], lon: c[1] });
    } else {
      r.geoPrecision = "zip-failed";
      failures.push(r.id);
    }
  }
  // Persist quietly; a failed write just means we geocode again next time.
  try {
    await Promise.all([
      ...updates.map((u) =>
        prisma.creditComp.update({
          where: { id: u.id },
          data: { lat: u.lat, lon: u.lon, geoPrecision: "zip" },
        })
      ),
      ...failures.map((id) =>
        prisma.creditComp.update({ where: { id }, data: { geoPrecision: "zip-failed" } })
      ),
    ]);
  } catch {
    /* non-fatal */
  }
  return rows;
}

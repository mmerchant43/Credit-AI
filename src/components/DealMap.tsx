"use client";

// The comp map (Mason, 9/22/26): subject in gold, matched comps in navy,
// radius circle when a radius screen is active. Leaflet + OpenStreetMap —
// no API key. Comps without a mappable location are flagged below the map
// with an inline address box; saving geocodes it and the map updates.
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import "leaflet/dist/leaflet.css";

export interface MapPoint {
  id: string;
  name: string;
  lat: number;
  lon: number;
  isSubject: boolean;
  precision: string | null; // "address" | "zip"
  detail: string;
}

export interface UnmappedComp {
  id: string;
  name: string;
  location: string;
  hasAddress: boolean;
}

function AddressFixRow({ c }: { c: UnmappedComp }) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function save() {
    if (value.trim().length < 3) return;
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/comps/set-address", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: c.id, address: value }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed.");
      if (!body.geocoded) setError("Saved, but that address couldn't be located — check the spelling.");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-slate-100 last:border-0">
      <span className="badge bg-amber-100 text-amber-800 border-amber-300">
        {c.hasAddress ? "address not locatable" : "no address"}
      </span>
      <span className="text-sm font-medium">{c.name}</span>
      <span className="text-xs text-slate-400">{c.location}</span>
      <input
        className="field !w-64 ml-auto"
        placeholder="street address, e.g. 2511 W Braker Ln"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") void save(); }}
      />
      <button type="button" className="btn text-xs" disabled={busy || value.trim().length < 3} onClick={save}>
        {busy ? "Locating…" : "Save & map"}
      </button>
      {error && <span className="text-xs text-red-600 w-full">{error}</span>}
    </div>
  );
}

export default function DealMap({
  points, unmapped, radiusMiles,
}: {
  points: MapPoint[];
  unmapped: UnmappedComp[];
  radiusMiles: number | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const dataKey = JSON.stringify([points.map((p) => [p.id, p.lat, p.lon]), radiusMiles]);

  useEffect(() => {
    let map: import("leaflet").Map | null = null;
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !containerRef.current) return;
      map = L.map(containerRef.current, { scrollWheelZoom: false });
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map);

      const dot = (color: string, size: number, ring: string) =>
        L.divIcon({
          className: "",
          html: `<div style="width:${size}px;height:${size}px;border-radius:9999px;background:${color};border:2.5px solid ${ring};box-shadow:0 1px 4px rgba(27,42,74,.5)"></div>`,
          iconSize: [size, size],
          iconAnchor: [size / 2, size / 2],
        });

      const subject = points.find((p) => p.isSubject);
      const bounds: [number, number][] = [];
      for (const p of points) {
        const marker = L.marker([p.lat, p.lon], {
          icon: p.isSubject ? dot("#A78C52", 20, "#fff") : dot("#1B2A4A", 14, "#fff"),
          zIndexOffset: p.isSubject ? 1000 : 0,
        }).addTo(map);
        marker.bindPopup(
          `<b>${p.name}</b>${p.isSubject ? " (Subject)" : ""}<br/>${p.detail}` +
          `<br/><span style="color:#94A3B8;font-size:11px">${p.precision === "address" ? "address-level pin" : "zip-centroid pin (approximate)"}</span>`
        );
        bounds.push([p.lat, p.lon]);
      }
      if (subject && radiusMiles && radiusMiles > 0) {
        L.circle([subject.lat, subject.lon], {
          radius: radiusMiles * 1609.34,
          color: "#A78C52",
          weight: 1.5,
          fillColor: "#A78C52",
          fillOpacity: 0.08,
        }).addTo(map);
      }
      if (bounds.length > 0) {
        map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
      } else {
        map.setView([39.5, -98.35], 4); // continental US
      }
    })();
    return () => {
      cancelled = true;
      map?.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataKey]);

  return (
    <section>
      <div className="section-head">
        <h2>Map</h2>
        <div className="rule" />
        <span className="text-xs text-slate-400 whitespace-nowrap">subject (gold) · comps (navy){radiusMiles ? " · radius shown" : ""}</span>
      </div>
      <div className="card overflow-hidden">
        <div ref={containerRef} style={{ height: 420, width: "100%" }} />
        {unmapped.length > 0 && (
          <div className="border-t border-slate-200">
            {unmapped.map((c) => (
              <div key={c.id}>
                <AddressFixRow c={c} />
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

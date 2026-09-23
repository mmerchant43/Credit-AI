"use client";

// The national comp map (Mason, 9/23/26): every mappable comp on one
// interactive US map — smooth wheel zoom, navy dots, click a dot for the
// deal's basics and a jump to it in the comps table. Canvas rendering keeps
// hundreds of dots fast.
import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";

export interface NationalPoint {
  id: string;
  name: string;
  detail: string; // "City, ST · $53.0M · Bridge / Refi"
  lat: number;
  lon: number;
  precision: string | null; // "address" or zip-centroid fallback
}

export default function NationalMap({ points }: { points: NationalPoint[] }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let map: import("leaflet").Map | null = null;
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !containerRef.current) return;
      map = L.map(containerRef.current, {
        preferCanvas: true,
        scrollWheelZoom: true,
        zoomSnap: 0.25,
        zoomDelta: 0.5,
        wheelPxPerZoomLevel: 90,
        wheelDebounceTime: 20,
      });
      const stadiaKey = process.env.NEXT_PUBLIC_STADIA_API_KEY;
      if (stadiaKey) {
        L.tileLayer(
          `https://tiles.stadiamaps.com/tiles/alidade_smooth/{z}/{x}/{y}{r}.png?api_key=${stadiaKey}`,
          {
            maxZoom: 20,
            attribution:
              '&copy; <a href="https://stadiamaps.com/">Stadia Maps</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
          }
        ).addTo(map);
      } else {
        L.tileLayer(
          "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}",
          { maxNativeZoom: 16, maxZoom: 18, attribution: "Tiles &copy; Esri &mdash; Esri, HERE, Garmin" }
        ).addTo(map);
        L.tileLayer(
          "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}",
          { maxNativeZoom: 16, maxZoom: 18, attribution: "" }
        ).addTo(map);
      }

      const esc = (t: string) =>
        t.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
      for (const p of points) {
        const marker = L.circleMarker([p.lat, p.lon], {
          radius: 5.5,
          color: "#fff",
          weight: 1.5,
          fillColor: "#1B2A4A",
          fillOpacity: 0.9,
        }).addTo(map);
        marker.bindPopup(
          `<b>${esc(p.name)}</b><br/>${esc(p.detail)}` +
          `<br/><a href="/comps?name=${encodeURIComponent(p.name)}" style="color:#8F7743;font-weight:600">Open in the comps table →</a>` +
          (p.precision === "address"
            ? ""
            : `<br/><span style="color:#94A3B8;font-size:11px">zip-centroid location (approximate)</span>`)
        );
      }
      // Continental US start; the dots say where to zoom.
      map.setView([39.5, -98.35], 4.25);
    })();
    return () => {
      cancelled = true;
      map?.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="card overflow-hidden">
      <div ref={containerRef} className="relative z-0" style={{ height: 560, width: "100%" }} />
    </div>
  );
}

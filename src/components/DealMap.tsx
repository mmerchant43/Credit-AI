"use client";

// The comp map (Mason, 9/22/26): subject in gold, matched comps in navy —
// but a comp gets a pin ONLY at exact address-level precision; a city/zip
// centroid is never shown as a dot. Everything unpinned is flagged below
// the map with an inline address box; saving geocodes it and the pin
// appears. Location screen is a draggable radius circle OR a hand-drawn
// boundary (toggle on the map).
import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import "leaflet/dist/leaflet.css";

function haversineMi(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3958.7613;
  const p1 = (lat1 * Math.PI) / 180, p2 = (lat2 * Math.PI) / 180;
  const dp = p2 - p1, dl = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export interface MapPoint {
  id: string;
  name: string;
  lat: number;
  lon: number;
  isSubject: boolean;
  precision: string | null; // "address" | "zip"
  detail: string;
  label: string; // "S" for the subject, "1".."N" matching the Comparison table
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
      const body = await res.json().catch(() => ({} as { error?: string; geocoded?: boolean }));
      if (!res.ok) throw new Error(body.error ?? `Failed (${res.status}).`);
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
  points, unmapped, radiusMiles, polygon,
}: {
  points: MapPoint[];
  unmapped: UnmappedComp[];
  radiusMiles: number | null;
  polygon: [number, number][] | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  // Remember where the user left the map so re-screens (radius drags, comp
  // removals) never yank the view back to an auto-fit — no more "snapping".
  const viewRef = useRef<{ lat: number; lng: number; zoom: number } | null>(null);
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const dataKey = JSON.stringify([points.map((p) => [p.id, p.lat, p.lon]), radiusMiles, polygon]);
  const hasSubjectPin = points.some((p) => p.isSubject);

  // Boundary drawing (Mason, 9/22/26): click corners, Apply closes the
  // shape and re-screens to comps inside it. The imperative bits live on
  // the Leaflet map, exposed to the buttons through drawApi.
  const [drawing, setDrawing] = useState(false);
  const [vertCount, setVertCount] = useState(0);
  const drawingRef = useRef(false);
  const drawApi = useRef<{ start: () => void; cancel: () => void; finish: () => void } | null>(null);
  const boundaryMode = drawing || Boolean(polygon);

  // Read the URL live (window.location) so a handler wired up inside the
  // map effect never replays stale params over criteria toggled since.
  function pushRadius(v: number | null) {
    const q = new URLSearchParams(window.location.search);
    q.delete("new");
    q.delete("loc");
    q.delete("poly");
    if (v && v > 0) q.set("radius", String(Math.min(Math.max(v, 0.5), 100)));
    else q.delete("radius");
    router.replace(`${pathname}${q.toString() ? `?${q}` : ""}`, { scroll: false });
  }

  function pushPoly(verts: [number, number][]) {
    const q = new URLSearchParams(window.location.search);
    q.delete("new");
    q.delete("loc");
    q.delete("radius");
    q.set("poly", verts.map((v) => `${v[0].toFixed(5)},${v[1].toFixed(5)}`).join(";"));
    router.replace(`${pathname}?${q}`, { scroll: false });
  }

  useEffect(() => {
    let map: import("leaflet").Map | null = null;
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !containerRef.current) return;
      // Smooth mouse-wheel zoom (Mason, 9/22/26): fine-grained fractional
      // zoom steps instead of full-level jumps.
      map = L.map(containerRef.current, {
        scrollWheelZoom: true,
        zoomSnap: 0.25,
        zoomDelta: 0.5,
        wheelPxPerZoomLevel: 90,
        wheelDebounceTime: 20,
      });
      map.on("moveend zoomend", () => {
        if (!map) return;
        const c = map.getCenter();
        viewRef.current = { lat: c.lat, lng: c.lng, zoom: map.getZoom() };
      });

      // ── Boundary drawing wiring ──
      const sketch = {
        line: null as import("leaflet").Polyline | null,
        dots: [] as import("leaflet").CircleMarker[],
      };
      let verts: [number, number][] = [];
      const clearSketch = () => {
        sketch.line?.remove();
        sketch.dots.forEach((d) => d.remove());
        sketch.line = null;
        sketch.dots = [];
        verts = [];
        setVertCount(0);
      };
      drawApi.current = {
        start: () => {
          if (!map) return;
          clearSketch();
          sketch.line = L.polyline([], { color: "#A78C52", weight: 2, dashArray: "6 4" }).addTo(map);
          drawingRef.current = true;
          setDrawing(true);
          map.doubleClickZoom.disable();
        },
        cancel: () => {
          clearSketch();
          drawingRef.current = false;
          setDrawing(false);
          map?.doubleClickZoom.enable();
        },
        finish: () => {
          const done = [...verts];
          drawApi.current?.cancel();
          if (done.length >= 3) pushPoly(done);
        },
      };
      map.on("click", (e: import("leaflet").LeafletMouseEvent) => {
        if (!drawingRef.current || !sketch.line || !map) return;
        verts.push([e.latlng.lat, e.latlng.lng]);
        sketch.line.setLatLngs(verts);
        sketch.dots.push(
          L.circleMarker(e.latlng, { radius: 4, color: "#A78C52", fillColor: "#fff", fillOpacity: 1, weight: 2 }).addTo(map)
        );
        setVertCount(verts.length);
      });
      // Basemap: Stadia "Alidade Smooth" when a (free) key is configured —
      // the cleanest modern look — else Esri Light Gray Canvas, the cleanest
      // keyless option (minimal gray base + labels; pins pop).
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

      const pin = (color: string, size: number, ring: string, label: string) =>
        L.divIcon({
          className: "",
          html: `<div style="width:${size}px;height:${size}px;border-radius:9999px;background:${color};border:2.5px solid ${ring};box-shadow:0 1px 4px rgba(27,42,74,.5);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:${Math.round(size * 0.5)}px;font-family:ui-sans-serif,system-ui">${label}</div>`,
          iconSize: [size, size],
          iconAnchor: [size / 2, size / 2],
        });

      const esc = (t: string) =>
        t.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
      const subject = points.find((p) => p.isSubject);
      const bounds: [number, number][] = [];
      for (const p of points) {
        const marker = L.marker([p.lat, p.lon], {
          icon: p.isSubject ? pin("#A78C52", 26, "#fff", esc(p.label)) : pin("#1B2A4A", 22, "#fff", esc(p.label)),
          zIndexOffset: p.isSubject ? 1000 : 0,
        }).addTo(map);
        marker.bindPopup(
          `<b>${esc(p.name)}</b>${p.isSubject ? " (Subject)" : ""}<br/>${esc(p.detail)}` +
          `<br/><span style="color:#94A3B8;font-size:11px">${p.precision === "address" ? "address-level pin" : "zip-centroid pin (approximate)"}</span>`
        );
        bounds.push([p.lat, p.lon]);
      }
      if (polygon && polygon.length >= 3) {
        // The applied boundary, in the same gold as the radius ring.
        L.polygon(polygon, {
          color: "#A78C52",
          weight: 1.5,
          fillColor: "#A78C52",
          fillOpacity: 0.08,
        }).addTo(map);
        for (const v of polygon) bounds.push(v);
      }
      if (subject && radiusMiles && radiusMiles > 0) {
        const circle = L.circle([subject.lat, subject.lon], {
          radius: radiusMiles * 1609.34,
          color: "#A78C52",
          weight: 1.5,
          fillColor: "#A78C52",
          fillOpacity: 0.08,
        }).addTo(map);

        // Draggable handle on the circle's eastern edge — drag in/out to
        // resize the radius; releasing re-screens (Mason, 9/22/26).
        const lonOffset = radiusMiles / (69.172 * Math.cos((subject.lat * Math.PI) / 180));
        const handle = L.marker([subject.lat, subject.lon + lonOffset], {
          draggable: true,
          icon: L.divIcon({
            className: "",
            html: `<div style="width:16px;height:16px;border-radius:9999px;background:#fff;border:3px solid #A78C52;box-shadow:0 1px 4px rgba(27,42,74,.5);cursor:ew-resize" title="Drag to resize the radius"></div>`,
            iconSize: [16, 16],
            iconAnchor: [8, 8],
          }),
          zIndexOffset: 900,
        }).addTo(map);
        handle.bindTooltip(`${radiusMiles} mi — drag to resize`, { direction: "right" });
        handle.on("drag", () => {
          const p = handle.getLatLng();
          const mi = haversineMi(subject.lat, subject.lon, p.lat, p.lng);
          circle.setRadius(Math.min(Math.max(mi, 0.5), 100) * 1609.34);
          handle.setTooltipContent(`${Math.min(Math.max(mi, 0.5), 100).toFixed(1)} mi`);
        });
        handle.on("dragend", () => {
          const p = handle.getLatLng();
          // Exact to a hundredth of a mile — no coarse snapping.
          const mi = Math.round(haversineMi(subject.lat, subject.lon, p.lat, p.lng) * 100) / 100;
          pushRadius(mi);
        });
      }
      if (viewRef.current) {
        // The user has positioned the map — keep their view across re-screens.
        map.setView([viewRef.current.lat, viewRef.current.lng], viewRef.current.zoom, { animate: false });
      } else if (bounds.length > 0) {
        map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
      } else {
        map.setView([39.5, -98.35], 4); // continental US
      }
    })();
    return () => {
      cancelled = true;
      // A re-render tears the map down — any half-drawn boundary goes with it.
      drawApi.current = null;
      drawingRef.current = false;
      setDrawing(false);
      setVertCount(0);
      map?.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataKey]);

  return (
    <section>
      <div className="section-head">
        <h2>Map</h2>
        <div className="rule" />
        <span className="text-xs text-slate-400 whitespace-nowrap">subject (gold) · comps (navy){radiusMiles ? " · radius shown" : polygon ? " · boundary shown" : ""}</span>
      </div>
      <div className="card overflow-hidden">
        {/* relative z-0 isolates Leaflet's internal z-indexes so the map can
            never paint above the site's modals/popups */}
        <div className="relative">
          <div ref={containerRef} className="relative z-0" style={{ height: 420, width: "100%" }} />
          {/* Radius control lives ON the map (Mason, 9/22/26). Default 1 mi. */}
          <div className="absolute top-2 right-2 z-10 card bg-white/95 px-3 py-2 flex items-center gap-2 shadow">
            {hasSubjectPin ? (
              <>
                {/* Circle ↔ drawn boundary toggle (Mason, 9/22/26) */}
                <div className="flex rounded-md overflow-hidden border border-slate-300">
                  <button
                    type="button"
                    className={`px-2.5 py-1 text-xs font-semibold ${!boundaryMode ? "bg-accent text-white" : "bg-white text-slate-500 hover:text-slate-700"}`}
                    onClick={() => { if (boundaryMode) { drawApi.current?.cancel(); pushRadius(1); } }}
                  >
                    Circle
                  </button>
                  <button
                    type="button"
                    className={`px-2.5 py-1 text-xs font-semibold border-l border-slate-300 ${boundaryMode ? "bg-accent text-white" : "bg-white text-slate-500 hover:text-slate-700"}`}
                    onClick={() => { if (!drawing) drawApi.current?.start(); }}
                  >
                    Boundary
                  </button>
                </div>
                {drawing ? (
                  <>
                    <span className="text-xs text-slate-500">
                      click the map to add corners{vertCount > 0 ? ` (${vertCount})` : ""}
                    </span>
                    <button type="button" className="btn text-xs" disabled={vertCount < 3}
                      onClick={() => drawApi.current?.finish()}>
                      Apply
                    </button>
                    <button type="button" className="btn text-xs"
                      onClick={() => drawApi.current?.cancel()}>
                      Cancel
                    </button>
                  </>
                ) : boundaryMode ? (
                  <>
                    <span className="text-xs text-slate-400">screening inside the drawn boundary</span>
                    <button type="button" className="btn text-xs" onClick={() => drawApi.current?.start()}>
                      Redraw
                    </button>
                  </>
                ) : (
                  <>
                    <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Radius</span>
                    <input
                      className="field !w-16 text-center !py-1"
                      type="number" min={0.5} max={100} step="any"
                      key={`r-${radiusMiles ?? 1}`}
                      defaultValue={radiusMiles ?? 1}
                      onBlur={(e) => pushRadius(e.target.value === "" ? null : Number(e.target.value))}
                      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                    />
                    <span className="text-xs text-slate-400">mi · drag the ring&apos;s edge to resize</span>
                  </>
                )}
              </>
            ) : (
              <span className="text-xs text-slate-400">subject has no pin — radius unavailable</span>
            )}
          </div>
        </div>
        {unmapped.length > 0 && (
          <div className="border-t border-slate-200">
            <div className="px-3 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Not on the map — add an exact address to pin
            </div>
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

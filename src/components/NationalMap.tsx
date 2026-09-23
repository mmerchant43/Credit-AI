"use client";

// The national comp map (Mason, 9/23/26): every mappable comp on one
// interactive US map — smooth wheel zoom, navy dots, click a dot for the
// deal's basics and a jump to it in the comps table. Filterable by
// category, state, vintage, loan amount, debt yield, and units (client-
// side — the dots update instantly; a comp missing a filtered value drops
// out of that view, same doctrine as the comps table). Canvas rendering
// keeps hundreds of dots fast.
import { useEffect, useMemo, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";

export interface NationalPoint {
  id: string;
  name: string;
  detail: string; // "City, ST · $53.0M · Bridge / Refi"
  lat: number;
  lon: number;
  precision: string | null; // "address" or zip-centroid fallback
  category: string | null; // BRIDGE_REFI | CONSTRUCTION
  state: string | null;
  yearBuilt: number | null;
  loanAmount: number | null;
  debtYieldPct: number | null; // fraction
  units: number | null;
}

const inRange = (v: number | null, min: string, max: string): boolean => {
  if (min === "" && max === "") return true;
  if (v == null) return false; // filtered value missing → drops out
  if (min !== "" && v < Number(min)) return false;
  if (max !== "" && v > Number(max)) return false;
  return true;
};

export default function NationalMap({ points }: { points: NationalPoint[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const layerRef = useRef<import("leaflet").LayerGroup | null>(null);
  const LRef = useRef<typeof import("leaflet") | null>(null);
  const [ready, setReady] = useState(false);

  const [cat, setCat] = useState("");
  const [state, setState] = useState("");
  const [vinMin, setVinMin] = useState(""); const [vinMax, setVinMax] = useState("");
  const [loanMin, setLoanMin] = useState(""); const [loanMax, setLoanMax] = useState(""); // $M
  const [dyMin, setDyMin] = useState(""); const [dyMax, setDyMax] = useState(""); // %
  const [uMin, setUMin] = useState(""); const [uMax, setUMax] = useState("");

  const filtered = useMemo(
    () =>
      points.filter(
        (p) =>
          (cat === "" || p.category === cat) &&
          (state.trim() === "" || (p.state ?? "").toUpperCase() === state.trim().toUpperCase()) &&
          inRange(p.yearBuilt, vinMin, vinMax) &&
          inRange(p.loanAmount == null ? null : p.loanAmount / 1_000_000, loanMin, loanMax) &&
          inRange(p.debtYieldPct == null ? null : p.debtYieldPct * 100, dyMin, dyMax) &&
          inRange(p.units, uMin, uMax)
      ),
    [points, cat, state, vinMin, vinMax, loanMin, loanMax, dyMin, dyMax, uMin, uMax]
  );

  // Create the map once.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !containerRef.current) return;
      const map = L.map(containerRef.current, {
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
      map.setView([39.5, -98.35], 4.25); // continental US
      LRef.current = L;
      mapRef.current = map;
      layerRef.current = L.layerGroup().addTo(map);
      setReady(true);
    })();
    return () => {
      cancelled = true;
      setReady(false);
      layerRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // (Re)draw the dots whenever the filters change — the view stays put.
  useEffect(() => {
    const L = LRef.current, layer = layerRef.current;
    if (!ready || !L || !layer) return;
    layer.clearLayers();
    const esc = (t: string) =>
      t.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
    for (const p of filtered) {
      const marker = L.circleMarker([p.lat, p.lon], {
        radius: 5.5,
        color: "#fff",
        weight: 1.5,
        fillColor: "#1B2A4A",
        fillOpacity: 0.9,
      }).addTo(layer);
      marker.bindPopup(
        `<b>${esc(p.name)}</b><br/>${esc(p.detail)}` +
        `<br/><a href="/comps?name=${encodeURIComponent(p.name)}" style="color:#8F7743;font-weight:600">Open in the comps table →</a>` +
        (p.precision === "address"
          ? ""
          : `<br/><span style="color:#94A3B8;font-size:11px">zip-centroid location (approximate)</span>`)
      );
    }
  }, [ready, filtered]);

  const colTitle = "text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1";
  const mini = "field !w-16 text-center !py-1";
  const reset = () => {
    setCat(""); setState("");
    setVinMin(""); setVinMax(""); setLoanMin(""); setLoanMax("");
    setDyMin(""); setDyMax(""); setUMin(""); setUMax("");
  };

  return (
    <div className="space-y-4">
      <div className="card p-4">
        <div className="flex items-center gap-3 mb-3">
          <span className="label !mb-0">Map Filters</span>
          <div className="flex-1 border-t border-accent/30" />
          <span className="text-xs text-slate-400">{filtered.length} of {points.length} comps shown</span>
          <button type="button" className="btn text-xs" onClick={reset}>Clear</button>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-x-6 gap-y-4">
          <div>
            <div className={colTitle}>Category</div>
            <select className="field !py-1" value={cat} onChange={(e) => setCat(e.target.value)}>
              <option value="">All</option>
              <option value="BRIDGE_REFI">Bridge / Refi</option>
              <option value="CONSTRUCTION">Construction</option>
            </select>
          </div>
          <div>
            <div className={colTitle}>State</div>
            <input className="field !w-20 !py-1" placeholder="e.g. TX" value={state} maxLength={2}
              onChange={(e) => setState(e.target.value)} />
          </div>
          <div>
            <div className={colTitle}>Vintage</div>
            <div className="flex items-center gap-1.5">
              <input className={mini} type="number" placeholder="min" value={vinMin} onChange={(e) => setVinMin(e.target.value)} />
              <span className="text-slate-400">–</span>
              <input className={mini} type="number" placeholder="max" value={vinMax} onChange={(e) => setVinMax(e.target.value)} />
            </div>
          </div>
          <div>
            <div className={colTitle}>Loan Amount ($M)</div>
            <div className="flex items-center gap-1.5">
              <input className={mini} type="number" placeholder="min" value={loanMin} onChange={(e) => setLoanMin(e.target.value)} />
              <span className="text-slate-400">–</span>
              <input className={mini} type="number" placeholder="max" value={loanMax} onChange={(e) => setLoanMax(e.target.value)} />
            </div>
          </div>
          <div>
            <div className={colTitle}>Debt Yield (%)</div>
            <div className="flex items-center gap-1.5">
              <input className={mini} type="number" step="any" placeholder="min" value={dyMin} onChange={(e) => setDyMin(e.target.value)} />
              <span className="text-slate-400">–</span>
              <input className={mini} type="number" step="any" placeholder="max" value={dyMax} onChange={(e) => setDyMax(e.target.value)} />
            </div>
          </div>
          <div>
            <div className={colTitle}>Units</div>
            <div className="flex items-center gap-1.5">
              <input className={mini} type="number" placeholder="min" value={uMin} onChange={(e) => setUMin(e.target.value)} />
              <span className="text-slate-400">–</span>
              <input className={mini} type="number" placeholder="max" value={uMax} onChange={(e) => setUMax(e.target.value)} />
            </div>
          </div>
        </div>
        <p className="text-xs text-slate-400 mt-2">Comps missing a filtered value drop out of that view — blanks are never treated as zero.</p>
      </div>
      <div className="card overflow-hidden">
        <div ref={containerRef} className="relative z-0" style={{ height: 560, width: "100%" }} />
      </div>
    </div>
  );
}

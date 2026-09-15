"use client";

import { useEffect, useMemo, useState } from "react";
import DeckGL from "@deck.gl/react";
import { PolygonLayer, ScatterplotLayer } from "@deck.gl/layers";

type ParcelRecord = {
  parcel_id: string;
  polygon: [number, number][];
  fill_color: [number, number, number, number];
  tooltip: string;
  is_leak: boolean;
};

type GisMeter = {
  meter_id: string;
  lat: number;
  lon: number;
  address: string | null;
  customer_name: string | null;
  parcel_id: string | null;
};

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const INITIAL_VIEW_STATE = {
  latitude: 41.7,
  longitude: -111.8,
  zoom: 12.5,
  pitch: 0,
  bearing: 0,
};

export default function MapClient() {
  const [threshold, setThreshold] = useState(10);
  const [parcels, setParcels] = useState<ParcelRecord[]>([]);
  const [extraParcels, setExtraParcels] = useState<ParcelRecord[]>([]);
  const [meters, setMeters] = useState<GisMeter[]>([]);
  const [viewState, setViewState] = useState(INITIAL_VIEW_STATE);
  const [error, setError] = useState<string | null>(null);
  const [hover, setHover] = useState<{ x: number; y: number; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [parcelsRes, metersRes] = await Promise.all([
          fetch(`${API_URL}/api/map/parcels?threshold=${threshold}`, { credentials: "include" }),
          fetch(`${API_URL}/api/map/meters`, { credentials: "include" }),
        ]);
        if (!parcelsRes.ok || !metersRes.ok) throw new Error("Failed to load map data");
        const parcelsData = await parcelsRes.json();
        const metersData = await metersRes.json();
        if (cancelled) return;
        setParcels(parcelsData.records);
        setExtraParcels(metersData.extra_parcels);
        setMeters(metersData.points);

        const coords: [number, number][] = [];
        for (const r of parcelsData.records as ParcelRecord[]) coords.push(...r.polygon);
        for (const m of metersData.points as GisMeter[]) coords.push([m.lon, m.lat]);
        if (coords.length) {
          const lons = coords.map((c) => c[0]);
          const lats = coords.map((c) => c[1]);
          const minLon = Math.min(...lons);
          const maxLon = Math.max(...lons);
          const minLat = Math.min(...lats);
          const maxLat = Math.max(...lats);
          setViewState({
            latitude: (minLat + maxLat) / 2,
            longitude: (minLon + maxLon) / 2,
            zoom: 12.5,
            pitch: 0,
            bearing: 0,
          });
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load map data");
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [threshold]);

  const layers = useMemo(() => {
    const allParcels = [...extraParcels, ...parcels];
    return [
      new PolygonLayer<ParcelRecord>({
        id: "parcels",
        data: allParcels,
        getPolygon: (d) => d.polygon,
        getFillColor: (d) => d.fill_color,
        getLineColor: [80, 80, 80, 150],
        filled: true,
        stroked: true,
        lineWidthMinPixels: 1,
        pickable: true,
        autoHighlight: true,
      }),
      new ScatterplotLayer<GisMeter>({
        id: "gis-meters",
        data: meters,
        getPosition: (d) => [d.lon, d.lat],
        getFillColor: [220, 20, 60, 200],
        getRadius: 6,
        radiusMinPixels: 3,
        radiusMaxPixels: 8,
        pickable: true,
        autoHighlight: true,
      }),
    ];
  }, [parcels, extraParcels, meters]);

  return (
    <div>
      <div className="mb-3 flex items-center gap-2 text-sm">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={threshold === 5}
            onChange={(e) => setThreshold(e.target.checked ? 5 : 10)}
          />
          Also flag smaller leaks (5+ gal/hr, instead of just 10+ gal/hr)
        </label>
      </div>

      {error && <div className="rounded border border-red-300 bg-red-50 text-red-800 p-4 mb-3">{error}</div>}

      <div className="relative w-full rounded border border-gray-200 bg-gray-100" style={{ height: 600 }}>
        <DeckGL
          viewState={viewState}
          onViewStateChange={(e) => setViewState(e.viewState as typeof INITIAL_VIEW_STATE)}
          controller
          layers={layers}
          onHover={(info) => {
            if (info.object) {
              const obj = info.object as ParcelRecord | GisMeter;
              const text =
                "tooltip" in obj
                  ? obj.tooltip
                  : `📍 ${obj.customer_name ?? "(no name on file)"} — meter ${obj.meter_id}`;
              setHover({ x: info.x, y: info.y, text });
            } else {
              setHover(null);
            }
          }}
        />
        {hover && (
          <div
            className="absolute pointer-events-none bg-black text-white text-xs px-2 py-1 rounded"
            style={{ left: hover.x + 10, top: hover.y + 10 }}
          >
            {hover.text}
          </div>
        )}
      </div>
      <p className="text-xs text-gray-400 mt-2">
        🟡🟠🔴 currently continuous &ge; {threshold} gal/hr this week (darker red = higher rate) &middot; 🔵
        no continuous leak this week (darker blue = GIS-survey-only parcel, no billing match) &middot; 🔴 dot
        = surveyed meter location from the utility&apos;s GIS survey
      </p>
    </div>
  );
}

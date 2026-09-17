"use client";

import { useEffect, useRef, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

type Neighbor = {
  miu_id: string;
  distance_ft: number;
  customer_name: string | null;
  address: string | null;
  lot_zone_label: string | null;
  window_avg: number | null;
};

type PopupState = {
  neighbor: Neighbor;
  x: number;
  y: number;
  loading: boolean;
  error: string | null;
  todayTotal: number | null;
};

function fmt(v: number | null) {
  return v === null || v === undefined ? "" : v.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

export default function NeighborsTable({ neighbors, miuId }: { neighbors: Neighbor[]; miuId: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [popup, setPopup] = useState<PopupState | null>(null);

  useEffect(() => {
    if (!popup) return;
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setPopup(null);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [popup]);

  async function showRowPopup(neighbor: Neighbor, clientX: number, clientY: number) {
    const rect = containerRef.current?.getBoundingClientRect();
    const x = rect ? Math.max(0, Math.min(clientX - rect.left, rect.width - 300)) : clientX;
    const y = rect ? clientY - rect.top : clientY;
    setPopup({ neighbor, x, y, loading: true, error: null, todayTotal: null });
    try {
      const res = await fetch(`${API_URL}/api/meters/${encodeURIComponent(neighbor.miu_id)}/usage?days=1`, {
        credentials: "include",
      });
      const usage: { gallons_used: number | null }[] = res.ok ? await res.json() : [];
      const todayTotal = usage.reduce((sum, p) => sum + (p.gallons_used ?? 0), 0);
      setPopup((prev) =>
        prev && prev.neighbor.miu_id === neighbor.miu_id ? { ...prev, loading: false, todayTotal } : prev
      );
    } catch {
      setPopup((prev) =>
        prev && prev.neighbor.miu_id === neighbor.miu_id
          ? { ...prev, loading: false, error: "Failed to load usage" }
          : prev
      );
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="overflow-x-auto mb-6">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-left border-b border-gray-300">
              <th className="py-2 pr-4">Distance (ft)</th>
              <th className="py-2 pr-4">Customer</th>
              <th className="py-2 pr-4">Address</th>
              <th className="py-2 pr-4">Lot zone</th>
              <th className="py-2 pr-4 text-right">Avg (gal/day)</th>
            </tr>
          </thead>
          <tbody>
            {neighbors.map((n) => {
              const isMe = n.miu_id === miuId;
              return (
                <tr
                  key={n.miu_id}
                  onClick={isMe ? undefined : (e) => showRowPopup(n, e.clientX, e.clientY)}
                  className={`border-b border-gray-100 ${isMe ? "bg-blue-50 font-semibold" : "hover:bg-gray-50 cursor-pointer"}`}
                >
                  <td className="py-1.5 pr-4">{n.distance_ft.toFixed(0)}</td>
                  <td className="py-1.5 pr-4">
                    {n.customer_name ?? ""}
                    {isMe && <span className="text-blue-600"> (this meter)</span>}
                  </td>
                  <td className="py-1.5 pr-4">{n.address ?? ""}</td>
                  <td className="py-1.5 pr-4 text-gray-500">{n.lot_zone_label ?? ""}</td>
                  <td className="py-1.5 pr-4 text-right">{fmt(n.window_avg)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {popup && (
        <div
          className="absolute z-10 w-72 rounded-lg border border-gray-300 bg-white text-sm shadow-lg"
          style={{ left: popup.x + 12, top: popup.y + 12 }}
        >
          <div className="flex items-center justify-between border-b border-gray-100 px-3 py-2">
            <span className="font-medium truncate">
              {popup.neighbor.customer_name || `Meter ${popup.neighbor.miu_id}`}
            </span>
            <button
              type="button"
              onClick={() => setPopup(null)}
              aria-label="Close"
              className="ml-2 text-gray-400 hover:text-gray-700"
            >
              &times;
            </button>
          </div>
          <div className="space-y-1 px-3 py-2">
            {popup.neighbor.address && <p className="text-gray-600">{popup.neighbor.address}</p>}
            <p className="text-gray-600">
              {popup.neighbor.distance_ft.toFixed(0)} ft away
              {popup.neighbor.lot_zone_label ? ` · ${popup.neighbor.lot_zone_label}` : ""}
            </p>
            {popup.loading && <p className="text-gray-400">Loading usage…</p>}
            {popup.error && <p className="text-red-600">{popup.error}</p>}
            {popup.todayTotal !== null && (
              <p className="text-gray-800">
                Today: <strong>{popup.todayTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })} gal</strong>
              </p>
            )}
            <a
              href={`${BASE_PATH}/meters/${popup.neighbor.miu_id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 inline-block text-blue-600 hover:underline"
            >
              Full details ↗
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

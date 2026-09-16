"use client";

import { useEffect, useRef, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

type Row = {
  account_number: string | null;
  customer_name: string | null;
  location: string | null;
  primary_phone: string | null;
  secondary_phone: string | null;
  email_address: string | null;
  meter_number: string | null;
  miu_id: string;
  cycle_route: string | null;
  meter_type: string | null;
  meter_size: string | null;
  lot_size_sqft: number | null;
  lot_zone_label: string | null;
};

type PopupState = {
  row: Row;
  x: number;
  y: number;
  loading: boolean;
  error: string | null;
  todayTotal: number | null;
};

export default function CustomerTable({ rows }: { rows: Row[] }) {
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

  async function showRowPopup(row: Row, clientX: number, clientY: number) {
    const rect = containerRef.current?.getBoundingClientRect();
    const x = rect ? Math.max(0, Math.min(clientX - rect.left, rect.width - 300)) : clientX;
    const y = rect ? clientY - rect.top : clientY;
    setPopup({ row, x, y, loading: true, error: null, todayTotal: null });
    try {
      const res = await fetch(`${API_URL}/api/meters/${encodeURIComponent(row.miu_id)}/usage?days=1`, {
        credentials: "include",
      });
      const usage: { gallons_used: number | null }[] = res.ok ? await res.json() : [];
      const todayTotal = usage.reduce((sum, p) => sum + (p.gallons_used ?? 0), 0);
      setPopup((prev) => (prev && prev.row.miu_id === row.miu_id ? { ...prev, loading: false, todayTotal } : prev));
    } catch {
      setPopup((prev) =>
        prev && prev.row.miu_id === row.miu_id
          ? { ...prev, loading: false, error: "Failed to load usage" }
          : prev
      );
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-left border-b border-gray-300">
              <th className="py-2 pr-4">Account</th>
              <th className="py-2 pr-4">Customer</th>
              <th className="py-2 pr-4">Address</th>
              <th className="py-2 pr-4">Phone</th>
              <th className="py-2 pr-4">Email</th>
              <th className="py-2 pr-4">Meter #</th>
              <th className="py-2 pr-4">Cycle route</th>
              <th className="py-2 pr-4">Lot zone</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.miu_id}
                onClick={(e) => showRowPopup(row, e.clientX, e.clientY)}
                className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer"
              >
                <td className="py-1.5 pr-4">{row.account_number}</td>
                <td className="py-1.5 pr-4">{row.customer_name ?? ""}</td>
                <td className="py-1.5 pr-4">{row.location ?? ""}</td>
                <td className="py-1.5 pr-4">{row.primary_phone ?? row.secondary_phone ?? ""}</td>
                <td className="py-1.5 pr-4">{row.email_address ?? ""}</td>
                <td className="py-1.5 pr-4">{row.meter_number}</td>
                <td className="py-1.5 pr-4 text-gray-500">{row.cycle_route ?? ""}</td>
                <td className="py-1.5 pr-4 text-gray-500">{row.lot_zone_label ?? ""}</td>
              </tr>
            ))}
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
              {popup.row.customer_name || `Meter ${popup.row.miu_id}`}
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
            {popup.row.location && <p className="text-gray-600">{popup.row.location}</p>}
            <p className="text-gray-600">
              Meter {popup.row.meter_number ?? popup.row.miu_id}
              {popup.row.account_number ? ` · Acct ${popup.row.account_number}` : ""}
            </p>
            {(popup.row.primary_phone ?? popup.row.secondary_phone) && (
              <p className="text-gray-600">{popup.row.primary_phone ?? popup.row.secondary_phone}</p>
            )}
            {popup.row.email_address && <p className="text-gray-600">{popup.row.email_address}</p>}
            {popup.row.lot_zone_label && <p className="text-gray-500">{popup.row.lot_zone_label}</p>}
            {popup.loading && <p className="text-gray-400">Loading usage…</p>}
            {popup.error && <p className="text-red-600">{popup.error}</p>}
            {popup.todayTotal !== null && (
              <p className="text-gray-800">
                Today: <strong>{popup.todayTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })} gal</strong>
              </p>
            )}
            <a
              href={`${BASE_PATH}/meters/${popup.row.miu_id}`}
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

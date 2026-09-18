"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

type LeaderboardRow = {
  miu_id: string;
  customer_name: string | null;
  location: string | null;
  account_number: string | null;
  meter_number: string | null;
  lot_zone_label: string | null;
  total_consumption: number | null;
  seven_day_avg: number | null;
  reading_count: number | null;
};

function formatNumber(value: number | null): string {
  if (value === null || value === undefined) return "";
  return value.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

// Readings is numeric, so its filter accepts an optional comparison operator
// (<, <=, >, >=) in front of the number -- e.g. "<=5" for the "which accounts
// barely reported this week" question that prompted this filter. A bare
// number without an operator matches exactly.
function parseNumericFilter(raw: string): ((n: number | null) => boolean) | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const match = trimmed.match(/^(<=|>=|<|>|=)?\s*(-?\d+(?:\.\d+)?)$/);
  if (!match) return null;
  const op = match[1] ?? "=";
  const value = parseFloat(match[2]);
  return (n) => {
    if (n === null || n === undefined) return false;
    switch (op) {
      case "<":
        return n < value;
      case "<=":
        return n <= value;
      case ">":
        return n > value;
      case ">=":
        return n >= value;
      default:
        return n === value;
    }
  };
}

function getZoneOptions(rows: LeaderboardRow[]): string[] {
  return Array.from(
    new Set(rows.map((r) => r.lot_zone_label).filter((z): z is string => Boolean(z)))
  ).sort();
}

const filterInputClass =
  "mt-1 w-full border border-gray-300 rounded px-1.5 py-0.5 text-xs font-normal";

export default function LeaderboardTable({ rows }: { rows: LeaderboardRow[] }) {
  const [customer, setCustomer] = useState("");
  const [address, setAddress] = useState("");
  const [readings, setReadings] = useState("");

  const zoneOptions = useMemo(() => getZoneOptions(rows), [rows]);
  const [selectedZones, setSelectedZones] = useState<Set<string>>(() => new Set(zoneOptions));
  const [zoneMenuOpen, setZoneMenuOpen] = useState(false);
  const zoneMenuRef = useRef<HTMLTableCellElement>(null);

  useEffect(() => {
    if (!zoneMenuOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (zoneMenuRef.current && !zoneMenuRef.current.contains(e.target as Node)) {
        setZoneMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [zoneMenuOpen]);

  function toggleZone(zone: string) {
    setSelectedZones((prev) => {
      const next = new Set(prev);
      if (next.has(zone)) next.delete(zone);
      else next.add(zone);
      return next;
    });
  }

  const allZonesSelected = selectedZones.size === zoneOptions.length;
  const zoneSummary = allZonesSelected
    ? "All zones"
    : selectedZones.size === 0
      ? "None selected"
      : `${selectedZones.size} of ${zoneOptions.length} selected`;

  const ranked = useMemo(() => rows.map((row, i) => ({ ...row, rank: i + 1 })), [rows]);

  const filtered = useMemo(() => {
    const customerNeedle = customer.trim().length >= 3 ? customer.trim().toLowerCase() : null;
    const addressNeedle = address.trim().length >= 3 ? address.trim().toLowerCase() : null;
    const readingsMatch = parseNumericFilter(readings);

    return ranked.filter((row) => {
      if (customerNeedle && !(row.customer_name ?? "").toLowerCase().includes(customerNeedle)) return false;
      if (addressNeedle && !(row.location ?? "").toLowerCase().includes(addressNeedle)) return false;
      if (!selectedZones.has(row.lot_zone_label ?? "")) return false;
      if (readingsMatch && !readingsMatch(row.reading_count)) return false;
      return true;
    });
  }, [ranked, customer, address, selectedZones, readings]);

  const hasFilters = Boolean(customer) || Boolean(address) || Boolean(readings) || !allZonesSelected;

  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-sm text-gray-500">
        <span>
          {filtered.length === ranked.length
            ? `${ranked.length} meters`
            : `${filtered.length} of ${ranked.length} meters`}
        </span>
        {hasFilters && (
          <button
            type="button"
            onClick={() => {
              setCustomer("");
              setAddress("");
              setReadings("");
              setSelectedZones(new Set(zoneOptions));
            }}
            className="text-gray-400 underline"
          >
            Clear filters
          </button>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-left border-b border-gray-300">
              <th className="py-2 pr-4">#</th>
              <th className="py-2 pr-4 align-top">
                Customer
                <input
                  type="text"
                  value={customer}
                  onChange={(e) => setCustomer(e.target.value)}
                  placeholder="3+ chars"
                  className={filterInputClass}
                />
              </th>
              <th className="py-2 pr-4 align-top">
                Address
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="3+ chars"
                  className={filterInputClass}
                />
              </th>
              <th className="py-2 pr-4 align-top relative" ref={zoneMenuRef}>
                Lot zone
                <button
                  type="button"
                  onClick={() => setZoneMenuOpen((o) => !o)}
                  className={`${filterInputClass} bg-white text-left truncate`}
                >
                  {zoneSummary}
                </button>
                {zoneMenuOpen && (
                  <div className="absolute z-10 mt-1 w-56 max-h-64 overflow-y-auto rounded border border-gray-300 bg-white shadow-lg p-2 text-xs font-normal">
                    <div className="flex justify-between mb-1 pb-1 border-b border-gray-100">
                      <button
                        type="button"
                        onClick={() => setSelectedZones(new Set(zoneOptions))}
                        className="text-blue-600 hover:underline"
                      >
                        All
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedZones(new Set())}
                        className="text-blue-600 hover:underline"
                      >
                        None
                      </button>
                    </div>
                    {zoneOptions.map((zone) => (
                      <label key={zone} className="flex items-center gap-1.5 py-0.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedZones.has(zone)}
                          onChange={() => toggleZone(zone)}
                        />
                        <span>{zone}</span>
                      </label>
                    ))}
                  </div>
                )}
              </th>
              <th className="py-2 pr-4 text-right">7-day total (gal)</th>
              <th className="py-2 pr-4 text-right">7-day avg (gal/day)</th>
              <th className="py-2 pr-4 text-right align-top">
                Readings
                <input
                  type="text"
                  value={readings}
                  onChange={(e) => setReadings(e.target.value)}
                  placeholder="e.g. <=5"
                  className={filterInputClass}
                />
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, 200).map((row) => (
              <tr key={row.miu_id} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="py-1.5 pr-4 text-gray-400">{row.rank}</td>
                <td className="py-1.5 pr-4">
                  <Link href={`/meters/${row.miu_id}`} className="text-blue-700 hover:underline">
                    {row.customer_name ?? "(no billing match)"}
                  </Link>
                </td>
                <td className="py-1.5 pr-4">{row.location ?? ""}</td>
                <td className="py-1.5 pr-4">{row.lot_zone_label ?? ""}</td>
                <td className="py-1.5 pr-4 text-right">{formatNumber(row.total_consumption)}</td>
                <td className="py-1.5 pr-4 text-right">{formatNumber(row.seven_day_avg)}</td>
                <td className="py-1.5 pr-4 text-right text-gray-400">{row.reading_count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {filtered.length > 200 && (
        <p className="text-xs text-gray-400 mt-2">Showing top 200 of {filtered.length}.</p>
      )}
    </div>
  );
}

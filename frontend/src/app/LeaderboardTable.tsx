"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

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

const filterInputClass =
  "mt-1 w-full border border-gray-300 rounded px-1.5 py-0.5 text-xs font-normal";

export default function LeaderboardTable({ rows }: { rows: LeaderboardRow[] }) {
  const [customer, setCustomer] = useState("");
  const [address, setAddress] = useState("");
  const [lotZone, setLotZone] = useState("");
  const [readings, setReadings] = useState("");

  const ranked = useMemo(() => rows.map((row, i) => ({ ...row, rank: i + 1 })), [rows]);

  const filtered = useMemo(() => {
    const customerNeedle = customer.trim().length >= 3 ? customer.trim().toLowerCase() : null;
    const addressNeedle = address.trim().length >= 3 ? address.trim().toLowerCase() : null;
    const lotZoneNeedle = lotZone.trim().length >= 3 ? lotZone.trim().toLowerCase() : null;
    const readingsMatch = parseNumericFilter(readings);

    return ranked.filter((row) => {
      if (customerNeedle && !(row.customer_name ?? "").toLowerCase().includes(customerNeedle)) return false;
      if (addressNeedle && !(row.location ?? "").toLowerCase().includes(addressNeedle)) return false;
      if (lotZoneNeedle && !(row.lot_zone_label ?? "").toLowerCase().includes(lotZoneNeedle)) return false;
      if (readingsMatch && !readingsMatch(row.reading_count)) return false;
      return true;
    });
  }, [ranked, customer, address, lotZone, readings]);

  const hasFilters = customer || address || lotZone || readings;

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
              setLotZone("");
              setReadings("");
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
              <th className="py-2 pr-4 align-top">
                Lot zone
                <input
                  type="text"
                  value={lotZone}
                  onChange={(e) => setLotZone(e.target.value)}
                  placeholder="3+ chars"
                  className={filterInputClass}
                />
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

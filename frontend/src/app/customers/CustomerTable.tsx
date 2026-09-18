"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

const NO_ZONE_LABEL = "No parcel match";

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

function zoneLabelOf(row: Row): string {
  return row.lot_zone_label ?? NO_ZONE_LABEL;
}

function getZoneOptions(rows: Row[]): string[] {
  return Array.from(new Set(rows.map(zoneLabelOf))).sort();
}

const filterInputClass =
  "mt-1 w-full border border-gray-300 rounded px-1.5 py-0.5 text-xs font-normal";

export default function CustomerTable({ rows }: { rows: Row[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [popup, setPopup] = useState<PopupState | null>(null);

  const [account, setAccount] = useState("");
  const [customer, setCustomer] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [meterNumber, setMeterNumber] = useState("");
  const [cycleRoute, setCycleRoute] = useState("");

  const zoneOptions = useMemo(() => getZoneOptions(rows), [rows]);
  const [selectedZones, setSelectedZones] = useState<Set<string>>(() => new Set(zoneOptions));
  const [zoneMenuOpen, setZoneMenuOpen] = useState(false);
  const zoneMenuRef = useRef<HTMLTableCellElement>(null);

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

  const filtered = useMemo(() => {
    const accountNeedle = account.trim().length >= 3 ? account.trim().toLowerCase() : null;
    const customerNeedle = customer.trim().length >= 3 ? customer.trim().toLowerCase() : null;
    const addressNeedle = address.trim().length >= 3 ? address.trim().toLowerCase() : null;
    const phoneNeedle = phone.trim().length >= 3 ? phone.trim().toLowerCase() : null;
    const emailNeedle = email.trim().length >= 3 ? email.trim().toLowerCase() : null;
    const meterNeedle = meterNumber.trim().length >= 3 ? meterNumber.trim().toLowerCase() : null;
    const cycleNeedle = cycleRoute.trim().length >= 3 ? cycleRoute.trim().toLowerCase() : null;

    return rows.filter((row) => {
      if (accountNeedle && !(row.account_number ?? "").toLowerCase().includes(accountNeedle)) return false;
      if (customerNeedle && !(row.customer_name ?? "").toLowerCase().includes(customerNeedle)) return false;
      if (addressNeedle && !(row.location ?? "").toLowerCase().includes(addressNeedle)) return false;
      if (
        phoneNeedle &&
        !`${row.primary_phone ?? ""} ${row.secondary_phone ?? ""}`.toLowerCase().includes(phoneNeedle)
      )
        return false;
      if (emailNeedle && !(row.email_address ?? "").toLowerCase().includes(emailNeedle)) return false;
      if (meterNeedle && !(row.meter_number ?? "").toLowerCase().includes(meterNeedle)) return false;
      if (cycleNeedle && !(row.cycle_route ?? "").toLowerCase().includes(cycleNeedle)) return false;
      if (!selectedZones.has(zoneLabelOf(row))) return false;
      return true;
    });
  }, [rows, account, customer, address, phone, email, meterNumber, cycleRoute, selectedZones]);

  const hasFilters =
    Boolean(account) ||
    Boolean(customer) ||
    Boolean(address) ||
    Boolean(phone) ||
    Boolean(email) ||
    Boolean(meterNumber) ||
    Boolean(cycleRoute) ||
    !allZonesSelected;

  function clearFilters() {
    setAccount("");
    setCustomer("");
    setAddress("");
    setPhone("");
    setEmail("");
    setMeterNumber("");
    setCycleRoute("");
    setSelectedZones(new Set(zoneOptions));
  }

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
      <div className="mb-2 flex items-center justify-between text-sm text-gray-500">
        <span>
          {filtered.length === rows.length
            ? `${rows.length} rows`
            : `${filtered.length} of ${rows.length} rows`}
        </span>
        {hasFilters && (
          <button type="button" onClick={clearFilters} className="text-gray-400 underline">
            Clear filters
          </button>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-left border-b border-gray-300">
              <th className="py-2 pr-4 align-top">
                Account
                <input
                  type="text"
                  value={account}
                  onChange={(e) => setAccount(e.target.value)}
                  placeholder="3+ chars"
                  className={filterInputClass}
                />
              </th>
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
                Phone
                <input
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="3+ chars"
                  className={filterInputClass}
                />
              </th>
              <th className="py-2 pr-4 align-top">
                Email
                <input
                  type="text"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="3+ chars"
                  className={filterInputClass}
                />
              </th>
              <th className="py-2 pr-4 align-top">
                Meter #
                <input
                  type="text"
                  value={meterNumber}
                  onChange={(e) => setMeterNumber(e.target.value)}
                  placeholder="3+ chars"
                  className={filterInputClass}
                />
              </th>
              <th className="py-2 pr-4 align-top">
                Cycle route
                <input
                  type="text"
                  value={cycleRoute}
                  onChange={(e) => setCycleRoute(e.target.value)}
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
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, 500).map((row) => (
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
                <td className="py-1.5 pr-4 text-gray-500">{zoneLabelOf(row)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {filtered.length > 500 && (
        <p className="text-xs text-gray-400 mt-2">Showing first 500 of {filtered.length} -- narrow with the filters above.</p>
      )}

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

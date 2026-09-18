"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

type Row = {
  miu_id: string;
  customer_name: string | null;
  address: string | null;
  primary_phone: string | null;
  secondary_phone: string | null;
  email_address: string | null;
  min_consumption: number | null;
  roll3_min_consumption: number | null;
  total_consumption: number | null;
  streak_start: string | null;
};

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

function fmt(v: number | null) {
  return v === null || v === undefined ? "" : v.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

function fmtDate(v: string | null) {
  return v ? new Date(v).toLocaleDateString() : "";
}

// Numeric columns accept an optional comparison operator (<, <=, >, >=) in
// front of the number -- e.g. ">=50" to find the worst offenders. A bare
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

type SendResult = {
  sent: { miu_id: string; email: string }[];
  skipped: { miu_id: string; reason: string }[];
  failed: { miu_id: string; email: string; error: string }[];
};

export default function ContinuousUsersTable({ rows, canSend }: { rows: Row[]; canSend: boolean }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showConfirm, setShowConfirm] = useState(false);
  const [preview, setPreview] = useState<{ subject: string; html: string; recipient_email: string | null } | null>(
    null
  );
  const [previewMiuId, setPreviewMiuId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<SendResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [customer, setCustomer] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [rawFloor, setRawFloor] = useState("");
  const [roll3Floor, setRoll3Floor] = useState("");
  const [total, setTotal] = useState("");
  const [since, setSince] = useState("");

  const ranked = useMemo(() => rows.map((row, i) => ({ ...row, rank: i + 1 })), [rows]);

  const filtered = useMemo(() => {
    const customerNeedle = customer.trim().length >= 3 ? customer.trim().toLowerCase() : null;
    const addressNeedle = address.trim().length >= 3 ? address.trim().toLowerCase() : null;
    const phoneNeedle = phone.trim().length >= 3 ? phone.trim().toLowerCase() : null;
    const emailNeedle = email.trim().length >= 3 ? email.trim().toLowerCase() : null;
    const sinceNeedle = since.trim().length >= 3 ? since.trim().toLowerCase() : null;
    const rawFloorMatch = parseNumericFilter(rawFloor);
    const roll3Match = parseNumericFilter(roll3Floor);
    const totalMatch = parseNumericFilter(total);

    return ranked.filter((row) => {
      if (customerNeedle && !(row.customer_name ?? "").toLowerCase().includes(customerNeedle)) return false;
      if (addressNeedle && !(row.address ?? "").toLowerCase().includes(addressNeedle)) return false;
      if (
        phoneNeedle &&
        !`${row.primary_phone ?? ""} ${row.secondary_phone ?? ""}`.toLowerCase().includes(phoneNeedle)
      )
        return false;
      if (emailNeedle && !(row.email_address ?? "").toLowerCase().includes(emailNeedle)) return false;
      if (rawFloorMatch && !rawFloorMatch(row.min_consumption)) return false;
      if (roll3Match && !roll3Match(row.roll3_min_consumption)) return false;
      if (totalMatch && !totalMatch(row.total_consumption)) return false;
      if (sinceNeedle && !fmtDate(row.streak_start).toLowerCase().includes(sinceNeedle)) return false;
      return true;
    });
  }, [ranked, customer, address, phone, email, rawFloor, roll3Floor, total, since]);

  const hasFilters =
    Boolean(customer) ||
    Boolean(address) ||
    Boolean(phone) ||
    Boolean(email) ||
    Boolean(rawFloor) ||
    Boolean(roll3Floor) ||
    Boolean(total) ||
    Boolean(since);

  function clearFilters() {
    setCustomer("");
    setAddress("");
    setPhone("");
    setEmail("");
    setRawFloor("");
    setRoll3Floor("");
    setTotal("");
    setSince("");
  }

  const sendable = filtered.filter((r) => !!r.email_address);
  const selectedRows = rows.filter((r) => selected.has(r.miu_id));
  const allSendableSelected = sendable.length > 0 && sendable.every((r) => selected.has(r.miu_id));

  function toggle(miuId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(miuId)) next.delete(miuId);
      else next.add(miuId);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) => {
      if (allSendableSelected) {
        const next = new Set(prev);
        for (const r of sendable) next.delete(r.miu_id);
        return next;
      }
      const next = new Set(prev);
      for (const r of sendable) next.add(r.miu_id);
      return next;
    });
  }

  async function openConfirm() {
    setError(null);
    setResult(null);
    setShowConfirm(true);
    const first = selectedRows[0];
    if (first) await loadPreview(first.miu_id);
  }

  async function loadPreview(miuId: string) {
    setPreviewMiuId(miuId);
    setPreview(null);
    try {
      const res = await fetch(`${API_URL}/api/notifications/preview`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ miu_id: miuId }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.detail ?? "Failed to load preview");
        return;
      }
      setPreview(await res.json());
    } catch {
      setError("Failed to reach the API");
    }
  }

  async function confirmSend() {
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/notifications/send`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ miu_ids: Array.from(selected) }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.detail ?? "Failed to send");
        return;
      }
      const data: SendResult = await res.json();
      setResult(data);
      setSelected(new Set());
    } catch {
      setError("Failed to reach the API");
    } finally {
      setSending(false);
    }
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-sm text-gray-500">
        <span>
          {filtered.length === ranked.length
            ? `${ranked.length} qualifying meters`
            : `${filtered.length} of ${ranked.length} qualifying meters`}
        </span>
        {hasFilters && (
          <button type="button" onClick={clearFilters} className="text-gray-400 underline">
            Clear filters
          </button>
        )}
      </div>

      {canSend && selected.size > 0 && (
        <div className="flex items-center gap-3 mb-3 text-sm bg-blue-50 border border-blue-200 rounded px-3 py-2">
          <span>{selected.size} selected</span>
          <button
            onClick={openConfirm}
            className="bg-gray-900 text-white rounded px-3 py-1.5 text-sm font-medium"
          >
            Send Leak Notice
          </button>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-left border-b border-gray-300">
              {canSend && (
                <th className="py-2 pr-2">
                  <input type="checkbox" checked={allSendableSelected} onChange={toggleAll} />
                </th>
              )}
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
              <th className="py-2 pr-4 text-right align-top">
                Raw floor (gal/hr)
                <input
                  type="text"
                  value={rawFloor}
                  onChange={(e) => setRawFloor(e.target.value)}
                  placeholder="e.g. >=50"
                  className={filterInputClass}
                />
              </th>
              <th className="py-2 pr-4 text-right align-top">
                3-hr rolling floor
                <input
                  type="text"
                  value={roll3Floor}
                  onChange={(e) => setRoll3Floor(e.target.value)}
                  placeholder="e.g. >=50"
                  className={filterInputClass}
                />
              </th>
              <th className="py-2 pr-4 text-right align-top">
                7-day total (gal)
                <input
                  type="text"
                  value={total}
                  onChange={(e) => setTotal(e.target.value)}
                  placeholder="e.g. >1000"
                  className={filterInputClass}
                />
              </th>
              <th className="py-2 pr-4 align-top">
                Continuous since
                <input
                  type="text"
                  value={since}
                  onChange={(e) => setSince(e.target.value)}
                  placeholder="3+ chars"
                  className={filterInputClass}
                />
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => (
              <tr key={row.miu_id} className="border-b border-gray-100 hover:bg-gray-50">
                {canSend && (
                  <td className="py-1.5 pr-2">
                    <input
                      type="checkbox"
                      disabled={!row.email_address}
                      checked={selected.has(row.miu_id)}
                      onChange={() => toggle(row.miu_id)}
                      title={row.email_address ? undefined : "No email address on file"}
                    />
                  </td>
                )}
                <td className="py-1.5 pr-4 text-gray-400">{row.rank}</td>
                <td className="py-1.5 pr-4">
                  <Link href={`/meters/${row.miu_id}`} className="text-blue-700 hover:underline">
                    {row.customer_name ?? "(no billing match)"}
                  </Link>
                </td>
                <td className="py-1.5 pr-4">{row.address ?? ""}</td>
                <td className="py-1.5 pr-4">{row.primary_phone ?? row.secondary_phone ?? ""}</td>
                <td className="py-1.5 pr-4">{row.email_address ?? ""}</td>
                <td className="py-1.5 pr-4 text-right">{fmt(row.min_consumption)}</td>
                <td className="py-1.5 pr-4 text-right font-medium">{fmt(row.roll3_min_consumption)}</td>
                <td className="py-1.5 pr-4 text-right">{fmt(row.total_consumption)}</td>
                <td className="py-1.5 pr-4 text-gray-500">{fmtDate(row.streak_start)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showConfirm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[85vh] overflow-y-auto p-6">
            {!result ? (
              <>
                <h2 className="text-lg font-semibold mb-1">Send leak notice to {selectedRows.length} residents?</h2>
                <p className="text-sm text-gray-500 mb-4">
                  Each resident gets their own copy with their name, address, and usage numbers merged in.
                </p>

                <ul className="text-sm mb-4 max-h-32 overflow-y-auto border border-gray-200 rounded divide-y">
                  {selectedRows.map((r) => (
                    <li key={r.miu_id} className="px-3 py-1.5 flex justify-between">
                      <span>{r.customer_name}</span>
                      <span className="text-gray-500">{r.email_address}</span>
                    </li>
                  ))}
                </ul>

                <div className="mb-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-sm font-medium">Preview:</span>
                    <select
                      value={previewMiuId ?? ""}
                      onChange={(e) => loadPreview(e.target.value)}
                      className="border border-gray-300 rounded px-2 py-1 text-sm"
                    >
                      {selectedRows.map((r) => (
                        <option key={r.miu_id} value={r.miu_id}>
                          {r.customer_name}
                        </option>
                      ))}
                    </select>
                  </div>
                  {preview ? (
                    <div className="border border-gray-200 rounded p-3 bg-gray-50">
                      <div className="text-sm font-medium mb-2">{preview.subject}</div>
                      <div
                        className="text-sm max-h-64 overflow-y-auto bg-white border border-gray-200 rounded p-3"
                        dangerouslySetInnerHTML={{ __html: preview.html }}
                      />
                    </div>
                  ) : (
                    <div className="text-sm text-gray-400">Loading preview...</div>
                  )}
                </div>

                {error && (
                  <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2 mb-4">
                    {error}
                  </div>
                )}

                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => setShowConfirm(false)}
                    className="px-3 py-2 text-sm rounded border border-gray-300"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={confirmSend}
                    disabled={sending}
                    className="px-3 py-2 text-sm rounded bg-gray-900 text-white font-medium disabled:opacity-50"
                  >
                    {sending ? "Sending..." : `Send to ${selectedRows.length}`}
                  </button>
                </div>
              </>
            ) : (
              <>
                <h2 className="text-lg font-semibold mb-3">Done</h2>
                <p className="text-sm mb-2">{result.sent.length} sent.</p>
                {result.skipped.length > 0 && (
                  <div className="text-sm text-yellow-800 bg-yellow-50 border border-yellow-200 rounded px-3 py-2 mb-2">
                    {result.skipped.length} skipped: {result.skipped.map((s) => `${s.miu_id} (${s.reason})`).join(", ")}
                  </div>
                )}
                {result.failed.length > 0 && (
                  <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2 mb-2">
                    {result.failed.length} failed: {result.failed.map((f) => `${f.email} (${f.error})`).join(", ")}
                  </div>
                )}
                <div className="flex justify-end mt-4">
                  <button
                    onClick={() => setShowConfirm(false)}
                    className="px-3 py-2 text-sm rounded bg-gray-900 text-white font-medium"
                  >
                    Close
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

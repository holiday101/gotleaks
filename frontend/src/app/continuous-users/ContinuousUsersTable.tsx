"use client";

import Link from "next/link";
import { useState } from "react";

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

  const sendable = rows.filter((r) => !!r.email_address);
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
    setSelected(() => {
      if (allSendableSelected) return new Set();
      return new Set(sendable.map((r) => r.miu_id));
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
              <th className="py-2 pr-4">Customer</th>
              <th className="py-2 pr-4">Address</th>
              <th className="py-2 pr-4">Phone</th>
              <th className="py-2 pr-4">Email</th>
              <th className="py-2 pr-4 text-right">Raw floor (gal/hr)</th>
              <th className="py-2 pr-4 text-right">3-hr rolling floor</th>
              <th className="py-2 pr-4 text-right">7-day total (gal)</th>
              <th className="py-2 pr-4">Continuous since</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
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
                <td className="py-1.5 pr-4 text-gray-400">{i + 1}</td>
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
                <td className="py-1.5 pr-4 text-gray-500">
                  {row.streak_start ? new Date(row.streak_start).toLocaleDateString() : ""}
                </td>
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

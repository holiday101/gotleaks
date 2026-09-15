"use client";

import { useEffect, useState, useCallback } from "react";

type Status = {
  allow_sync: boolean;
  calls_used?: number;
  daily_budget?: number;
  site_id?: string;
  row_counts?: { customers: number; water_usage_rows: number };
  backfill_progress?: { percent_complete: number; cursor: string } | null;
};

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

async function post(path: string, body?: object) {
  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail ?? "Request failed");
  return data;
}

export default function SyncClient() {
  const [status, setStatus] = useState<Status | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [days, setDays] = useState(3);
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 730);
    return d.toISOString().slice(0, 10);
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [actualOnly, setActualOnly] = useState(false);

  const loadStatus = useCallback(async () => {
    const res = await fetch(`${API_URL}/api/sync/status`, { credentials: "include" });
    if (res.ok) setStatus(await res.json());
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  async function run(fn: () => Promise<{ message: string }>) {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const { message } = await fn();
      setMessage(message);
      await loadStatus();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  if (status && !status.allow_sync) {
    return (
      <div className="rounded border border-yellow-300 bg-yellow-50 text-yellow-900 px-4 py-3 text-sm">
        🔒 Sync & Backfill is disabled on this machine. It only runs on the production server, so a
        local checkout can&apos;t silently spend Neptune API quota the server&apos;s own budget
        tracking doesn&apos;t know about. Set <code>NEPTUNE_ALLOW_SYNC=true</code> in <code>.env</code>{" "}
        if you really need to run it here.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      {status && (
        <div className="text-sm text-gray-600">
          <p>
            API calls used today: <strong>{status.calls_used}</strong> / {status.daily_budget} &middot; site{" "}
            {status.site_id}
          </p>
          <p>
            {status.row_counts?.customers} meters/accounts &middot; {status.row_counts?.water_usage_rows?.toLocaleString()}{" "}
            usage rows stored
          </p>
          {status.backfill_progress && (
            <p>
              Backfill in progress: {status.backfill_progress.percent_complete}% (resumes from{" "}
              {status.backfill_progress.cursor})
            </p>
          )}
        </div>
      )}

      {error && <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</div>}
      {message && (
        <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded px-3 py-2">{message}</div>
      )}

      <section>
        <h2 className="font-medium mb-1">1. Customers</h2>
        <p className="text-sm text-gray-500 mb-2">Pulls every meter/account record. Usually 1-2 API calls total.</p>
        <button
          disabled={busy}
          onClick={() =>
            run(async () => {
              const r = await post("/api/sync/customers");
              return { message: `Synced ${r.customers_synced} customer/meter records.` };
            })
          }
          className="bg-gray-900 text-white rounded px-3 py-2 text-sm disabled:opacity-50"
        >
          Sync Customers now
        </button>
      </section>

      <section>
        <h2 className="font-medium mb-1">2. Recent water usage (daily incremental sync)</h2>
        <p className="text-sm text-gray-500 mb-2">Pulls the last few days for every meter. Small -- safe to run daily.</p>
        <div className="flex items-center gap-2 mb-2">
          <label className="text-sm">Days back:</label>
          <input
            type="number"
            min={1}
            max={14}
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="border border-gray-300 rounded px-2 py-1 text-sm w-20"
          />
        </div>
        <button
          disabled={busy}
          onClick={() =>
            run(async () => {
              const r = await post("/api/sync/recent-usage", { days });
              return { message: `Wrote ${r.rows_written} usage rows.` };
            })
          }
          className="bg-gray-900 text-white rounded px-3 py-2 text-sm disabled:opacity-50"
        >
          Sync recent usage now
        </button>
      </section>

      <section>
        <h2 className="font-medium mb-1">3. Historical backfill (resumable)</h2>
        <p className="text-sm text-gray-500 mb-2">
          Consumption calls are capped at 7 days and 100 meters per call, so a full history pull can
          take many days of budget. This runs what it can today, saves its place, and picks up where
          it left off next time.
        </p>
        <div className="flex gap-3 mb-2 items-center flex-wrap text-sm">
          <label>
            From <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="border border-gray-300 rounded px-2 py-1 ml-1" />
          </label>
          <label>
            Through <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="border border-gray-300 rounded px-2 py-1 ml-1" />
          </label>
          <label>
            <input type="checkbox" checked={actualOnly} onChange={(e) => setActualOnly(e.target.checked)} className="mr-1" />
            Actual readings only (skip estimated consumption)
          </label>
        </div>
        <button
          disabled={busy}
          onClick={() =>
            run(async () => {
              const r = await post("/api/sync/backfill", { start_date: startDate, end_date: endDate, actual_only: actualOnly });
              return {
                message: `${r.status}: completed ${r.windows_completed_this_run} date windows, wrote ${r.rows_written_this_run} rows. Next cursor: ${r.next_cursor}.`,
              };
            })
          }
          className="bg-gray-900 text-white rounded px-3 py-2 text-sm disabled:opacity-50"
        >
          Run / resume backfill
        </button>
      </section>
    </div>
  );
}

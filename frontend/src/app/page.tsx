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

type LeaderboardResponse = {
  window: { window_start: string; window_end: string } | null;
  rows: LeaderboardRow[];
};

async function getLeaderboard(): Promise<LeaderboardResponse> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
  const res = await fetch(`${apiUrl}/api/usage/leaderboard`, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`API returned ${res.status}`);
  }
  return res.json();
}

function formatNumber(value: number | null): string {
  if (value === null || value === undefined) return "";
  return value.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

export default async function Home() {
  let data: LeaderboardResponse | null = null;
  let error: string | null = null;

  try {
    data = await getLeaderboard();
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to reach the API";
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="text-2xl font-semibold mb-1">Water Usage Leaderboard</h1>
      <p className="text-sm text-gray-500 mb-6">
        First end-to-end slice of the GotLeaks rebuild -- this page is rendered by
        Next.js, fetching live data from the FastAPI backend, which reads the same
        database the Streamlit app uses.
      </p>

      {error && (
        <div className="rounded border border-red-300 bg-red-50 text-red-800 p-4">
          Could not reach the API at {process.env.NEXT_PUBLIC_API_URL}: {error}
          <br />
          Make sure the backend is running (
          <code>cd backend && .venv/bin/python -m uvicorn main:app --reload --port 8000</code>
          ).
        </div>
      )}

      {data && data.window === null && (
        <div className="rounded border border-yellow-300 bg-yellow-50 text-yellow-800 p-4">
          No leak-status data computed yet -- run a sync in the Neptune app first.
        </div>
      )}

      {data && data.window && (
        <>
          <p className="text-sm text-gray-500 mb-4">
            Window: {data.window.window_start} &rarr; {data.window.window_end} &middot;{" "}
            {data.rows.length} meters
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="text-left border-b border-gray-300">
                  <th className="py-2 pr-4">#</th>
                  <th className="py-2 pr-4">Customer</th>
                  <th className="py-2 pr-4">Address</th>
                  <th className="py-2 pr-4">Lot zone</th>
                  <th className="py-2 pr-4 text-right">7-day total (gal)</th>
                  <th className="py-2 pr-4 text-right">7-day avg (gal/day)</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.slice(0, 50).map((row, i) => (
                  <tr key={row.miu_id} className="border-b border-gray-100">
                    <td className="py-1.5 pr-4 text-gray-400">{i + 1}</td>
                    <td className="py-1.5 pr-4">{row.customer_name ?? "(no billing match)"}</td>
                    <td className="py-1.5 pr-4">{row.location ?? ""}</td>
                    <td className="py-1.5 pr-4">{row.lot_zone_label ?? ""}</td>
                    <td className="py-1.5 pr-4 text-right">{formatNumber(row.total_consumption)}</td>
                    <td className="py-1.5 pr-4 text-right">{formatNumber(row.seven_day_avg)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </main>
  );
}

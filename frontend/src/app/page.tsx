import { getSession, hasRole, serverFetch, ApiError } from "@/lib/api";
import Locked from "@/components/Locked";
import LeaderboardTable from "./LeaderboardTable";

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

export default async function Home() {
  const session = await getSession();
  if (!hasRole(session, "viewer")) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-8">
        <Locked label="Water Usage" requiredRole="viewer" />
      </main>
    );
  }

  let data: LeaderboardResponse | null = null;
  let error: string | null = null;
  try {
    data = await serverFetch(`/api/usage/leaderboard`);
  } catch (e) {
    error = e instanceof ApiError ? e.message : "Failed to reach the API";
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="text-2xl font-semibold mb-1">Water Usage Leaderboard</h1>
      <p className="text-sm text-gray-500 mb-6">
        Every meter with usage in the trailing 7 days, ranked by total gallons. Click a row for its
        usage chart and nearby-meter comparison.
      </p>

      {error && (
        <div className="rounded border border-red-300 bg-red-50 text-red-800 p-4">
          Could not reach the API: {error}
        </div>
      )}

      {data && data.window === null && (
        <div className="rounded border border-yellow-300 bg-yellow-50 text-yellow-800 p-4">
          No leak-status data computed yet -- run a sync first.
        </div>
      )}

      {data && data.window && (
        <>
          <p className="text-sm text-gray-500 mb-4">
            Window: {data.window.window_start} &rarr; {data.window.window_end}
          </p>

          <LeaderboardTable rows={data.rows} />
        </>
      )}
    </main>
  );
}

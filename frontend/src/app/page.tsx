import Link from "next/link";
import { getSession, hasRole, serverFetch, ApiError } from "@/lib/api";
import Locked from "@/components/Locked";

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

function formatNumber(value: number | null): string {
  if (value === null || value === undefined) return "";
  return value.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ zone?: string | string[] }>;
}) {
  const session = await getSession();
  if (!hasRole(session, "viewer")) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-8">
        <Locked label="Water Usage" requiredRole="viewer" />
      </main>
    );
  }

  const params = await searchParams;
  const selectedZones = params.zone ? (Array.isArray(params.zone) ? params.zone : [params.zone]) : [];

  let data: LeaderboardResponse | null = null;
  let error: string | null = null;
  try {
    const qs = selectedZones.map((z) => `zone=${encodeURIComponent(z)}`).join("&");
    data = await serverFetch(`/api/usage/leaderboard${qs ? `?${qs}` : ""}`);
  } catch (e) {
    error = e instanceof ApiError ? e.message : "Failed to reach the API";
  }

  const allZones = Array.from(
    new Set((data?.rows ?? []).map((r) => r.lot_zone_label).filter((z): z is string => Boolean(z)))
  ).sort();

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
            Window: {data.window.window_start} &rarr; {data.window.window_end} &middot;{" "}
            {data.rows.length} meters
          </p>

          {allZones.length > 0 && (
            <div className="mb-4 flex flex-wrap gap-2 text-sm">
              {allZones.map((zone) => {
                const active = selectedZones.includes(zone);
                const next = active ? selectedZones.filter((z) => z !== zone) : [...selectedZones, zone];
                const qs = next.map((z) => `zone=${encodeURIComponent(z)}`).join("&");
                return (
                  <Link
                    key={zone}
                    href={qs ? `/?${qs}` : "/"}
                    className={`px-2 py-1 rounded border ${
                      active ? "bg-gray-900 text-white border-gray-900" : "border-gray-300 text-gray-600"
                    }`}
                  >
                    {zone}
                  </Link>
                );
              })}
              {selectedZones.length > 0 && (
                <Link href="/" className="px-2 py-1 text-gray-400 underline">
                  Clear
                </Link>
              )}
            </div>
          )}

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
                  <th className="py-2 pr-4 text-right">Readings</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.slice(0, 200).map((row, i) => (
                  <tr key={row.miu_id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-1.5 pr-4 text-gray-400">{i + 1}</td>
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
          {data.rows.length > 200 && (
            <p className="text-xs text-gray-400 mt-2">Showing top 200 of {data.rows.length}.</p>
          )}
        </>
      )}
    </main>
  );
}

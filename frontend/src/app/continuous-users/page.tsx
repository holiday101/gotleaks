import Link from "next/link";
import { getSession, hasRole, serverFetch, ApiError } from "@/lib/api";
import Locked from "@/components/Locked";

type Row = {
  miu_id: string;
  customer_name: string | null;
  address: string | null;
  account_number: string | null;
  primary_phone: string | null;
  secondary_phone: string | null;
  email_address: string | null;
  min_consumption: number | null;
  roll3_min_consumption: number | null;
  total_consumption: number | null;
  streak_start: string | null;
};

type Response = {
  window: { window_start: string; window_end: string } | null;
  rows: Row[];
};

function fmt(v: number | null) {
  return v === null || v === undefined ? "" : v.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

export default async function ContinuousUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ min_gph?: string; sort_by?: string }>;
}) {
  const session = await getSession();
  if (!hasRole(session, "viewer")) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-8">
        <Locked label="Continuous Users" requiredRole="viewer" />
      </main>
    );
  }

  const params = await searchParams;
  const minGph = params.min_gph ?? "10";
  const sortBy = params.sort_by === "roll3_min_consumption" ? "roll3_min_consumption" : "min_consumption";

  let data: Response | null = null;
  let error: string | null = null;
  try {
    data = await serverFetch(`/api/continuous-users?min_gph=${minGph}&sort_by=${sortBy}`);
  } catch (e) {
    error = e instanceof ApiError ? e.message : "Failed to reach the API";
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="text-2xl font-semibold mb-1">🚰 Continuous Users</h1>
      <p className="text-sm text-gray-500 mb-6">
        Meters with nonstop nonzero flow across the trailing week -- a conservative floor on leak
        rate. Toggle between the raw lowest-hourly reading and the 3-hour rolling floor, which
        absorbs single-hour meter-reporting glitches.
      </p>

      <div className="flex gap-2 mb-4 text-sm items-center flex-wrap">
        <span className="text-gray-500">Threshold:</span>
        {["5", "10"].map((v) => (
          <Link
            key={v}
            href={`/continuous-users?min_gph=${v}&sort_by=${sortBy}`}
            className={`px-2 py-1 rounded border ${
              minGph === v ? "bg-gray-900 text-white border-gray-900" : "border-gray-300 text-gray-600"
            }`}
          >
            {v}+ gal/hr
          </Link>
        ))}
        <span className="text-gray-500 ml-4">Sort by:</span>
        {[
          { key: "min_consumption", label: "Raw floor" },
          { key: "roll3_min_consumption", label: "3-hr rolling floor" },
        ].map((opt) => (
          <Link
            key={opt.key}
            href={`/continuous-users?min_gph=${minGph}&sort_by=${opt.key}`}
            className={`px-2 py-1 rounded border ${
              sortBy === opt.key ? "bg-gray-900 text-white border-gray-900" : "border-gray-300 text-gray-600"
            }`}
          >
            {opt.label}
          </Link>
        ))}
      </div>

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
          <p className="text-sm text-gray-500 mb-4">{data.rows.length} qualifying meters</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="text-left border-b border-gray-300">
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
                {data.rows.map((row, i) => (
                  <tr key={row.miu_id} className="border-b border-gray-100 hover:bg-gray-50">
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
        </>
      )}
    </main>
  );
}

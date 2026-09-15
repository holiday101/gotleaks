import { getSession, hasRole, serverFetch, ApiError } from "@/lib/api";
import Locked from "@/components/Locked";
import UsageChart from "@/components/UsageChart";

type UsagePoint = { reading_date: string; gallons_used: number | null };
type Neighbor = {
  miu_id: string;
  distance_ft: number;
  customer_name: string | null;
  address: string | null;
  lot_zone_label: string | null;
  seven_day_avg: number | null;
};
type Neighbors = {
  my_seven_day_avg: number | null;
  neighborhood_avg: number | null;
  neighbors: Neighbor[];
};

function fmt(v: number | null) {
  return v === null || v === undefined ? "" : v.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

export default async function MeterDetailPage({ params }: { params: Promise<{ miu_id: string }> }) {
  const session = await getSession();
  if (!hasRole(session, "viewer")) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-8">
        <Locked label="Meter detail" requiredRole="viewer" />
      </main>
    );
  }

  const { miu_id } = await params;

  let usage: UsagePoint[] | null = null;
  let usageError: string | null = null;
  try {
    usage = await serverFetch(`/api/meters/${encodeURIComponent(miu_id)}/usage`);
  } catch (e) {
    usageError = e instanceof ApiError ? e.message : "Failed to load usage";
  }

  let neighbors: Neighbors | null = null;
  let neighborsError: string | null = null;
  try {
    neighbors = await serverFetch(`/api/meters/${encodeURIComponent(miu_id)}/neighbors?n=10`);
  } catch (e) {
    neighborsError = e instanceof ApiError ? e.message : "Failed to load neighbors";
  }

  const ratio =
    neighbors?.my_seven_day_avg && neighbors?.neighborhood_avg
      ? neighbors.my_seven_day_avg / neighbors.neighborhood_avg
      : null;

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="text-2xl font-semibold mb-1">Meter {miu_id}</h1>
      <p className="text-sm text-gray-500 mb-6">Hourly usage and comparison to nearby meters.</p>

      <section className="mb-8">
        <h2 className="text-lg font-medium mb-2">Usage history</h2>
        {usageError && (
          <div className="rounded border border-red-300 bg-red-50 text-red-800 p-4 text-sm">{usageError}</div>
        )}
        {usage && <UsageChart data={usage} />}
      </section>

      <section>
        <h2 className="text-lg font-medium mb-2">Compare to nearby meters</h2>
        {neighborsError && (
          <div className="rounded border border-yellow-300 bg-yellow-50 text-yellow-800 p-4 text-sm">
            {neighborsError}
          </div>
        )}
        {neighbors && (
          <>
            <p className="text-sm mb-4">
              This meter averaged <strong>{fmt(neighbors.my_seven_day_avg)} gal/day</strong> this week vs a{" "}
              <strong>{fmt(neighbors.neighborhood_avg)} gal/day</strong> average among its 10 nearest meters
              {ratio !== null && (
                <>
                  {" "}
                  -- about <strong>{ratio.toFixed(1)}x</strong> {ratio >= 1 ? "higher" : "lower"}.
                </>
              )}
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="text-left border-b border-gray-300">
                    <th className="py-2 pr-4">Distance (ft)</th>
                    <th className="py-2 pr-4">Customer</th>
                    <th className="py-2 pr-4">Address</th>
                    <th className="py-2 pr-4">Lot zone</th>
                    <th className="py-2 pr-4 text-right">7-day avg (gal/day)</th>
                  </tr>
                </thead>
                <tbody>
                  {neighbors.neighbors.map((n) => (
                    <tr key={n.miu_id} className="border-b border-gray-100">
                      <td className="py-1.5 pr-4">{n.distance_ft.toFixed(0)}</td>
                      <td className="py-1.5 pr-4">{n.customer_name ?? ""}</td>
                      <td className="py-1.5 pr-4">{n.address ?? ""}</td>
                      <td className="py-1.5 pr-4 text-gray-500">{n.lot_zone_label ?? ""}</td>
                      <td className="py-1.5 pr-4 text-right">{fmt(n.seven_day_avg)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </main>
  );
}

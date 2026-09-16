import Link from "next/link";
import { getSession, hasRole, serverFetch, ApiError } from "@/lib/api";
import Locked from "@/components/Locked";
import UsageChart from "@/components/UsageChart";

type UsagePoint = { reading_date: string; gallons_used: number | null };
type MeterInfo = {
  customer_name: string | null;
  location: string | null;
  account_number: string | null;
  meter_number: string | null;
};
type Neighbor = {
  miu_id: string;
  distance_ft: number;
  customer_name: string | null;
  address: string | null;
  lot_zone_label: string | null;
  window_avg: number | null;
};
type Neighbors = {
  days: number;
  my_avg: number | null;
  neighborhood_avg: number | null;
  neighbors: Neighbor[];
};

// "Today" is the default -- a meter's page opens on its most recent day of
// hourly readings, not a week-plus of data crammed into one chart.
const VIEWS: { key: string; label: string; days: number | null }[] = [
  { key: "1", label: "Today", days: 1 },
  { key: "7", label: "Last 7", days: 7 },
  { key: "30", label: "Month", days: 30 },
  { key: "365", label: "Year", days: 365 },
  { key: "all", label: "All", days: null },
];

function fmt(v: number | null) {
  return v === null || v === undefined ? "" : v.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

// Local-calendar-day arithmetic on a "YYYY-MM-DD" string -- avoids the
// UTC-shift bugs that new Date(s).toISOString() would introduce for dates
// near a timezone boundary.
function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d + days);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

function formatShortDate(dateStr: string) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default async function MeterDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ miu_id: string }>;
  searchParams: Promise<{ view?: string; compare?: string; date?: string }>;
}) {
  const session = await getSession();
  if (!hasRole(session, "viewer")) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-8">
        <Locked label="Meter detail" requiredRole="viewer" />
      </main>
    );
  }

  const { miu_id } = await params;
  const sp = await searchParams;
  const view = VIEWS.find((v) => v.key === sp.view) ?? VIEWS[0];
  const compareWindow = sp.compare === "month" ? "month" : "week";
  const compareDays = compareWindow === "month" ? 30 : 7;
  const compareQuery = sp.compare ? `&compare=${sp.compare}` : "";

  // An explicit `date` anchors the usage window to a specific calendar day
  // (set by Prev/Next or by clicking a bar in a multi-day view) instead of
  // the meter's most recent reading -- validated since it round-trips
  // through a URL.
  const explicitDate = sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : undefined;

  let info: MeterInfo | null = null;
  try {
    info = await serverFetch(`/api/meters/${encodeURIComponent(miu_id)}/info`);
  } catch {
    // Header falls back to just the meter ID if there's no billing match.
  }

  let usage: UsagePoint[] | null = null;
  let usageError: string | null = null;
  try {
    let qs: string;
    if (view.days === null) {
      qs = "all=true";
    } else if (explicitDate) {
      const untilDay = addDays(explicitDate, 1);
      const sinceDay = addDays(explicitDate, 1 - view.days);
      qs = `since=${encodeURIComponent(`${sinceDay}T00:00:00`)}&until=${encodeURIComponent(`${untilDay}T00:00:00`)}`;
    } else {
      qs = `days=${view.days}`;
    }
    usage = await serverFetch(`/api/meters/${encodeURIComponent(miu_id)}/usage?${qs}`);
  } catch (e) {
    usageError = e instanceof ApiError ? e.message : "Failed to load usage";
  }

  // The window actually returned (its last reading's calendar day) --
  // drives Prev/Next even on the initial, un-dated load, which anchors to
  // the meter's own latest reading rather than an explicit date.
  const windowEndDate = usage && usage.length > 0 ? usage[usage.length - 1].reading_date.slice(0, 10) : explicitDate;
  const prevDate = windowEndDate && view.days !== null ? addDays(windowEndDate, -view.days) : null;
  const nextDate = windowEndDate && view.days !== null ? addDays(windowEndDate, view.days) : null;
  const rangeLabel =
    windowEndDate && view.days !== null
      ? view.days === 1
        ? formatShortDate(windowEndDate)
        : `${formatShortDate(addDays(windowEndDate, 1 - view.days))} – ${formatShortDate(windowEndDate)}`
      : null;

  let neighbors: Neighbors | null = null;
  let neighborsError: string | null = null;
  try {
    neighbors = await serverFetch(
      `/api/meters/${encodeURIComponent(miu_id)}/neighbors?n=10&days=${compareDays}`
    );
  } catch (e) {
    neighborsError = e instanceof ApiError ? e.message : "Failed to load neighbors";
  }

  const ratio = neighbors?.my_avg && neighbors?.neighborhood_avg ? neighbors.my_avg / neighbors.neighborhood_avg : null;

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="text-2xl font-semibold mb-1">
        {info?.customer_name ? info.customer_name : `Meter ${miu_id}`}
      </h1>
      <p className="text-sm text-gray-500 mb-6">
        {info?.customer_name && <>Meter {miu_id}{info.location ? ` -- ${info.location}` : ""} -- </>}
        Hourly usage and comparison to nearby meters.
      </p>

      <section className="mb-8">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
          <h2 className="text-lg font-medium">Usage history</h2>
          <div className="flex gap-2 text-sm">
            {VIEWS.map((v) => (
              <Link
                key={v.key}
                href={`/meters/${miu_id}?view=${v.key}${explicitDate ? `&date=${explicitDate}` : ""}${compareQuery}`}
                className={`px-2 py-1 rounded border ${
                  view.key === v.key ? "bg-gray-900 text-white border-gray-900" : "border-gray-300 text-gray-600"
                }`}
              >
                {v.label}
              </Link>
            ))}
          </div>
        </div>
        {rangeLabel && (
          <div className="flex items-center justify-center gap-4 mb-2 text-sm">
            {prevDate ? (
              <Link
                href={`/meters/${miu_id}?view=${view.key}&date=${prevDate}${compareQuery}`}
                className="text-gray-500 hover:text-gray-900"
              >
                &lsaquo; Prev
              </Link>
            ) : (
              <span className="text-gray-300">&lsaquo; Prev</span>
            )}
            <span className="text-gray-700 font-medium">{rangeLabel}</span>
            {explicitDate && nextDate ? (
              <Link
                href={`/meters/${miu_id}?view=${view.key}&date=${nextDate}${compareQuery}`}
                className="text-gray-500 hover:text-gray-900"
              >
                Next &rsaquo;
              </Link>
            ) : (
              <span className="text-gray-300">Next &rsaquo;</span>
            )}
          </div>
        )}
        {usageError && (
          <div className="rounded border border-red-300 bg-red-50 text-red-800 p-4 text-sm">{usageError}</div>
        )}
        {usage && <UsageChart data={usage} miuId={miu_id} compareQuery={compareQuery} />}
      </section>

      <section>
        <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
          <h2 className="text-lg font-medium">Compare to nearby meters</h2>
          <div className="flex gap-2 text-sm">
            {(["week", "month"] as const).map((w) => (
              <Link
                key={w}
                href={`/meters/${miu_id}?view=${view.key}&compare=${w}`}
                className={`px-2 py-1 rounded border ${
                  compareWindow === w ? "bg-gray-900 text-white border-gray-900" : "border-gray-300 text-gray-600"
                }`}
              >
                Last {w}
              </Link>
            ))}
          </div>
        </div>
        {neighborsError && (
          <div className="rounded border border-yellow-300 bg-yellow-50 text-yellow-800 p-4 text-sm">
            {neighborsError}
          </div>
        )}
        {neighbors && (
          <>
            <p className="text-sm mb-4">
              This meter averaged <strong>{fmt(neighbors.my_avg)} gal/day</strong> over the last {compareWindow} vs a{" "}
              <strong>{fmt(neighbors.neighborhood_avg)} gal/day</strong> average among its 10 nearest meters
              {ratio !== null && (
                <>
                  {" "}
                  -- about <strong>{ratio.toFixed(1)}x</strong> {ratio >= 1 ? "higher" : "lower"}.
                </>
              )}
            </p>
            <div className="overflow-x-auto mb-6">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="text-left border-b border-gray-300">
                    <th className="py-2 pr-4">Distance (ft)</th>
                    <th className="py-2 pr-4">Customer</th>
                    <th className="py-2 pr-4">Address</th>
                    <th className="py-2 pr-4">Lot zone</th>
                    <th className="py-2 pr-4 text-right">Avg (gal/day)</th>
                  </tr>
                </thead>
                <tbody>
                  {neighbors.neighbors.map((n) => (
                    <tr key={n.miu_id} className="border-b border-gray-100">
                      <td className="py-1.5 pr-4">{n.distance_ft.toFixed(0)}</td>
                      <td className="py-1.5 pr-4">{n.customer_name ?? ""}</td>
                      <td className="py-1.5 pr-4">{n.address ?? ""}</td>
                      <td className="py-1.5 pr-4 text-gray-500">{n.lot_zone_label ?? ""}</td>
                      <td className="py-1.5 pr-4 text-right">{fmt(n.window_avg)}</td>
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

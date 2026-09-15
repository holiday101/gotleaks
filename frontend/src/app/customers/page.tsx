import { getSession, hasRole, serverFetch, ApiError } from "@/lib/api";
import Locked from "@/components/Locked";

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

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const session = await getSession();
  if (!hasRole(session, "viewer")) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-8">
        <Locked label="Customers" requiredRole="viewer" />
      </main>
    );
  }

  const params = await searchParams;
  const q = params.q ?? "";

  let rows: Row[] = [];
  let error: string | null = null;
  try {
    const data = await serverFetch(`/api/customers${q ? `?q=${encodeURIComponent(q)}` : ""}`);
    rows = data.rows;
  } catch (e) {
    error = e instanceof ApiError ? e.message : "Failed to reach the API";
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="text-2xl font-semibold mb-1">Customers</h1>
      <p className="text-sm text-gray-500 mb-6">
        Meter/account data from Neptune, joined with name/address/phone/email from the billing
        system and lot-size zone.
      </p>

      <form className="mb-4" action="/customers">
        <input
          type="text"
          name="q"
          defaultValue={q}
          placeholder="Filter by name, account number, address, meter number, or cycle route"
          className="border border-gray-300 rounded px-3 py-2 text-sm w-full max-w-xl"
        />
      </form>

      {error && (
        <div className="rounded border border-red-300 bg-red-50 text-red-800 p-4">
          Could not reach the API: {error}
        </div>
      )}

      {!error && (
        <>
          <p className="text-sm text-gray-500 mb-4">{rows.length} rows</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="text-left border-b border-gray-300">
                  <th className="py-2 pr-4">Account</th>
                  <th className="py-2 pr-4">Customer</th>
                  <th className="py-2 pr-4">Address</th>
                  <th className="py-2 pr-4">Phone</th>
                  <th className="py-2 pr-4">Email</th>
                  <th className="py-2 pr-4">Meter #</th>
                  <th className="py-2 pr-4">Cycle route</th>
                  <th className="py-2 pr-4">Lot zone</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 500).map((row) => (
                  <tr key={row.miu_id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-1.5 pr-4">{row.account_number}</td>
                    <td className="py-1.5 pr-4">{row.customer_name ?? ""}</td>
                    <td className="py-1.5 pr-4">{row.location ?? ""}</td>
                    <td className="py-1.5 pr-4">{row.primary_phone ?? row.secondary_phone ?? ""}</td>
                    <td className="py-1.5 pr-4">{row.email_address ?? ""}</td>
                    <td className="py-1.5 pr-4">{row.meter_number}</td>
                    <td className="py-1.5 pr-4 text-gray-500">{row.cycle_route ?? ""}</td>
                    <td className="py-1.5 pr-4 text-gray-500">{row.lot_zone_label ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rows.length > 500 && (
            <p className="text-xs text-gray-400 mt-2">Showing first 500 of {rows.length} -- narrow with the filter above.</p>
          )}
        </>
      )}
    </main>
  );
}

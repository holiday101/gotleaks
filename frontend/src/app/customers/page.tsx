import { getSession, hasRole, serverFetch, ApiError } from "@/lib/api";
import Locked from "@/components/Locked";
import CustomerTable from "./CustomerTable";

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

      <form className="mb-4" action={`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/customers`}>
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
          <CustomerTable rows={rows.slice(0, 500)} />
          {rows.length > 500 && (
            <p className="text-xs text-gray-400 mt-2">Showing first 500 of {rows.length} -- narrow with the filter above.</p>
          )}
        </>
      )}
    </main>
  );
}

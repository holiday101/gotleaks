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

export default async function CustomersPage() {
  const session = await getSession();
  if (!hasRole(session, "viewer")) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-8">
        <Locked label="Customers" requiredRole="viewer" />
      </main>
    );
  }

  let rows: Row[] = [];
  let error: string | null = null;
  try {
    const data = await serverFetch(`/api/customers`);
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

      {error && (
        <div className="rounded border border-red-300 bg-red-50 text-red-800 p-4">
          Could not reach the API: {error}
        </div>
      )}

      {!error && <CustomerTable rows={rows} />}
    </main>
  );
}

"use client";

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

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

export default function CustomerRow({ row }: { row: Row }) {
  const openMeter = () => {
    window.open(`${BASE_PATH}/meters/${row.miu_id}`, "_blank", "noopener,noreferrer");
  };

  return (
    <tr
      onClick={openMeter}
      className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer"
    >
      <td className="py-1.5 pr-4">{row.account_number}</td>
      <td className="py-1.5 pr-4">{row.customer_name ?? ""}</td>
      <td className="py-1.5 pr-4">{row.location ?? ""}</td>
      <td className="py-1.5 pr-4">{row.primary_phone ?? row.secondary_phone ?? ""}</td>
      <td className="py-1.5 pr-4">{row.email_address ?? ""}</td>
      <td className="py-1.5 pr-4">{row.meter_number}</td>
      <td className="py-1.5 pr-4 text-gray-500">{row.cycle_route ?? ""}</td>
      <td className="py-1.5 pr-4 text-gray-500">{row.lot_zone_label ?? ""}</td>
    </tr>
  );
}

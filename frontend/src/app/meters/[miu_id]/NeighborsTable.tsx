"use client";

import { useRouter } from "next/navigation";

type Neighbor = {
  miu_id: string;
  distance_ft: number;
  customer_name: string | null;
  address: string | null;
  lot_zone_label: string | null;
  window_avg: number | null;
};

function fmt(v: number | null) {
  return v === null || v === undefined ? "" : v.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

// Clicking a neighbor re-centers this same page on them -- their usage
// chart, zone rank, and own nearby-meters list -- rather than popping up a
// preview or leaving the page via a new-tab link.
export default function NeighborsTable({ neighbors, miuId }: { neighbors: Neighbor[]; miuId: string }) {
  const router = useRouter();

  return (
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
          {neighbors.map((n) => {
            const isMe = n.miu_id === miuId;
            return (
              <tr
                key={n.miu_id}
                onClick={isMe ? undefined : () => router.push(`/meters/${n.miu_id}`)}
                className={`border-b border-gray-100 ${isMe ? "bg-blue-50 font-semibold" : "hover:bg-gray-50 cursor-pointer"}`}
              >
                <td className="py-1.5 pr-4">{n.distance_ft.toFixed(0)}</td>
                <td className="py-1.5 pr-4">
                  {n.customer_name ?? ""}
                  {isMe && <span className="text-blue-600"> (this meter)</span>}
                </td>
                <td className="py-1.5 pr-4">{n.address ?? ""}</td>
                <td className="py-1.5 pr-4 text-gray-500">{n.lot_zone_label ?? ""}</td>
                <td className="py-1.5 pr-4 text-right">{fmt(n.window_avg)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

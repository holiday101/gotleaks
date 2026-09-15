"use client";

type Point = { reading_date: string; gallons_used: number | null };

// Lightweight inline-SVG line chart -- no charting library dependency.
// Deliberately simple: this is an hourly usage trace, not a general-purpose
// chart component, so it only needs to do one thing well.
export default function UsageChart({ data }: { data: Point[] }) {
  const clean = data.filter((d) => d.gallons_used !== null) as { reading_date: string; gallons_used: number }[];
  if (clean.length < 2) {
    return <p className="text-sm text-gray-400">Not enough data to chart.</p>;
  }

  const width = 800;
  const height = 220;
  const padding = { top: 10, right: 10, bottom: 24, left: 44 };
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;

  const values = clean.map((d) => d.gallons_used);
  const maxV = Math.max(...values, 1);
  const minV = Math.min(...values, 0);
  const n = clean.length;

  const x = (i: number) => padding.left + (i / (n - 1)) * innerW;
  const y = (v: number) => padding.top + innerH - ((v - minV) / (maxV - minV || 1)) * innerH;

  const path = clean.map((d, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(d.gallons_used).toFixed(1)}`).join(" ");

  const firstDate = new Date(clean[0].reading_date);
  const lastDate = new Date(clean[n - 1].reading_date);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto">
      <line x1={padding.left} y1={padding.top} x2={padding.left} y2={height - padding.bottom} stroke="#e5e7eb" />
      <line
        x1={padding.left}
        y1={height - padding.bottom}
        x2={width - padding.right}
        y2={height - padding.bottom}
        stroke="#e5e7eb"
      />
      <text x={4} y={padding.top + 4} fontSize="10" fill="#9ca3af">
        {maxV.toLocaleString(undefined, { maximumFractionDigits: 0 })}
      </text>
      <text x={4} y={height - padding.bottom} fontSize="10" fill="#9ca3af">
        {minV.toLocaleString(undefined, { maximumFractionDigits: 0 })}
      </text>
      <path d={path} fill="none" stroke="#2563eb" strokeWidth={1.5} />
      <text x={padding.left} y={height - 4} fontSize="10" fill="#9ca3af">
        {firstDate.toLocaleDateString()}
      </text>
      <text x={width - padding.right} y={height - 4} fontSize="10" fill="#9ca3af" textAnchor="end">
        {lastDate.toLocaleDateString()}
      </text>
    </svg>
  );
}

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
  const height = 260;
  const padding = { top: 16, right: 16, bottom: 28, left: 52 };
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;

  const values = clean.map((d) => d.gallons_used);
  const maxV = Math.max(...values, 1);
  const minV = Math.min(...values, 0);
  const n = clean.length;

  const x = (i: number) => padding.left + (i / (n - 1)) * innerW;
  const y = (v: number) => padding.top + innerH - ((v - minV) / (maxV - minV || 1)) * innerH;

  const path = clean.map((d, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(d.gallons_used).toFixed(1)}`).join(" ");

  // 4 horizontal gridlines (min through max) so a value can be read
  // without hovering -- there's no tooltip in this lightweight chart.
  const yTickCount = 4;
  const yTicks = Array.from({ length: yTickCount + 1 }, (_, i) => minV + ((maxV - minV) * i) / yTickCount);

  // Up to 6 evenly spaced date labels along the x-axis, not just the
  // endpoints -- with hundreds/thousands of hourly points, two labels
  // give no sense of scale or where a spike happened.
  const xTickCount = Math.min(6, n - 1);
  const xTickIdx = Array.from({ length: xTickCount + 1 }, (_, i) => Math.round((i / xTickCount) * (n - 1)));
  const uniqueXTickIdx = Array.from(new Set(xTickIdx));

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto">
      {yTicks.map((v, i) => {
        const yy = y(v);
        return (
          <g key={i}>
            <line x1={padding.left} y1={yy} x2={width - padding.right} y2={yy} stroke="#f1f5f9" />
            <text x={padding.left - 6} y={yy + 3} fontSize="10" fill="#9ca3af" textAnchor="end">
              {v.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </text>
          </g>
        );
      })}
      <line x1={padding.left} y1={padding.top} x2={padding.left} y2={height - padding.bottom} stroke="#cbd5e1" />
      <line
        x1={padding.left}
        y1={height - padding.bottom}
        x2={width - padding.right}
        y2={height - padding.bottom}
        stroke="#cbd5e1"
      />
      <path d={path} fill="none" stroke="#2563eb" strokeWidth={1.5} />
      {uniqueXTickIdx.map((i) => {
        const xx = x(i);
        const d = new Date(clean[i].reading_date);
        return (
          <g key={i}>
            <line x1={xx} y1={height - padding.bottom} x2={xx} y2={height - padding.bottom + 4} stroke="#cbd5e1" />
            <text x={xx} y={height - 6} fontSize="10" fill="#9ca3af" textAnchor="middle">
              {d.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

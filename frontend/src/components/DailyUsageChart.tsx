"use client";

type Point = { day: string; gallons: number | null };

// Bar chart of one meter's per-day totals -- shows which specific days
// drove a window's total, rather than just its average. Companion to
// UsageChart (the raw hourly line), not a replacement for it.
export default function DailyUsageChart({ data }: { data: Point[] }) {
  const clean = data.filter((d) => d.gallons !== null) as { day: string; gallons: number }[];
  if (clean.length === 0) {
    return <p className="text-sm text-gray-400">No usage data in this window.</p>;
  }

  const width = 800;
  const height = 200;
  const padding = { top: 12, right: 16, bottom: 28, left: 52 };
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;

  const n = clean.length;
  const maxV = Math.max(...clean.map((d) => d.gallons), 1);
  const gap = 4;
  const barW = Math.max(1, innerW / n - gap);

  const y = (v: number) => padding.top + innerH - (v / maxV) * innerH;

  // Skip labels once there are more days than fit legibly (e.g. a 30-day
  // window) -- every day for a week, every ~5th day beyond that.
  const labelEvery = n <= 10 ? 1 : Math.ceil(n / 8);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto">
      <line
        x1={padding.left}
        y1={height - padding.bottom}
        x2={width - padding.right}
        y2={height - padding.bottom}
        stroke="#cbd5e1"
      />
      <text x={padding.left - 6} y={padding.top + 3} fontSize="10" fill="#9ca3af" textAnchor="end">
        {maxV.toLocaleString(undefined, { maximumFractionDigits: 0 })}
      </text>
      {clean.map((d, i) => {
        const barX = padding.left + i * (innerW / n) + gap / 2;
        const barY = y(d.gallons);
        return (
          <g key={d.day}>
            <rect x={barX} y={barY} width={barW} height={height - padding.bottom - barY} fill="#2563eb" />
            {i % labelEvery === 0 && (
              <text
                x={barX + barW / 2}
                y={height - 6}
                fontSize="10"
                fill="#9ca3af"
                textAnchor="middle"
              >
                {new Date(d.day).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

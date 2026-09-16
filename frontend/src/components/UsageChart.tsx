"use client";

type Point = { reading_date: string; gallons_used: number | null };

// Lightweight inline-SVG bar chart -- no charting library dependency.
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

  const n = clean.length;
  const maxV = Math.max(...clean.map((d) => d.gallons_used), 1);

  const gap = n > 60 ? 0 : 2;
  const barW = Math.max(1, innerW / n - gap);
  const barX = (i: number) => padding.left + i * (innerW / n) + gap / 2;
  const y = (v: number) => padding.top + innerH - (v / maxV) * innerH;

  // 4 horizontal gridlines (0 through max) so a value can be read without
  // hovering -- there's no tooltip in this lightweight chart.
  const yTickCount = 4;
  const yTicks = Array.from({ length: yTickCount + 1 }, (_, i) => (maxV * i) / yTickCount);

  // Up to 6 evenly spaced date labels along the x-axis, not just the
  // endpoints -- with hundreds/thousands of hourly points, two labels
  // give no sense of scale or where a spike happened.
  const xTickCount = Math.min(6, n - 1);
  const xTickIdx = Array.from({ length: xTickCount + 1 }, (_, i) => Math.round((i / xTickCount) * (n - 1)));
  const uniqueXTickIdx = Array.from(new Set(xTickIdx));

  // A single-day window (e.g. the "Today" view) puts every point on the same
  // calendar date, so a date label repeated across all ticks tells you
  // nothing -- show hour-of-day instead, which is what actually varies.
  const spanMs = new Date(clean[n - 1].reading_date).getTime() - new Date(clean[0].reading_date).getTime();
  const isSingleDay = spanMs < 36 * 60 * 60 * 1000;
  const formatTick = (d: Date) =>
    isSingleDay
      ? d.toLocaleTimeString(undefined, { hour: "numeric" })
      : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });

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
      {clean.map((d, i) => {
        const bx = barX(i);
        const by = y(d.gallons_used);
        return <rect key={i} x={bx} y={by} width={barW} height={height - padding.bottom - by} fill="#2563eb" />;
      })}
      {uniqueXTickIdx.map((i) => {
        const xx = barX(i) + barW / 2;
        const d = new Date(clean[i].reading_date);
        return (
          <g key={i}>
            <line x1={xx} y1={height - padding.bottom} x2={xx} y2={height - padding.bottom + 4} stroke="#cbd5e1" />
            <text x={xx} y={height - 6} fontSize="10" fill="#9ca3af" textAnchor="middle">
              {formatTick(d)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

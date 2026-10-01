import { useMemo, useState } from 'react';

export interface TimelineBucket {
  bucket: string;
  total: number;
  errors: number;
  avgLatency: number;
}

interface TimelineChartProps {
  data: TimelineBucket[];
  height?: number;
}

const PAD = { top: 10, right: 34, bottom: 22, left: 30 };

/**
 * Dependency-free SVG area/line chart: request volume (accent area) with
 * error counts overlaid (red line). Theme-aware via CSS variables, with a
 * hover crosshair + tooltip.
 */
export default function TimelineChart({ data, height = 170 }: TimelineChartProps) {
  const [hover, setHover] = useState<number | null>(null);
  const [width, setWidth] = useState(640);

  const geometry = useMemo(() => {
    const innerW = Math.max(width - PAD.left - PAD.right, 10);
    const innerH = height - PAD.top - PAD.bottom;
    const maxTotal = Math.max(1, ...data.map((d) => d.total));
    const stepX = data.length > 1 ? innerW / (data.length - 1) : innerW;

    const x = (i: number) => PAD.left + (data.length > 1 ? i * stepX : innerW / 2);
    const y = (value: number) => PAD.top + innerH - (value / maxTotal) * innerH;

    const totalPoints = data.map((d, i) => `${x(i)},${y(d.total)}`);
    const errorPoints = data.map((d, i) => `${x(i)},${y(d.errors)}`);
    const areaPath = data.length > 1
      ? `M ${x(0)},${y(data[0].total)} ${data.slice(1).map((d, i) => `L ${x(i + 1)},${y(d.total)}`).join(' ')} L ${x(data.length - 1)},${PAD.top + innerH} L ${x(0)},${PAD.top + innerH} Z`
      : '';

    const gridLines = [0, 0.5, 1].map((fraction) => ({
      y: PAD.top + innerH * fraction,
      label: String(Math.round(maxTotal * (1 - fraction))),
    }));

    return { innerW, innerH, maxTotal, stepX, x, y, totalPoints, errorPoints, areaPath, gridLines };
  }, [data, width, height]);

  if (data.length === 0) {
    return <div className="flex h-[170px] items-center justify-center text-body text-text-3">No data in this window yet.</div>;
  }

  const hasTraffic = data.some((d) => d.total > 0);
  const hoverBucket = hover !== null ? data[hover] : null;

  const labelEvery = Math.max(1, Math.floor(data.length / (width < 560 ? 3 : 5)));

  return (
    <div className="relative" ref={(el) => { if (el && el.clientWidth > 0) setWidth(el.clientWidth); }}>
      <svg
        width="100%"
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Request volume over time"
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
          const scaleX = width / rect.width;
          const mx = (e.clientX - rect.left) * scaleX;
          const relative = (mx - PAD.left) / Math.max(geometry.stepX, 1);
          const index = Math.min(data.length - 1, Math.max(0, Math.round(relative)));
          setHover(index);
        }}
      >
        <defs>
          <linearGradient id="td-area-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgb(var(--td-accent))" stopOpacity="0.16" />
            <stop offset="100%" stopColor="rgb(var(--td-accent))" stopOpacity="0.01" />
          </linearGradient>
        </defs>

        {/* Grid */}
        {geometry.gridLines.map((line) => (
          <g key={line.y}>
            <line x1={PAD.left} x2={width - PAD.right} y1={line.y} y2={line.y} stroke="rgb(var(--td-line))" strokeWidth="1" strokeDasharray={line.y === PAD.top + geometry.innerH ? undefined : '2 5'} />
            <text x={PAD.left - 6} y={line.y + 3.5} textAnchor="end" fontSize="10" fill="rgb(var(--td-text-3))" fontFamily="'Geist Mono Variable', ui-monospace, monospace">{line.label}</text>
          </g>
        ))}

        {/* Total area + line */}
        {data.length > 1 && <path d={geometry.areaPath} fill="url(#td-area-fill)" />}
        <polyline
          points={geometry.totalPoints.join(' ')}
          fill="none"
          stroke="rgb(var(--td-accent))"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {/* Errors line */}
        <polyline
          points={geometry.errorPoints.join(' ')}
          fill="none"
          stroke="rgb(var(--td-danger))"
          strokeWidth="1.5"
          strokeDasharray="1 4"
          strokeLinecap="round"
          opacity="0.9"
        />

        {/* Single-point dots (sparse demo data renders as spikes) */}
        {data.map((d, i) => (d.total > 0 && (data.length === 1 || (data[i - 1]?.total ?? 0) === 0 || (data[i + 1]?.total ?? 0) === 0) ? (
          <circle key={`dot-${d.bucket}`} cx={geometry.x(i)} cy={geometry.y(d.total)} r="3" fill="rgb(var(--td-accent))" stroke="rgb(var(--td-surface))" strokeWidth="1.5" />
        ) : null))}

        {/* X labels */}
        {data.map((d, i) => (
          i % labelEvery === 0 || i === data.length - 1 ? (
            <text key={`x-${d.bucket}`} x={geometry.x(i)} y={height - 6} textAnchor={i === data.length - 1 ? 'end' : 'middle'} fontSize="10" fill="rgb(var(--td-text-3))" fontFamily="'Geist Mono Variable', ui-monospace, monospace">
              {new Date(d.bucket).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </text>
          ) : null
        ))}

        {/* Hover crosshair */}
        {hover !== null && (
          <g>
            <line x1={geometry.x(hover)} x2={geometry.x(hover)} y1={PAD.top} y2={PAD.top + geometry.innerH} stroke="rgb(var(--td-text-3))" strokeWidth="1" strokeDasharray="2 4" opacity="0.7" />
            <circle cx={geometry.x(hover)} cy={geometry.y(data[hover].total)} r="4" fill="rgb(var(--td-accent))" stroke="rgb(var(--td-surface))" strokeWidth="2" />
          </g>
        )}
      </svg>

      {!hasTraffic && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <p className="rounded-pill border border-line bg-surface/90 px-3 py-1 text-caption text-text-3">
            Run a simulation to populate the timeline
          </p>
        </div>
      )}

      {/* Tooltip */}
      {hoverBucket && hover !== null && (
        <div
          className="td-pop pointer-events-none absolute top-1 z-10 w-40 p-2.5"
          style={{
            left: Math.min(Math.max((geometry.x(hover) / width) * 100, 8), 78) + '%',
          }}
        >
          <p className="td-label">
            {new Date(hoverBucket.bucket).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </p>
          <p className="mt-1 flex items-center justify-between text-caption text-text-2">
            <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full" style={{ background: 'rgb(var(--td-accent))' }} /> Requests</span>
            <span className="font-semibold tabular-nums text-text-1">{hoverBucket.total}</span>
          </p>
          <p className="mt-0.5 flex items-center justify-between text-caption text-text-2">
            <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-danger" /> Errors</span>
            <span className="font-semibold tabular-nums text-text-1">{hoverBucket.errors}</span>
          </p>
          <p className="mt-0.5 flex items-center justify-between text-caption text-text-2">
            <span>Avg latency</span>
            <span className="font-semibold tabular-nums text-text-1">{hoverBucket.avgLatency}ms</span>
          </p>
        </div>
      )}
    </div>
  );
}

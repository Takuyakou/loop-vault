export interface EarChartPoint {
  label: string;
  value?: number;
  /** Fewer chords than the figure needs: drawn hollow. */
  few?: boolean;
  /** A small figure written under the label (the listens of the week). */
  extra?: string;
}

const W = 460;
const H = 150;
const LEFT = 50;
const RIGHT = 16;
const TOP = 12;
const BOTTOM = 34;

/**
 * A line chart of one kind of figure (one unit, one axis). Points with too few chords are hollow; a gap in the
 * data breaks the line.
 */
export function EarChart({ testId, title, points, format, max, extraLabel }: {
  testId: string;
  title: string;
  points: readonly EarChartPoint[];
  format: (value: number) => string;
  /** The top of the axis; the bottom is 0. */
  max: number;
  extraLabel?: string;
}) {
  const plotW = W - LEFT - RIGHT;
  const plotH = H - TOP - BOTTOM;
  const x = (index: number) => LEFT + (points.length <= 1 ? plotW / 2 : (plotW * index) / (points.length - 1));
  const y = (value: number) => TOP + plotH - (Math.min(value, max) / max) * plotH;
  const segments: Array<Array<{ x: number; y: number }>> = [];
  points.forEach((point, index) => {
    if (point.value === undefined) { segments.push([]); return; }
    if (!segments.length) segments.push([]);
    segments[segments.length - 1]!.push({ x: x(index), y: y(point.value) });
  });
  const ticks = [0, max / 2, max];
  const every = points.length > 8 ? 2 : 1;
  return (
    <figure className="ear-chart" data-testid={testId}>
      <figcaption>{title}</figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${title}: ${points.map((p) => `${p.label} ${p.value === undefined ? "なし" : format(p.value)}`).join("、")}`}>
        {ticks.map((tick) => (
          <g key={tick}>
            <line x1={LEFT} x2={W - RIGHT} y1={y(tick)} y2={y(tick)} className="ear-chart-grid" />
            <text x={LEFT - 6} y={y(tick) + 3.5} textAnchor="end" className="ear-chart-axis">{format(tick)}</text>
          </g>
        ))}
        {segments.filter((segment) => segment.length > 1).map((segment, index) => (
          <polyline key={index} points={segment.map((p) => `${p.x},${p.y}`).join(" ")} className="ear-chart-line" />
        ))}
        {points.map((point, index) => (
          <g key={`${point.label}-${index}`}>
            {point.value === undefined ? null : (
              <circle cx={x(index)} cy={y(point.value)} r={4} className="ear-chart-dot" data-few={point.few || undefined} data-testid={`${testId}-dot`}>
                <title>{`${point.label}: ${format(point.value)}${point.few ? "(まだ少ない)" : ""}`}</title>
              </circle>
            )}
            {index % every === 0 ? <text x={x(index)} y={H - BOTTOM + 14} textAnchor={index === points.length - 1 && points.length < 4 ? "end" : "middle"} className="ear-chart-axis">{point.label}</text> : null}
            {point.extra !== undefined && index % every === 0 ? <text x={x(index)} y={H - BOTTOM + 27} textAnchor="middle" className="ear-chart-extra">{point.extra}</text> : null}
          </g>
        ))}
        {extraLabel ? <text x={LEFT - 8} y={H - BOTTOM + 27} textAnchor="end" className="ear-chart-extra">{extraLabel}</text> : null}
      </svg>
    </figure>
  );
}

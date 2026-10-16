/* SVG geometry for the Portfolio Analysis charts (cumulative realised P&L, P&L by period, basket EOD P&L). */
import { CurvePoint, PeriodBar } from './models/portfolio.model';

export interface ChartGridLine { y: number; label: string; }
export interface ChartAxisLabel { x: number; text: string; anchor: 'start' | 'middle' | 'end'; }

export interface BarChartGeometry {
    viewBox: string;
    padLeft: number;
    plotRight: number;
    plotBottom: number;
    labelY: number;
    zeroY: number;
    grid: ChartGridLine[];
    bars: Array<{ x: number; y: number; width: number; height: number; positive: boolean; label: string; value: number }>;
    labels: ChartAxisLabel[];
}

export interface CurveChartGeometry {
    viewBox: string;
    padLeft: number;
    plotRight: number;
    labelY: number;
    zeroY: number;
    grid: ChartGridLine[];
    areaPath: string;
    peakPath: string;
    linePath: string;
    positive: boolean;
    startLabel: string;
    endLabel: string;
}

/** Compact axis value: 12k above a thousand, whole rupees below. */
export function axisValue(value: number): string {
    return Math.abs(value) >= 1000 ? `${(value / 1000).toFixed(0)}k` : value.toFixed(0);
}

function paddedRange(values: number[], includeZero: boolean, padding: number): [number, number] {
    let min = includeZero ? Math.min(0, ...values) : Math.min(...values);
    let max = includeZero ? Math.max(0, ...values) : Math.max(...values);
    if (max === min) { max += 1; min -= 1; }
    const pad = (max - min) * padding;
    return [min - pad, max + pad];
}

export function buildBarChart(data: readonly PeriodBar[], narrow: boolean, size: 'full' | 'compact' = 'full'): BarChartGeometry | null {
    if (!data.length) return null;
    const compact = size === 'compact';
    const W = compact ? (narrow ? 300 : 560) : narrow ? 340 : 1000;
    const H = compact ? 120 : narrow ? 220 : 240;
    const padL = compact ? (narrow ? 42 : 52) : narrow ? 46 : 60;
    const padR = compact ? 10 : narrow ? 12 : 18;
    const padT = compact ? 10 : 14;
    const padB = compact ? 22 : narrow ? 36 : 40;
    const pw = W - padL - padR, ph = H - padT - padB;
    const [yMin, yMax] = paddedRange(data.map(d => d.v), true, compact ? 0.12 : 0.1);
    const yAt = (v: number) => padT + ph - ((v - yMin) / (yMax - yMin)) * ph;
    const zeroY = yAt(0);
    const bw = pw / data.length;
    const lines = compact ? 2 : 4;
    const every = data.length <= (compact ? 6 : 8) ? 1 : Math.ceil(data.length / (compact ? 6 : 8));
    return {
        viewBox: `0 0 ${W} ${H}`,
        padLeft: padL,
        plotRight: W - padR,
        plotBottom: padT + ph,
        labelY: H - (compact ? 8 : 10),
        zeroY,
        grid: Array.from({ length: lines + 1 }, (_, g) => {
            const v = yMin + ((yMax - yMin) * g) / lines;
            return { y: yAt(v), label: axisValue(v) };
        }),
        bars: data.map((d, i) => {
            const y1 = yAt(d.v);
            return {
                x: padL + i * bw + bw * 0.14,
                y: Math.min(zeroY, y1),
                width: bw * 0.72,
                height: Math.max(Math.abs(y1 - zeroY), 1),
                positive: d.v >= 0,
                label: d.label,
                value: d.v,
            };
        }),
        labels: data
            .map((d, i) => ({ x: padL + i * bw + bw / 2, text: d.label, anchor: 'middle' as const, index: i }))
            .filter(l => l.index % every === 0 || l.index === data.length - 1)
            .map(({ x, text, anchor }) => ({ x, text, anchor })),
    };
}

export function buildCurveChart(points: readonly CurvePoint[], group: string, narrow: boolean, tradeCount: number): CurveChartGeometry | null {
    if (!points.length) return null;
    const W = narrow ? 340 : 1000, H = narrow ? 250 : 300;
    const padL = narrow ? 46 : 64, padR = narrow ? 12 : 22, padT = 16, padB = narrow ? 26 : 30;
    const pw = W - padL - padR, ph = H - padT - padB;
    const [yMin, yMax] = paddedRange(points.map(p => p.v), false, 0.14);
    const xAt = (i: number) => padL + (points.length > 1 ? i / (points.length - 1) : 0) * pw;
    const yAt = (v: number) => padT + ph - ((v - yMin) / (yMax - yMin)) * ph;
    const zeroY = Math.max(padT, Math.min(padT + ph, yAt(0)));
    let peak = -Infinity;
    const peaks = points.map(p => { peak = Math.max(peak, p.v); return { i: p.i, v: peak }; });
    const path = (list: ReadonlyArray<{ i: number; v: number }>) =>
        list.map((p, i) => `${i ? 'L' : 'M'}${xAt(p.i).toFixed(1)},${yAt(p.v).toFixed(1)}`).join(' ');
    const last = points[points.length - 1];
    return {
        viewBox: `0 0 ${W} ${H}`,
        padLeft: padL,
        plotRight: W - padR,
        labelY: H - 8,
        zeroY,
        grid: Array.from({ length: 5 }, (_, g) => {
            const v = yMin + ((yMax - yMin) * g) / 4;
            return { y: yAt(v), label: axisValue(v) };
        }),
        areaPath: `M${xAt(0).toFixed(1)},${zeroY.toFixed(1)} ${points.map(p => `L${xAt(p.i).toFixed(1)},${yAt(p.v).toFixed(1)}`).join(' ')} L${xAt(points.length - 1).toFixed(1)},${zeroY.toFixed(1)} Z`,
        peakPath: path(peaks),
        linePath: path(points),
        positive: last.v >= 0,
        startLabel: group === 'trade' ? 'trade 1' : (points[1]?.label ?? ''),
        endLabel: group === 'trade' ? `trade ${tradeCount}` : (last.label || ''),
    };
}

import { EodDataRow } from './eod.model';

export interface ChartResult {
    path: string;
    yTicks: { y: number; price: number }[];
    xTicks: { x: number; label: string }[];
    viewBox: string;
    width: number;
    height: number;
    yAxisLabelX: number;
}

const DEFAULT_W = 720;
const DEFAULT_H = 300;

function fmtDateLabel(d: string) {
    const dt = new Date(d + 'T00:00:00');
    return dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}

export function buildEodChart(rows: EodDataRow[], width = DEFAULT_W, height = DEFAULT_H): ChartResult {
    const chartW = width;
    const chartH = height;
    const marginLeft = 82, marginRight = 12, marginTop = 16, marginBottom = 30;
    const plotW = chartW - marginLeft - marginRight;
    const plotH = chartH - marginTop - marginBottom;

    const points = rows.map(r => r.ltp ?? r.close ?? 0);
    const min = points.length ? Math.min(...points) : 0;
    const max = points.length ? Math.max(...points) : min || 1;

    const xOf = (i: number) => marginLeft + (rows.length > 1 ? (i / (rows.length - 1)) * plotW : 0);
    const yOf = (price: number) => marginTop + (1 - (price - min) / ((max - min) || 1)) * plotH;

    const pathPts = rows.map((r, i) => `${i === 0 ? 'M' : 'L'}${xOf(i).toFixed(1)},${yOf(r.ltp ?? r.close ?? 0).toFixed(1)}`).join(' ');

    const yTicks = [0, 1, 2, 3, 4].map(k => {
        const price = min + (max - min) * (k / 4);
        return { y: yOf(price), price };
    }).reverse();

    const tickCount = Math.min(6, Math.max(1, rows.length));
    const xTickIdx = Array.from(new Set(Array.from({ length: tickCount }, (_, k) => Math.round(k * (rows.length - 1) / ((tickCount - 1) || 1)))));
    const xTicks = xTickIdx.map(i => ({ x: xOf(i), label: fmtDateLabel(rows[i].date) }));

    return {
        path: pathPts,
        yTicks,
        xTicks,
        viewBox: `0 0 ${chartW} ${chartH}`,
        width: chartW,
        height: chartH,
        yAxisLabelX: marginLeft - 8,
    };
}

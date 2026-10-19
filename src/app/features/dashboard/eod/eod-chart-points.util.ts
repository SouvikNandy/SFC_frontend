import { EodChartPoint } from './eod.model';

/**
 * The points of a `/fo/eod/chart` response, oldest first. Every returned session is kept: nothing is thinned or
 * dropped for being flat. A malformed entry (no date, or a close that is not a finite number) is skipped rather than
 * drawn as 0. Returns null when the payload is not a list at all, so the screen can report an error instead of an empty chart.
 */
export function readChartPoints(payload: unknown): EodChartPoint[] | null {
    if (!Array.isArray(payload)) return null;
    const points: EodChartPoint[] = [];
    for (const item of payload) {
        const row = item as { date?: unknown; close?: unknown } | null;
        const date = typeof row?.date === 'string' ? row.date.slice(0, 10) : '';
        const close = typeof row?.close === 'number' ? row.close : Number.NaN;
        if (date && Number.isFinite(close)) points.push({ date, close });
    }
    return points.sort((a, b) => a.date.localeCompare(b.date));
}

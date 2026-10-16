import { EodDataRow, EodPaginatedData } from './eod.model';

type RawRow = Partial<EodDataRow> & { trade_date?: string; close_price?: number };

const num = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null);

/**
 * Reads a `/fo/eod` payload (an array, or an object holding `results`/`rows`/`items`/`data`) into a page of rows.
 * Mirrors the shapes the F&O EOD screen already accepts; nothing is invented.
 */
export function readEodPage(payload: unknown): EodPaginatedData {
    const empty: EodPaginatedData = { results: [], page: 1, has_next: false, has_previous: false };
    if (Array.isArray(payload)) return { ...empty, results: payload.map(toRow).filter(isRow) };
    if (!payload || typeof payload !== 'object') return empty;
    const value = payload as Record<string, unknown>;
    const nested = value['data'];
    if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
        const inner = nested as Record<string, unknown>;
        if (['results', 'rows', 'items', 'data'].some(key => Array.isArray(inner[key]))) return readEodPage(nested);
    }
    const list = ['results', 'rows', 'items', 'data'].map(key => value[key]).find(Array.isArray) as unknown[] | undefined;
    return {
        results: (list ?? []).map(toRow).filter(isRow),
        page: typeof value['page'] === 'number' ? value['page'] : 1,
        has_next: value['has_next'] === true,
        has_previous: value['has_previous'] === true,
    };
}

function toRow(raw: unknown): EodDataRow | null {
    if (!raw || typeof raw !== 'object') return null;
    const row = raw as RawRow;
    const date = row.date ?? row.trade_date;
    if (typeof date !== 'string' || !date) return null;
    return {
        date: date.slice(0, 10),
        symbol: row.symbol ?? '',
        open: num(row.open) ?? Number.NaN,
        high: num(row.high) ?? Number.NaN,
        low: num(row.low) ?? Number.NaN,
        // Close only: never substituted from LTP.
        close: num(row.close) ?? num(row.close_price) ?? Number.NaN,
        volume: num(row.volume) ?? Number.NaN,
        oi: num(row.oi) ?? Number.NaN,
    };
}

const isRow = (row: EodDataRow | null): row is EodDataRow => row !== null;

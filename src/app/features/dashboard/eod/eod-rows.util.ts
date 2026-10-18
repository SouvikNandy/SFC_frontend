import { EodDataRow, EodPaginatedData } from './eod.model';

type RawRow = Partial<EodDataRow> & { trade_date?: string; close_price?: number };

/** A `/fo/eod` payload reduced to its page metadata and untouched rows. */
export interface RawEodPage {
    results: unknown[];
    page: number;
    has_next: boolean;
    has_previous: boolean;
}

const LIST_KEYS = ['results', 'rows', 'items', 'data'] as const;
const EMPTY_PAGE: RawEodPage = { results: [], page: 1, has_next: false, has_previous: false };

/**
 * Finds the rows and paging flags in a `/fo/eod` payload: an array, or an object holding `results`
 * (the shape the live API returns), `rows`, `items` or `data`, possibly nested one level in `data`.
 * Shared by the F&O EOD and Multi-Leg EOD screens; rows are returned untouched.
 */
export function extractEodPage(payload: unknown): RawEodPage {
    if (Array.isArray(payload)) return { ...EMPTY_PAGE, results: payload };
    if (!payload || typeof payload !== 'object') return EMPTY_PAGE;
    const value = payload as Record<string, unknown>;
    const nested = value['data'];
    if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
        const inner = nested as Record<string, unknown>;
        if (LIST_KEYS.some(key => Array.isArray(inner[key]))) return extractEodPage(nested);
    }
    const list = LIST_KEYS.map(key => value[key]).find(Array.isArray) as unknown[] | undefined;
    return {
        results: list ?? [],
        page: typeof value['page'] === 'number' ? value['page'] : 1,
        has_next: value['has_next'] === true,
        has_previous: value['has_previous'] === true,
    };
}

const num = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null);

/**
 * Typed rows for the Multi-Leg screen: a row without a date is dropped, and a field the backend did not
 * send is NaN (never a fabricated 0). The F&O EOD screen keeps its own row defaults.
 */
export function readEodPage(payload: unknown): EodPaginatedData {
    const raw = extractEodPage(payload);
    return { ...raw, results: raw.results.map(toRow).filter((row): row is EodDataRow => row !== null) };
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

/**
 * A session on which the contract did not trade. Verified against the live API: such rows come back with
 * open, high, low, volume and OI all 0 and a close carried over from the previous session. They are left
 * as gaps instead of being drawn as zero-price candles or a flat stale line.
 */
export const isNoTradeBar = (row: Pick<EodDataRow, 'open' | 'high' | 'low' | 'volume'>): boolean =>
    row.open === 0 && row.high === 0 && row.low === 0 && row.volume === 0;

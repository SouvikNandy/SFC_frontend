/*
 * Multi-Leg EOD Data helpers: date ranges, session alignment, chart geometry, table rows and CSV.
 * Pure functions so they can be tested without the DOM. All dates are YYYY-MM-DD and handled in UTC.
 */
import { MAX_RANGE_MESSAGE, exceedsOneYear } from '../../../shared/utils/date-range';
import { EodDataRow } from '../eod/eod.model';
import {
    CombinedTableRow,
    DateRange,
    LegChartGeometry,
    LegSelection,
    LegSeries,
    RangePreset,
    SessionRow,
    SingleLegTableRow,
} from './multi-leg-eod.model';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isIsoDate(value: string): boolean {
    const match = DATE_RE.exec(value);
    if (!match) return false;
    const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
    const date = new Date(Date.UTC(y, m - 1, d));
    return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

export const ymd = (date: Date): string =>
    `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;

const parse = (value: string): Date => {
    const [y, m, d] = value.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d));
};

/** 29 Oct 2026 */
export function longDate(value: string): string {
    if (!isIsoDate(value)) return value;
    const [y, m, d] = value.split('-').map(Number);
    return `${d} ${MONTHS[m - 1]} ${y}`;
}

/** 29 Oct */
export function shortDate(value: string): string {
    if (!isIsoDate(value)) return value;
    const [, m, d] = value.split('-').map(Number);
    return `${String(d).padStart(2, '0')} ${MONTHS[m - 1]}`;
}

/** Presets show the last N sessions, as in the reference (1W = 5, 1M = 21, 3M = 63). */
export const PRESET_SESSIONS: Record<Exclude<RangePreset, 'Custom'>, number> = { '1W': 5, '1M': 21, '3M': 63 };

/**
 * The date window to REQUEST for a preset ending on `today` (UTC): wide enough to contain the preset's session
 * count plus weekends and holidays; the screen then keeps only the last N sessions. For Custom it is the
 * exact From/To fields.
 * Returns an error message instead of a range when the custom dates are missing, invalid or reversed.
 */
export function resolveRange(preset: RangePreset, today: string, customFrom: string, customTill: string): { range: DateRange } | { error: string } {
    if (preset === 'Custom') {
        if (!customFrom || !customTill) return { error: 'Select both From and To dates.' };
        if (!isIsoDate(customFrom) || !isIsoDate(customTill)) return { error: 'Enter valid dates.' };
        if (customFrom > customTill) return { error: 'From date cannot be after To date.' };
        if (customTill > today) return { error: 'Dates cannot be in the future.' };
        if (exceedsOneYear(customFrom, customTill)) return { error: MAX_RANGE_MESSAGE };
        return { range: { from: customFrom, till: customTill } };
    }
    if (!isIsoDate(today)) return { error: 'Enter valid dates.' };
    const till = parse(today);
    const from = new Date(till);
    from.setUTCDate(till.getUTCDate() - (Math.ceil(PRESET_SESSIONS[preset] * 1.6) + 7));
    return { range: { from: ymd(from), till: today } };
}

export const legLabel = (leg: Pick<LegSelection, 'strike' | 'optionType' | 'expiry'>): string =>
    `${leg.strike ?? '–'} ${leg.optionType} · ${shortDate(leg.expiry).replace(/^0/, '')}`;

/** A leg is requestable once its strike is known and its expiry is a real date. */
export const isLegComplete = (leg: LegSelection): boolean => leg.strike !== null && leg.strike > 0 && isIsoDate(leg.expiry);

export const legCacheKey = (symbol: string, leg: LegSelection, range: DateRange): string =>
    `${symbol}|${leg.optionType}|${leg.strike}|${leg.expiry}|${range.from}|${range.till}`;

/**
 * Aligns every leg on a common session list. A session is kept when at least one leg has a bar, because legs on
 * different expiries list and expire on different days. Rows outside the optional [from, till] window are dropped.
 */
export function buildSessions(series: readonly LegSeries[], range?: DateRange): SessionRow[] {
    const byLeg = series.map(s => new Map(s.rows.map(row => [row.date, row] as const)));
    const dates = new Set<string>();
    byLeg.forEach(map => map.forEach((_row, date) => dates.add(date)));
    return [...dates]
        .filter(date => !(range && (date < range.from || date > range.till)))
        .sort()
        .map(date => ({ date, bars: byLeg.map(map => map.get(date) ?? null) }));
}

const closeOf = (bar: EodDataRow | null): number | null => (bar && Number.isFinite(bar.close) ? bar.close : null);

/* ---------------- chart ---------------- */

export function buildLegChart(sessions: readonly SessionRow[], series: readonly LegSeries[], narrow: boolean): LegChartGeometry | null {
    const closes = sessions.map(s => s.bars.map(closeOf));
    const all = closes.flat().filter((v): v is number => v !== null);
    if (!sessions.length || !all.length) return null;
    const W = narrow ? 430 : 1000, H = narrow ? 270 : 320;
    const padL = narrow ? 54 : 68, padR = narrow ? 10 : 24, padT = 14, padB = 32;
    const pw = W - padL - padR, ph = H - padT - padB;
    let yMin = Math.min(...all), yMax = Math.max(...all);
    if (yMax === yMin) { yMax += 1; yMin -= 1; }
    const pad = (yMax - yMin) * 0.08;
    yMin -= pad;
    yMax += pad;
    const n = sessions.length;
    const xAt = (i: number) => padL + (n > 1 ? i / (n - 1) : 0.5) * pw;
    const yAt = (v: number) => padT + ph - ((v - yMin) / (yMax - yMin)) * ph;
    const every = Math.max(1, Math.ceil(n / (narrow ? 4 : 7)));

    return {
        viewBox: `0 0 ${W} ${H}`,
        width: W,
        padLeft: padL,
        plotWidth: pw,
        plotTop: padT,
        plotBottom: padT + ph,
        yTicks: Array.from({ length: 5 }, (_, t) => {
            const v = yMin + ((yMax - yMin) * t) / 4;
            return { y: yAt(v), label: v.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: Math.abs(v) >= 100 ? 0 : 1 }) };
        }),
        xTicks: sessions.map((s, i) => ({ x: xAt(i), label: shortDate(s.date), i })).filter(t => t.i % every === 0).map(({ x, label }) => ({ x, label })),
        xs: sessions.map((_s, i) => xAt(i)),
        lines: series.map((s, index) => {
            let path = '', pen = false;
            const dots: Array<{ x: number; y: number }> = [];
            closes.forEach((row, i) => {
                const v = row[index];
                if (v === null) { pen = false; return; }   // a gap (not listed / expired) lifts the pen
                path += `${pen ? 'L' : 'M'}${xAt(i).toFixed(1)},${yAt(v).toFixed(1)} `;
                dots.push({ x: xAt(i), y: yAt(v) });
                pen = true;
            });
            return { index, label: s.label, path: path.trim(), dots };
        }),
    };
}

/* ---------------- tables ---------------- */

/** Latest session first, with each close compared against that leg's previous available close. */
export function combinedRows(sessions: readonly SessionRow[], legCount: number): CombinedTableRow[] {
    const last: Array<number | null> = Array.from({ length: legCount }, () => null);
    const rows = sessions.map(session => {
        const closes = session.bars.map(closeOf);
        const changes = closes.map((close, i) => {
            const change = close !== null && last[i] !== null ? close - (last[i] as number) : null;
            if (close !== null) last[i] = close;
            return change;
        });
        return { date: session.date, closes, changes };
    });
    return rows.reverse();
}

export function singleLegRows(sessions: readonly SessionRow[], legIndex: number): SingleLegTableRow[] {
    let last: number | null = null;
    const rows = sessions.map(session => {
        const bar = session.bars[legIndex] ?? null;
        const close = closeOf(bar);
        const change = close !== null && last !== null ? close - last : null;
        if (close !== null) last = close;
        return { date: session.date, bar, change };
    });
    return rows.reverse();
}

export function pageSlice<T>(rows: readonly T[], page: number, size: number): { slice: T[]; pages: number; page: number } {
    const pages = Math.max(1, Math.ceil(rows.length / size));
    const safe = Math.min(Math.max(page, 0), pages - 1);
    return { slice: rows.slice(safe * size, safe * size + size), pages, page: safe };
}

/* ---------------- CSV ---------------- */

/** RFC 4180 quoting, plus a leading apostrophe-free guard against spreadsheet formula injection. */
export function csvCell(value: string | number | null | undefined): string {
    if (value === null || value === undefined) return '';
    let text = typeof value === 'number' ? (Number.isFinite(value) ? String(value) : '') : value;
    if (/^[=+@\t\r]/.test(text) || (/^-/.test(text) && Number.isNaN(Number(text)))) text = `'${text}`;
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

const money = (value: number | null): string => (value !== null && Number.isFinite(value) ? value.toFixed(2) : '');
const whole = (value: number): string => (Number.isFinite(value) ? String(Math.round(value)) : '');

/** All legs combined: Date plus one close column per leg, oldest first, over the selected sessions. */
export function combinedCsv(sessions: readonly SessionRow[], series: readonly LegSeries[]): string {
    const header = ['Date', ...series.map(s => s.label)].map(csvCell).join(',');
    const body = sessions.map(s => [s.date, ...s.bars.map(bar => money(closeOf(bar)))].map(csvCell).join(','));
    return [header, ...body].join('\n');
}

/** One leg: Date, Open, High, Low, Close, Volume, OI. A missing field is left empty, never invented. */
export function singleLegCsv(sessions: readonly SessionRow[], legIndex: number): string {
    const header = ['Date', 'Open', 'High', 'Low', 'Close', 'Volume', 'OI'].join(',');
    const body = sessions.flatMap(s => {
        const bar = s.bars[legIndex];
        if (!bar) return [];
        return [[s.date, money(bar.open), money(bar.high), money(bar.low), money(bar.close), whole(bar.volume), whole(bar.oi)].map(csvCell).join(',')];
    });
    return [header, ...body].join('\n');
}

const slug = (text: string): string => text.replace(/[^A-Za-z0-9.-]+/g, '_').replace(/^_+|_+$/g, '');

/** e.g. NIFTY_22600CE_2026-10-29_EOD.csv (one leg) or NIFTY_22600CE_2026-10-29_22600PE_2026-10-29_EOD.csv (combined). */
export function csvFilename(symbol: string, legs: readonly LegSelection[]): string {
    const parts = legs.map(leg => `${leg.strike}${leg.optionType}_${leg.expiry}`);
    return `${slug(symbol)}_${parts.map(slug).join('_')}_EOD.csv`;
}

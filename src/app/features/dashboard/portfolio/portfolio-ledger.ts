/*
 * Portfolio Analysis calculations: a paper-trading ledger with weighted-average cost.
 * Ported from prototype/portfolio-analysis (6).html (recordFill, stats, maxDrawdown, grouping),
 * kept free of Angular and the DOM so every figure is unit-testable.
 *
 * Conventions (same as the prototype):
 *  - qty is in LOTS and signed (+ long, - short); one lot = `lot` units.
 *  - Realised P&L uses weighted-average cost (not FIFO).
 *  - Dates are YYYY-MM-DD strings handled in UTC so there are no off-by-one errors.
 */
import {
    Basket,
    BasketEodRow,
    ClosedTrade,
    ContractRef,
    CurvePoint,
    DrawdownStats,
    FillResult,
    LedgerFill,
    OpenPosition,
    PeriodBar,
    PeriodGroup,
    PeriodSummary,
    PriceHistory,
    TradeStats,
} from './models/portfolio.model';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/* ---------------- dates (UTC-safe) ---------------- */

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isIsoDate(value: string): boolean {
    const match = DATE_RE.exec(value);
    if (!match) return false;
    const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
    const date = new Date(Date.UTC(y, m - 1, d));
    return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

export function ymd(date: Date): string {
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

function parseYmd(value: string): Date {
    const [y, m, d] = value.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d));
}

/** 12 Oct 2026 */
export function dateLabel(value: string): string {
    if (!isIsoDate(value)) return value;
    const [y, m, d] = value.split('-').map(Number);
    return `${d} ${MONTHS[m - 1]} ${y}`;
}

/** Whole days from `today` (YYYY-MM-DD) to `expiry`; null when either is not a valid date. */
export function daysToExpiry(expiry: string, today: string): number | null {
    if (!isIsoDate(expiry) || !isIsoDate(today)) return null;
    return Math.round((parseYmd(expiry).getTime() - parseYmd(today).getTime()) / 86400000);
}

export function weekStart(value: string): string {
    const date = parseYmd(value);
    date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7)); // back to Monday
    return ymd(date);
}

export function periodKey(value: string, group: PeriodGroup): string {
    if (group === 'week') return weekStart(value);
    if (group === 'month') return value.slice(0, 7);
    return value;
}

export function periodLabel(key: string, group: PeriodGroup): string {
    if (group === 'month') {
        const [y, m] = key.split('-').map(Number);
        return `${MONTHS[m - 1]} ${y}`;
    }
    if (group === 'week') {
        const end = parseYmd(key);
        end.setUTCDate(end.getUTCDate() + 6);
        return `${dateLabel(key)} – ${dateLabel(ymd(end))}`;
    }
    return dateLabel(key);
}

/* ---------------- ledger replay ---------------- */

interface MutablePosition {
    contract: ContractRef;
    lot: number;
    qty: number;
    avg: number;
    opened: string;
    basketId: string | null;
}

export interface Ledger {
    positions: OpenPosition[];
    closed: ClosedTrade[];
}

/** Applies one fill to the running book; mirrors the prototype's recordFill. */
function applyFill(book: Map<string, MutablePosition>, closed: ClosedTrade[], fill: LedgerFill, basketId: string | null): FillResult {
    let position = book.get(fill.contract.key);
    if (!position) {
        position = { contract: fill.contract, lot: fill.lot, qty: 0, avg: 0, opened: fill.date, basketId: null };
        book.set(fill.contract.key, position);
    }
    if (position.qty === 0) {
        position.lot = fill.lot;
        position.contract = fill.contract;
        position.opened = fill.date;
    }
    // A later fill can move an already-open position into another basket.
    if (basketId) position.basketId = basketId;

    const signed = fill.side === 'buy' ? fill.qty : -fill.qty;
    if (position.qty === 0) {
        position.qty = signed;
        position.avg = fill.price;
        return { action: 'opened', realised: 0 };
    }
    if (position.qty > 0 === signed > 0) {
        const total = position.qty + signed;
        position.avg = (position.qty * position.avg + signed * fill.price) / total;
        position.qty = total;
        return { action: 'added', realised: 0 };
    }

    const closing = Math.min(Math.abs(signed), Math.abs(position.qty));
    const direction = position.qty > 0 ? 'long' : 'short';
    const sign = position.qty > 0 ? 1 : -1;
    const realised = (fill.price - position.avg) * closing * position.lot * sign;
    closed.push({
        contract: position.contract,
        label: position.contract.label,
        kind: position.contract.kind,
        direction,
        qty: closing,
        lot: position.lot,
        entry: position.avg,
        exit: fill.price,
        realised,
        entryDate: position.opened,
        exitDate: fill.date,
        basketId: position.basketId,
    });
    const remaining = position.qty + signed;
    if (Math.abs(remaining) < 1e-12) {
        position.qty = 0;
        position.avg = 0;
        return { action: 'closed', realised };
    }
    if (remaining > 0 === position.qty > 0) {
        position.qty = remaining;
        return { action: 'reduced', realised };
    }
    position.qty = remaining;
    position.avg = fill.price;
    position.opened = fill.date;
    return { action: 'flipped', realised };
}

/**
 * Replays the fills (in booking order) into open positions and closed trades.
 * Baskets that no longer exist are treated as unassigned, so deleting a basket never loses a position.
 */
export function replayLedger(
    fills: readonly LedgerFill[],
    baskets: readonly Basket[],
    onFill?: (fill: LedgerFill, result: FillResult) => void,
): Ledger {
    const known = new Set(baskets.map(basket => basket.id));
    const book = new Map<string, MutablePosition>();
    const closed: ClosedTrade[] = [];
    for (const fill of fills) {
        const result = applyFill(book, closed, fill, fill.basketId && known.has(fill.basketId) ? fill.basketId : null);
        onFill?.(fill, result);
    }
    const positions: OpenPosition[] = [...book.values()]
        .filter(position => position.qty !== 0)
        .map(position => ({
            contract: position.contract,
            kind: position.contract.kind,
            lot: position.lot,
            qty: position.qty,
            avg: position.avg,
            opened: position.opened,
            basketId: position.basketId && known.has(position.basketId) ? position.basketId : null,
            cmp: null,
        }));
    return { positions, closed: closed.map(trade => ({ ...trade, basketId: trade.basketId && known.has(trade.basketId) ? trade.basketId : null })) };
}

/** Validates a fill before it is booked; returns a user-facing message or '' when valid. */
export function validateFill(input: { qty: number; price: number; lot: number; date: string }): string {
    if (!(input.qty > 0)) return 'Quantity must be greater than 0.';
    if (!(input.price > 0)) return 'Price must be greater than 0.';
    if (!(input.lot >= 1)) return 'Lot size is not available for this contract.';
    if (!isIsoDate(input.date)) return 'Enter a valid trade date.';
    return '';
}

/* ---------------- position metrics ---------------- */

export const units = (p: Pick<OpenPosition, 'qty' | 'lot'>): number => Math.abs(p.qty) * p.lot;
export const invested = (p: OpenPosition): number => p.avg * units(p);

/** Exposure controlled: strike value for an option (not the premium), mark/cost value for a future. */
export function notional(p: OpenPosition): number {
    if (p.kind === 'option' && p.contract.strike) return p.contract.strike * units(p);
    return (p.cmp ?? p.avg) * units(p);
}

export const unrealised = (p: OpenPosition): number => (p.cmp === null || p.qty === 0 ? 0 : (p.cmp - p.avg) * p.qty * p.lot);

export const realisedTotal = (closed: readonly ClosedTrade[]): number => closed.reduce((sum, trade) => sum + trade.realised, 0);
export const unrealisedTotal = (positions: readonly OpenPosition[]): number => positions.reduce((sum, p) => sum + unrealised(p), 0);
export const notionalTotal = (positions: readonly OpenPosition[]): number => positions.reduce((sum, p) => sum + notional(p), 0);

/* ---------------- performance ---------------- */

export function maxDrawdown(trades: readonly ClosedTrade[]): DrawdownStats {
    let peak = 0, worst = 0, run = 0;
    let peakDate: string | null = null, troughDate: string | null = null;
    for (const trade of trades) {
        run += trade.realised;
        if (run > peak) { peak = run; peakDate = trade.exitDate; }
        if (run - peak < worst) { worst = run - peak; troughDate = trade.exitDate; }
    }
    return { amount: worst, pct: peak > 0 && worst < 0 ? (Math.abs(worst) / peak) * 100 : null, peakDate, troughDate };
}

export function tradeStats(trades: readonly ClosedTrade[]): TradeStats {
    const winners = trades.filter(t => t.realised > 0);
    const losers = trades.filter(t => t.realised < 0);
    const grossProfit = winners.reduce((s, t) => s + t.realised, 0);
    const grossLoss = -losers.reduce((s, t) => s + t.realised, 0);
    const net = trades.reduce((s, t) => s + t.realised, 0);
    return {
        trades: trades.length,
        wins: winners.length,
        losses: losers.length,
        winRate: trades.length ? (winners.length / trades.length) * 100 : 0,
        grossProfit,
        grossLoss,
        net,
        avgWin: winners.length ? grossProfit / winners.length : 0,
        avgLoss: losers.length ? grossLoss / losers.length : 0,
        largestWin: winners.length ? Math.max(...winners.map(t => t.realised)) : 0,
        largestLoss: losers.length ? Math.min(...losers.map(t => t.realised)) : 0,
        profitFactor: grossLoss > 0 ? grossProfit / grossLoss : null,
        expectancy: trades.length ? net / trades.length : 0,
        dd: maxDrawdown(trades),
    };
}

export function groupClosed(trades: readonly ClosedTrade[], group: PeriodGroup): PeriodSummary[] {
    const map = new Map<string, PeriodSummary>();
    for (const trade of trades) {
        const key = periodKey(trade.exitDate, group);
        const entry = map.get(key) ?? { key, trades: 0, wins: 0, realised: 0 };
        entry.trades++;
        if (trade.realised > 0) entry.wins++;
        entry.realised += trade.realised;
        map.set(key, entry);
    }
    return [...map.values()];
}

/** Inclusive exit-date filter; an empty bound is open-ended. */
export function filterByExitDate(trades: readonly ClosedTrade[], from: string, to: string): ClosedTrade[] {
    return trades.filter(t => !(from && t.exitDate < from) && !(to && t.exitDate > to));
}

/** Cumulative realised P&L, per trade (in closing order) or per period. Index 0 is the zero baseline. */
export function buildCurvePoints(trades: readonly ClosedTrade[], group: PeriodGroup): CurvePoint[] {
    const points: CurvePoint[] = [{ i: 0, v: 0, label: '' }];
    let run = 0;
    if (group === 'trade') {
        trades.forEach((trade, index) => {
            run += trade.realised;
            points.push({ i: index + 1, v: run, label: trade.exitDate });
        });
        return points;
    }
    groupClosed(trades, group).sort((a, b) => a.key.localeCompare(b.key)).forEach(entry => {
        run += entry.realised;
        points.push({ i: points.length, v: run, label: periodLabel(entry.key, group) });
    });
    return points;
}

/** Net realised P&L per trade or period (not cumulative). */
export function periodPnlSeries(trades: readonly ClosedTrade[], group: PeriodGroup): PeriodBar[] {
    if (group === 'trade') return trades.map(t => ({ label: dateLabel(t.exitDate), v: t.realised }));
    return groupClosed(trades, group)
        .sort((a, b) => a.key.localeCompare(b.key))
        .map(entry => ({ label: periodLabel(entry.key, group), v: entry.realised }));
}

export function realisedBySegment(trades: readonly ClosedTrade[]): Array<{ kind: ClosedTrade['kind']; realised: number }> {
    const totals = new Map<ClosedTrade['kind'], number>();
    for (const trade of trades) totals.set(trade.kind, (totals.get(trade.kind) ?? 0) + trade.realised);
    return [...totals].map(([kind, realised]) => ({ kind, realised }));
}

/* ---------------- basket EOD P&L (real EOD closes) ---------------- */

/**
 * Day-by-day EOD P&L of one basket. The sessions are the dates for which EOD closes exist for the basket's
 * contracts (plus any fill dates); each contract is marked at its close on that date, carried forward over
 * missing days. A contract with no EOD history at all is marked at its fill price (no unrealised), and is
 * reported in `unpriced` so the UI can say so. Nothing is synthesised.
 */
export function buildBasketEodSeries(
    basketId: string,
    fills: readonly LedgerFill[],
    prices: PriceHistory,
    maxRows = 40,
): { rows: BasketEodRow[]; unpriced: string[] } {
    const basketFills = fills.filter(f => f.basketId === basketId);
    // A fill tagged into the basket moves the whole position there (as in the prototype), so include
    // every fill of those contracts.
    const keys = new Set(basketFills.map(f => f.contract.key));
    const ordered = fills.map((fill, index) => ({ fill, index }))
        .filter(o => keys.has(o.fill.contract.key))
        .sort((a, b) => a.fill.date.localeCompare(b.fill.date) || a.index - b.index)
        .map(o => o.fill);
    if (!ordered.length) return { rows: [], unpriced: [] };

    const start = ordered[0].date;
    const daySet = new Set<string>(ordered.map(f => f.date));
    const unpriced: string[] = [];
    keys.forEach(key => {
        const history = prices.get(key);
        if (!history?.size) unpriced.push(ordered.find(f => f.contract.key === key)?.contract.label ?? key);
        history?.forEach((_close, date) => { if (date >= start) daySet.add(date); });
    });
    const days = [...daySet].sort();

    const state = new Map<string, { qty: number; avg: number; lot: number; real: number; lastFill: number }>();
    keys.forEach(key => state.set(key, { qty: 0, avg: 0, lot: 1, real: 0, lastFill: 0 }));
    const lastClose = new Map<string, number>();
    const openAtEnd = new Set<string>(replayLedger(ordered, []).positions.map(p => p.contract.key));

    let cursor = 0, prevLive = 0, prevSquared = 0;
    const rows: BasketEodRow[] = [];
    for (const day of days) {
        while (cursor < ordered.length && ordered[cursor].date <= day) {
            const fill = ordered[cursor++];
            const a = state.get(fill.contract.key)!;
            a.lot = fill.lot;
            a.lastFill = fill.price;
            const signed = fill.side === 'buy' ? fill.qty : -fill.qty;
            if (a.qty === 0) { a.qty = signed; a.avg = fill.price; }
            else if (a.qty > 0 === signed > 0) {
                const total = a.qty + signed;
                a.avg = (a.qty * a.avg + signed * fill.price) / total;
                a.qty = total;
            } else {
                const closing = Math.min(Math.abs(signed), Math.abs(a.qty));
                a.real += (fill.price - a.avg) * closing * fill.lot * (a.qty > 0 ? 1 : -1);
                const remaining = a.qty + signed;
                if (Math.abs(remaining) < 1e-12) { a.qty = 0; a.avg = 0; }
                else if (remaining > 0 === a.qty > 0) a.qty = remaining;
                else { a.qty = remaining; a.avg = fill.price; }
            }
        }
        let live = 0, squared = 0;
        state.forEach((a, key) => {
            const close = prices.get(key)?.get(day);
            if (close !== undefined) lastClose.set(key, close);
            const mark = lastClose.get(key) ?? a.lastFill;
            const total = a.real + (a.qty !== 0 && a.lastFill > 0 ? (mark - a.avg) * a.qty * a.lot : 0);
            if (openAtEnd.has(key)) live += total; else squared += total;
        });
        rows.push({ date: day, live: live - prevLive, squared: squared - prevSquared, day: live + squared - (prevLive + prevSquared), cum: live + squared });
        prevLive = live;
        prevSquared = squared;
    }
    return { rows: rows.slice(-maxRows), unpriced };
}

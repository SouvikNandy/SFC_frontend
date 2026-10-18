/*
 * EOD-close fallback for CMP. Used only for open positions whose Portfolio API `cmp` is null; a price the
 * backend supplies is never replaced. Pure functions, no I/O: the lookups live in PortfolioEodPriceService.
 */
import { EodDataRow } from '../eod/eod.model';
import { isNoTradeBar } from '../eod/eod-rows.util';
import { PortfolioPosition, PortfolioSummary } from './models/portfolio.model';
import { amount } from './portfolio-format';

/** A close price and the session it belongs to. */
export interface EodQuote {
    close: number;
    /** Session date, YYYY-MM-DD. */
    date: string;
}

/** Calendar days searched back from today for the latest session; older closes are treated as unavailable. */
export const EOD_LOOKBACK_DAYS = 10;

/** One contract per segment/symbol/type/strike/expiry, the same identity the Portfolio API uses. */
export function contractKey(p: Pick<PortfolioPosition, 'segment' | 'symbol' | 'type' | 'strike' | 'expiry_date'>): string {
    const strike = amount(p.strike);
    return [p.segment, p.symbol.toUpperCase(), p.type, strike === null ? '' : strike, p.expiry_date.slice(0, 10)].join('|');
}

/** True when the Portfolio API gave neither price nor P&L, so an EOD close may fill in. */
export const needsEodPrice = (p: PortfolioPosition): boolean => amount(p.cmp) === null && amount(p.unrealised) === null;

/**
 * Latest usable close in a page of `/fo/eod` rows: the newest session on which the contract traded.
 * A no-trade row carries a stale close from an earlier session, so it is skipped; the quote then keeps
 * the date of the session the close really belongs to.
 */
export function pickLatestClose(rows: readonly EodDataRow[]): EodQuote | null {
    const traded = rows
        .filter(row => !isNoTradeBar(row) && Number.isFinite(row.close) && row.close > 0)
        .sort((a, b) => b.date.localeCompare(a.date));
    return traded.length ? { close: traded[0].close, date: traded[0].date } : null;
}

/**
 * Monthly futures expiry that is nearest on or after `onOrAfter`. The listed expiries mix weeklies and monthlies,
 * and a monthly is the last listed expiry of its calendar month.
 */
export function nearestMonthlyExpiry(expiries: readonly string[], onOrAfter: string): string | null {
    const sorted = [...new Set(expiries.map(e => e.slice(0, 10)))].sort();
    const monthly = sorted.filter((expiry, i) => sorted[i + 1]?.slice(0, 7) !== expiry.slice(0, 7));
    return monthly.find(expiry => expiry >= onOrAfter) ?? null;
}

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

/** The Portfolio API formula: (cmp − avg_cost) × lots × lot size, negated for SHORT. */
export function unrealisedAt(p: PortfolioPosition, cmp: number): number | null {
    const avg = amount(p.avg_cost);
    if (avg === null) return null;
    return round2((cmp - avg) * p.qnt * p.lot_size * (p.direction === 'SHORT' ? -1 : 1));
}

export interface OverlayResult {
    positions: PortfolioPosition[];
    /** Rows that received an EOD price. */
    priced: number;
    unrealisedDelta: number;
    notionalDelta: number;
}

/** Fills cmp/unrealised from EOD closes for rows that have none; every other row is returned untouched. */
export function overlayEodPrices(positions: readonly PortfolioPosition[], quotes: ReadonlyMap<string, EodQuote>): OverlayResult {
    let priced = 0, unrealisedDelta = 0, notionalDelta = 0;
    const out = positions.map(p => {
        const quote = needsEodPrice(p) ? quotes.get(contractKey(p)) : undefined;
        const unrealised = quote ? unrealisedAt(p, quote.close) : null;
        if (!quote || unrealised === null) return p;
        priced++;
        unrealisedDelta += unrealised;
        const units = p.qnt * p.lot_size;
        let notional = p.notional;
        // Futures notional is price × units (cmp, else avg_cost); option notional is strike-based and unchanged.
        if (p.segment === 'FUT') {
            const oldNotional = amount(p.notional), avg = amount(p.avg_cost);
            if (oldNotional !== null && avg !== null) {
                const next = round2(quote.close * units);
                notionalDelta += next - oldNotional;
                notional = next.toFixed(2);
            }
        }
        return { ...p, cmp: quote.close.toFixed(2), unrealised: unrealised.toFixed(2), notional, cmp_source: 'eod' as const, cmp_date: quote.date };
    });
    return { positions: out, priced, unrealisedDelta, notionalDelta };
}

/** Summary totals adjusted for the rows that received an EOD price. */
export function adjustSummary(summary: PortfolioSummary, overlay: Pick<OverlayResult, 'priced' | 'unrealisedDelta' | 'notionalDelta'>): PortfolioSummary {
    if (!overlay.priced) return summary;
    return {
        ...summary,
        priced: summary.priced + overlay.priced,
        notional: round2(summary.notional + overlay.notionalDelta),
        unrealised: round2(summary.unrealised + overlay.unrealisedDelta),
        total: round2(summary.total + overlay.unrealisedDelta),
    };
}

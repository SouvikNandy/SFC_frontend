import { describe, expect, it } from 'vitest';
import { EodDataRow } from '../eod/eod.model';
import { PortfolioPosition, PortfolioSummary } from './models/portfolio.model';
import { adjustSummary, contractKey, needsEodPrice, nearestMonthlyExpiry, overlayEodPrices, pickLatestClose, unrealisedAt } from './portfolio-eod-price';

const position = (over: Partial<PortfolioPosition> = {}): PortfolioPosition => ({
    id: 'p1', segment: 'OPT', symbol: 'NIFTY', label: 'NIFTY 23150 CE', type: 'CE', strike: '23150.00', expiry_date: '2026-10-27',
    basket: null, basket_name: null, side: 'Buy', direction: 'LONG', qnt: 2, open_price: '100.00', date: '2026-10-15', lot_size: 65,
    avg_cost: '100.0000', cmp: null, notional: '3009500.00', unrealised: null, realised: null, closing_price: null, close_date: null, ...over,
});
const bar = (date: string, over: Partial<EodDataRow> = {}): EodDataRow => ({ date, symbol: 'NIFTY', open: 10, high: 12, low: 9, close: 11, volume: 100, oi: 5, ...over });
const summary: PortfolioSummary = { open_positions: 2, priced: 0, notional: 5_000_000, unrealised: 0, realised: 100, total: 100, closed_trades: 1 };

describe('portfolio EOD price fallback', () => {
    it('keys a contract by segment, symbol, type, strike and expiry', () => {
        expect(contractKey(position())).toBe('OPT|NIFTY|CE|23150|2026-10-27');
        expect(contractKey(position({ segment: 'FUT', type: '', strike: null, symbol: 'nifty' }))).toBe('FUT|NIFTY|||2026-10-27');
        expect(contractKey(position({ type: 'PE' }))).not.toBe(contractKey(position()));
        expect(contractKey(position({ expiry_date: '2026-11-03' }))).not.toBe(contractKey(position()));
    });

    it('only asks for a price when the API supplied neither cmp nor unrealised', () => {
        expect(needsEodPrice(position())).toBe(true);
        expect(needsEodPrice(position({ cmp: '131.00' }))).toBe(false);
        expect(needsEodPrice(position({ unrealised: '10.00' }))).toBe(false);
    });

    it('takes the newest traded close and skips no-trade rows carrying a stale close', () => {
        const rows = [bar('2026-10-14', { close: 50 }), bar('2026-10-16', { open: 0, high: 0, low: 0, volume: 0, close: 99 }), bar('2026-10-15', { close: 60 })];
        expect(pickLatestClose(rows)).toEqual({ close: 60, date: '2026-10-15' });
        expect(pickLatestClose([bar('2026-10-16', { open: 0, high: 0, low: 0, volume: 0 })])).toBeNull();
        expect(pickLatestClose([bar('2026-10-16', { close: Number.NaN })])).toBeNull();
        expect(pickLatestClose([])).toBeNull();
    });

    it('treats the last listed expiry of each month as the monthly one', () => {
        const listed = ['2026-10-19', '2026-10-27', '2026-11-03', '2026-11-09', '2026-11-23', '2026-12-29'];
        expect(nearestMonthlyExpiry(listed, '2026-10-16')).toBe('2026-10-27');
        expect(nearestMonthlyExpiry(listed, '2026-10-27')).toBe('2026-10-27');
        expect(nearestMonthlyExpiry(listed, '2026-10-28')).toBe('2026-11-23');
        expect(nearestMonthlyExpiry(listed, '2027-01-01')).toBeNull();
    });

    it('computes unrealised as (cmp - avg) x lots x lot size, negated for SHORT', () => {
        expect(unrealisedAt(position(), 131)).toBe(31 * 2 * 65);
        expect(unrealisedAt(position({ direction: 'SHORT', side: 'Sell' }), 131)).toBe(-31 * 2 * 65);
        expect(unrealisedAt(position({ direction: 'SHORT', side: 'Sell' }), 80)).toBe(20 * 2 * 65);
        expect(unrealisedAt(position({ avg_cost: 'x' }), 131)).toBeNull();
    });

    it('fills an unpriced row with the exact contract quote and labels its source and date', () => {
        const p = position();
        const result = overlayEodPrices([p], new Map([[contractKey(p), { close: 131, date: '2026-10-16' }]]));
        expect(result.priced).toBe(1);
        expect(result.positions[0]).toMatchObject({ cmp: '131.00', unrealised: '4030.00', cmp_source: 'eod', cmp_date: '2026-10-16', notional: '3009500.00' });
        expect(result.unrealisedDelta).toBe(4030);
        expect(result.notionalDelta).toBe(0);
    });

    it('leaves rows alone when there is no matching quote, or the quote is for another contract', () => {
        const p = position();
        const other = new Map([[contractKey(position({ expiry_date: '2026-11-03' })), { close: 5, date: '2026-10-16' }]]);
        for (const quotes of [new Map(), other]) {
            const result = overlayEodPrices([p], quotes);
            expect(result.priced).toBe(0);
            expect(result.positions[0]).toBe(p);
            expect(result.positions[0].cmp).toBeNull();
            expect(result.positions[0].unrealised).toBeNull();
        }
    });

    it('never overwrites a backend-supplied cmp or unrealised', () => {
        const priced = position({ cmp: '120.00', unrealised: '2600.00' });
        const result = overlayEodPrices([priced], new Map([[contractKey(priced), { close: 999, date: '2026-10-16' }]]));
        expect(result.priced).toBe(0);
        expect(result.positions[0]).toBe(priced);
    });

    it('re-bases futures notional on the EOD close (price x units) and moves it in the summary', () => {
        const fut = position({ segment: 'FUT', type: '', strike: null, label: 'NIFTY', avg_cost: '23000.0000', qnt: 1, lot_size: 65, notional: '1495000.00' });
        const result = overlayEodPrices([fut], new Map([[contractKey(fut), { close: 23119.2, date: '2026-10-16' }]]));
        expect(result.positions[0].notional).toBe('1502748.00');
        expect(result.positions[0].unrealised).toBe('7748.00');
        const adjusted = adjustSummary(summary, result);
        expect(adjusted).toMatchObject({ priced: 1, unrealised: 7748, total: 7848, notional: 5_007_748 });
    });

    it('leaves the summary untouched when nothing was priced', () => {
        expect(adjustSummary(summary, { priced: 0, unrealisedDelta: 0, notionalDelta: 0 })).toBe(summary);
    });
});

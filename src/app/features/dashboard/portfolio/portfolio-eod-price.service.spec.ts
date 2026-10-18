import { TestBed } from '@angular/core/testing';
import { firstValueFrom, of, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { EodRequest } from '../eod/eod.model';
import { EodService } from '../eod/eod.service';
import { PortfolioPosition } from './models/portfolio.model';
import { contractKey } from './portfolio-eod-price';
import { PortfolioEodPriceService } from './portfolio-eod-price.service';
import { PortfolioMarketService } from './portfolio-market.service';

const position = (over: Partial<PortfolioPosition> = {}): PortfolioPosition => ({
    id: 'p1', segment: 'OPT', symbol: 'NIFTY', label: 'NIFTY 23150 CE', type: 'CE', strike: '23150.00', expiry_date: '2026-10-27',
    basket: null, basket_name: null, side: 'Buy', direction: 'LONG', qnt: 1, open_price: '100.00', date: '2026-10-15', lot_size: 65,
    avg_cost: '100.0000', cmp: null, notional: '1', unrealised: null, realised: null, closing_price: null, close_date: null, ...over,
});
const bar = (date: string, close: number) => ({ date, symbol: 'NIFTY', open: 1, high: 2, low: 1, close, volume: 10, oi: 1 });
const page = (results: unknown[]) => of({ success: true, data: { results, page: 1, has_next: false, has_previous: false } });

function setup(getEod: (r: EodRequest) => ReturnType<typeof page>, expiries = ['2026-10-19', '2026-10-27', '2026-11-03', '2026-11-23']) {
    const eod = { getEod: vi.fn(getEod) };
    const market = { getCatalog: vi.fn(() => of({ symbol: 'NIFTY', expiries, strikes: [], atmStrike: null, tradeDate: null, lot: 65 })) };
    TestBed.configureTestingModule({ providers: [{ provide: EodService, useValue: eod }, { provide: PortfolioMarketService, useValue: market }] });
    return { service: TestBed.inject(PortfolioEodPriceService), eod, market };
}

describe('PortfolioEodPriceService', () => {
    it('requests the exact option contract (symbol, CE/PE, strike, expiry) and returns its latest traded close', async () => {
        const { service, eod } = setup(() => page([bar('2026-10-16', 131), bar('2026-10-15', 120)]));
        const p = position();
        const quotes = await firstValueFrom(service.quotesFor([p]));
        expect(quotes.get(contractKey(p))).toEqual({ close: 131, date: '2026-10-16' });
        const req = eod.getEod.mock.calls[0][0];
        expect(req).toMatchObject({ symbol: 'NIFTY', option_type: 'CE', strike: 23150, expiry: '2026-10-27', page: 1 });
    });

    it('does not request positions the API already priced, and caches repeat lookups', async () => {
        const { service, eod } = setup(() => page([bar('2026-10-16', 131)]));
        expect((await firstValueFrom(service.quotesFor([position({ cmp: '120.00' })]))).size).toBe(0);
        expect(eod.getEod).not.toHaveBeenCalled();
        await firstValueFrom(service.quotesFor([position()]));
        await firstValueFrom(service.quotesFor([position({ id: 'p2' })]));
        expect(eod.getEod).toHaveBeenCalledTimes(1);
    });

    it('prices a futures position only when its expiry is the nearest monthly expiry', async () => {
        const { service, eod } = setup(() => page([bar('2026-10-16', 23119.2)]));
        const nearest = position({ segment: 'FUT', type: '', strike: null, expiry_date: '2026-10-27' });
        const weekly = position({ id: 'p2', segment: 'FUT', type: '', strike: null, expiry_date: '2026-10-19' });
        const next = position({ id: 'p3', segment: 'FUT', type: '', strike: null, expiry_date: '2026-11-23' });
        const quotes = await firstValueFrom(service.quotesFor([nearest, weekly, next]));
        expect([...quotes.keys()]).toEqual([contractKey(nearest)]);
        expect(eod.getEod.mock.calls[0][0].option_type).toBe('XX');
        expect(eod.getEod.mock.calls[0][0].expiry).toBeUndefined();
        expect(eod.getEod).toHaveBeenCalledTimes(1);
    });

    it('leaves a contract unpriced when the lookup fails or returns nothing', async () => {
        const failing = setup(() => throwError(() => new Error('500')) as never);
        expect((await firstValueFrom(failing.service.quotesFor([position()]))).size).toBe(0);
        TestBed.resetTestingModule();
        const empty = setup(() => page([]));
        expect((await firstValueFrom(empty.service.quotesFor([position()]))).size).toBe(0);
    });

    it('skips an option row that has no strike or type', async () => {
        const { service, eod } = setup(() => page([bar('2026-10-16', 1)]));
        expect((await firstValueFrom(service.quotesFor([position({ strike: null })]))).size).toBe(0);
        expect(eod.getEod).not.toHaveBeenCalled();
    });
});

import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter, Router } from '@angular/router';
import { signal } from '@angular/core';
import { Subject, of, throwError } from 'rxjs';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';
import { PortfolioComponent } from './portfolio.component';
import { PortfolioApiError, PortfolioApiService } from './portfolio-api.service';
import { PortfolioMarketService } from './portfolio-market.service';
import { PortfolioEodPriceService } from './portfolio-eod-price.service';
import { contractKey } from './portfolio-eod-price';
import {
  BasketsData,
  ClosedListData,
  OpenListData,
  PerformanceData,
  PortfolioPosition,
  PortfolioSummary,
} from './models/portfolio.model';

const summary = (over: Partial<PortfolioSummary> = {}): PortfolioSummary =>
  ({ open_positions: 2, priced: 1, notional: 4375000, unrealised: 1575, realised: 2212.5, total: 3787.5, closed_trades: 1, ...over });

const position = (over: Partial<PortfolioPosition> = {}): PortfolioPosition => ({
  id: 'p1', segment: 'OPT', symbol: 'NIFTY', label: 'NIFTY 24500 CE', type: 'CE', strike: '24500.00', expiry_date: '2026-11-26',
  basket: null, basket_name: null, side: 'Buy', direction: 'LONG', qnt: 2, open_price: '120.50', date: '2026-10-12', lot_size: 75,
  avg_cost: '120.5000', cmp: '131.00', notional: '3675000.00', unrealised: '1575.00', realised: null, closing_price: null, close_date: null, dte: 40, ...over,
});

const closedRow = (over: Partial<PortfolioPosition> = {}): PortfolioPosition =>
  position({ id: 'c1', qnt: 1, cmp: null, unrealised: '0.00', realised: '2212.50', closing_price: '150.00', close_date: '2026-10-17', dte: undefined, ...over });

const openData = (over: Partial<OpenListData> = {}): OpenListData => ({
  summary: summary(), segment_counts: { all: 2, FUT: 1, OPT: 1 }, expiring_soon: 0,
  results: [position(), position({ id: 'p2', segment: 'FUT', symbol: 'TCS', label: 'TCS', type: '', strike: null, cmp: null, unrealised: null, notional: '38500.00', dte: 3, avg_cost: '3850.0000' })], ...over,
});

const basketsData = (over: Partial<BasketsData> = {}): BasketsData => ({
  summary: summary(),
  baskets: [{ id: 'b1', name: 'Weekly', open_count: 1, closed_count: 3, unrealised: 1575, realised: 2212.5, open_positions: [position({ basket: 'b1', basket_name: 'Weekly' })],
    closed_trades: [closedRow({ basket: 'b1' })], closed_trades_truncated: true }],
  unassigned: { open_count: 1, unrealised: 0, open_positions: [position({ id: 'p9', label: 'TCS', segment: 'FUT', cmp: null, unrealised: null })] }, ...over,
});

const perf = (over: Partial<PerformanceData> = {}): PerformanceData => ({
  group: 'trade', date_from: null, date_to: null, has_closed_trades: true, summary: summary(),
  metrics: { trades: 2, wins: 1, losses: 1, win_rate: 50, gross_profit: 2212.5, gross_loss: 500, net: 1712.5, avg_win: 2212.5, avg_loss: 500, largest_win: 2212.5, largest_loss: -500,
    profit_factor: 4.42, expectancy: 856.25, max_drawdown: { amount: -500, pct: 22.6, peak_date: '2026-10-17', trough_date: '2026-10-18' } },
  curve: [{ index: 0, key: null, value: 0, peak: 0 }, { index: 1, key: '2026-10-17', value: 2212.5, peak: 2212.5 }, { index: 2, key: '2026-10-18', value: 1712.5, peak: 2212.5 }],
  period_pnl: [{ key: '2026-10-17', value: 2212.5 }, { key: '2026-10-18', value: -500 }], by_segment: { OPT: 1712.5 }, ...over,
});

const closedTrades = (over: Partial<ClosedListData> = {}): ClosedListData =>
  ({ group: 'trade', summary: summary(), totals: { closed_trades: 30, profitable: 18 }, results: [closedRow()], page: 1, has_next: true, has_previous: false, ...over } as ClosedListData);

describe('PortfolioComponent (live Portfolio API)', () => {
  let fixture: ReturnType<typeof TestBed.createComponent<PortfolioComponent>>;
  let component: PortfolioComponent;
  let host: HTMLElement;
  const api = {
    add: vi.fn(), squareOff: vi.fn(), openList: vi.fn(), closedList: vi.fn(), performance: vi.fn(),
    baskets: vi.fn(), basketChart: vi.fn(), renameBasket: vi.fn(), removeBasket: vi.fn(),
  };

  const eodPrices = { quotesFor: vi.fn(), contractQuote: vi.fn() };
  const settle = async () => { await fixture.whenStable(); fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges(); };
  const click = async (selector: string, text?: string) => {
    const nodes = Array.from(host.querySelectorAll<HTMLElement>(selector));
    const node = text ? nodes.find(n => n.textContent?.trim().startsWith(text)) : nodes[0];
    expect(node, `${selector} ${text ?? ''}`).toBeTruthy();
    node!.click();
    await settle();
  };
  const err = (status: number, message: string, fields: Record<string, string[]> = {}) => throwError(() => new PortfolioApiError(message, status, '', fields));

  async function create(authenticated = true) {
    for (const fn of Object.values(api)) fn.mockReset();
    eodPrices.quotesFor.mockReset().mockReturnValue(of(new Map()));
    eodPrices.contractQuote.mockReset().mockReturnValue(of(null));
    api.openList.mockReturnValue(of(openData()));
    api.baskets.mockReturnValue(of(basketsData()));
    api.closedList.mockReturnValue(of(closedTrades()));
    api.performance.mockReturnValue(of(perf()));
    vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: () => undefined, removeEventListener: () => undefined }));
    await TestBed.configureTestingModule({
      imports: [PortfolioComponent],
      providers: [
        provideHttpClient(), provideRouter([]),
        { provide: AuthService, useValue: { isAuthenticated: signal(authenticated) } },
        { provide: PortfolioApiService, useValue: api },
        { provide: PortfolioEodPriceService, useValue: eodPrices },
        { provide: PortfolioMarketService, useValue: {
          getUnderlyings: () => of(['NIFTY', 'TCS']),
          getCatalog: (symbol: string) => of({ symbol, strikes: [24400, 24500, 24600], atmStrike: 24500, tradeDate: '2026-10-16', expiries: ['2026-11-26', '2026-12-31'], lot: 75 }),
        } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(PortfolioComponent);
    component = fixture.componentInstance;
    host = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    await settle();
  }

  afterEach(() => vi.unstubAllGlobals());

  describe('signed out', () => {
    beforeEach(() => create(false));

    it('shows a sign-in prompt and calls no Portfolio API', async () => {
      expect(host.textContent).toContain('sign in');
      expect(api.openList).not.toHaveBeenCalled();
      expect(api.baskets).not.toHaveBeenCalled();
      const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
      await click('button.primary', 'Sign in');
      expect(navigate).toHaveBeenCalledWith(['/login'], { queryParams: { returnUrl: '/dashboard/portfolio' } });
    });
  });

  describe('signed in', () => {
    beforeEach(() => create(true));

    it('is titled Portfolio Analysis, states the paper-trading scope, and loads open positions and baskets', () => {
      expect(host.querySelector('h2')?.textContent).toContain('Portfolio Analysis');
      expect(host.textContent).toContain('Read, sync and analytics only');
      expect(api.openList).toHaveBeenCalledWith({ segment: 'all', sort_by: 'notional', sort_dir: 'desc' });
      expect(api.baskets).toHaveBeenCalledWith({ closed_limit: 50 });
      expect(host.textContent).toContain('Close (EOD) · 16 Oct 2026');
    });

    it('KPI strip uses the backend summary (no frontend recalculation)', () => {
      const values = Array.from(host.querySelectorAll('.stat-value')).map(e => e.textContent?.trim());
      expect(values).toEqual(['₹43,75,000', '+₹1,575', '+₹2,213', '+₹3,788']);
      expect(host.textContent).toContain('1 of 2 priced · EOD');
    });

    it('open table renders backend rows: segment tag, DTE warning, CMP and unrealised "not priced" instead of zero', () => {
      expect(host.querySelectorAll('.tbl tbody tr')).toHaveLength(2);
      const futures = host.querySelectorAll('.tbl tbody tr')[1].textContent ?? '';
      expect(futures).toContain('not priced');
      expect(futures).toContain('—');
      expect(futures).not.toContain('₹0');
      expect(futures).toContain('3d');
      expect(host.querySelector('.tbl tbody tr td.num.pos')?.textContent).toContain('+₹1,575');
    });

    it('KPI unrealised shows "—" (not ₹0) while no open position has a price', async () => {
      api.openList.mockReturnValue(of(openData({ summary: summary({ priced: 0, unrealised: 0 }) })));
      component.loadOpen();
      await settle();
      expect(host.querySelectorAll('.stat-value')[1].textContent?.trim()).toBe('—');
      expect(host.textContent).toContain('No end-of-day prices yet');
      expect(host.textContent).toContain('Realised only');
    });

    describe('Price field prefill', () => {
      const priceInput = () => host.querySelector<HTMLInputElement>('#pf-price')!;
      const hint = () => priceInput().parentElement!.querySelector('.hint')!.textContent?.trim();

      it('prefills the latest EOD close of the chosen contract, labelled and editable', async () => {
        eodPrices.contractQuote.mockReturnValue(of({ close: 24310.5, date: '2026-10-16' }));
        component.onExpiry('2026-12-31');
        await settle();
        expect(eodPrices.contractQuote).toHaveBeenLastCalledWith({ segment: 'FUT', symbol: 'NIFTY', expiry_date: '2026-12-31', type: '', strike: null });
        expect(priceInput().value).toBe('24310.50');
        expect(hint()).toContain('Close (EOD) · 16 Oct');
        priceInput().value = '24300';
        priceInput().dispatchEvent(new Event('input', { bubbles: true }));
        expect(component.fillPrice()).toBe('24300');             // the user's fill wins until the contract changes
      });

      it('requests the exact option contract (type and strike) after switching to Options', async () => {
        eodPrices.contractQuote.mockReturnValue(of({ close: 131, date: '2026-10-16' }));
        component.setSegment('OPT');
        component.setOptionType('PE');
        component.onStrike('24600');
        await settle();
        expect(eodPrices.contractQuote).toHaveBeenLastCalledWith({ segment: 'OPT', symbol: 'NIFTY', expiry_date: '2026-11-26', type: 'PE', strike: '24600.00' });
        expect(priceInput().value).toBe('131.00');
      });

      it('clears a stale price and says so when the contract has no EOD price', async () => {
        eodPrices.contractQuote.mockReturnValue(of({ close: 100, date: '2026-10-16' }));
        component.onExpiry('2026-12-31');
        await settle();
        eodPrices.contractQuote.mockReturnValue(of(null));
        component.onExpiry('2026-11-26');
        await settle();
        expect(priceInput().value).toBe('');
        expect(hint()).toContain('No EOD price for this contract');
      });
    });
    describe('EOD close as CMP when the API has none', () => {
      const unpriced = position({ id: 'p2', segment: 'FUT', symbol: 'TCS', label: 'TCS', type: '', strike: null, cmp: null, unrealised: null, notional: '577500.00', dte: 3, avg_cost: '3850.0000' });
      const reload = async (quotes: Map<string, { close: number; date: string }>) => {
        eodPrices.quotesFor.mockReturnValue(of(quotes));
        api.baskets.mockReturnValue(of(basketsData({ unassigned: { open_count: 1, unrealised: 0, open_positions: [unpriced] } })));   // the same open positions as the open list
        component.loadOpen();
        component.loadBaskets();
        await settle();
      };

      it('shows the EOD close with its date, computes unrealised from it, and updates the KPIs', async () => {
        await reload(new Map([[contractKey(unpriced), { close: 3900, date: '2026-10-16' }]]));
        const row = host.querySelectorAll('.tbl tbody tr')[1].textContent ?? '';
        expect(row).toContain('3,900.00');
        expect(row).toContain('Close (EOD) · 16 Oct');
        expect(row).not.toContain('not priced');
        expect(row).toContain('+₹7,500');                       // (3900 − 3850) × 2 lots × 75
        expect(host.querySelectorAll('.stat-value')[1].textContent?.trim()).toBe('+₹9,075');   // 1,575 from the API + 7,500
        expect(host.textContent).toContain('not live prices');
      });

      it('keeps a different contract unpriced', async () => {
        await reload(new Map([[contractKey({ ...unpriced, expiry_date: '2026-12-31' }), { close: 3900, date: '2026-10-16' }]]));
        const row = host.querySelectorAll('.tbl tbody tr')[1].textContent ?? '';
        expect(row).toContain('not priced');
        expect(row).not.toContain('Close (EOD)');
        expect(host.querySelectorAll('.stat-value')[1].textContent?.trim()).toBe('+₹1,575');
      });

      it('never overrides a price the API supplied', async () => {
        await reload(new Map([[contractKey(position()), { close: 999, date: '2026-10-16' }]]));
        const row = host.querySelectorAll('.tbl tbody tr')[0].textContent ?? '';
        expect(row).toContain('131.00');
        expect(row).not.toContain('Close (EOD)');
        expect(row).toContain('+₹1,575');
      });

      it('adds EOD-priced P&L to the unassigned bucket and labels its rows in Baskets', async () => {
        await reload(new Map([[contractKey(unpriced), { close: 3900, date: '2026-10-16' }]]));
        await click('.tabbar button', 'Baskets');
        const unassigned = host.querySelectorAll('.basket-card')[1].textContent ?? '';
        expect(unassigned).toContain('+₹7,500 unrealised');
        expect(unassigned).toContain('Close (EOD) · 16 Oct');
      });
    });

    it('segment chips use segment_counts and filtering calls the API (server-side)', async () => {
      expect(Array.from(host.querySelectorAll('.chip')).map(c => c.textContent?.trim())).toEqual(['All · 2', 'Futures · 1', 'Options · 1']);
      api.openList.mockClear();
      await click('.chip', 'Options');
      expect(api.openList).toHaveBeenCalledWith({ segment: 'OPT', sort_by: 'notional', sort_dir: 'desc' });
    });

    it('sorting sends sort_by / sort_dir and toggles direction', async () => {
      api.openList.mockClear();
      await click('th button.sort', 'Qty / lots');
      expect(api.openList).toHaveBeenLastCalledWith({ segment: 'all', sort_by: 'qnt', sort_dir: 'desc' });
      await click('th button.sort', 'Qty / lots');
      expect(api.openList).toHaveBeenLastCalledWith({ segment: 'all', sort_by: 'qnt', sort_dir: 'asc' });
      expect(host.querySelector('th[aria-sort="ascending"]')).toBeTruthy();
    });

    it('a slow response for an earlier filter never overwrites a newer one', async () => {
      const slow = new Subject<OpenListData>();
      api.openList.mockReturnValueOnce(slow).mockReturnValueOnce(of(openData({ results: [position({ id: 'new', label: 'NEWEST' })] })));
      component.setSegFilter('FUT');
      component.setSegFilter('OPT');
      await settle();
      slow.next(openData({ results: [position({ id: 'old', label: 'STALE' })] }));
      await settle();
      expect(host.textContent).toContain('NEWEST');
      expect(host.textContent).not.toContain('STALE');
    });

    it('an API failure shows the error with a retry, not an empty portfolio', async () => {
      api.openList.mockReturnValue(err(500, 'Something went wrong. Please try again.'));
      component.loadOpen();
      await settle();
      expect(host.querySelector('[role="alert"]')?.textContent).toContain('Something went wrong');
      api.openList.mockReturnValue(of(openData()));
      await click('[role="alert"] button', 'Retry');
      expect(host.querySelector('[role="alert"]')).toBeNull();
    });

    it('401 (expired or invalid token): one notification, a sign-in prompt, and no raw server text', async () => {
      api.openList.mockReturnValue(err(401, 'Your session has expired. Please sign in again.'));
      api.baskets.mockReturnValue(err(401, 'Your session has expired. Please sign in again.'));
      component.loadOpen();
      component.loadBaskets();
      await settle();
      expect(host.querySelector('[aria-label="Sign in required"]')?.textContent).toContain('session has expired');
      expect(host.querySelector('.form-grid')).toBeNull();                     // the portfolio is replaced, not shown empty
      expect(TestBed.inject(ToastService).messages()).toHaveLength(1);         // not one toast per failed call
      const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
      await click('button.primary', 'Sign in');
      expect(navigate).toHaveBeenCalledWith(['/login'], { queryParams: { returnUrl: '/dashboard/portfolio' } });
    });

    it('an empty successful response is an empty state, not an error', async () => {
      api.openList.mockReturnValue(of(openData({ results: [], summary: summary({ open_positions: 0, priced: 0, notional: 0 }), segment_counts: { all: 0, FUT: 0, OPT: 0 } })));
      component.loadOpen();
      await settle();
      expect(host.textContent).toContain('No open positions.');
      expect(host.querySelector('[role="alert"]')).toBeNull();
    });

    describe('recording a fill', () => {
      const addResult = (action: string, extra: Record<string, unknown> = {}) =>
        of({ action, realised: '0.00', position: position({ basket: 'b1', basket_name: 'Weekly' }), closed_trades: [], ...extra });

      it('options: sends the exact API fields, quantity in lots, strings for decimals, and refreshes the data', async () => {
        api.add.mockReturnValue(addResult('opened'));
        await click('.form-grid.top .seg button', 'Options');
        component.onStrike('24500');
        component.qty.set('3');
        component.fillPrice.set('120.5');
        component.fillDate.set('2026-10-12');
        component.optionType.set('PE');
        component.side.set('Sell');
        api.openList.mockClear(); api.baskets.mockClear();
        component.record();
        await settle();
        expect(api.add).toHaveBeenCalledWith({
          segment: 'OPT', symbol: 'NIFTY', type: 'PE', strike: '24500.00', expiry_date: '2026-11-26', side: 'Sell', qnt: 3,
          open_price: '120.50', date: '2026-10-12', lot_size: 75,
        });
        expect(host.textContent).toContain('Opened NIFTY 24500.00 PE 26 Nov 2026');
        expect(host.textContent).toContain('Ledger entry only; no order was placed');
        expect(api.openList).toHaveBeenCalled();
        expect(api.baskets).toHaveBeenCalled();
      });

      it('futures: no type or strike is sent', async () => {
        api.add.mockReturnValue(addResult('opened'));
        component.fillPrice.set('24800');
        component.record();
        await settle();
        const body = api.add.mock.calls[0][0];
        expect(body).toMatchObject({ segment: 'FUT', symbol: 'NIFTY', side: 'Buy', qnt: 1, open_price: '24800.00', lot_size: 75 });
        expect(body).not.toHaveProperty('type');
        expect(body).not.toHaveProperty('strike');
      });

      it('sends basket_id for an existing basket and basket_name for a new one, never both', async () => {
        api.add.mockReturnValue(addResult('opened'));
        component.fillPrice.set('100');
        component.onBasketChoice('b1');
        component.record();
        await settle();
        expect(api.add.mock.calls[0][0]).toMatchObject({ basket_id: 'b1' });
        expect(api.add.mock.calls[0][0]).not.toHaveProperty('basket_name');
        component.onBasketChoice('__new__');
        component.newBasketName.set('  Monthly ');
        component.record();
        await settle();
        expect(api.add.mock.calls[1][0]).toMatchObject({ basket_name: 'Monthly' });
        expect(api.add.mock.calls[1][0]).not.toHaveProperty('basket_id');
      });

      it.each([
        ['added', 'Added to'], ['reduced', 'Reduced'], ['closed', 'Closed'], ['flipped', 'Flipped'],
      ])('handles the %s action', async (action, verb) => {
        api.add.mockReturnValue(addResult(action, { realised: '2212.50', position: action === 'closed' ? null : position() }));
        component.fillPrice.set('100');
        component.record();
        await settle();
        expect(component.entryMessage()).toContain(verb);
        expect(component.entryMessage()).toContain('Realised ₹2,212.50');
        if (action === 'flipped') expect(component.entryMessage()).toContain('new long position');
      });

      it('refreshes closed trades and performance when those views are shown after a fill', async () => {
        api.add.mockReturnValue(addResult('closed', { position: null, closed_trades: [closedRow()] }));
        await click('.tabbar button', 'Closed trades');
        api.closedList.mockClear();
        component.fillPrice.set('100');
        component.record();
        await settle();
        expect(api.closedList).toHaveBeenCalled();
        api.performance.mockClear();
        await click('.tabbar button', 'Performance');
        expect(api.performance).toHaveBeenCalledTimes(1);
      });

      it('validates qty, price, dates and the new-basket name before calling the API', async () => {
        component.qty.set('0'); component.fillPrice.set('100'); component.record();
        expect(component.entryError()).toContain('Quantity');
        component.qty.set('1.5'); component.record();
        expect(component.entryError()).toContain('whole number');
        component.qty.set('1'); component.fillPrice.set('0'); component.record();
        expect(component.entryError()).toContain('Price');
        component.fillPrice.set('100'); component.onBasketChoice('__new__'); component.record();
        expect(component.entryError()).toContain('name for the new basket');
        component.onBasketChoice(''); component.expiry.set('2026-01-01'); component.fillDate.set('2026-10-12'); component.record();
        expect(component.entryError()).toContain('Expiry cannot be before');
        expect(api.add).not.toHaveBeenCalled();
      });

      it('shows backend 422 messages and highlights the offending fields', async () => {
        api.add.mockReturnValue(err(422, 'bad', { qnt: ['Ensure this value is greater than or equal to 1.'], open_price: ['A valid number is required.'] }));
        component.fillPrice.set('100');
        component.record();
        await settle();
        expect(host.querySelector('[role="alert"]')?.textContent).toContain('Ensure this value is greater than or equal to 1.');
        expect(host.querySelector('#pf-qty')?.classList.contains('invalid')).toBe(true);
        expect(host.querySelector('#pf-price')?.classList.contains('invalid')).toBe(true);
        expect(component.entryMessage()).toBe('');
      });

      it('prevents duplicate submissions while a request is in flight', async () => {
        const pending = new Subject<never>();
        api.add.mockReturnValue(pending);
        component.fillPrice.set('100');
        component.record();
        component.record();
        await settle();
        expect(api.add).toHaveBeenCalledTimes(1);
        expect((host.querySelector('.form-grid.fill button.primary') as HTMLButtonElement).disabled).toBe(true);
      });
    });

    describe('square off', () => {
      it('closes part of a position: sends id, closing_price and qnt, then reports realised and the remainder', async () => {
        api.squareOff.mockReturnValue(of({ realised: '2212.50', closed_trade: closedRow({ qnt: 1 }), position: position({ qnt: 1 }) }));
        await click('button.row-btn', 'Square off');
        expect((host.querySelector('#pf-close-price') as HTMLInputElement).value).toBe('131.00');
        component.onCloseQty('1'); component.onClosePrice('150');
        api.openList.mockClear();
        component.confirmSquareOff();
        await settle();
        expect(api.squareOff).toHaveBeenCalledWith({ id: 'p1', closing_price: '150.00', qnt: 1 });
        expect(component.entryMessage()).toContain('realised ₹2,212.50');
        expect(component.entryMessage()).toContain('1 lot remain open');
        expect(component.dialog()).toBeNull();
        expect(api.openList).toHaveBeenCalled();
      });

      it('omits qnt to close every lot; defaults to average cost when there is no CMP', () => {
        api.squareOff.mockReturnValue(of({ realised: '-100.00', closed_trade: closedRow(), position: null }));
        component.openSquareOff(position({ cmp: null, avg_cost: '120.5000' }));
        expect(component.dialog()).toMatchObject({ kind: 'close', price: '120.50' });
        component.confirmSquareOff();
        expect(api.squareOff).toHaveBeenCalledWith({ id: 'p1', closing_price: '120.50' });
      });

      it('blocks more lots than are open and invalid prices without calling the API', () => {
        component.openSquareOff(position({ qnt: 2 }));
        component.onCloseQty('3'); component.confirmSquareOff();
        expect(component.dialog()).toMatchObject({ error: 'Cannot square off 3 lots; only 2 open.' });
        component.onCloseQty(''); component.onClosePrice('0'); component.confirmSquareOff();
        expect(component.dialog()).toMatchObject({ error: expect.stringContaining('closing price') });
        expect(api.squareOff).not.toHaveBeenCalled();
      });

      it('404: shows the backend message and reloads the stale list; 422 keeps the dialog open', async () => {
        component.openSquareOff(position());
        api.squareOff.mockReturnValue(err(404, 'Open position not found.'));
        api.openList.mockClear();
        component.confirmSquareOff();
        await settle();
        expect(component.dialog()).toMatchObject({ kind: 'close', error: 'Open position not found.', busy: false });
        expect(api.openList).toHaveBeenCalled();
        api.squareOff.mockReturnValue(err(422, 'Cannot square off 3 lots; only 2 open.'));
        component.confirmSquareOff();
        await settle();
        expect(host.querySelector('.modal-card [role="alert"]')?.textContent).toContain('only 2 open');
      });
    });

    describe('closed trades', () => {
      it('trade view: sends group, sort and pagination; renders backend values; Next/Previous page', async () => {
        await click('.tabbar button', 'Closed trades');
        expect(api.closedList).toHaveBeenLastCalledWith({ group: 'trade', sort_by: 'close_date', sort_dir: 'desc', page: 1, page_size: 25 });
        expect(host.querySelectorAll('.tbl tbody tr')).toHaveLength(1);
        expect(host.textContent).toContain('+₹2,213');
        expect(host.textContent).toContain('30 closed trades · 18 profitable');
        api.closedList.mockReturnValue(of(closedTrades({ page: 2, has_next: false, has_previous: true })));
        await click('.pager button', 'Next');
        expect(api.closedList).toHaveBeenLastCalledWith({ group: 'trade', sort_by: 'close_date', sort_dir: 'desc', page: 2, page_size: 25 });
        expect((host.querySelectorAll('.pager button')[1] as HTMLButtonElement).disabled).toBe(true);
        await click('th button.sort', 'Realised');
        expect(api.closedList).toHaveBeenLastCalledWith({ group: 'trade', sort_by: 'realised', sort_dir: 'desc', page: 1, page_size: 25 });
      });

      it('rows-per-page offers 10/25/50 (default 25), sends page_size and returns to page 1', async () => {
        await click('.tabbar button', 'Closed trades');
        const options = Array.from(host.querySelectorAll('.pager select option')).map(o => o.textContent?.trim());
        expect(options).toEqual(['10', '25', '50']);
        await click('.pager button', 'Next');
        expect(component.closedPage()).toBe(2);
        const select = host.querySelector('.pager select') as HTMLSelectElement;
        select.value = '50';
        select.dispatchEvent(new Event('change'));
        await settle();
        expect(api.closedList).toHaveBeenLastCalledWith({ group: 'trade', sort_by: 'close_date', sort_dir: 'desc', page: 1, page_size: 50 });
        component.setClosedPageSize('7');
        expect(component.closedPageSize()).toBe(50);
      });

      it('grouped view: renders period rows (no pagination) from key/start/end/trades/wins/win_rate/realised', async () => {
        await click('.tabbar button', 'Closed trades');
        api.closedList.mockReturnValue(of({ group: 'week', summary: summary(), totals: { closed_trades: 3, profitable: 2 },
          results: [{ key: '2026-10-12', start: '2026-10-12', end: '2026-10-18', trades: 3, wins: 2, win_rate: 66.6667, realised: 1500 }] }));
        await click('.group-seg button', 'Weekly');
        expect(api.closedList).toHaveBeenLastCalledWith(expect.objectContaining({ group: 'week' }));
        expect(host.textContent).toContain('12 Oct 2026 – 18 Oct 2026');
        expect(host.textContent).toContain('67%');
        expect(host.querySelector('.pager')).toBeNull();
      });

      it('empty state when there are no closed trades at all', async () => {
        api.closedList.mockReturnValue(of(closedTrades({ totals: { closed_trades: 0, profitable: 0 }, results: [], has_next: false })));
        await click('.tabbar button', 'Closed trades');
        expect(host.textContent).toContain('No closed trades yet.');
      });
    });

    describe('performance', () => {
      it('sends group and date filters; renders metrics, curve, period chart and segment split from the API', async () => {
        await click('.tabbar button', 'Performance');
        expect(api.performance).toHaveBeenLastCalledWith({ group: 'trade' });
        expect(host.querySelectorAll('.metric')).toHaveLength(8);
        expect(host.textContent).toContain('50%');
        expect(host.textContent).toContain('(22.6% of peak)');
        expect(host.textContent).toContain('Options +₹1,713');
        expect(Array.from(host.querySelectorAll('svg')).map(s => s.getAttribute('aria-label'))).toContain('Cumulative realised P&L');
        await click('.perf-controls .seg button', 'Week');
        const from = host.querySelector('#pf-from') as HTMLInputElement;
        from.value = '2026-10-01'; from.dispatchEvent(new Event('change'));
        await settle();
        expect(api.performance).toHaveBeenLastCalledWith({ group: 'week', date_from: '2026-10-01' });
        await click('.perf-controls .ghost', 'All time');
        expect(api.performance).toHaveBeenLastCalledWith({ group: 'week' });
      });

      it('null profit factor and null drawdown percentage render honestly', async () => {
        api.performance.mockReturnValue(of(perf({ metrics: { ...perf().metrics, profit_factor: null, max_drawdown: { amount: 0, pct: null, peak_date: '2026-10-17', trough_date: null } } })));
        await click('.tabbar button', 'Performance');
        expect(host.textContent).toContain('n/a');
        expect(host.textContent).toContain('No losing trades yet');
        expect(host.textContent).not.toContain('% of peak)');
      });

      it('distinguishes "no closed trades at all" from "none in this range"', async () => {
        api.performance.mockReturnValue(of(perf({ has_closed_trades: false, curve: [], period_pnl: [] })));
        await click('.tabbar button', 'Performance');
        expect(host.textContent).toContain('No closed trades yet.');
        api.performance.mockReturnValue(of(perf({ has_closed_trades: true, curve: [], period_pnl: [], date_from: '2027-01-01' })));
        component.setPerfFrom('2027-01-01');
        await settle();
        expect(host.textContent).toContain('No closed trades in this date range.');
      });

      it('an inverted range is rejected locally and not sent', async () => {
        await click('.tabbar button', 'Performance');
        api.performance.mockClear();
        component.setPerfFrom('2026-12-01');
        component.setPerfTo('2026-11-01');
        await settle();
        expect(host.querySelector('[role="alert"]')?.textContent).toContain('after To date');
        expect(api.performance).toHaveBeenCalledTimes(1);
      });
    });

    describe('baskets', () => {
      it('renders baskets, unassigned positions, the truncation note, and "—" for unpriced buckets', async () => {
        await click('.tabbar button', 'Baskets');
        expect(host.querySelector('.basket-card h3')?.textContent).toContain('Weekly');
        expect(host.textContent).toContain('1 open');
        expect(host.textContent).toContain('3 closed');
        expect(host.textContent).toContain('Showing the newest 1 of 3 closed trades');
        expect(host.textContent).toContain('Unassigned');
        expect(host.querySelectorAll('.basket-card')[1].textContent).toContain('— unrealised');
      });

      it('shows the empty state, and an empty basket', async () => {
        api.baskets.mockReturnValue(of(basketsData({ baskets: [], unassigned: { open_count: 0, unrealised: 0, open_positions: [] } })));
        component.loadBaskets();
        await click('.tabbar button', 'Baskets');
        expect(host.textContent).toContain('No baskets yet.');
        api.baskets.mockReturnValue(of(basketsData({ baskets: [{ id: 'e', name: 'Empty', open_count: 0, closed_count: 0, unrealised: 0, realised: 0, open_positions: [], closed_trades: [], closed_trades_truncated: false }] })));
        component.loadBaskets();
        await settle();
        expect(host.textContent).toContain('No open positions in this basket.');
      });

      it('chart modal requests the basket id and renders the API rows with as_of', async () => {
        api.basketChart.mockReturnValue(of({ basket: { id: 'b1', name: 'Weekly' }, as_of: '2026-10-14',
          rows: [{ date: '2026-10-12', live: -112.5, sq: 0, day: -112.5, cum: -112.5 }, { date: '2026-10-13', live: 1125, sq: 0, day: 1125, cum: 1012.5 }] }));
        await click('.tabbar button', 'Baskets');
        await click('.basket-head .row-btn', 'Chart');
        expect(api.basketChart).toHaveBeenCalledWith({ id: 'b1' });
        expect(host.textContent).toContain('priced up to 14 Oct 2026');
        const rows = Array.from(host.querySelectorAll('.limited tbody tr')).map(r => r.textContent?.replace(/\s+/g, ' ').trim());
        expect(rows[0]).toContain('13 Oct 2026');
        expect(rows[0]).toContain('+₹1,013');
        expect(Array.from(host.querySelectorAll('svg')).map(s => s.getAttribute('aria-label'))).toContain('Basket EOD P&L by day');
        await click('.modal-actions .ghost', 'Close');
        expect(component.dialog()).toBeNull();
      });

      it('chart modal: empty basket and 404 are handled', async () => {
        api.basketChart.mockReturnValue(of({ basket: { id: 'b1', name: 'Weekly' }, as_of: null, rows: [] }));
        component.openBasketChart('b1', 'Weekly');
        await settle();
        expect(host.textContent).toContain('No positions in this basket yet.');
        api.basketChart.mockReturnValue(err(404, 'Basket not found.'));
        component.openBasketChart('gone', 'Gone');
        await settle();
        expect(host.querySelector('.modal-card [role="alert"]')?.textContent).toContain('Basket not found.');
      });

      it('rename: validates, shows backend duplicate-name errors, and refreshes on success', async () => {
        component.openRename('b1', 'Weekly');
        component.onRenameInput('   ');
        component.confirmRename();
        expect(component.dialog()).toMatchObject({ error: 'Enter a basket name.' });
        api.renameBasket.mockReturnValue(err(422, 'A basket with this name already exists.', { name: ['A basket with this name already exists.'] }));
        component.onRenameInput('Monthly');
        component.confirmRename();
        await settle();
        expect(component.dialog()).toMatchObject({ error: 'A basket with this name already exists.' });
        api.renameBasket.mockReturnValue(of({ id: 'b1', name: 'Monthly' }));
        api.baskets.mockClear();
        component.confirmRename();
        await settle();
        expect(api.renameBasket).toHaveBeenLastCalledWith({ id: 'b1', name: 'Monthly' });
        expect(component.dialog()).toBeNull();
        expect(api.baskets).toHaveBeenCalled();
      });

      it('remove: confirms first, explains positions are detached, then calls the API and refreshes', async () => {
        await click('.tabbar button', 'Baskets');
        await click('.basket-head .row-btn', 'Remove basket');
        expect(host.querySelector('.modal-card')?.textContent).toContain('become unassigned');
        expect(host.querySelector('.modal-card')?.textContent).toContain('no position');
        expect(api.removeBasket).not.toHaveBeenCalled();
        api.removeBasket.mockReturnValue(of({ id: 'b1', name: 'Weekly', unassigned: 4 }));
        api.baskets.mockClear(); api.openList.mockClear();
        await click('.modal-actions .danger', 'Remove basket');
        expect(api.removeBasket).toHaveBeenCalledWith({ id: 'b1' });
        expect(api.baskets).toHaveBeenCalled();
        expect(api.openList).toHaveBeenCalled();
        expect(component.dialog()).toBeNull();
      });

      it('remove: a 404 (already removed) is reported and the list reloads', async () => {
        component.openDelete('b1', 'Weekly');
        api.removeBasket.mockReturnValue(err(404, 'Basket not found.'));
        api.baskets.mockClear();
        component.confirmDelete();
        await settle();
        expect(component.dialog()).toBeNull();
        expect(api.baskets).toHaveBeenCalled();
      });
    });

    it('Live data stays a locked/unavailable state and never claims live CMP', async () => {
      await click('.source-tabs button', 'Live data');
      expect(host.querySelector('app-live-data-access')).toBeTruthy();
      expect(host.textContent).toContain('Live CMP needs broker integration');
      expect(host.querySelector('.source-note')?.textContent).toContain('not connected');
    });

    it('underlying autocomplete filters, supports the keyboard and clears', async () => {
      const input = host.querySelector('#pf-underlying') as HTMLInputElement;
      input.value = 'tc';
      input.dispatchEvent(new Event('input'));
      await settle();
      expect(component.filteredUnderlyings()).toEqual(['TCS']);
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
      await settle();
      expect(component.underlying()).toBe('TCS');
      await click('.combo-clear');
      expect(component.symbolQuery()).toBe('');
    });
  });
});

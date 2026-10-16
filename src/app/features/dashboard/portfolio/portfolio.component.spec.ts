import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { Observable, Subject, of } from 'rxjs';
import { PortfolioComponent } from './portfolio.component';
import { ContractCatalog, LatestClose, PortfolioMarketService } from './portfolio-market.service';
import { PortfolioStoreService } from './portfolio-store.service';

const catalog = (symbol: string): ContractCatalog => ({
  symbol, strikes: [22500, 22600, 22700], atmStrike: 22600, tradeDate: '2026-10-15', expiries: ['2026-10-29', '2026-11-26'], lot: 75,
});

describe('PortfolioComponent', () => {
  let fixture: ReturnType<typeof TestBed.createComponent<PortfolioComponent>>;
  let component: PortfolioComponent;
  let host: HTMLElement;
  let closeFor: (key: string) => LatestClose | null;
  let closeRequests: string[];
  let latest$: Observable<LatestClose | null> | null;
  let history$: Observable<ReadonlyMap<string, ReadonlyMap<string, number>>>;

  const settle = async () => { await fixture.whenStable(); fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges(); };
  const click = async (selector: string, text?: string) => {
    const nodes = Array.from(host.querySelectorAll<HTMLElement>(selector));
    const node = text ? nodes.find(n => n.textContent?.trim().startsWith(text)) : nodes[0];
    expect(node, `${selector} ${text ?? ''}`).toBeTruthy();
    node!.click();
    await settle();
  };

  beforeEach(async () => {
    localStorage.clear();
    vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: () => undefined, removeEventListener: () => undefined }));
    closeFor = () => ({ date: '2026-10-15', close: 123.45 });
    closeRequests = [];
    latest$ = null;
    history$ = of(new Map());
    await TestBed.configureTestingModule({
      imports: [PortfolioComponent],
      providers: [
        provideHttpClient(),
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: { get: () => null } } } },
        { provide: PortfolioMarketService, useValue: {
          getUnderlyings: () => of(['NIFTY', 'BANKNIFTY']),
          getCatalog: (symbol: string) => of(catalog(symbol)),
          getLatestClose: (contract: { key: string }) => { closeRequests.push(contract.key); return latest$ ?? of(closeFor(contract.key)); },
          getCloseHistory: () => history$,
        } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(PortfolioComponent);
    component = fixture.componentInstance;
    host = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    await settle();
  });

  afterEach(() => vi.unstubAllGlobals());

  it('is titled Portfolio Analysis and states the read/sync/analytics scope', () => {
    expect(host.querySelector('h2')?.textContent).toContain('Portfolio Analysis');
    expect(host.textContent).toContain('Read, sync and analytics only');
    expect(host.textContent).not.toMatch(/\bBuy now\b|Place order/i);
  });

  it('starts empty with the approved empty states', () => {
    expect(host.textContent).toContain('No open positions.');
    expect(component.summary().totalText).toBe('₹0');
    expect(host.querySelectorAll('.stat')).toHaveLength(4);
  });

  it('futures hide option fields; options show type and strike', async () => {
    expect(host.querySelector('#pf-strike')).toBeNull();
    expect(host.textContent).not.toContain('CE');
    await click('.form-grid.top .seg button', 'Options');
    expect(host.querySelector('#pf-strike')).toBeTruthy();
    expect(Array.from(host.querySelectorAll('[aria-label="Option type"] button')).map(b => b.textContent?.trim())).toEqual(['CE', 'PE']);
    expect(host.querySelector('#pf-expiry')).toBeTruthy();
  });

  it('loads the contract catalog (expiry, lot) and suggests the latest EOD close as the price', () => {
    expect(component.lot()).toBe(75);
    expect(component.expiry()).toBe('2026-10-29');
    expect(component.fillPrice()).toBe('123.45');
    expect(component.priceHint()).toContain('EOD close');
    expect((host.querySelector('#pf-lot') as HTMLInputElement).readOnly).toBe(true);
  });

  it('a new contract suggests its own close; a late response never overwrites a price the user typed', async () => {
    const pending = new Subject<LatestClose | null>();
    latest$ = pending;
    component.onExpiry('2026-11-26');          // new contract -> its close is requested
    await settle();
    component.onPriceInput('130');             // the user types before the response arrives
    pending.next({ date: '2026-10-15', close: 99 });
    pending.complete();
    await settle();
    expect(component.fillPrice()).toBe('130');
    expect(component.priceHint()).toContain('EOD close');
  });

  it('validates quantity, price and basket name with visible errors', async () => {
    component.qty.set('0');
    component.record();
    expect(component.entryError()).toContain('Quantity');
    component.qty.set('1');
    component.fillPrice.set('');
    component.record();
    expect(component.entryError()).toContain('Price');
    component.fillPrice.set('100');
    component.onBasketChoice('__new__');
    component.record();
    expect(component.entryError()).toContain('name for the new basket');
    expect(component.positions()).toHaveLength(0);
    await settle();
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('name for the new basket');
  });

  it('records a paper fill, shows the open position with weighted cost, notional and unrealised P&L', async () => {
    component.qty.set('2');
    component.onPriceInput('100');
    component.record();
    await settle();
    expect(component.entryMessage()).toContain('Ledger entry only; no order was placed');
    expect(host.querySelectorAll('.tbl tbody tr')).toHaveLength(1);
    const p = component.positions()[0];
    expect(p).toMatchObject({ qty: 2, avg: 100, cmp: 123.45 });
    // (123.45 - 100) * 2 lots * 75
    expect(component.summary().unreal).toBeCloseTo(23.45 * 150, 6);
    expect(component.summary().unrealText).toBe('+₹3,518');
    expect(host.querySelector('.stat-value.pos')).toBeTruthy();
    expect(host.textContent).toContain('+₹3,518'); // sign shown, not colour alone
  });

  it('shows "no feed" instead of a fake price when EOD has no close for a position', async () => {
    closeFor = () => null;
    component.qty.set('1');
    component.onPriceInput('100');
    component.record();
    await settle();
    expect(component.positions()[0].cmp).toBeNull();
    expect(host.textContent).toContain('no feed');
    expect(component.summary().unreal).toBe(0);
  });

  it('filters open positions by segment and sorts by a column', async () => {
    component.onPriceInput('100');
    component.record();                                  // future
    component.setSegment('option');
    component.onPriceInput('50');
    component.qty.set('3');
    component.record();                                  // option
    await settle();
    expect(component.segCounts()).toEqual({ all: 2, future: 1, option: 1 });
    expect(component.openRows()).toHaveLength(2);
    component.segFilter.set('option');
    expect(component.openRows().map(p => p.kind)).toEqual(['option']);
    component.segFilter.set('all');
    component.sortOpenBy('qty');                         // desc first
    expect(component.openRows()[0].qty).toBe(3);
    component.sortOpenBy('qty');                         // toggle asc
    expect(component.openRows()[0].qty).toBe(1);
    await settle();
    expect(host.querySelector('th[aria-sort="ascending"]')).toBeTruthy();
  });

  it('squares off through the confirmation dialog and reports realised P&L', async () => {
    component.qty.set('2');
    component.onPriceInput('100');
    component.record();
    await settle();
    const key = component.positions()[0].contract.key;
    component.openSquareOff(key);
    await settle();
    expect(host.querySelector('[role="dialog"]')).toBeTruthy();
    component.onDialogPrice('0');
    component.confirmSquareOff();
    expect(component.dialog()).toMatchObject({ kind: 'close', error: expect.stringContaining('greater than 0') });
    component.onDialogPrice('110');
    component.confirmSquareOff();
    await settle();
    expect(component.dialog()).toBeNull();
    expect(component.positions()).toHaveLength(0);
    expect(component.closed()).toHaveLength(1);
    expect(component.summary().real).toBeCloseTo(10 * 2 * 75, 6);
    expect(component.summary().total).toBeCloseTo(component.summary().unreal + component.summary().real, 6);
    expect(component.entryMessage()).toContain('Squared off');
  });

  it('closed trades view lists trades and groups by day/week/month; empty state when none', async () => {
    await click('.tabbar button', 'Closed trades');
    expect(host.textContent).toContain('No closed trades yet.');
    component.qty.set('1');
    component.onPriceInput('100');
    component.fillDate.set('2026-10-01');
    component.record();
    component.side.set('sell');
    component.onPriceInput('90');
    component.fillDate.set('2026-10-05');
    component.record();
    await settle();
    expect(host.querySelectorAll('.tbl tbody tr')).toHaveLength(1);
    expect(host.textContent).toContain('-₹750');
    await click('.group-seg button', 'Weekly');
    expect(host.textContent).toContain('5 Oct 2026 – 11 Oct 2026');
    await click('.group-seg button', 'Monthly');
    expect(host.textContent).toContain('Oct 2026');
    await click('.group-seg button', 'Daily');
    expect(host.textContent).toContain('5 Oct 2026');
  });

  it('performance view: date filter, grouping and metrics from real closed trades', async () => {
    const trade = (open: number, close: number, d1: string, d2: string) => {
      component.side.set('buy'); component.onPriceInput(String(open)); component.fillDate.set(d1); component.record();
      component.side.set('sell'); component.onPriceInput(String(close)); component.fillDate.set(d2); component.record();
    };
    await click('.tabbar button', 'Performance');
    expect(host.textContent).toContain('No closed trades yet.');
    trade(100, 120, '2026-10-01', '2026-10-02');    // +1500
    trade(100, 90, '2026-10-05', '2026-10-06');     // -750
    await settle();
    expect(component.perfStats()).toMatchObject({ trades: 2, wins: 1, losses: 1, net: 750 });
    expect(host.querySelectorAll('.metric')).toHaveLength(8);
    expect(Array.from(host.querySelectorAll('svg')).map(s => s.getAttribute('aria-label'))).toContain('Cumulative realised P&L');
    component.perfFrom.set('2026-10-05');
    await settle();
    expect(component.perfStats().trades).toBe(1);
    component.perfFrom.set('2027-01-01');
    await settle();
    expect(host.textContent).toContain('No closed trades in this date range.');
    await click('.perf-controls .ghost', 'All time');
    expect(component.perfTrades()).toHaveLength(2);
    component.perfGroup.set('week');
    expect(component.perfBars()?.bars).toHaveLength(2);
    component.perfFrom.set('2026-12-01');
    component.perfTo.set('2026-11-01');
    expect(component.perfRangeError()).toContain('after');
  });

  it('baskets: create with a fill, show members, rename, chart modal with real EOD history, remove', async () => {
    expect(host.querySelector('.tabbar')).toBeTruthy();
    await click('.tabbar button', 'Baskets');
    expect(host.textContent).toContain('No baskets yet.');

    component.onBasketChoice('__new__');
    component.newBasketName.set('Swing set');
    component.onPriceInput('100');
    component.record();
    await settle();
    expect(component.baskets().map(b => b.name)).toEqual(['Swing set']);
    expect(host.querySelector('.basket-card h3')?.textContent).toContain('Swing set');
    expect(host.textContent).toContain('1 open');

    component.openRename(component.baskets()[0].id);
    component.onDialogName('');
    component.confirmRename();
    expect(component.dialog()).toMatchObject({ kind: 'rename', error: expect.stringContaining('basket name') });
    component.onDialogName('Renamed');
    component.confirmRename();
    await settle();
    expect(host.querySelector('.basket-card h3')?.textContent).toContain('Renamed');

    const key = component.positions()[0].contract.key;
    history$ = of(new Map([[key, new Map([['2026-10-14', 105], ['2026-10-15', 110]])]]));
    await click('.basket-head .row-btn', 'Chart');
    expect(component.dialog()).toMatchObject({ kind: 'chart' });
    expect(Array.from(host.querySelectorAll('svg')).map(s => s.getAttribute('aria-label'))).toContain('Basket EOD P&L by day');
    expect(host.querySelectorAll('.limited tbody tr').length).toBeGreaterThan(0);
    await click('.modal-actions .ghost', 'Close');
    expect(component.dialog()).toBeNull();

    component.openDelete(component.baskets()[0].id);
    component.confirmDelete();
    await settle();
    expect(component.baskets()).toHaveLength(0);
    expect(component.positions()).toHaveLength(1);       // position survives, now unassigned
    expect(host.textContent).toContain('Unassigned');
  });

  it('basket chart: a slow response for a closed modal never reaches a newer one (switchMap)', async () => {
    component.onBasketChoice('__new__');
    component.newBasketName.set('A');
    component.onPriceInput('100');
    component.record();
    await settle();
    const never = new Subject<ReadonlyMap<string, ReadonlyMap<string, number>>>();
    history$ = never;
    component.openBasketChart(component.baskets()[0].id);
    expect(component.chartLoading()).toBe(true);
    component.closeDialog();
    expect(component.chartLoading()).toBe(false);
    never.next(new Map());
    expect(component.basketEod()).toBeNull();
  });

  it('live data is Premium: shows the access state, never live prices, and keeps EOD valuation', async () => {
    component.qty.set('1');
    component.onPriceInput('100');
    component.record();
    await settle();
    const before = component.summary().unrealText;
    await click('.source-tabs button', 'Live data');
    expect(host.querySelector('app-live-data-access')).toBeTruthy();
    expect(host.textContent).toContain('Live CMP needs broker integration');
    expect(component.summary().unrealText).toBe(before);
    expect(host.querySelector('.source-note')?.textContent).toContain('not connected');
  });

  it('underlying autocomplete filters, supports the keyboard and restores the active symbol on blur', async () => {
    const input = host.querySelector('#pf-underlying') as HTMLInputElement;
    input.value = 'bank';
    input.dispatchEvent(new Event('input'));
    await settle();
    expect(component.filteredUnderlyings()).toEqual(['BANKNIFTY']);
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    await settle();
    expect(component.underlying()).toBe('BANKNIFTY');
    expect(component.catalog()?.symbol).toBe('BANKNIFTY');
    component.onSymbolInput('garbage');
    component.onSymbolBlur();
    await new Promise(resolve => setTimeout(resolve, 200));
    expect(component.symbolQuery()).toBe('BANKNIFTY');
  });

  it('warns when local storage is unavailable instead of implying the book was saved', async () => {
    TestBed.inject(PortfolioStoreService).persisted.set(false);
    await settle();
    expect(host.textContent).toContain('blocking local storage');
  });
});

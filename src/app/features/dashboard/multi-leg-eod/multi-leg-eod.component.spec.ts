import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { Observable, Subject, of, throwError } from 'rxjs';
import { MultiLegEodComponent } from './multi-leg-eod.component';
import { ToastService } from '../../../core/services/toast.service';
import { minusOneYear, plusOneYear } from '../../../shared/utils/date-range';
import { longDate, resolveRange } from './multi-leg-eod.util';
import { EodDataRow, EodRequest } from '../eod/eod.model';
import { EodService } from '../eod/eod.service';
import { ExpiryStrikesResult, ExpiryStrikesService } from '../eod/expiry-strikes.service';
import { HistoricalUnderlyingResult, HistoricalUnderlyingService } from '../eod/historical-underlying.service';

type RowsRequest = Omit<EodRequest, 'page' | 'page_size'>;
type ExpiryRequest = { symbol: string; trade_from: string; trade_till: string };

const strikes = [22400, 22500, 22600, 22700];
/** What dd_strikes lists by default: wide enough for every ATM the tests use (spot 22630, 25320, 59610 ...). */
const STRIKE_GRID = [...strikes, 24800, 24900, 25000, 25100, 25200, 25300, 25400, 25500, 25600, 59400, 59500, 59600, 59700];
const details = (symbol: string) => ({ data: { symbol, trade_date: '2026-10-15', expiry_date: ['2026-10-29', '2026-11-26'], underlying: 22630, strike: strikes, atm_strike: 22600, market_price: { CE: 1, PE: 1 } } });

/** "Today" for every test: the system clock is pinned to it in beforeEach, and the date helpers below use it too (never the real date, which module-level constants would otherwise read at import time). */
const PINNED_NOW = new Date('2026-10-30T12:00:00Z');

/** YYYY-MM-DD, `n` days before the pinned today. */
const isoDaysAgo = (n: number): string => {
  const now = PINNED_NOW;
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate() - n)).toISOString().slice(0, 10);
};

/** `count` consecutive sessions ending `lastDaysAgo` days ago, so they always fall inside the 1W/1M/3M windows. */
const makeRows = (count: number, base: number, lastDaysAgo = 1): EodDataRow[] =>
  Array.from({ length: count }, (_, i) => {
    return { date: isoDaysAgo(lastDaysAgo + count - 1 - i), symbol: 'NIFTY', open: base + i, high: base + i + 3, low: base + i - 3, close: base + i + 1, volume: 1000 * (i + 1), oi: 5000 * (i + 1) };
  });

/** Expiries inside every Custom range used below (From 20 days ago .. To 2 days ago, or From 30 days ago). */
const E1 = isoDaysAgo(15), E2 = isoDaysAgo(10), E3 = isoDaysAgo(12);

const reply = (req: { symbol: string; trade_from: string; trade_till: string }, dates: string[]) =>
  of({ data: { symbol: req.symbol, trade_from: req.trade_from, trade_till: req.trade_till, expiry_date: dates } });

describe('MultiLegEodComponent', () => {
  let fixture: ReturnType<typeof TestBed.createComponent<MultiLegEodComponent>>;
  let component: MultiLegEodComponent;
  let host: HTMLElement;
  let requests: RowsRequest[];
  let rowsFor: (req: RowsRequest) => Observable<EodDataRow[]>;
  let metaFor: (symbol: string) => Observable<ReturnType<typeof details>>;
  let expiryCalls: ExpiryRequest[];
  let atmCalls: Array<{ symbol: string; till: string }>;
  let strikeCalls: Array<{ symbol: string; expiry: string }>;
  let strikesFor: (symbol: string, expiry: string) => Observable<ExpiryStrikesResult>;
  let atmFor: (symbol: string, till: string) => Observable<HistoricalUnderlyingResult>;
  let expiryFor: (req: ExpiryRequest) => Observable<{ data: { symbol: string; trade_from: string; trade_till: string; expiry_date: string[] } }>;

  /** Toasts currently showing, by variant (the real ToastService runs in these tests). */
  const toasts = (type: 'success' | 'info' | 'error') => TestBed.inject(ToastService).messages().filter(t => t.type === type).map(t => t.message);
  const settle = async () => { await fixture.whenStable(); fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges(); };
  const click = async (selector: string, text?: string) => {
    const nodes = Array.from(host.querySelectorAll<HTMLElement>(selector));
    const node = text ? nodes.find(n => n.textContent?.trim() === text) : nodes[0];
    expect(node, `${selector} ${text ?? ''}`).toBeTruthy();
    node!.click();
    await settle();
  };
  const select = async (selector: string, value: string) => {
    const el = host.querySelector<HTMLSelectElement>(selector)!;
    el.value = value;
    el.dispatchEvent(new Event('change'));
    await settle();
  };

  /** Legs are cached per contract and range, so a different range forces a fresh request with the new rowsFor. */
  const reloadWith = async (fn: typeof rowsFor) => {
    rowsFor = fn;
    // A new symbol clears the cache, resets the legs and reloads with the new rowsFor.
    component.selectSymbol(component.symbol() === 'BANKNIFTY' ? 'RELIANCE' : 'BANKNIFTY');
    await settle();
  };

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: PINNED_NOW });
    requests = [];
    expiryCalls = [];
    atmCalls = [];
    strikeCalls = [];
    strikesFor = () => of({ ok: true, strikes: STRIKE_GRID });
    // The historical ATM: the underlying closed at 22630 on the session, so 22600 is the nearest listed strike.
    atmFor = () => of({ ok: true, session: '2026-10-29', underlying: 22630, strikes, atm: 22600 });
    // The real backend also lists dates outside the requested range; 2026-11-26 is after "today" and is dropped for the presets.
    expiryFor = req => reply(req, ['2026-10-29', '2026-11-26', '2026-10-22']);
    rowsFor = req => of(makeRows(5, req.option_type === 'CE' ? 100 : 50));
    metaFor = symbol => of(details(symbol));
    vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: () => undefined, removeEventListener: () => undefined }));
    await TestBed.configureTestingModule({
      imports: [MultiLegEodComponent],
      providers: [
        provideHttpClient(),
        provideRouter([]),
        { provide: ExpiryStrikesService, useValue: { resolve: (symbol: string, expiry: string) => { strikeCalls.push({ symbol, expiry }); return strikesFor(symbol, expiry); } } },
        { provide: HistoricalUnderlyingService, useValue: { resolve: (symbol: string, till: string) => { atmCalls.push({ symbol, till }); return atmFor(symbol, till); } } },
        { provide: EodService, useValue: {
          getSymbols: () => of(['NIFTY', 'BANKNIFTY', 'RELIANCE']),
          getDdGreeks: ({ symbol }: { symbol: string }) => metaFor(symbol),
          getDdExpiry: (req: ExpiryRequest) => { expiryCalls.push(req); return expiryFor(req); },
          getAllRows: (req: RowsRequest) => { requests.push(req); return rowsFor(req); },
        } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(MultiLegEodComponent);
    component = fixture.componentInstance;
    host = fixture.nativeElement as HTMLElement;
    fixture.detectChanges();
    await settle();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('is the Multi-Leg EOD Data screen with the EOD badge and reference-data notice', () => {
    expect(host.querySelector('h2')?.textContent).toContain('Multi-Leg EOD Data');
    expect(host.textContent).not.toContain('Closed Trades');
    expect(host.querySelector('.badge')?.textContent).toContain('EOD');
    expect(host.textContent).toContain('Reference data only');
    expect(host.textContent).not.toMatch(/modelled|Black-Scholes|seeded/i);
  });

  it('defaults to 3M and starts with an ATM CE and PE on the nearest expiry, requested from the API', () => {
    expect(component.range()).toBe('3M');
    expect(host.querySelector('.seg button.active')?.textContent?.trim()).toBe('3M');
    expect(component.legs().map(l => [l.optionType, l.strike, l.expiry])).toEqual([['CE', 22600, '2026-11-26'], ['PE', 22600, '2026-11-26']]);
    expect(requests).toHaveLength(2);
    expect(requests[0]).toMatchObject({ symbol: 'NIFTY', option_type: 'CE', strike: 22600, expiry: '2026-11-26' });
    expect(requests[0].date_from < requests[0].date_till).toBe(true);
    expect(host.querySelectorAll('.legend span')).toHaveLength(2);
    expect(host.querySelectorAll('.chartbox path.line')).toHaveLength(2);
  });

  it('symbol clear button empties the field and opens the list; picking a symbol reloads legs and data', async () => {
    await click('.symclear');
    expect(component.symbolQuery()).toBe('');
    expect(host.querySelectorAll('.combo-list button')).toHaveLength(3);
    requests.length = 0;
    await click('.combo-list button', 'BANKNIFTY');
    expect(component.symbol()).toBe('BANKNIFTY');
    expect(requests.every(r => r.symbol === 'BANKNIFTY')).toBe(true);
    expect(requests).toHaveLength(2);
  });

  it('supports keyboard selection and reverts unlisted text on blur', async () => {
    const input = host.querySelector('#ml-symbol') as HTMLInputElement;
    input.value = 'rel';
    input.dispatchEvent(new Event('input'));
    await settle();
    expect(component.filteredSymbols()).toEqual(['RELIANCE']);
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    await settle();
    expect(component.symbol()).toBe('RELIANCE');
    component.onSymbolInput('zzz');
    component.onSymbolBlur();
    await new Promise(resolve => setTimeout(resolve, 200));
    expect(component.symbolQuery()).toBe('RELIANCE');
  });

  it('adds and removes legs and requests only valid contracts', async () => {
    await click('.legs-head .ghost', '+ Add leg');
    expect(component.legs()).toHaveLength(3);
    expect(requests).toHaveLength(2);              // an identical contract is served from the cache
    requests.length = 0;
    await select('#ml-strike-3', '22700');
    expect(requests).toEqual([expect.objectContaining({ option_type: 'CE', strike: 22700, expiry: '2026-11-26' })]);
    await click('.legrow:last-of-type .legx');
    expect(component.legs()).toHaveLength(2);
    for (let i = 0; i < 10; i++) component.addLeg();
    expect(component.legs()).toHaveLength(component.maxLegs);
    fixture.detectChanges();
    expect((host.querySelector('.legs-head .ghost') as HTMLButtonElement).disabled).toBe(true);
    component.legs().slice(1).forEach(l => component.removeLeg(l.id));
    component.removeLeg(component.legs()[0].id);
    await settle();
    expect(host.textContent).toContain('Add at least one leg');
    expect((host.querySelector('.outline') as HTMLButtonElement).disabled).toBe(true);
  });

  it('changing type, strike or expiry re-requests that contract', async () => {
    requests.length = 0;
    await select('#ml-strike-1', '22700');
    expect(requests.some(r => r.option_type === 'CE' && r.strike === 22700)).toBe(true);
    requests.length = 0;
    await click('.legrow .seg button', 'PE');
    expect(requests.some(r => r.option_type === 'PE' && r.strike === 22700)).toBe(true);
    requests.length = 0;
    await select('#ml-expiry-1', '2026-10-22');
    expect(requests.some(r => r.expiry === '2026-10-22')).toBe(true);
    expect(component.series()[0].label).toBe('22700 PE · 22 Oct');
  });

  it('date range presets change the window; Custom validates From/To and does not call the API when invalid', async () => {
    requests.length = 0;
    await click('.field .seg button', '1W');
    const week = requests[0];
    expect(Date.parse(week.date_till) - Date.parse(week.date_from)).toBe(15 * 86400000);
    await click('.field .seg button', 'Custom');
    expect(host.querySelector('#ml-from')).toBeTruthy();
    requests.length = 0;
    component.onCustomFrom('2026-10-10');
    requests.length = 0;
    component.onCustomTill('2026-10-01');
    await settle();
    expect(host.textContent).toContain('The From date was cleared because it was after the new To date.');   // reversed: From is cleared, not refused
    expect(requests).toHaveLength(0);
    component.onCustomFrom('2026-09-01');
    component.onCustomTill('2026-09-30');
    await settle();
    expect(requests.at(-1)).toMatchObject({ date_from: '2026-09-01', date_till: '2026-09-30' });
    expect(component.rangeError()).toBe('');
  });

  describe('custom range: one calendar year, never blocking a chosen date', () => {
    const typeDate = async (id: string, value: string) => {
      const input = host.querySelector<HTMLInputElement>(`#${id}`)!;
      input.value = value;
      input.dispatchEvent(new Event('change', { bubbles: true }));
      await settle();
    };
    const value = (id: string) => host.querySelector<HTMLInputElement>(`#${id}`)!.value;
    const note = () => host.querySelector('.input-error')?.textContent?.trim() ?? '';
    // Back-dated so the cases do not depend on today's date: the component's own `today` is the upper bound.
    const ago = (days: number) => new Date(Date.parse(`${component.today}T00:00:00Z`) - days * 86400000).toISOString().slice(0, 10);

    beforeEach(async () => {
      expiryFor = req => reply(req, [req.trade_from]);   // these cases are about the date messages: always return an expiry
      await click('.field .seg button', 'Custom');
      requests.length = 0;
    });

    it('a chosen date is never blocked by the other; only an empty one is narrowed', async () => {
      const from = host.querySelector<HTMLInputElement>('#ml-from')!;
      const till = host.querySelector<HTMLInputElement>('#ml-till')!;
      expect([from.min, from.max, till.min, till.max]).toEqual(['', component.today, '', component.today]);
      await typeDate('ml-from', ago(800));                              // far more than a year before To: accepted, To cleared
      expect(value('ml-from')).toBe(ago(800));
      expect(value('ml-till')).toBe('');
      expect(till.min).toBe(ago(800));
      expect(till.max).toBe(plusOneYear(ago(800)));                    // From + 1 year (already before today)
      await typeDate('ml-from', '');
      await typeDate('ml-till', ago(10));
      expect(from.max).toBe(ago(10));
      expect(from.min).toBe(minusOneYear(ago(10)));
    });

    it('changing From clears a To that is earlier or over a year later, keeps one that fits, and requests only complete ranges', async () => {
      await typeDate('ml-from', ago(20));                               // fits the default To (today)
      expect(value('ml-till')).toBe(component.today);
      expect(requests.length).toBeGreaterThan(0);
      requests.length = 0;
      await typeDate('ml-from', ago(366));                              // one day over a year: To cleared, message, no request
      expect(value('ml-till')).toBe('');
      expect(note()).toContain('The To date was cleared because it was more than one year after the new From date');
      expect(requests).toHaveLength(0);
      await typeDate('ml-till', ago(1));                                // pick To again
      expect(note()).toBe('');
      expect(requests.at(-1)).toMatchObject({ date_from: ago(366), date_till: ago(1) });
      requests.length = 0;
      component.onCustomFrom(component.today);                          // From after To: To cleared
      await settle();
      expect(component.customTill()).toBe('');
      expect(note()).toContain('before the new From date');
      expect(requests).toHaveLength(0);
    });

    it('changing To clears a From that is after it or over a year before it', async () => {
      await typeDate('ml-from', ago(10));
      requests.length = 0;
      await typeDate('ml-till', ago(12));                               // before From: From cleared
      expect(value('ml-from')).toBe('');
      expect(value('ml-till')).toBe(ago(12));
      expect(note()).toContain('The From date was cleared because it was after the new To date');
      expect(requests).toHaveLength(0);
      await typeDate('ml-from', ago(12 + 365));                         // exactly one year: allowed
      expect(note()).toBe('');
      expect(requests.at(-1)).toMatchObject({ date_from: ago(12 + 365), date_till: ago(12) });
      requests.length = 0;
      await typeDate('ml-till', ago(11));                               // one day too far from From: From cleared
      expect(value('ml-from')).toBe('');
      expect(note()).toContain('more than one year before the new To date');
      expect(requests).toHaveLength(0);
    });

    it('presets still work and clear any leftover message', async () => {
      await typeDate('ml-from', ago(400));
      expect(note()).toContain('cleared');
      await click('.field .seg button', '1M');
      expect(note()).toBe('');
      expect(requests.length).toBeGreaterThan(0);
    });
  });

  it('combined table shows one close column per leg, latest first; missing values are explicit', async () => {
    await reloadWith(req => of(req.option_type === 'CE' ? makeRows(5, 100) : makeRows(2, 50)));   // PE only has the last 2 sessions
    const heads = Array.from(host.querySelectorAll('.data-table th, table th')).map(th => th.textContent?.trim());
    expect(heads).toContain('22600 CE · 26 Nov');
    expect(heads).toContain('22600 PE · 26 Nov');
    const first = component.combined()[0];
    expect(first.date).toBe(isoDaysAgo(1));
    expect(first.closes).toEqual([105, 52]);
    const last = component.combined().at(-1)!;
    expect(last.closes[1]).toBeNull();
    expect(host.textContent).toContain('—');
    expect(component.missingLegs()).toHaveLength(0);
  });

  it('single-leg mode shows Date/Open/High/Low/Close/Volume/OI and keeps latest-first order', async () => {
    const ceId = component.legs()[0].id;
    await click('.legchips button', '22600 CE · 26 Nov');
    expect(component.activeLegIndex()).toBe(0);
    const heads = Array.from(host.querySelectorAll('table th')).map(th => th.textContent?.trim());
    expect(heads).toEqual(['Date', 'Open', 'High', 'Low', 'Close (EOD)', 'Volume', 'OI']);
    const cells = Array.from(host.querySelectorAll('tbody tr:first-child td')).map(td => td.textContent?.trim());
    expect(cells[0]).toBe(isoDaysAgo(1));
    expect(cells[1]).toBe('104.00');
    expect(cells[4]).toContain('105.00');
    expect(cells[5]).toBe('5.0K');
    expect(cells[6]).toBe('25.0K');
    // removing the selected leg falls back to the combined view
    component.removeLeg(ceId);
    await settle();
    expect(component.tableLeg()).toBe('all');
  });

  it('rows-per-page and Previous/Next paginate locally and disable at the boundaries', async () => {
    await reloadWith(() => of(makeRows(60, 100)));
    expect(component.totalSessions()).toBe(60);
    expect(host.querySelectorAll('tbody tr')).toHaveLength(10);
    const buttons = () => Array.from(host.querySelectorAll<HTMLButtonElement>('.tablebar .ghost'));
    expect(buttons()[0].disabled).toBe(true);      // Previous
    expect(buttons()[1].disabled).toBe(false);     // Next
    expect(host.textContent).toContain('Page 1');
    for (let i = 0; i < 5; i++) await click('.tablebar .ghost', 'Next');
    expect(host.textContent).toContain('Page 6');
    expect(buttons()[1].disabled).toBe(true);
    await click('.tablebar .ghost', 'Previous');
    expect(host.textContent).toContain('Page 5');
    await select('.rows-label select', '25');
    expect(host.querySelectorAll('tbody tr')).toHaveLength(25);
    expect(host.textContent).toContain('Page 1');
    await select('.rows-label select', '50');
    expect(host.querySelectorAll('tbody tr')).toHaveLength(50);
    expect(component.pageInfo().pages).toBe(2);
  });

  it('shows empty and error states instead of fake data', async () => {
    await reloadWith(() => of([]));
    expect(host.textContent).toContain('No sessions in this range');
    expect(host.textContent).toContain('No sessions to show');
    expect(component.missingLegs()).toHaveLength(2);
    expect((host.querySelector('.outline') as HTMLButtonElement).disabled).toBe(true);

    await reloadWith(req => (req.option_type === 'CE' ? of(makeRows(5, 100)) : throwError(() => new Error('boom'))));
    expect(component.failedLegs()).toHaveLength(1);
    expect(host.textContent).toContain('(failed)');
    expect(component.loadError()).toContain('Unable to load EOD data');
    expect(component.series()[0].rows.length).toBe(5);
  });

  it('hovering the chart shows a tooltip with every leg close for that session', async () => {
    const hit = host.querySelector('.chartbox .hit') as SVGRectElement;
    hit.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1000, height: 300, right: 1000, bottom: 300, x: 0, y: 0, toJSON: () => ({}) });
    const svg = hit.ownerSVGElement!;
    svg.getBoundingClientRect = hit.getBoundingClientRect;
    hit.dispatchEvent(new MouseEvent('mousemove', { clientX: 1000, clientY: 100, bubbles: true }));
    await settle();
    expect(component.hover()?.index).toBe(4);
    expect(host.querySelector('app-chart-tooltip')?.textContent).toContain(component.longDate(isoDaysAgo(1)));
    hit.dispatchEvent(new MouseEvent('mouseleave'));
    await settle();
    expect(host.querySelector('app-chart-tooltip')).toBeNull();
  });

  describe('CSV export', () => {
    let blobs: Blob[];
    let downloads: string[];
    let revoked: string[];
    beforeEach(() => {
      blobs = []; downloads = []; revoked = [];
      URL.createObjectURL = (blob: Blob) => { blobs.push(blob); return `blob:test/${blobs.length}`; };
      URL.revokeObjectURL = (url: string) => { revoked.push(url); };
      vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { downloads.push(this.download); });
    });

    it('combined export: one close per leg for the visible sessions, named by symbol and legs', async () => {
      await click('.outline');
      expect(downloads).toEqual(['NIFTY_22600CE_2026-11-26_22600PE_2026-11-26_EOD.csv']);
      const text = await blobs[0].text();
      expect(text.split('\n')[0]).toBe('Date,22600 CE · 26 Nov,22600 PE · 26 Nov');
      expect(text.split('\n')).toHaveLength(6);
      expect(text.split('\n')[1]).toBe(`${isoDaysAgo(5)},101.00,51.00`);
      await new Promise(resolve => setTimeout(resolve, 600));
      expect(revoked).toEqual(['blob:test/1']);
    });

    it('single-leg export: OHLC, volume and OI for the selected leg only', async () => {
      await click('.legchips button', '22600 PE · 26 Nov');
      await click('.outline');
      expect(downloads).toEqual(['NIFTY_22600PE_2026-11-26_EOD.csv']);
      const lines = (await blobs[0].text()).split('\n');
      expect(lines[0]).toBe('Date,Open,High,Low,Close,Volume,OI');
      expect(lines[1]).toBe(`${isoDaysAgo(5)},50.00,53.00,47.00,51.00,1000,5000`);
    });
  });

  it('sessions without trades (zero OHLC and volume, carried close) are gaps, never zero candles or a flat stale line', async () => {
    const dead = (rows: EodDataRow[]) => rows.map(r => ({ ...r, open: 0, high: 0, low: 0, volume: 0, oi: 0 }));
    await reloadWith(req => of(req.option_type === 'CE'
      ? [...dead(makeRows(3, 1500, 4)), ...makeRows(2, 100)]          // listed but untraded for 3 sessions, then 2 traded ones
      : dead(makeRows(5, 50))));                                       // never traded in the range
    expect(component.series()[0].rows).toHaveLength(2);
    expect(component.series()[1].rows).toHaveLength(0);
    expect(component.sessions().map(s => s.date)).toEqual([isoDaysAgo(2), isoDaysAgo(1)]);
    expect(component.chart()?.lines[0].path.match(/M/g)).toHaveLength(1);
    expect(component.chart()?.yTicks.every(tick => !tick.label.startsWith('1,5'))).toBe(true);   // the stale 1500 close is not plotted
    expect(host.textContent).toContain('(no data)');
    expect(component.missingLegs()).toHaveLength(1);
  });

  describe('only legs that are not already loaded are requested', () => {
    it('adding a leg requests just that leg; removing a leg requests nothing', async () => {
      requests.length = 0;
      component.addLeg();                                    // a new CE at the same contract as leg 1: already cached
      await settle();
      expect(requests).toHaveLength(0);
      await select('#ml-strike-3', '22700');                 // now it is a different contract
      expect(requests).toEqual([expect.objectContaining({ option_type: 'CE', strike: 22700 })]);
      requests.length = 0;
      component.removeLeg(component.legs()[2].id);
      await settle();
      expect(requests).toHaveLength(0);
      expect(component.series()).toHaveLength(2);
    });

    it('changing one leg re-requests only that leg, and changing back is served from the cache', async () => {
      requests.length = 0;
      await select('#ml-strike-1', '22700');
      expect(requests).toHaveLength(1);
      requests.length = 0;
      await select('#ml-strike-1', '22600');
      expect(requests).toHaveLength(0);
    });

    it('a request still in flight when another leg changes is not repeated, and its result is kept', async () => {
      const slow = new Subject<EodDataRow[]>();
      rowsFor = req => (req.strike === 22700 ? slow : of(makeRows(4, 100)));
      requests.length = 0;
      component.setLegStrike(component.legs()[0].id, '22700');   // leg 1 starts loading (slow)
      component.setLegType(component.legs()[1].id, 'CE');         // a second change reloads the screen while leg 1 is in flight
      await settle();
      expect(requests.filter(r => r.strike === 22700)).toHaveLength(1);
      slow.next(makeRows(3, 500));
      slow.complete();
      await settle();
      expect(component.series()[0].rows).toHaveLength(3);
      requests.length = 0;
      component.setLegType(component.legs()[1].id, 'PE');        // another reload: leg 1 comes from the cache
      await settle();
      expect(requests.filter(r => r.strike === 22700)).toHaveLength(0);
    });
  });

  it('stale responses never overwrite the latest symbol (rapid switching)', async () => {
    const slow = new Subject<ReturnType<typeof details>>();
    metaFor = symbol => (symbol === 'BANKNIFTY' ? slow : of(details(symbol)));
    component.selectSymbol('BANKNIFTY');
    component.selectSymbol('RELIANCE');
    await settle();
    slow.next(details('BANKNIFTY'));
    await settle();
    expect(component.symbol()).toBe('RELIANCE');
    expect(requests.at(-1)?.symbol).toBe('RELIANCE');
    expect(requests.some(r => r.symbol === 'BANKNIFTY')).toBe(false);
  });

  describe('expiry list for every range mode (POST /fo/dd_expiry)', () => {
    const from = isoDaysAgo(20), till = isoDaysAgo(2);
    /** The backend also lists dates outside any requested range. */
    const ALL = [isoDaysAgo(25), E1, E2, isoDaysAgo(1), '2099-12-31'];
    const listed = (call: ExpiryRequest, dates = ALL) => dates.filter(d => d >= call.trade_from && d <= call.trade_till);
    /** dd_symbol_details lists 2026-10-29 and 2026-11-26; with "today" pinned to 2026-10-30 only the latter is upcoming. */
    const UP = '2026-11-26';
    /** The dates the backend lists after a request's To date. */
    const after = (call: ExpiryRequest, dates = ALL) => dates.filter(d => d > call.trade_till);
    /** The dropdown: the range's historical expiries, those listed after To and the upcoming ones, de-duplicated, earliest first. */
    const combined = (historical: string[], later: string[] = []) => [...new Set([...historical, ...later, UP])].sort();
    const expiryOptions = () => Array.from(host.querySelectorAll<HTMLOptionElement>('select[id^="ml-expiry-"] option')).map(o => o.value);
    const asRequest = (preset: Parameters<typeof resolveRange>[0], customFrom = '', customTill = '') => {
      const resolved = resolveRange(preset, component.today, customFrom, customTill) as { range: { from: string; till: string } };
      return { symbol: 'NIFTY', trade_from: resolved.range.from, trade_till: resolved.range.till };
    };
    const customRange = async () => {
      await click('.field .seg button', 'Custom');
      component.onCustomFrom(from);
      component.onCustomTill(till);
      await settle();
    };
    beforeEach(() => { expiryFor = req => reply(req, ALL); });

    it('the initial 3M load asks dd_expiry for the resolved dates; the list is its dates inside them plus the upcoming expiry, earliest first', () => {
      expect(expiryCalls).toEqual([asRequest('3M')]);
      expect(component.expiries()).toEqual(['2026-10-22', '2026-10-29', '2026-11-26']);      // 2026-11-26 comes from dd_symbol_details, not from the range
    });

    it('1W, 1M, 3M and Custom each send the symbol and the dates the existing range logic resolved', async () => {
      for (const preset of ['1W', '1M', '3M'] as const) {
        await click('.field .seg button', preset);
        expect(expiryCalls.at(-1), preset).toEqual(asRequest(preset));
      }
      await customRange();
      expect(expiryCalls.at(-1)).toEqual({ symbol: 'NIFTY', trade_from: from, trade_till: till });
    });

    it('switching between modes replaces the list with that mode\'s dates only', async () => {
      for (const preset of ['1W', '1M', '3M'] as const) {
        await click('.field .seg button', preset);
        expect(component.expiries(), preset).toEqual(combined(listed(expiryCalls.at(-1)!), after(expiryCalls.at(-1)!)));
        expect(expiryOptions(), preset).toEqual(expect.arrayContaining(combined(listed(expiryCalls.at(-1)!), after(expiryCalls.at(-1)!))));
      }
      await customRange();
      expect(component.expiries()).toEqual(combined([E1, E2], [isoDaysAgo(1), '2099-12-31']));
      await click('.field .seg button', '1W');
      expect(component.expiries()).toEqual(combined(listed(expiryCalls.at(-1)!), after(expiryCalls.at(-1)!)));
      expect(component.expiries()).not.toContain(isoDaysAgo(25));      // before the window: never listed
    });

    it('the range\'s own expiries are From to To inclusive and earlier dates are dropped; dates after To are listed as later expiries', async () => {
      const before = isoDaysAgo(25), afterTo = isoDaysAgo(1);
      expiryFor = req => reply(req, [before, from, E1, till, afterTo, '2099-12-31']);
      await customRange();
      expect(component.expiries()).toEqual(combined([from, E1, till], [afterTo, '2099-12-31']));
      expect(expiryOptions()).toEqual(expect.arrayContaining([from, E1, till, afterTo, '2099-12-31']));
      expect(expiryOptions()).not.toContain(before);
    });

    it('untouched default legs take the nearest expiry on or after To, whatever order the list arrives in; the dropdown is sorted earliest first', async () => {
      expiryFor = req => reply(req, [E2, E1, E3]);                       // all before To: the nearest on or after it is the upcoming one
      await customRange();
      expect(component.expiries()).toEqual(combined([E1, E3, E2]));
      expect(component.legs().map(l => l.expiry)).toEqual([UP, UP]);
      expiryFor = req => reply(req, [E1, E3, E2]);
      component.onCustomFrom(isoDaysAgo(19));
      await settle();
      expect(component.expiries()).toEqual(combined([E1, E3, E2]));
      expect(component.legs().map(l => l.expiry)).toEqual([UP, UP]);
    });

    it('a default leg takes the nearest listed expiry on or after To: the To date itself counts, and so does a later date that has since passed', async () => {
      expiryFor = req => reply(req, [from, E1, till, isoDaysAgo(1), '2099-12-31']);
      await customRange();
      expect(component.legs().map(l => l.expiry)).toEqual([till, till]);
      expiryFor = req => reply(req, [isoDaysAgo(25), isoDaysAgo(1)]);
      component.onCustomTill(isoDaysAgo(3));
      await settle();
      expect(component.expiries()).toEqual([isoDaysAgo(1), UP]);          // nothing in range: the later date and the upcoming one
      expect(component.legs().map(l => l.expiry)).toEqual([isoDaysAgo(1), isoDaysAgo(1)]);   // the nearest on or after the To date (not the system date)
    });

    it('a manually chosen expiry stays while the new list has it, and is replaced (not kept as an extra option) once it does not', async () => {
      await customRange();
      component.setLegExpiry(component.legs()[0].id, E1);
      await settle();
      expiryFor = req => reply(req, [E1, E3, E2]);
      component.onCustomFrom(isoDaysAgo(19));
      await settle();
      expect(component.legs().map(l => l.expiry)).toEqual([E1, UP]);       // still listed: kept; the untouched leg takes the nearest expiry on or after To
      expect(component.legs()[0].picked?.expiry).toBe(true);
      expiryFor = req => reply(req, [E3, E2]);
      component.onCustomFrom(isoDaysAgo(18));
      await settle();
      expect(component.legs().map(l => l.expiry)).toEqual([UP, UP]);       // E1 is gone: replaced by the nearest expiry on or after To
      expect(component.legs()[0].picked?.expiry).toBeUndefined();          // it follows the default from now on
      expect(expiryOptions()).not.toContain(E1);
      expect(host.textContent).not.toContain('not in the current expiry list');
      expect(toasts('info')).toEqual([`Expiry ${longDate(E1)} is not listed for these dates, so it was replaced by a listed expiry.`]);   // the user's pick changed: told once
      expect(toasts('error')).toEqual([]);
    });

    it('future expiries survive: dates after To come from dd_expiry and dd_symbol_details, are not duplicated, and expired standard dates do not leak in', async () => {
      expiryFor = req => reply(req, [E1, UP, '2099-12-31']);       // the backend echoes an upcoming date and a far one
      await customRange();
      expect(component.expiries()).toEqual([E1, UP, '2099-12-31']);   // UP once; far-future dates are kept, never hidden
      expect(component.expiries()).not.toContain('2026-10-29');     // standard-list date already expired: it only appears if the range returns it
      expiryFor = req => reply(req, ['2026-10-29', E1]);
      component.onCustomFrom('2026-10-15');
      component.onCustomTill('2026-10-29');
      await settle();
      expect(component.expiries()).toEqual([E1, '2026-10-29', UP]);   // 10-29 is back because the range returned it
    });

    it('the preset windows are inclusive too: a date on the resolved From or To stays', async () => {
      const window = asRequest('1M');
      expiryFor = req => reply(req, ['2000-01-01', window.trade_from, window.trade_till, '2099-12-31']);
      await click('.field .seg button', '1M');
      expect(component.expiries()).toEqual(combined([window.trade_from, window.trade_till], ['2099-12-31']));
    });

    it('when no returned date is inside the range every leg silently takes the next expiry on or after From (none before it)', async () => {
      expiryFor = req => reply(req, [isoDaysAgo(25), isoDaysAgo(1)]);
      component.setLegExpiry(component.legs()[0].id, '2026-09-01');
      await settle();
      await customRange();
      expect(component.expiries()).toEqual([isoDaysAgo(1), UP]);
      expect(host.textContent).not.toContain('No expiry falls within the selected date range.');   // routine fallback: no explanation on screen
      expect(component.legs().map(l => l.expiry)).toEqual([isoDaysAgo(1), isoDaysAgo(1)]);   // the unlisted pick is replaced too; 25 days ago (before From) is never chosen
    });

    it('makes no call while the dates are incomplete or invalid, and none twice for the same dates', async () => {
      await click('.field .seg button', 'Custom');
      const afterDefaults = expiryCalls.length;
      component.onCustomFrom('');                    // incomplete
      component.onCustomTill('2999-01-01');          // in the future: invalid
      await settle();
      expect(expiryCalls.length).toBe(afterDefaults);
      component.onCustomFrom(from);
      component.onCustomTill(till);
      component.onCustomTill(till);
      await settle();
      expect(expiryCalls.filter(c => c.trade_from === from && c.trade_till === till)).toHaveLength(1);
    });

    it('an expiry the new dates do not list is never kept or shown: a mode change replaces it with a listed one', async () => {
      await customRange();
      expect(component.legs().map(l => l.expiry)).toEqual([isoDaysAgo(1), isoDaysAgo(1)]);   // untouched default legs take the nearest expiry on or after To
      component.setLegExpiry(component.legs()[0].id, '2026-09-01');
      await settle();
      expect(component.legs()[0].expiry).toBe('2026-09-01');
      await click('.field .seg button', '1W');
      expect(component.legs()[0].expiry).not.toBe('2026-09-01');
      expect(component.expiries()).toContain(component.legs()[0].expiry);
      expect(expiryOptions()).not.toContain('2026-09-01');
      expect(host.textContent).not.toContain('not in the current expiry list');
      expect(host.textContent).not.toContain('The selection is kept');
    });

    it('a failed dd_expiry keeps the selections, offers Retry, disables the expiry dropdowns and requests no leg data', async () => {
      await customRange();
      const before = component.legs().map(l => l.expiry);
      expiryFor = () => throwError(() => new Error('boom'));
      requests.length = 0;
      component.onCustomFrom(isoDaysAgo(19));
      await settle();
      expect(component.legs().map(l => l.expiry)).toEqual(before);          // not reconciled against the upcoming-only standard list
      expect(component.expiryError()).toContain('Unable to load expiries');
      expect(host.textContent).not.toContain('Showing the standard expiry list');
      expect(component.expiryListReady()).toBe(false);
      expect(Array.from(host.querySelectorAll<HTMLSelectElement>('select[id^="ml-expiry-"]')).every(s => s.disabled)).toBe(true);
      expect(expiryOptions()).toEqual(before);                              // each disabled control shows only its kept selection
      expect(requests).toEqual([]);
      expect(component.loading()).toBe(false);
      expect(host.querySelector('.legs-head .ghost')?.hasAttribute('disabled')).toBe(true);   // no leg can be added on an unverified list
      expiryFor = req => reply(req, ALL);
      await click('.inline-error .inline-retry', 'Retry');
      expect(component.expiryError()).toBe('');
      expect(component.expiryListReady()).toBe(true);
      expect(requests.length).toBeGreaterThan(0);
      expect(requests.every(r => r.date_from === isoDaysAgo(19))).toBe(true);
    });

    it('a preset whose dd_expiry fails also reports it, keeps the legs and requests nothing', async () => {
      expiryFor = () => throwError(() => new Error('boom'));
      requests.length = 0;
      await click('.field .seg button', '1M');
      expect(component.expiryError()).toContain('Unable to load expiries');
      expect(component.legs().map(l => l.expiry)).toEqual(['2026-11-26', '2026-11-26']);
      expect(requests).toEqual([]);
    });

    it('the backend\'s 422 "No data available." is an empty result: no message, no fallback to the standard list, every leg on a listed expiry', async () => {
      component.setLegExpiry(component.legs()[0].id, '2026-09-01');
      await settle();
      expiryFor = () => throwError(() => new HttpErrorResponse({ status: 422, error: { success: false, message: 'VALIDATION_FAILED', errors: { expiry_date: ['No data available.'] } } }));
      await customRange();
      expect(component.expiries()).toEqual([UP]);                          // not the standard list, which still holds the expired 2026-10-29
      expect(component.expiriesEmpty()).toBe(true);
      expect(component.expiryError()).toBe('');
      expect(host.textContent).not.toContain('No expiry falls within the selected date range.');
      expect(host.querySelector('.inline-error')).toBeNull();               // an empty range is not a failure
      expect(host.textContent).not.toContain('Showing the standard expiry list');
      expect(component.legs().map(l => l.expiry)).toEqual([UP, UP]);       // the unlisted pick is replaced; nothing stays on an unlisted date
    });

    it('any other 422 is still a failure: error message, and the list is not verified', async () => {
      await click('.field .seg button', 'Custom');
      const cases = [{ trade_from: ['Invalid date.'] }, { expiry_date: ['Something else.'] }, { expiry_date: ['No data available.', 'Other.'] }];
      for (const [index, errors] of cases.entries()) {
        expiryFor = () => throwError(() => new HttpErrorResponse({ status: 422, error: { success: false, errors } }));
        component.onCustomFrom(isoDaysAgo(30));
        component.onCustomTill(isoDaysAgo(1 + index));
        await settle();
        expect(component.expiriesEmpty()).toBe(false);
        expect(component.expiryError()).toContain('Unable to load expiries');
        expect(component.expiryListReady()).toBe(false);
      }
    });

    it('while the expiry request is pending the dropdowns and Add leg are disabled and a loading hint shows', async () => {
      const pending = new Subject<ReturnType<typeof expiryFor> extends Observable<infer R> ? R : never>();
      expiryFor = () => pending;
      await customRange();
      expect(component.expiryLoading()).toBe(true);
      expect(Array.from(host.querySelectorAll<HTMLSelectElement>('select[id^="ml-expiry-"]')).every(s => s.disabled)).toBe(true);
      expect(host.textContent).toContain('Loading expiries for these dates');
      pending.next({ data: { symbol: 'NIFTY', trade_from: from, trade_till: till, expiry_date: [E1] } });
      await settle();
      expect(component.expiryLoading()).toBe(false);
      expect(Array.from(host.querySelectorAll<HTMLSelectElement>('select[id^="ml-expiry-"]')).some(s => s.disabled)).toBe(false);
    });

    it('an out-of-order response for earlier dates is ignored', async () => {
      const slow = new Subject<ReturnType<typeof expiryFor> extends Observable<infer R> ? R : never>();
      expiryFor = req => (req.trade_from === from ? slow : reply(req, [E3]));
      await click('.field .seg button', 'Custom');
      component.onCustomFrom(from);
      component.onCustomTill(till);
      component.onCustomFrom(isoDaysAgo(30));
      component.onCustomTill(till);
      await settle();
      slow.next({ data: { symbol: 'NIFTY', trade_from: from, trade_till: till, expiry_date: [E1] } });
      await settle();
      expect(component.expiries()).toEqual(combined([E3]));
    });

    it('a late response for the previous mode or symbol never overwrites the latest one', async () => {
      const slow = new Subject<ReturnType<typeof expiryFor> extends Observable<infer R> ? R : never>();
      const oneMonth = asRequest('1M');
      expiryFor = req => (req.trade_from === oneMonth.trade_from ? slow : reply(req, [E2]));
      await click('.field .seg button', '1M');         // pending
      await click('.field .seg button', '1W');         // newer request answers first
      slow.next({ data: { symbol: 'NIFTY', trade_from: oneMonth.trade_from, trade_till: oneMonth.trade_till, expiry_date: [E1] } });
      await settle();
      expect(component.expiries()).toEqual(combined([E2]));
      expiryFor = req => (req.symbol === 'BANKNIFTY' ? reply(req, [E3]) : slow);
      component.selectSymbol('BANKNIFTY');
      await settle();
      expect(component.expiries()).toEqual(combined([E3]));
    });

    it('changing the symbol asks dd_expiry for the new symbol with the current dates', async () => {
      await customRange();
      expiryCalls.length = 0;
      component.selectSymbol('BANKNIFTY');
      await settle();
      expect(expiryCalls).toEqual([{ symbol: 'BANKNIFTY', trade_from: from, trade_till: till }]);
    });

    it('dd_symbol_details still supplies the starting metadata; the historical close of To then sets spot, ATM and strikes', async () => {
      expect(component.underlying()).toBe(22630);
      expect(component.atmFor('2026-11-26')).toBe(22600);
      expect(component.strikesFor('2026-11-26')).toEqual(STRIKE_GRID);
      expect(component.tradeDate()).toBe('2026-10-29');           // the session the close belongs to
      expect(component.expiries()).toContain('2026-10-29');       // expiries still start from the dd_symbol_details list
      await customRange();
      expect(component.underlying()).toBe(22630);
      expect(component.strikesFor('2026-11-26')).toEqual(STRIKE_GRID);
    });

    it('the default legs are requested once, on an expiry from the range\'s list', () => {
      expect(requests).toHaveLength(2);
      expect(requests.every(r => r.expiry === '2026-11-26')).toBe(true);
    });
  });

  describe('default ATM strike from the historical underlying close (To date)', () => {
    const ATM_STRIKES = [24800, 24900, 25000, 25100, 25200, 25300, 25400, 25500, 25600];
    const found = (session: string, underlying: number, atm: number, list = ATM_STRIKES): Observable<HistoricalUnderlyingResult> =>
      of({ ok: true, session, underlying, strikes: list, atm });
    const legStrikes = () => component.legs().map(l => l.strike);
    const pickStrike = async (index: number, value: number) => {
      const el = host.querySelectorAll<HTMLSelectElement>('select[id^="ml-strike-"]')[index - 1]!;
      el.value = String(value);
      el.dispatchEvent(new Event('change'));
      await settle();
    };

    it('the first load asks for the To date of the default range (today for a preset) and builds the legs on that ATM', () => {
      expect(atmCalls).toEqual([{ symbol: 'NIFTY', till: '2026-10-30' }]);
      expect(legStrikes()).toEqual([22600, 22600]);
      expect(component.atmFor('2026-11-26')).toBe(22600);
      expect(component.tradeDate()).toBe('2026-10-29');
    });

    it('the default legs are requested once, already on the historical ATM, never on the current one first', () => {
      expect(requests).toHaveLength(2);
      expect(requests.every(r => r.strike === 22600)).toBe(true);
    });

    it('a Custom range uses its own To date: the close of that day sets the ATM, taken from the strikes of the leg\'s expiry', async () => {
      atmFor = (_s, till) => (till === '2026-01-31' ? found('2026-01-30', 25320.65, 25300) : found('2026-10-29', 22630, 22600));
      await click('.field .seg button', 'Custom');
      component.onCustomFrom('2026-01-01');
      component.onCustomTill('2026-01-31');
      await settle();
      expect(atmCalls.at(-1)).toEqual({ symbol: 'NIFTY', till: '2026-01-31' });
      expect(component.atmFor('2026-11-26')).toBe(25300);
      expect(component.tradeDate()).toBe('2026-01-30');
      expect(legStrikes()).toEqual([25300, 25300]);
    });

    it('a To date that is a weekend or holiday gets the previous session\'s close (the service maps the date; the screen shows the session used)', async () => {
      atmFor = () => found('2026-01-30', 25320.65, 25300);
      await click('.field .seg button', 'Custom');
      component.onCustomFrom('2026-01-20');
      component.onCustomTill('2026-01-31');   // a Saturday
      await settle();
      expect(component.tradeDate()).toBe('2026-01-30');
      expect(host.textContent).toContain('on 30 Jan 2026');
    });

    it('changing the To date or the symbol recalculates strikes the user did not pick', async () => {
      atmFor = (symbol, till) => (symbol === 'BANKNIFTY' ? found('2026-10-29', 59610.45, 59600, [59400, 59500, 59600, 59700]) : till === '2026-01-31' ? found('2026-01-30', 25320.65, 25300) : found('2026-10-29', 22630, 22600));
      await click('.field .seg button', 'Custom');
      component.onCustomFrom('2026-01-01');
      component.onCustomTill('2026-01-31');
      await settle();
      expect(legStrikes()).toEqual([25300, 25300]);
      component.selectSymbol('BANKNIFTY');
      await settle();
      expect(atmCalls.at(-1)).toEqual({ symbol: 'BANKNIFTY', till: '2026-01-31' });
      expect(legStrikes()).toEqual([59600, 59600]);
    });

    it('a strike the user picked is kept when the To date changes, and the other leg follows the new ATM', async () => {
      await pickStrike(1, 22700);
      expect(legStrikes()).toEqual([22700, 22600]);
      atmFor = () => found('2026-01-30', 25320.65, 25300);
      await click('.field .seg button', 'Custom');
      component.onCustomFrom('2026-01-01');
      component.onCustomTill('2026-01-31');
      await settle();
      expect(legStrikes()).toEqual([22700, 25300]);                      // the picked strike stays; the untouched leg follows the new ATM
      expect(component.atmFor('2026-11-26')).toBe(25300);
      const option = host.querySelectorAll<HTMLSelectElement>('select[id^="ml-strike-"]')[0].selectedOptions[0];
      expect(option.textContent?.trim()).toBe('22700');                      // still listed for this expiry: not flagged
    });

    it('an unchanged To date asks nothing new (switching presets that end today reuses the answer)', async () => {
      await click('.field .seg button', '1M');
      await click('.field .seg button', '1W');
      expect(atmCalls).toHaveLength(1);
    });

    it('invalid or incomplete Custom dates make no ATM request', async () => {
      await click('.field .seg button', 'Custom');
      const before = atmCalls.length;
      component.onCustomFrom('');
      component.onCustomTill('2999-01-01');
      await settle();
      expect(atmCalls).toHaveLength(before);
    });

    it('a failed lookup shows why, keeps the expiry\'s strike list, and never falls back to the current price', async () => {
      atmFor = () => of({ ok: false, reason: 'unavailable' });
      component.selectSymbol('BANKNIFTY');
      await settle();
      expect(host.textContent).toContain('Unable to load the closing price for');
      expect(legStrikes()).toEqual([null, null]);                          // not the current ATM from dd_symbol_details
      expect(component.strikesFor('2026-11-26')).toEqual(STRIKE_GRID);
      // nothing on screen presents today's ATM or spot as the answer
      expect(component.atmFor('2026-11-26')).toBeNull();
      expect(component.underlying()).toBeNull();
      expect(host.querySelector('.legnote')).toBeNull();
      expect(Array.from(host.querySelectorAll('select[id^="ml-strike-"] option')).some(o => /ATM/.test(o.textContent ?? ''))).toBe(false);
      expect(host.querySelector('.source-note')?.textContent).not.toMatch(/d{4}-d{2}-d{2}/);
      await click('.legs-head .ghost', '+ Add leg');                       // a new leg does not get a guessed strike either
      expect(legStrikes()).toEqual([null, null, null]);
      expect(requests.filter(r => r.symbol === 'BANKNIFTY')).toHaveLength(0);
    });

    it('no trading session on or before the date is reported as such, as neutral guidance rather than an error', async () => {
      atmFor = () => of({ ok: false, reason: 'no-session' });
      component.selectSymbol('BANKNIFTY');
      await settle();
      expect(component.atmNote()).toContain('No trading session was found');
      expect(component.atmError()).toBe('');
      const note = Array.from(host.querySelectorAll('.inline-note')).find(el => el.textContent?.includes('No trading session'));
      expect(note?.getAttribute('role')).toBe('status');
      expect(toasts('error')).toEqual([]);
    });

    it('after a failure choosing a strike works and loads the data', async () => {
      atmFor = () => of({ ok: false, reason: 'unavailable' });
      component.selectSymbol('BANKNIFTY');
      await settle();
      requests.length = 0;
      await pickStrike(1, 22600);
      expect(component.legs()[0].strike).toBe(22600);
      expect(requests.some(r => r.strike === 22600)).toBe(true);
    });

    it('the strike dropdowns are disabled and a hint shows while the closing price loads', async () => {
      const pending = new Subject<HistoricalUnderlyingResult>();
      atmFor = () => pending;
      component.selectSymbol('BANKNIFTY');
      await settle();
      expect(component.atmLoading()).toBe(true);
      expect(Array.from(host.querySelectorAll<HTMLSelectElement>('select[id^="ml-strike-"]')).every(el => el.disabled)).toBe(true);
      expect(host.textContent).toContain('Loading the closing price');
      pending.next({ ok: true, session: '2026-10-29', underlying: 59610.45, strikes: [59500, 59600, 59700], atm: 59600 });
      await settle();
      expect(component.atmLoading()).toBe(false);
      expect(legStrikes()).toEqual([59600, 59600]);
    });

    it('a late answer for an earlier date or symbol never overwrites the latest one', async () => {
      const slow = new Subject<HistoricalUnderlyingResult>();
      atmFor = (_s, till) => (till === '2026-01-31' ? slow : found('2026-02-27', 25100, 25100));
      await click('.field .seg button', 'Custom');
      component.onCustomFrom('2026-01-01');
      component.onCustomTill('2026-01-31');
      component.onCustomTill('2026-02-27');
      await settle();
      slow.next({ ok: true, session: '2026-01-30', underlying: 25320.65, strikes: ATM_STRIKES, atm: 25300 });
      await settle();
      expect(component.atmFor('2026-11-26')).toBe(25100);
      expect(legStrikes()).toEqual([25100, 25100]);
    });

    it('does not depend on the real system date', async () => {
      expect(atmCalls[0].till).toBe('2026-10-30');                         // the pinned test clock, not the machine\'s
    });
  });

  describe('strikes of the selected expiry (dd_strikes)', () => {
    const OTHER = '2026-10-29';
    const legStrikes = () => component.legs().map(l => l.strike);
    const strikeSelects = () => Array.from(host.querySelectorAll<HTMLSelectElement>('select[id^="ml-strike-"]'));
    const expirySelects = () => Array.from(host.querySelectorAll<HTMLSelectElement>('select[id^="ml-expiry-"]'));
    const ok = (list: number[]): Observable<ExpiryStrikesResult> => of({ ok: true, strikes: list });
    const chooseExpiry = async (index: number, expiry: string) => {
      const el = expirySelects()[index];
      el.value = expiry;
      el.dispatchEvent(new Event('change'));
      await settle();
    };
    const pickStrike = async (index: number, value: number) => {
      const el = strikeSelects()[index];
      el.value = String(value);
      el.dispatchEvent(new Event('change'));
      await settle();
    };

    it('the first load asks dd_strikes once for the legs\' expiry, and the legs load on that expiry\'s ATM', () => {
      expect(strikeCalls).toEqual([{ symbol: 'NIFTY', expiry: '2026-11-26' }]);
      expect(legStrikes()).toEqual([22600, 22600]);
      expect(requests).toHaveLength(2);
    });

    it('the strike dropdown lists the expiry\'s strikes and marks its ATM', () => {
      const options = Array.from(strikeSelects()[0].options).map(o => o.textContent?.trim());
      expect(options).toContain('22600 (ATM)');
      expect(options).toContain('59700');
    });

    it('changing a leg\'s expiry fetches that expiry\'s strikes and moves an untouched strike to its ATM', async () => {
      strikesFor = (_s, expiry) => (expiry === OTHER ? ok([22550, 22650, 22750]) : ok(STRIKE_GRID));
      requests.length = 0;
      await chooseExpiry(0, OTHER);
      expect(strikeCalls.at(-1)).toEqual({ symbol: 'NIFTY', expiry: OTHER });
      expect(legStrikes()).toEqual([22650, 22600]);                       // 22630 is nearest to 22650 in that list; the other leg is on its own expiry
      expect(Array.from(strikeSelects()[0].options).map(o => o.textContent?.trim())).toEqual(['22550', '22650 (ATM)', '22750']);
      expect(requests.some(r => r.expiry === OTHER && r.strike === 22650)).toBe(true);
      expect(requests.some(r => r.expiry === OTHER && r.strike === 22600)).toBe(false);   // never a strike of the previous expiry
      expect(toasts('info')).toEqual([]);                                   // an untouched strike following its expiry is routine
    });

    it('a picked strike the new expiry does not list is reset to that expiry\'s ATM, never offered as an extra option or requested', async () => {
      await pickStrike(0, 22700);
      strikesFor = (_s, expiry) => (expiry === OTHER ? ok([22550, 22650]) : ok(STRIKE_GRID));
      requests.length = 0;
      await chooseExpiry(0, OTHER);
      expect(legStrikes()).toEqual([22650, 22600]);                         // the ATM of OTHER (close 22630)
      expect(component.legs()[0].picked?.strike).toBeUndefined();          // it follows the ATM from now on
      expect(Array.from(strikeSelects()[0].options).map(o => o.textContent?.trim())).toEqual(['22550', '22650 (ATM)']);
      expect(strikeSelects()[0].value).toBe('22650');
      expect(requests.some(r => r.expiry === OTHER && r.strike === 22700)).toBe(false);
      expect(requests.some(r => r.expiry === OTHER && r.strike === 22650)).toBe(true);
      expect(toasts('info')).toEqual([`Strike 22700 is not listed for the ${longDate(OTHER)} expiry, so the ATM strike 22650 is selected.`]);
    });

    it('a picked strike is not requested on a new expiry until that expiry\'s strikes have answered', async () => {
      await pickStrike(0, 22700);
      const pending = new Subject<ExpiryStrikesResult>();
      strikesFor = (_s, expiry) => (expiry === OTHER ? pending : ok(STRIKE_GRID));
      requests.length = 0;
      await chooseExpiry(0, OTHER);
      expect(requests.some(r => r.expiry === OTHER)).toBe(false);
      expect(component.series()[0].status).toBe('loading');
      pending.next({ ok: true, strikes: [22650, 22700] });
      await settle();
      expect(legStrikes()[0]).toBe(22700);                                  // listed: kept
      expect(requests.filter(r => r.expiry === OTHER).map(r => r.strike)).toEqual([22700]);
    });

    it('a picked strike that the new expiry lists is simply kept, without a flag', async () => {
      await pickStrike(0, 22700);
      strikesFor = (_s, expiry) => (expiry === OTHER ? ok([22650, 22700]) : ok(STRIKE_GRID));
      await chooseExpiry(0, OTHER);
      expect(strikeSelects()[0].selectedOptions[0].textContent?.trim()).toBe('22700');
    });

    it('strikes are tracked per leg: an untouched leg follows the expiry while a picked one in the same list does not', async () => {
      await pickStrike(0, 22400);
      strikesFor = (_s, expiry) => (expiry === OTHER ? ok([22400, 22550, 22650, 22750]) : ok(STRIKE_GRID));   // the pick is listed for OTHER too
      await chooseExpiry(0, OTHER);
      await chooseExpiry(1, OTHER);
      expect(legStrikes()).toEqual([22400, 22650]);
    });

    it('while an expiry\'s strikes load, that leg has no strike, its dropdown is disabled with a hint, and no data is requested for it', async () => {
      const pending = new Subject<ExpiryStrikesResult>();
      strikesFor = (_s, expiry) => (expiry === OTHER ? pending : ok(STRIKE_GRID));
      requests.length = 0;
      await chooseExpiry(0, OTHER);
      expect(component.strikesLoading()).toBe(true);
      expect(legStrikes()).toEqual([null, 22600]);
      expect(strikeSelects()[0].disabled).toBe(true);
      expect(strikeSelects()[0].options[0].textContent).toContain('Select strike');
      expect(host.textContent).toContain('Loading the strikes for the selected expiry');
      expect(requests.some(r => r.expiry === OTHER)).toBe(false);
      pending.next({ ok: true, strikes: [22550, 22650] });
      await settle();
      expect(component.strikesLoading()).toBe(false);
      expect(legStrikes()).toEqual([22650, 22600]);
      expect(requests.some(r => r.expiry === OTHER && r.strike === 22650)).toBe(true);
    });

    it('an expiry whose strikes cannot be loaded shows why; the untouched strike stays unset instead of keeping another expiry\'s', async () => {
      strikesFor = (_s, expiry) => (expiry === OTHER ? of({ ok: false, reason: 'unavailable' }) : ok(STRIKE_GRID));
      requests.length = 0;
      await chooseExpiry(0, OTHER);
      expect(host.textContent).toContain('Unable to load the strikes for the');
      expect(legStrikes()).toEqual([null, 22600]);
      expect(requests.some(r => r.expiry === OTHER)).toBe(false);
    });

    it('an expiry with no listed strikes says so, and a picked strike is cleared rather than kept', async () => {
      await pickStrike(0, 22700);
      strikesFor = (_s, expiry) => (expiry === OTHER ? of({ ok: false, reason: 'none' }) : ok(STRIKE_GRID));
      requests.length = 0;
      await chooseExpiry(0, OTHER);
      expect(host.textContent).toContain('No strikes are listed for the');
      expect(legStrikes()[0]).toBeNull();                                   // there is no ATM to reset to
      expect(Array.from(strikeSelects()[0].options).map(o => o.textContent?.trim())).toEqual(['Select strike']);
      expect(requests.some(r => r.expiry === OTHER)).toBe(false);
      expect(toasts('info')).toEqual([`Strike 22700 is not listed for the ${longDate(OTHER)} expiry. Select a strike.`]);
      const note = Array.from(host.querySelectorAll('.inline-note')).find(el => el.textContent?.includes('No strikes are listed'));
      expect(note?.getAttribute('role')).toBe('status');                    // no listed strikes is a data condition, not an error
    });

    it('a picked strike whose list could not be loaded is kept and flagged as unchecked (a failure proves nothing)', async () => {
      await pickStrike(0, 22700);
      strikesFor = (_s, expiry) => (expiry === OTHER ? of({ ok: false, reason: 'unavailable' }) : ok(STRIKE_GRID));
      await chooseExpiry(0, OTHER);
      expect(legStrikes()[0]).toBe(22700);
      expect(strikeSelects()[0].selectedOptions[0].textContent?.trim()).toBe('22700 (could not be checked for this expiry)');
    });

    it('a failed strike list can be retried by choosing the expiry again later (failures are not remembered)', async () => {
      let attempt = 0;
      strikesFor = (_s, expiry) => (expiry === OTHER ? (++attempt === 1 ? of({ ok: false, reason: 'unavailable' }) : ok([22550, 22650])) : ok(STRIKE_GRID));
      await chooseExpiry(0, OTHER);
      expect(legStrikes()[0]).toBeNull();
      await chooseExpiry(0, '2026-11-26');
      await chooseExpiry(0, OTHER);
      expect(legStrikes()[0]).toBe(22650);
    });

    it('lists are kept per expiry: going back to a loaded expiry asks nothing new', async () => {
      strikesFor = (_s, expiry) => (expiry === OTHER ? ok([22550, 22650]) : ok(STRIKE_GRID));
      await chooseExpiry(0, OTHER);
      const calls = strikeCalls.length;
      await chooseExpiry(0, '2026-11-26');
      await chooseExpiry(0, OTHER);
      expect(strikeCalls).toHaveLength(calls);
      expect(legStrikes()).toEqual([22650, 22600]);
    });

    it('a late answer for an earlier expiry never overwrites the latest one', async () => {
      const slow = new Subject<ExpiryStrikesResult>();
      strikesFor = (_s, expiry) => (expiry === OTHER ? slow : ok(STRIKE_GRID));
      await chooseExpiry(0, OTHER);
      await chooseExpiry(0, '2026-11-26');                                  // back to the first expiry before the slow answer
      expect(legStrikes()).toEqual([22600, 22600]);
      slow.next({ ok: true, strikes: [22550, 22650] });
      await settle();
      expect(component.strikesFor('2026-11-26')).toEqual(STRIKE_GRID);
      expect(component.strikesFor(OTHER)).toEqual([22550, 22650]);          // stored under its own expiry
      expect(legStrikes()).toEqual([22600, 22600]);                          // the leg is still on the first expiry and its ATM
    });

    it('an answer for the previous symbol is dropped after the symbol changed', async () => {
      const slow = new Subject<ExpiryStrikesResult>();
      strikesFor = (symbol, expiry) => (symbol === 'NIFTY' && expiry === OTHER ? slow : ok(STRIKE_GRID));
      await chooseExpiry(0, OTHER);
      component.selectSymbol('BANKNIFTY');
      await settle();
      slow.next({ ok: true, strikes: [1, 2, 3] });
      await settle();
      expect(component.strikesFor(OTHER)).toEqual([]);
      expect(component.symbol()).toBe('BANKNIFTY');
    });

    it('a new symbol loads its own strike lists and defaults to its ATM', async () => {
      atmFor = () => of({ ok: true, session: '2026-10-29', underlying: 59610.45, strikes: [59600], atm: 59600 });
      strikeCalls.length = 0;
      component.selectSymbol('BANKNIFTY');
      await settle();
      expect(strikeCalls).toEqual([{ symbol: 'BANKNIFTY', expiry: '2026-11-26' }]);
      expect(legStrikes()).toEqual([59600, 59600]);
    });

    it('a newly added leg takes the ATM of its expiry\'s strikes', async () => {
      strikesFor = (_s, expiry) => (expiry === OTHER ? ok([22550, 22650]) : ok(STRIKE_GRID));
      await chooseExpiry(1, OTHER);
      await click('.legs-head .ghost', '+ Add leg');
      expect(component.legs()[2].expiry).toBe(OTHER);
      expect(legStrikes()[2]).toBe(22650);
    });
  });

  describe('loading indicator inside the expiry and strike dropdowns', () => {
    const wrapOf = (selector: string) => host.querySelector(selector)!.closest('.select-wrap')!;
    const spinnersIn = (selector: string) => wrapOf(selector).querySelectorAll('.select-spinner').length;
    const hintText = () => host.querySelector('.hint-line')?.textContent ?? '';

    it('no spinner and no loading line when nothing is loading', () => {
      expect(host.querySelectorAll('.select-spinner')).toHaveLength(0);
      expect(host.querySelector('.hint-line')).toBeNull();
    });

    it('a strike list that is loading shows a spinner inside that leg\'s strike control only, disabled, with no text line', async () => {
      const pending = new Subject<ExpiryStrikesResult>();
      strikesFor = (_s, expiry) => (expiry === '2026-10-29' ? pending : of({ ok: true, strikes: STRIKE_GRID }));
      const select = host.querySelectorAll<HTMLSelectElement>('select[id^="ml-expiry-"]')[0];
      select.value = '2026-10-29';
      select.dispatchEvent(new Event('change'));
      await settle();
      expect(spinnersIn('select[id^="ml-strike-"]')).toBe(1);
      const first = host.querySelectorAll<HTMLSelectElement>('select[id^="ml-strike-"]')[0];
      expect(first.closest('.select-wrap')!.querySelector('.select-spinner')).toBeTruthy();
      expect(first.disabled).toBe(true);
      expect(first.getAttribute('aria-busy')).toBe('true');
      expect(host.querySelectorAll<HTMLSelectElement>('select[id^="ml-strike-"]')[1].closest('.select-wrap')!.querySelector('.select-spinner')).toBeNull();
      expect(hintText()).toBe('');
      pending.next({ ok: true, strikes: [22550, 22650] });
      await settle();
      expect(host.querySelectorAll('.select-spinner')).toHaveLength(0);
      expect(first.disabled).toBe(false);
    });

    it('expiry lists that are loading show a spinner in every expiry control, disabled, and no text line', async () => {
      const slow = new Subject<{ data: { symbol: string; trade_from: string; trade_till: string; expiry_date: string[] } }>();
      expiryFor = () => slow;
      await click('.field .seg button', '1M');
      expect(component.expiryLoading()).toBe(true);
      const expiries = Array.from(host.querySelectorAll<HTMLSelectElement>('select[id^="ml-expiry-"]'));
      expect(expiries.every(el => el.disabled && !!el.closest('.select-wrap')!.querySelector('.select-spinner'))).toBe(true);
      expect(hintText()).toBe('');
      slow.next({ data: { symbol: 'NIFTY', trade_from: '', trade_till: '', expiry_date: [] } });
      await settle();
      expect(host.querySelectorAll('select[id^="ml-expiry-"] ~ .select-spinner')).toHaveLength(0);
    });

    it('the closing price loading shows spinners in the strike controls', async () => {
      const pending = new Subject<HistoricalUnderlyingResult>();
      atmFor = () => pending;
      component.selectSymbol('BANKNIFTY');
      await settle();
      expect(component.atmLoading()).toBe(true);
      const strikes = Array.from(host.querySelectorAll<HTMLSelectElement>('select[id^="ml-strike-"]'));
      expect(strikes.every(el => !!el.closest('.select-wrap')!.querySelector('.select-spinner'))).toBe(true);
      expect(hintText()).not.toContain('closing price');
      pending.next({ ok: true, session: '2026-10-29', underlying: 59610.45, strikes: [59600], atm: 59600 });
      await settle();
      expect(host.querySelectorAll('select[id^="ml-strike-"] ~ .select-spinner')).toHaveLength(0);
    });

    it('the loading text is kept for screen readers only', async () => {
      const pending = new Subject<ExpiryStrikesResult>();
      strikesFor = (_s, expiry) => (expiry === '2026-10-29' ? pending : of({ ok: true, strikes: STRIKE_GRID }));
      const select = host.querySelectorAll<HTMLSelectElement>('select[id^="ml-expiry-"]')[0];
      select.value = '2026-10-29';
      select.dispatchEvent(new Event('change'));
      await settle();
      const status = host.querySelector('.select-wrap .visually-hidden');
      expect(status?.textContent).toContain('Loading the strikes');
    });
  });

  describe('date changes wait for the expiry list before requesting the legs', () => {
    type ExpiryReply = { data: { symbol: string; trade_from: string; trade_till: string; expiry_date: string[] } };
    const ALL = ['2026-10-22', '2026-10-29', '2026-11-26'];
    const answer = (subject: Subject<ExpiryReply>, dates: string[]) => subject.next({ data: { symbol: 'NIFTY', trade_from: '', trade_till: '', expiry_date: dates } });
    const legExpiries = () => component.legs().map(l => l.expiry);
    const expiryControls = () => Array.from(host.querySelectorAll<HTMLSelectElement>('select[id^="ml-expiry-"]'));
    const customRange = async (from: string, till: string) => {
      await click('.field .seg button', 'Custom');
      requests.length = 0;   // the switch itself reloads the default 30 days; only the date change is under test
      component.onCustomFrom(from);
      component.onCustomTill(till);
      await settle();
    };
    /** Legs left on 2026-10-22 by a range that ends that day: the nearest expiry on or after its To date. */
    const legsOnOldExpiry = async () => {
      expiryFor = req => reply(req, ALL);
      await customRange('2026-10-01', '2026-10-22');
      expect(legExpiries()).toEqual(['2026-10-22', '2026-10-22']);
    };

    it('the reproduced case: legs on an expiry before the new From date request nothing with it, then load on the new expiry', async () => {
      await legsOnOldExpiry();
      const slow = new Subject<ExpiryReply>();
      expiryFor = () => slow;
      requests.length = 0;
      component.onCustomFrom('2026-10-25');
      component.onCustomTill('2026-10-30');
      await settle();
      expect(requests).toEqual([]);                                       // no request carries the old expiry with the new dates
      expect(component.loading()).toBe(true);
      expect(component.series().every(s => s.status === 'loading')).toBe(true);
      answer(slow, ['2026-10-29', '2026-11-26']);                         // the nearest expiry on or after To (30 Oct) is 26 Nov
      await settle();
      expect(legExpiries()).toEqual(['2026-11-26', '2026-11-26']);
      expect(requests.length).toBeGreaterThan(0);
      expect(requests.every(r => r.expiry === '2026-11-26' && r.date_from === '2026-10-25')).toBe(true);
      expect(requests.some(r => r.expiry === '2026-10-22')).toBe(false);
      expect(component.loading()).toBe(false);
    });

    it('a closing price or strike list that arrives before the expiry list does not trigger a request with the old expiry', async () => {
      const slow = new Subject<ExpiryReply>();
      expiryFor = () => slow;
      atmFor = () => of({ ok: true, session: '2026-10-28', underlying: 22300, strikes: [], atm: 0 });
      await click('.field .seg button', 'Custom');
      requests.length = 0;
      component.onCustomFrom('2026-10-01');
      component.onCustomTill('2026-10-28');
      await settle();
      expect(component.legs().map(l => l.strike)).toEqual([22400, 22400]);   // untouched strikes followed the new close ...
      expect(requests).toEqual([]);                                          // ... but nothing is requested while the expiry list is pending
      answer(slow, ['2026-11-03']);
      await settle();
      expect(requests.length).toBeGreaterThan(0);
      expect(requests.every(r => r.expiry === '2026-11-03' && r.date_till === '2026-10-28')).toBe(true);
    });

    it('an unchanged expiry is still requested, once, after the list answers', async () => {
      const slow = new Subject<ExpiryReply>();
      expiryFor = () => slow;
      requests.length = 0;
      await click('.field .seg button', '1M');
      expect(requests).toEqual([]);
      answer(slow, ['2026-11-26']);
      await settle();
      expect(legExpiries()).toEqual(['2026-11-26', '2026-11-26']);
      expect(requests.map(r => r.option_type).sort()).toEqual(['CE', 'PE']);
      expect(requests.every(r => r.expiry === '2026-11-26')).toBe(true);
    });

    it('a failed expiry list leaves nothing loading, keeps the legs and requests no leg data with the unverified expiries', async () => {
      await legsOnOldExpiry();
      expiryFor = () => throwError(() => new HttpErrorResponse({ status: 500 }));
      requests.length = 0;
      component.onCustomFrom('2026-10-25');
      component.onCustomTill('2026-10-30');
      await settle();
      expect(component.loading()).toBe(false);
      expect(legExpiries()).toEqual(['2026-10-22', '2026-10-22']);        // unchanged: the list is unknown
      expect(requests).toEqual([]);
      expect(host.textContent).toContain('Unable to load expiries for these dates');
      expect(host.textContent).not.toContain('is before the From date');
    });

    it('a failed list requests nothing even when the dates still contain the legs\' expiry', async () => {
      expiryFor = () => throwError(() => new HttpErrorResponse({ status: 500 }));
      requests.length = 0;
      await click('.field .seg button', '1M');
      expect(component.loading()).toBe(false);
      expect(legExpiries()).toEqual(['2026-11-26', '2026-11-26']);
      expect(requests).toEqual([]);
    });

    it('a manually chosen expiry before the new From date is replaced by the nearest valid expiry; no request ever carries the old one', async () => {
      const select = expiryControls()[0];
      select.value = '2026-10-22';
      select.dispatchEvent(new Event('change'));
      await settle();
      expect(legExpiries()).toEqual(['2026-10-22', '2026-11-26']);
      await customRange('2026-10-26', '2026-10-30');
      expect(legExpiries()).toEqual(['2026-11-26', '2026-11-26']);        // never an expiry before From
      expect(component.legs()[0].picked?.expiry).toBeUndefined();
      expect(requests.every(r => r.expiry !== '2026-10-22')).toBe(true);  // no 422-bound request
      expect(requests.filter(r => r.date_from === '2026-10-26').map(r => r.expiry)).toEqual(['2026-11-26', '2026-11-26']);   // both legs, once, on the listed expiry
      expect(toasts('info')).toEqual(['Expiry 22 Oct 2026 is not listed for these dates, so it was replaced by a listed expiry.']);   // an info toast, not an inline message
    });

    it('a manually chosen expiry that the new dates still list is kept and requested with them', async () => {
      const select = expiryControls()[0];
      select.value = '2026-10-22';
      select.dispatchEvent(new Event('change'));
      await settle();
      requests.length = 0;
      await customRange('2026-10-20', '2026-10-30');
      expect(legExpiries()).toEqual(['2026-10-22', '2026-11-26']);
      expect(component.legs()[0].picked?.expiry).toBe(true);
      expect(requests.some(r => r.expiry === '2026-10-22' && r.date_from === '2026-10-20')).toBe(true);
      expect(toasts('info')).toEqual([]);
    });

    it('an expiry equal to the From date is valid', async () => {
      const select = expiryControls()[0];
      select.value = '2026-10-22';
      select.dispatchEvent(new Event('change'));
      await settle();
      requests.length = 0;
      await customRange('2026-10-22', '2026-10-30');
      expect(legExpiries()[0]).toBe('2026-10-22');
      expect(requests.some(r => r.expiry === '2026-10-22')).toBe(true);
    });

    it('a late expiry list for earlier dates is ignored: only the latest dates are ever requested', async () => {
      const first = new Subject<ExpiryReply>();
      const second = new Subject<ExpiryReply>();
      expiryFor = req => (req.trade_from === '2026-10-30' ? first : second);
      requests.length = 0;
      await click('.field .seg button', 'Custom');
      component.onCustomFrom('2026-10-30');
      component.onCustomTill('2026-10-30');
      await settle();
      component.onCustomFrom('2026-10-20');                               // newer dates before the first list answers
      await settle();
      answer(first, []);                                                   // late: dropped
      await settle();
      expect(requests).toEqual([]);
      answer(second, ['2026-10-22', '2026-10-29']);
      await settle();
      expect(requests.every(r => r.date_from === '2026-10-20' && r.expiry === '2026-11-26')).toBe(true);
    });

    it('the first load is unchanged: the legs are requested once, after the expiry list, the close and the strikes', () => {
      expect(requests).toHaveLength(2);
      expect(requests.every(r => r.expiry === '2026-11-26' && r.strike === 22600)).toBe(true);
    });
  });

  describe('default expiry: the nearest listed on or after the To date', () => {
    const NEAR = '2026-11-03';
    const legExpiries = () => component.legs().map(l => l.expiry);
    const customRange = async (from: string, till: string) => {
      await click('.field .seg button', 'Custom');
      requests.length = 0;
      component.onCustomFrom(from);
      component.onCustomTill(till);
      await settle();
    };

    it('historical and upcoming expiries coexist: the nearest on or after To wins, not the latest in range or the earliest upcoming', async () => {
      expiryFor = req => reply(req, ['2026-10-14', '2026-10-21', NEAR, '2026-11-10', '2026-11-26']);
      await customRange('2026-10-01', '2026-10-28');
      expect(legExpiries()).toEqual([NEAR, NEAR]);
      const final = requests.filter(r => r.date_till === '2026-10-28');   // the intermediate request for the half-edited dates is not under test
      expect(final.length).toBeGreaterThan(0);
      expect(final.every(r => r.expiry === NEAR)).toBe(true);
    });

    it('the comparison uses the selected To date, not the system date (pinned to 30 Oct): an expiry between To and today is eligible', async () => {
      expiryFor = req => reply(req, ['2026-10-14', '2026-10-21', '2026-10-29', NEAR]);
      await customRange('2026-10-01', '2026-10-25');
      expect(legExpiries()).toEqual(['2026-10-29', '2026-10-29']);        // already past "today", but on or after the To date
    });

    it('an expiry on the To date itself counts as on or after it', async () => {
      expiryFor = req => reply(req, ['2026-10-14', '2026-10-21', NEAR]);
      await customRange('2026-10-01', '2026-10-21');
      expect(legExpiries()).toEqual(['2026-10-21', '2026-10-21']);
    });

    it('every preset ends today: the default is the nearest expiry on or after it', async () => {
      expiryFor = req => reply(req, ['2026-10-14', '2026-10-21', '2026-10-29', NEAR, '2026-11-10']);
      for (const preset of ['1W', '1M', '3M'] as const) {
        await click('.field .seg button', preset);
        expect(legExpiries(), preset).toEqual([NEAR, NEAR]);
      }
    });

    it('with no expiry on or after To the legs take the latest expiry within the dates, never one before From, silently (routine default)', async () => {
      metaFor = symbol => of({ data: { ...details(symbol).data, expiry_date: ['2026-10-22'] } });
      expiryFor = req => reply(req, ['2026-10-14', '2026-10-22']);
      component.selectSymbol('BANKNIFTY');
      await settle();
      expect(legExpiries()).toEqual(['2026-10-22', '2026-10-22']);       // the latest inside the 3M dates, not 14 Oct
      expect(host.textContent).not.toContain('No expiry is listed on or after');
      expect(toasts('info')).toEqual([]);
      expect(toasts('error')).toEqual([]);
    });

    it('a later range with an expiry on or after To is used the same way, still without a message', async () => {
      metaFor = symbol => of({ data: { ...details(symbol).data, expiry_date: ['2026-10-22'] } });
      expiryFor = req => reply(req, ['2026-10-14', '2026-10-22']);
      component.selectSymbol('BANKNIFTY');
      await settle();
      expect(legExpiries()).toEqual(['2026-10-22', '2026-10-22']);
      await customRange('2026-10-01', '2026-10-20');
      expect(toasts('info')).toEqual([]);
      expect(legExpiries()).toEqual(['2026-10-22', '2026-10-22']);       // 22 Oct is on or after the new To (20 Oct)
    });

    it('with no expiry on or after From at all the legs are cleared, nothing is requested and the empty state shows', async () => {
      metaFor = symbol => of({ data: { ...details(symbol).data, expiry_date: ['2026-10-22'] } });
      expiryFor = req => reply(req, ['2026-10-14', '2026-10-22']);
      component.selectSymbol('BANKNIFTY');
      await settle();
      await customRange('2026-10-23', '2026-10-30');
      expect(legExpiries()).toEqual(['', '']);
      expect(component.legs().map(l => l.strike)).toEqual([null, null]);
      expect(requests).toEqual([]);
      expect(component.noExpiryMessage()).toBe('No expiry is available on or after the From date (23 Oct 2026). Choose a different date range.');
      const selects = Array.from(host.querySelectorAll<HTMLSelectElement>('select[id^="ml-expiry-"]'));
      expect(selects.map(s => Array.from(s.options).map(o => o.textContent?.trim()))).toEqual([['No expiry available'], ['No expiry available']]);
      expect(host.querySelector('.legs-head .ghost')?.hasAttribute('disabled')).toBe(true);
      expiryFor = req => reply(req, ['2026-10-22', '2026-11-04']);
      component.onCustomFrom('2026-10-20');
      await settle();
      expect(legExpiries()).toEqual(['2026-11-04', '2026-11-04']);       // a later valid range gives the legs an expiry again
      expect(component.noExpiryMessage()).toBe('');
    });

    it('a manually chosen expiry is kept while listed and replaced when not; the default never overwrites a listed pick', async () => {
      expiryFor = req => reply(req, ['2026-10-14', '2026-10-21', '2026-10-22', NEAR]);
      const first = host.querySelector<HTMLSelectElement>('select[id^="ml-expiry-"]')!;
      first.value = '2026-10-22';
      first.dispatchEvent(new Event('change'));
      await settle();
      await customRange('2026-10-01', '2026-10-28');
      expect(legExpiries()).toEqual(['2026-10-22', NEAR]);                // the pick stays; the untouched leg takes the nearest on or after To
      expiryFor = req => reply(req, ['2026-10-14', '2026-10-21', NEAR]);
      component.onCustomFrom('2026-10-02');
      await settle();
      expect(legExpiries()).toEqual([NEAR, NEAR]);                        // no longer listed: replaced by the nearest on or after To
    });

    it('a symbol change re-applies the rule for the new symbol', async () => {
      expiryFor = req => reply(req, req.symbol === 'BANKNIFTY' ? ['2026-10-21', '2026-11-04'] : ['2026-10-21', NEAR]);
      component.selectSymbol('BANKNIFTY');
      await settle();
      expect(legExpiries()).toEqual(['2026-11-04', '2026-11-04']);
    });

    it('the initial load already requests the legs on that expiry, once', () => {
      expect(requests).toHaveLength(2);
      expect(requests.every(r => r.expiry === '2026-11-26')).toBe(true);
    });

    it('the ATM still comes from the To-date close, asked once per To date, whatever the expiry', async () => {
      expiryFor = req => reply(req, ['2026-10-21', NEAR, '2026-11-26']);
      await customRange('2026-10-01', '2026-10-28');
      const asked = atmCalls.filter(call => call.till === '2026-10-28');
      expect(asked).toHaveLength(1);
      const before = atmCalls.length;
      const select = host.querySelector<HTMLSelectElement>('select[id^="ml-expiry-"]')!;
      select.value = '2026-11-26';
      select.dispatchEvent(new Event('change'));
      await settle();
      expect(atmCalls).toHaveLength(before);                                // changing an expiry asks for no new close
      expect(atmCalls.every(call => !['2026-11-03', '2026-11-26'].includes(call.till))).toBe(true);   // never the expiry date
    });

    it('a picked strike stays when the default expiry moves', async () => {
      const strike = host.querySelectorAll<HTMLSelectElement>('select[id^="ml-strike-"]')[0];
      strike.value = '22700';
      strike.dispatchEvent(new Event('change'));
      await settle();
      expiryFor = req => reply(req, ['2026-10-21', NEAR]);
      await customRange('2026-10-01', '2026-10-28');
      expect(component.legs()[0].strike).toBe(22700);
      expect(component.legs()[0].picked?.strike).toBe(true);
    });
  });

  describe('sparse strike warning', () => {
    const SPARSE = '2026-10-29';
    const warnings = () => Array.from(host.querySelectorAll('.leg-warn')).map(el => el.textContent?.trim());
    const TEXT = 'Available strikes are limited. Calculated ATM is significantly away from the underlying close.';
    const chooseExpiry = async (index: number, expiry: string) => {
      const el = host.querySelectorAll<HTMLSelectElement>('select[id^="ml-expiry-"]')[index];
      el.value = expiry;
      el.dispatchEvent(new Event('change'));
      await settle();
    };

    it('no warning when the ATM is within 1% of the close (22600 against 22630)', () => {
      expect(warnings()).toEqual([]);
    });

    it('warns, on that leg only, when its expiry lists too few strikes near the money (ATM more than 1% away)', async () => {
      strikesFor = (_s, expiry) => (expiry === SPARSE ? of({ ok: true, strikes: [21000, 22000] }) : of({ ok: true, strikes: STRIKE_GRID }));
      await chooseExpiry(1, SPARSE);
      expect(component.atmFor(SPARSE)).toBe(22000);
      expect(warnings()).toEqual([TEXT]);
      expect(host.querySelectorAll('.legrow')[1].querySelector('.leg-warn')).toBeTruthy();
      expect(host.querySelectorAll('.legrow')[0].querySelector('.leg-warn')).toBeNull();
    });

    it('legs warn independently: two sparse legs show two warnings, a dense one none', async () => {
      strikesFor = (_s, expiry) => (expiry === SPARSE ? of({ ok: true, strikes: [21000, 22000] }) : of({ ok: true, strikes: STRIKE_GRID }));
      await chooseExpiry(0, SPARSE);
      await chooseExpiry(1, SPARSE);
      expect(warnings()).toEqual([TEXT, TEXT]);
      await chooseExpiry(1, '2026-11-26');
      expect(warnings()).toEqual([TEXT]);
    });

    it('the warning disappears when the expiry is changed to one with strikes near the close, and the ATM itself is unchanged', async () => {
      strikesFor = (_s, expiry) => (expiry === SPARSE ? of({ ok: true, strikes: [21000, 22000] }) : of({ ok: true, strikes: STRIKE_GRID }));
      await chooseExpiry(0, SPARSE);
      expect(warnings()).toHaveLength(1);
      await chooseExpiry(0, '2026-11-26');
      expect(warnings()).toEqual([]);
      expect(component.atmFor('2026-11-26')).toBe(22600);
    });

    it('exactly 1% is not flagged and just above is', async () => {
      // 22630 * 1% = 226.3: a strike at 22630 - 226.3 = 22403.7 would be exactly on the line; 22400 is 1.0163% away, 22450 is 0.795% away
      strikesFor = (_s, expiry) => (expiry === SPARSE ? of({ ok: true, strikes: [22400] }) : of({ ok: true, strikes: STRIKE_GRID }));
      await chooseExpiry(0, SPARSE);
      expect(warnings()).toEqual([TEXT]);
      strikesFor = (_s, expiry) => (expiry === '2026-10-22' ? of({ ok: true, strikes: [22450] }) : of({ ok: true, strikes: STRIKE_GRID }));
      await chooseExpiry(0, '2026-10-22');
      expect(warnings()).toEqual([]);
    });

    it('updates when the To date changes the underlying close', async () => {
      strikesFor = () => of({ ok: true, strikes: [22000, 22600, 23200] });
      component.selectSymbol('BANKNIFTY');
      await settle();
      expect(warnings()).toEqual([]);                                       // 22630 against 22600
      atmFor = () => of({ ok: true, session: '2026-10-21', underlying: 22300, strikes: [], atm: 0 });
      await click('.field .seg button', 'Custom');
      component.onCustomFrom('2026-10-01');
      component.onCustomTill('2026-10-21');
      await settle();
      expect(component.underlying()).toBe(22300);
      expect(component.atmFor(component.legs()[0].expiry)).toBe(22000);     // 22300 is nearer 22000 than 22600 ...
      expect(warnings()).toEqual([TEXT, TEXT]);                             // ... and 22000 is 1.35% away
    });

    it('shows nothing without a closing price, and the ATM is not guessed', async () => {
      atmFor = () => of({ ok: false, reason: 'unavailable' });
      component.selectSymbol('BANKNIFTY');
      await settle();
      expect(component.underlying()).toBeNull();
      expect(warnings()).toEqual([]);
    });

    it('shows nothing when the expiry lists no strikes, or a zero close arrives', async () => {
      strikesFor = () => of({ ok: false, reason: 'none' });
      component.selectSymbol('BANKNIFTY');
      await settle();
      expect(warnings()).toEqual([]);
      strikesFor = () => of({ ok: true, strikes: STRIKE_GRID });
      atmFor = () => of({ ok: true, session: '2026-10-29', underlying: 0, strikes: [], atm: 0 });
      component.selectSymbol('RELIANCE');
      await settle();
      expect(warnings()).toEqual([]);
    });

    it('never changes a picked strike the expiry lists, and raises no toast', async () => {
      // 22400 is listed and is itself the ATM: 230 from the 22630 close (1.02%), so the expiry is sparse.
      strikesFor = (_s, expiry) => (expiry === SPARSE ? of({ ok: true, strikes: [21000, 22000, 22400] }) : of({ ok: true, strikes: STRIKE_GRID }));
      const strike = host.querySelectorAll<HTMLSelectElement>('select[id^="ml-strike-"]')[0];
      strike.value = '22400';
      strike.dispatchEvent(new Event('change'));
      await settle();
      await chooseExpiry(0, SPARSE);
      expect(component.legs()[0].strike).toBe(22400);                       // kept; the warning is about the ATM, not the choice
      expect(component.legs()[0].picked?.strike).toBe(true);
      expect(warnings()).toEqual([TEXT]);
    });
  });

  describe('adding a leg keeps an inherited manual expiry', () => {
    const NEAR = '2026-11-03';
    const legExpiries = () => component.legs().map(l => l.expiry);
    const pickExpiry = async (index: number, value: string) => {
      const el = host.querySelectorAll<HTMLSelectElement>('select[id^="ml-expiry-"]')[index];
      el.value = value;
      el.dispatchEvent(new Event('change'));
      await settle();
    };
    const addLeg = async () => { await click('.legs-head .ghost', '+ Add leg'); };

    it('a leg added after the LAST leg was set by hand inherits the expiry and the choice', async () => {
      await pickExpiry(1, '2026-10-22');
      await addLeg();
      expect(legExpiries()).toEqual(['2026-11-26', '2026-10-22', '2026-10-22']);
      expect(component.legs().map(l => !!l.picked?.expiry)).toEqual([false, true, true]);
    });

    it('the inherited expiry survives a preset change, a To change and a From change, like the leg it was copied from', async () => {
      await pickExpiry(1, '2026-10-22');
      await addLeg();
      expiryFor = req => reply(req, ['2026-10-22', NEAR, '2026-11-26']);
      for (const preset of ['1W', '1M', '3M'] as const) {
        await click('.field .seg button', preset);
        expect(legExpiries(), preset).toEqual([NEAR, '2026-10-22', '2026-10-22']);   // the untouched leg takes the nearest listed on or after To
      }
      await click('.field .seg button', 'Custom');
      component.onCustomFrom('2026-10-01');
      component.onCustomTill('2026-10-28');
      await settle();
      expect(legExpiries()).toEqual([NEAR, '2026-10-22', '2026-10-22']);       // only the untouched leg follows the new default
      component.onCustomFrom('2026-10-02');
      await settle();
      expect(legExpiries()).toEqual([NEAR, '2026-10-22', '2026-10-22']);
    });

    it('a leg added after an automatically chosen expiry stays automatic and follows the default', async () => {
      await addLeg();
      expect(component.legs().map(l => !!l.picked?.expiry)).toEqual([false, false, false]);
      expiryFor = req => reply(req, ['2026-10-22', NEAR, '2026-11-26']);
      await click('.field .seg button', 'Custom');
      component.onCustomFrom('2026-10-01');
      component.onCustomTill('2026-10-28');
      await settle();
      expect(legExpiries()).toEqual([NEAR, NEAR, NEAR]);
    });

    it('selections stay independent: an untouched leg, a leg set by hand, and a copy of the latter', async () => {
      await pickExpiry(1, '2026-10-22');
      await addLeg();
      await pickExpiry(2, '2026-10-29');                                         // the copy is then changed by hand again
      expect(legExpiries()).toEqual(['2026-11-26', '2026-10-22', '2026-10-29']);
      expect(component.legs().map(l => !!l.picked?.expiry)).toEqual([false, true, true]);
      expiryFor = req => reply(req, ['2026-10-22', '2026-10-29', NEAR]);
      await click('.field .seg button', 'Custom');
      component.onCustomFrom('2026-10-01');
      component.onCustomTill('2026-10-28');
      await settle();
      expect(legExpiries()).toEqual(['2026-10-29', '2026-10-22', '2026-10-29']);   // 29 Oct is the nearest listed on or after 28 Oct
    });

    it('the copied leg\'s strike is still automatic (only the expiry choice is inherited)', async () => {
      await pickExpiry(1, '2026-10-22');
      await addLeg();
      expect(component.legs()[2].picked?.strike).toBeUndefined();
    });
  });

  describe('legs are requested only when the expiry list, the closing price and the strikes of the new dates are all in', () => {
    type ExpiryReply = { data: { symbol: string; trade_from: string; trade_till: string; expiry_date: string[] } };
    const NEAR = '2026-11-03';
    const legStrikes = () => component.legs().map(l => l.strike);
    const legExpiries = () => component.legs().map(l => l.expiry);
    const expiryAnswer = (subject: Subject<ExpiryReply>, dates: string[]) => subject.next({ data: { symbol: 'NIFTY', trade_from: '', trade_till: '', expiry_date: dates } });
    const closeAnswer = (subject: Subject<HistoricalUnderlyingResult>, underlying: number) => subject.next({ ok: true, session: '2026-10-28', underlying, strikes: [], atm: 0 });
    /** Custom range 1..28 Oct (To changes from 30 Oct): its expiry list and closing price are held back by the returned subjects. */
    const slowDateChange = async () => {
      const expiry = new Subject<ExpiryReply>();
      const close = new Subject<HistoricalUnderlyingResult>();
      expiryFor = req => (req.trade_till === '2026-10-28' ? expiry : reply(req, ['2026-10-22', NEAR, '2026-11-26']));
      atmFor = (_s, till) => (till === '2026-10-28' ? close : of({ ok: true, session: '2026-10-29', underlying: 22630, strikes: [], atm: 22600 }));
      await click('.field .seg button', 'Custom');
      component.onCustomFrom('2026-10-01');                                       // To is still 30 Oct: this intermediate state answers at once
      await settle();
      requests.length = 0;
      component.onCustomTill('2026-10-28');
      await settle();
      return { expiry, close };
    };

    it('the expiry list arrives first: nothing is requested until the closing price is in, then once with the new expiry and its ATM', async () => {
      const { expiry, close } = await slowDateChange();
      expect(requests).toEqual([]);
      expect(component.loading()).toBe(true);
      expiryAnswer(expiry, ['2026-10-22', NEAR]);
      await settle();
      expect(requests).toEqual([]);                                              // the old close (22630 -> 22600) must not be used
      expect(component.loading()).toBe(true);
      closeAnswer(close, 22300);
      await settle();
      expect(requests).toHaveLength(2);
      expect(requests.every(r => r.expiry === NEAR && r.strike === 22400 && r.date_till === '2026-10-28')).toBe(true);
      expect(component.loading()).toBe(false);
      expect(legExpiries()).toEqual([NEAR, NEAR]);
      expect(legStrikes()).toEqual([22400, 22400]);
    });

    it('the closing price arrives first: still nothing until the expiry list is in, then once', async () => {
      const { expiry, close } = await slowDateChange();
      closeAnswer(close, 22300);
      await settle();
      expect(requests).toEqual([]);                                              // legs still carry the previous dates\' expiry
      expect(component.loading()).toBe(true);
      expiryAnswer(expiry, ['2026-10-22', NEAR]);
      await settle();
      expect(requests).toHaveLength(2);
      expect(requests.every(r => r.expiry === NEAR && r.strike === 22400)).toBe(true);
      expect(component.loading()).toBe(false);
    });

    it('a strike list the new expiry needs is also waited for', async () => {
      const strikes = new Subject<ExpiryStrikesResult>();
      strikesFor = (_s, expiry) => (expiry === NEAR ? strikes : of({ ok: true, strikes: STRIKE_GRID }));
      const { expiry, close } = await slowDateChange();
      expiryAnswer(expiry, ['2026-10-22', NEAR]);
      closeAnswer(close, 22300);
      await settle();
      expect(requests).toEqual([]);                                              // expiry and close are in, but the strikes of NEAR are not
      expect(component.loading()).toBe(true);
      expect(strikeBusyAny()).toBe(true);
      strikes.next({ ok: true, strikes: [22250, 22350, 22450] });
      await settle();
      expect(requests).toHaveLength(2);
      expect(requests.every(r => r.expiry === NEAR && r.strike === 22250)).toBe(true);   // 22300 is equally far from 22250 and 22350: the lower strike wins
    });

    it('a strike the user picked is kept through the whole sequence and requested once', async () => {
      const select = host.querySelectorAll<HTMLSelectElement>('select[id^="ml-strike-"]')[0];
      select.value = '22700';
      select.dispatchEvent(new Event('change'));
      await settle();
      const { expiry, close } = await slowDateChange();
      expiryAnswer(expiry, ['2026-10-22', NEAR]);
      closeAnswer(close, 22300);
      await settle();
      expect(legStrikes()).toEqual([22700, 22400]);
      expect(requests.filter(r => r.option_type === 'CE').map(r => r.strike)).toEqual([22700]);
      expect(requests).toHaveLength(2);
    });

    it('a failed closing price does not leave the screen loading: the legs load without a strike and the reason shows', async () => {
      const { expiry, close } = await slowDateChange();
      expiryAnswer(expiry, ['2026-10-22', NEAR]);
      close.next({ ok: false, reason: 'unavailable' });
      await settle();
      expect(component.loading()).toBe(false);
      expect(requests).toEqual([]);                                              // no strike is known, so nothing is requested
      expect(host.textContent).toContain('Unable to load the closing price');
    });

    it('a failed expiry list does not leave the screen loading and does not use the previous close', async () => {
      const expiry = new Subject<ExpiryReply>();
      const close = new Subject<HistoricalUnderlyingResult>();
      expiryFor = req => (req.trade_till === '2026-10-28' ? expiry : reply(req, ['2026-10-22', NEAR, '2026-11-26']));
      atmFor = (_s, till) => (till === '2026-10-28' ? close : of({ ok: true, session: '2026-10-29', underlying: 22630, strikes: [], atm: 22600 }));
      await click('.field .seg button', 'Custom');
      component.onCustomFrom('2026-10-01');
      await settle();
      requests.length = 0;
      component.onCustomTill('2026-10-28');
      await settle();
      expiry.error(new HttpErrorResponse({ status: 500 }));
      await settle();
      expect(requests).toEqual([]);                                              // the close is still outstanding
      closeAnswer(close, 22300);
      await settle();
      expect(component.loading()).toBe(false);
      expect(component.legs().map(l => l.strike)).toEqual([22400, 22400]);    // the strikes follow the new close, not the previous one
      expect(requests).toEqual([]);                                              // but nothing is requested on an unverified expiry list
    });

    it('rapid consecutive changes: answers for the earlier dates are ignored and only the latest dates are requested, once', async () => {
      const firstExpiry = new Subject<ExpiryReply>();
      const firstClose = new Subject<HistoricalUnderlyingResult>();
      const secondExpiry = new Subject<ExpiryReply>();
      const secondClose = new Subject<HistoricalUnderlyingResult>();
      expiryFor = req => (req.trade_till === '2026-10-28' ? firstExpiry : req.trade_till === '2026-10-27' ? secondExpiry : reply(req, ['2026-10-22', NEAR]));
      atmFor = (_s, till) => (till === '2026-10-28' ? firstClose : till === '2026-10-27' ? secondClose : of({ ok: true, session: '2026-10-29', underlying: 22630, strikes: [], atm: 22600 }));
      await click('.field .seg button', 'Custom');
      component.onCustomFrom('2026-10-01');
      await settle();
      requests.length = 0;
      component.onCustomTill('2026-10-28');
      component.onCustomTill('2026-10-27');
      await settle();
      expiryAnswer(firstExpiry, ['2026-10-22', NEAR]);                           // late answers for the earlier To date
      closeAnswer(firstClose, 22300);
      await settle();
      expect(requests).toEqual([]);
      expect(component.loading()).toBe(true);
      expiryAnswer(secondExpiry, ['2026-10-22', NEAR]);
      secondClose.next({ ok: true, session: '2026-10-27', underlying: 22690, strikes: [], atm: 0 });
      await settle();
      expect(requests).toHaveLength(2);
      expect(requests.every(r => r.date_till === '2026-10-27' && r.expiry === NEAR && r.strike === 22700)).toBe(true);
    });

    it('a preset change that keeps the To date waits only for the expiry list and requests once', async () => {
      const expiry = new Subject<ExpiryReply>();
      expiryFor = () => expiry;
      requests.length = 0;
      await click('.field .seg button', '1M');
      expect(requests).toEqual([]);
      expiryAnswer(expiry, ['2026-11-03', '2026-11-26']);
      await settle();
      expect(requests).toHaveLength(2);
      expect(component.loading()).toBe(false);
      expect(atmCalls.filter(c => c.till === '2026-10-30')).toHaveLength(1);       // the close of the unchanged To date is not asked again
    });

    it('every input already cached: the date change reloads at once, once', async () => {
      requests.length = 0;
      await click('.field .seg button', '1M');
      await click('.field .seg button', '3M');
      expect(requests.length).toBeLessThanOrEqual(2);
      expect(component.loading()).toBe(false);
    });

    function strikeBusyAny(): boolean {
      return Array.from(host.querySelectorAll<HTMLSelectElement>('select[id^="ml-strike-"]')).some(el => el.disabled);
    }
  });

  describe('one message when no expiry is listed on or after To', () => {
    const inputErrors = () => Array.from(host.querySelectorAll('.input-error, .inline-error, .inline-note')).map(el => el.textContent?.trim() ?? '');
    const noForward = async () => {
      metaFor = symbol => of({ data: { ...details(symbol).data, expiry_date: ['2026-10-22'] } });
      expiryFor = req => reply(req, ['2026-10-14', '2026-10-22']);
      component.selectSymbol('BANKNIFTY');
      await settle();
    };

    it('the routine in-range fallback shows no message at all, and no toast', async () => {
      await noForward();
      await click('.field .seg button', 'Custom');
      component.onCustomFrom('2026-10-01');
      component.onCustomTill('2026-10-21');
      await settle();
      component.onCustomTill('2026-10-30');
      await settle();
      const messages = inputErrors();
      expect(messages).toEqual([]);
      expect(toasts('info')).toEqual([]);
      expect(component.legs().map(l => l.expiry)).toEqual(['2026-10-22', '2026-10-22']);
    });

    it('with nothing on or after From the empty state is the single message, and no expiry before From is kept', async () => {
      await noForward();
      await click('.field .seg button', 'Custom');
      component.onCustomFrom('2026-10-24');
      component.onCustomTill('2026-10-30');
      await settle();
      expect(inputErrors()).toEqual(['No expiry is available on or after the From date (24 Oct 2026). Choose a different date range.']);
      expect(host.querySelector('.inline-note')?.getAttribute('role')).toBe('status');   // a data condition: neutral, not an error
      expect(host.querySelector('.inline-error, .input-error')).toBeNull();
      expect(component.legs().map(l => l.expiry)).toEqual(['', '']);
    });

    it('a pick before the new From date is replaced and that is said once, as an info toast, with no inline message left', async () => {
      const select = host.querySelectorAll<HTMLSelectElement>('select[id^="ml-expiry-"]')[0];
      select.value = '2026-10-22';
      select.dispatchEvent(new Event('change'));
      await settle();
      await click('.field .seg button', 'Custom');
      component.onCustomFrom('2026-10-26');
      component.onCustomTill('2026-10-30');
      await settle();
      expect(inputErrors()).toEqual([]);
      expect(toasts('info')).toEqual(['Expiry 22 Oct 2026 is not listed for these dates, so it was replaced by a listed expiry.']);
      expect(component.legs()[0].expiry).toBe('2026-11-26');
    });
  });

  describe('ATM explanatory note while the closing price loads', () => {
    const UPDATING = 'Updating ATM reference price…';
    const noteBoxes = () => Array.from(host.querySelectorAll('.legnote, .legnote-spacer'));
    const noteText = () => host.querySelector('.legnote')?.textContent?.trim() ?? null;
    const OLD_CLOSE = '22630';
    const closeFor = (underlying: number, session: string): HistoricalUnderlyingResult => ({ ok: true, session, underlying, strikes: [], atm: 0 });
    /** Custom range ending 28 Oct: its closing price is held back by the returned subject. */
    const changeTo = async (till: string, subject: Subject<HistoricalUnderlyingResult>) => {
      const before = atmFor;
      atmFor = (symbol, d) => (d === till ? subject : before(symbol, d));
      await click('.field .seg button', 'Custom');
      component.onCustomFrom('2026-10-01');
      await settle();
      component.onCustomTill(till);
      await settle();
    };

    it('shows the current explanation before any change, with the close of the To date', () => {
      expect(noteText()).toContain('underlying close of 22630 on 29 Oct 2026');
      expect(noteBoxes()).toHaveLength(1);
    });

    it('a To date change replaces the note at once with the updating text and never shows the previous close', async () => {
      const close = new Subject<HistoricalUnderlyingResult>();
      await changeTo('2026-10-28', close);
      expect(component.atmLoading()).toBe(true);
      expect(noteText()).toBe(UPDATING);
      expect(host.textContent).not.toContain('underlying close of 22630');
      expect(host.querySelector('.legnote')?.getAttribute('role')).toBe('status');
    });

    it('the closing price arriving brings back the explanation for the new date', async () => {
      const close = new Subject<HistoricalUnderlyingResult>();
      await changeTo('2026-10-28', close);
      close.next(closeFor(22300, '2026-10-28'));
      await settle();
      expect(noteText()).toContain('underlying close of 22300 on 28 Oct 2026');
      expect(noteText()).not.toContain(UPDATING);
      expect(noteText()).not.toContain(OLD_CLOSE);
    });

    it('a failed lookup leaves no explanation and no stale value; the reason is shown and the space is kept', async () => {
      const close = new Subject<HistoricalUnderlyingResult>();
      await changeTo('2026-10-28', close);
      close.next({ ok: false, reason: 'unavailable' });
      await settle();
      expect(host.querySelector('.legnote')).toBeNull();
      expect(host.textContent).not.toContain(OLD_CLOSE);
      expect(host.textContent).not.toContain(UPDATING);
      expect(host.textContent).toContain('Unable to load the closing price');
      expect(host.querySelectorAll('.legnote-spacer')).toHaveLength(1);        // the same box stays in the layout
    });

    it('rapid consecutive changes: a late answer for the earlier date is ignored and the note keeps saying updating until the latest arrives', async () => {
      const first = new Subject<HistoricalUnderlyingResult>();
      const second = new Subject<HistoricalUnderlyingResult>();
      const before = atmFor;
      atmFor = (symbol, d) => (d === '2026-10-28' ? first : d === '2026-10-27' ? second : before(symbol, d));
      await click('.field .seg button', 'Custom');
      component.onCustomFrom('2026-10-01');
      await settle();
      component.onCustomTill('2026-10-28');
      component.onCustomTill('2026-10-27');
      await settle();
      expect(noteText()).toBe(UPDATING);
      first.next(closeFor(22300, '2026-10-28'));                              // late
      await settle();
      expect(noteText()).toBe(UPDATING);
      expect(host.textContent).not.toContain('22300');
      second.next(closeFor(22690, '2026-10-27'));
      await settle();
      expect(noteText()).toContain('underlying close of 22690 on 27 Oct 2026');
    });

    it('a change that keeps the To date does not show the updating text (the close is not asked again)', async () => {
      const calls = atmCalls.length;
      await click('.field .seg button', '1M');
      expect(noteText()).toContain('underlying close of 22630');
      expect(atmCalls).toHaveLength(calls);
    });

    it('no layout shift: exactly one note box exists in every state and the loading and loaded notes are the same element type and class', async () => {
      const close = new Subject<HistoricalUnderlyingResult>();
      expect(noteBoxes()).toHaveLength(1);
      const loaded = noteBoxes()[0];
      await changeTo('2026-10-28', close);
      expect(noteBoxes()).toHaveLength(1);
      const loading = noteBoxes()[0];
      expect(loading.tagName).toBe(loaded.tagName);
      expect(loading.className).toBe(loaded.className);                        // one CSS box for both, with its reserved height
      close.next(closeFor(22300, '2026-10-28'));
      await settle();
      expect(noteBoxes()).toHaveLength(1);
      expect(noteBoxes()[0].className).toBe(loaded.className);
      const failing = new Subject<HistoricalUnderlyingResult>();
      atmFor = (symbol, d) => (d === '2026-10-26' ? failing : of(closeFor(22630, '2026-10-29')));
      component.onCustomTill('2026-10-26');
      await settle();
      failing.next({ ok: false, reason: 'no-session' });
      await settle();
      expect(noteBoxes()).toHaveLength(1);                                    // the spacer takes the note's place
    });

    it('a symbol change shows the updating text instead of the previous symbol\'s close', async () => {
      const close = new Subject<HistoricalUnderlyingResult>();
      atmFor = () => close;
      component.selectSymbol('BANKNIFTY');
      await settle();
      expect(noteText()).toBe(UPDATING);
      expect(host.textContent).not.toContain(OLD_CLOSE);
      close.next(closeFor(59610.45, '2026-10-29'));
      await settle();
      expect(noteText()).toContain('underlying close of 59610.45');
    });

    it('does not touch the ATM calculation: strikes and markers behave as before around the update', async () => {
      const close = new Subject<HistoricalUnderlyingResult>();
      await changeTo('2026-10-28', close);
      expect(component.legs().map(l => l.strike)).toEqual([22600, 22600]);       // unchanged until the new close is in
      expect(requests.filter(r => r.date_till === '2026-10-28')).toEqual([]);   // and nothing is requested meanwhile
      close.next(closeFor(22300, '2026-10-28'));
      await settle();
      expect(component.legs().map(l => l.strike)).toEqual([22400, 22400]);
      expect(requests.filter(r => r.date_till === '2026-10-28')).toHaveLength(2);
    });
  });

  describe('no expiry inside the selected dates: the default is applied silently', () => {
    /** Any explanation of the empty range, whatever its wording. */
    const emptyMessages = () => Array.from(host.querySelectorAll('.inline-note, .inline-error, .input-error')).map(el => el.textContent?.trim() ?? '')
      .filter(m => /No expiry falls|No expiries are listed|is selected for the option legs/.test(m));
    const toEmptyRange = async () => {
      expiryFor = req => reply(req, ['2026-11-03', '2026-11-26']);             // both after To: nothing inside the dates
      await click('.field .seg button', 'Custom');
      component.onCustomFrom('2026-10-23');
      component.onCustomTill('2026-10-25');
      await settle();
    };
    const pick = async (index: number, value: string) => {
      const el = host.querySelectorAll<HTMLSelectElement>('select[id^="ml-expiry-"]')[index];
      el.value = value;
      el.dispatchEvent(new Event('change'));
      await settle();
    };

    it('untouched legs take the nearest expiry on or after To with no inline message and no toast', async () => {
      await toEmptyRange();
      expect(component.expiriesEmpty()).toBe(true);
      expect(component.legs().map(l => l.expiry)).toEqual(['2026-11-03', '2026-11-03']);
      expect(emptyMessages()).toEqual([]);
      expect(TestBed.inject(ToastService).messages()).toEqual([]);
    });

    it('shows no explanation in either the old or the removed wording', async () => {
      await toEmptyRange();
      expect(host.textContent).not.toContain('No expiries are listed for these dates');
      expect(host.textContent).not.toContain('No expiry falls within the selected date range');
      expect(host.textContent).not.toContain('is selected for the option legs');
    });

    it('nothing is shown either when an expiry falls inside the dates', async () => {
      expiryFor = req => reply(req, ['2026-10-24', '2026-11-03']);
      await click('.field .seg button', 'Custom');
      component.onCustomFrom('2026-10-23');
      component.onCustomTill('2026-10-25');
      await settle();
      expect(component.expiriesEmpty()).toBe(false);
      expect(emptyMessages()).toEqual([]);
    });

    it('a manual pick the empty range still lists is kept, the untouched leg follows the default, and nothing is announced', async () => {
      await pick(0, '2026-11-26');                                             // listed after To, so it is kept
      await toEmptyRange();
      expect(component.legs().map(l => [l.expiry, !!l.picked?.expiry])).toEqual([['2026-11-26', true], ['2026-11-03', false]]);
      expect(emptyMessages()).toEqual([]);
      expect(toasts('info')).toEqual([]);
    });

    it('manual picks the dates no longer list are replaced and announced once by the info toast, with no inline message', async () => {
      await pick(0, '2026-10-22');
      await pick(1, '2026-10-29');
      await toEmptyRange();
      expect(component.legs().map(l => l.expiry)).toEqual(['2026-11-03', '2026-11-03']);
      expect(component.legs().map(l => !!l.picked?.expiry)).toEqual([false, false]);   // replaced picks follow the default
      expect(toasts('info')).toEqual(['Expiries 22 Oct 2026, 29 Oct 2026 are not listed for these dates, so they were replaced by a listed expiry.']);
      expect(emptyMessages()).toEqual([]);
    });

    it('manual picks that stay listed raise nothing at all', async () => {
      await pick(0, '2026-10-29');
      await pick(1, '2026-10-29');
      expiryFor = req => reply(req, ['2026-10-29', '2026-11-03']);           // 29 Oct is after To (25 Oct): listed, nothing inside the dates
      await click('.field .seg button', 'Custom');
      component.onCustomFrom('2026-10-23');
      component.onCustomTill('2026-10-25');
      await settle();
      expect(component.legs().map(l => l.expiry)).toEqual(['2026-10-29', '2026-10-29']);   // kept
      expect(emptyMessages()).toEqual([]);
      expect(TestBed.inject(ToastService).messages()).toEqual([]);
    });

    it('the necessary empty state remains when no expiry exists on or after From', async () => {
      metaFor = symbol => of({ data: { ...details(symbol).data, expiry_date: ['2026-10-22'] } });
      expiryFor = req => reply(req, ['2026-10-14', '2026-10-22']);
      component.selectSymbol('BANKNIFTY');
      await settle();
      await click('.field .seg button', 'Custom');
      component.onCustomFrom('2026-10-23');
      component.onCustomTill('2026-10-30');
      await settle();
      expect(component.expiriesEmpty()).toBe(true);
      expect(emptyMessages()).toEqual([]);
      const note = Array.from(host.querySelectorAll('.inline-note')).find(el => el.textContent?.includes('No expiry is available on or after the From date (23 Oct 2026)'));
      expect(note?.getAttribute('role')).toBe('status');                   // kept: the user has to choose other dates
    });

    it('does not change which expiry the legs take, their strikes or the requests', async () => {
      await toEmptyRange();
      expect(component.legs().map(l => l.strike)).toEqual([22600, 22600]);
      const forTheDates = requests.filter(r => r.date_till === '2026-10-25');   // earlier requests belong to the intermediate dates
      expect(forTheDates.length).toBeGreaterThan(0);
      expect(forTheDates.every(r => r.expiry === '2026-11-03')).toBe(true);
    });

    it('stays silent when the dates are changed to include an expiry', async () => {
      await toEmptyRange();
      expiryFor = req => reply(req, ['2026-10-24', '2026-11-03']);
      component.onCustomFrom('2026-10-20');
      await settle();
      expect(emptyMessages()).toEqual([]);
      expect(TestBed.inject(ToastService).messages()).toEqual([]);
    });
  });

    const OLD_NOTE_CLOSE = '22630';
  describe('historical underlying price unavailable (backend history gap)', () => {
    const INFO = 'Historical underlying closing price is unavailable for this date. ATM cannot be calculated automatically. Please select a strike manually.';
    const noData = (): Observable<HistoricalUnderlyingResult> => of({ ok: false, reason: 'no-data' });
    const strikeTexts = (index: number) => Array.from(host.querySelectorAll<HTMLSelectElement>('select[id^="ml-strike-"]')[index].options).map(o => o.textContent?.trim());
    let toastError: ReturnType<typeof vi.spyOn>;
    beforeEach(() => { toastError = vi.spyOn(TestBed.inject(ToastService), 'error'); });

    const toGap = async () => {
      atmFor = () => noData();
      await click('.field .seg button', 'Custom');
      component.onCustomFrom('2022-01-03');
      component.onCustomTill('2022-06-02');
      await settle();
    };

    it('shows the information message as information, not as an error, and raises no toast', async () => {
      await toGap();
      expect(host.querySelector('.legnote')?.textContent?.trim()).toBe(INFO);                    // in the ATM note's own reserved box
      expect(host.querySelector('.hint-line')).toBeNull();                                       // not a new line above the legs
      expect(Array.from(host.querySelectorAll('.input-error, .inline-error')).some(el => /closing price/i.test(el.textContent ?? ''))).toBe(false);
      expect(component.atmError()).toBe('');
      expect(toastError).not.toHaveBeenCalled();
    });

    it('calculates and displays no ATM: no strike, no marker, no spot, no explanation note, no sparse warning', async () => {
      await toGap();
      expect(component.legs().map(l => l.strike)).toEqual([null, null]);
      expect(component.underlying()).toBeNull();
      expect(component.atmFor(component.legs()[0].expiry)).toBeNull();
      expect(strikeTexts(0).some(text => /ATM/.test(text ?? ''))).toBe(false);
      expect(host.textContent).not.toContain('underlying close of');                          // the ATM explanation itself is absent
      expect(host.querySelectorAll('.legnote, .legnote-spacer')).toHaveLength(1);                // one box in the layout, holding the message
      expect(host.querySelectorAll('.leg-warn')).toHaveLength(0);
      expect(host.textContent).not.toContain(OLD_NOTE_CLOSE);
    });

    it('the strike lists still load and a strike chosen by hand loads that leg\'s EOD data', async () => {
      await toGap();
      expect(component.strikesFor(component.legs()[0].expiry)).toEqual(STRIKE_GRID);
      requests.length = 0;
      const select = host.querySelectorAll<HTMLSelectElement>('select[id^="ml-strike-"]')[0];
      select.value = '22700';
      select.dispatchEvent(new Event('change'));
      await settle();
      expect(component.legs()[0].strike).toBe(22700);
      expect(requests.some(r => r.strike === 22700 && r.option_type === 'CE' && r.date_till === '2022-06-02')).toBe(true);
      expect(host.querySelector('.legnote')?.textContent?.trim()).toBe(INFO);
    });

    it('does not request legs that have no strike', async () => {
      requests.length = 0;
      await toGap();
      expect(requests.filter(r => r.date_till === '2022-06-02')).toEqual([]);
      expect(component.loading()).toBe(false);
    });

    it('a genuine failure is still a visible error (role alert, with Retry), not information, and is not repeated as a toast', async () => {
      atmFor = () => of({ ok: false, reason: 'unavailable' });
      component.selectSymbol('BANKNIFTY');
      await settle();
      const error = Array.from(host.querySelectorAll('.inline-error')).find(el => el.textContent?.includes('Unable to load the closing price'));
      expect(error?.getAttribute('role')).toBe('alert');
      expect(error?.querySelector('.inline-retry')?.textContent?.trim()).toBe('Retry');
      expect(host.querySelector('.hint-line')).toBeNull();
      expect(component.atmInfo()).toBe('');
      expect(toastError).not.toHaveBeenCalled();
      atmFor = () => of({ ok: true, session: '2026-10-29', underlying: 22630, strikes, atm: 22600 });
      await click('.inline-error .inline-retry', 'Retry');
      expect(component.atmError()).toBe('');
      expect(component.underlying()).toBe(22630);
    });

    it('moving the To date to one with a close clears the message and brings the ATM back', async () => {
      await toGap();
      atmFor = () => of({ ok: true, session: '2026-10-28', underlying: 22300, strikes: [], atm: 0 });
      component.onCustomFrom('2026-10-01');
      component.onCustomTill('2026-10-28');
      await settle();
      expect(host.textContent).not.toContain('Historical underlying closing price is unavailable');
      expect(component.legs().map(l => l.strike)).toEqual([22400, 22400]);
      expect(strikeTexts(0)).toContain('22400 (ATM)');
    });

    it('a strike picked by hand is kept when the To date moves into the gap, and nothing else is guessed', async () => {
      const select = host.querySelectorAll<HTMLSelectElement>('select[id^="ml-strike-"]')[0];
      select.value = '22700';
      select.dispatchEvent(new Event('change'));
      await settle();
      await toGap();
      expect(component.legs().map(l => l.strike)).toEqual([22700, null]);
    });

    it('a symbol change resets the message', async () => {
      await toGap();
      atmFor = () => of({ ok: true, session: '2026-10-29', underlying: 59610.45, strikes: [], atm: 0 });
      strikesFor = () => of({ ok: true, strikes: [59500, 59600, 59700] });
      component.selectSymbol('BANKNIFTY');
      await settle();
      expect(host.textContent).not.toContain('Historical underlying closing price is unavailable');
    });

    it('no layout shift: the loading note, the message and the loaded note all use the same single box', async () => {
      const loading = new Subject<HistoricalUnderlyingResult>();
      atmFor = () => loading;
      await click('.field .seg button', 'Custom');
      component.onCustomFrom('2022-01-03');
      component.onCustomTill('2022-06-02');
      await settle();
      expect(host.querySelectorAll('.legnote, .legnote-spacer')).toHaveLength(1);              // "Updating ATM reference price…"
      const loadingBox = host.querySelector('.legnote')!;
      loading.next({ ok: false, reason: 'no-data' });
      await settle();
      const messageBox = host.querySelector('.legnote')!;
      expect(host.querySelectorAll('.legnote, .legnote-spacer')).toHaveLength(1);
      expect(messageBox.className).toBe(loadingBox.className);
      expect(host.querySelector('.hint-line')).toBeNull();                                      // nothing is added above the legs
    });
  });

  it('stale leg data is dropped when the range changes quickly', async () => {
    const slow = new Subject<EodDataRow[]>();
    let calls = 0;
    rowsFor = () => (calls++ < 2 ? slow : of(makeRows(3, 10)));   // the first range (1M) is slow, the second (1W) is fast
    await click('.field .seg button', '1M');
    await click('.field .seg button', '1W');
    slow.next(makeRows(9, 999));
    await settle();
    expect(component.series().map(s => s.rows.length)).toEqual([3, 3]);
    expect(component.sessions().every(s => s.bars.every(b => !b || b.open < 900))).toBe(true);
  });

  describe('expiry reconciliation: only listed expiries, manual picks kept while listed', () => {
    type ExpiryReply = { data: { symbol: string; trade_from: string; trade_till: string; expiry_date: string[] } };
    /** Pinned today 30 Oct: 1W asks from 15 Oct, 1M from 19 Sep, 3M from 14 Jul, all to 30 Oct. */
    const PICK = '2026-09-25', NEAR = '2026-11-03';
    const legExpiries = () => component.legs().map(l => l.expiry);
    const expirySelects = () => Array.from(host.querySelectorAll<HTMLSelectElement>('select[id^="ml-expiry-"]'));
    const chooseExpiry = (index: number, value: string) => select(`#${expirySelects()[index].id}`, value);
    const chooseStrike = (index: number, value: number) => select(`#${host.querySelectorAll<HTMLSelectElement>('select[id^="ml-strike-"]')[index].id}`, String(value));
    const allOptions = () => expirySelects().flatMap(s => Array.from(s.options).map(o => o.value));

    it('1W, 1M, 3M and Custom: a pick is kept in every mode that lists it, replaced in the first that does not, and untouched legs follow To', async () => {
      expiryFor = req => reply(req, [PICK, '2026-10-22', NEAR]);
      await click('.field .seg button', '1M');
      await chooseExpiry(0, PICK);
      expect(legExpiries()).toEqual([PICK, NEAR]);
      await click('.field .seg button', '3M');
      expect(legExpiries()).toEqual([PICK, NEAR]);                         // 3M (from 14 Jul) lists it
      await click('.field .seg button', '1M');
      expect(legExpiries()).toEqual([PICK, NEAR]);
      await click('.field .seg button', '1W');                             // 1W starts on 15 Oct: 25 Sep is not listed
      expect(legExpiries()).toEqual([NEAR, NEAR]);
      expect(component.legs()[0].picked?.expiry).toBeUndefined();
      expect(allOptions()).not.toContain(PICK);
      expect(component.range()).toBe('1W');                               // the mode is not touched
      await click('.field .seg button', 'Custom');
      component.onCustomFrom('2026-10-01');
      component.onCustomTill('2026-10-28');
      await settle();
      await chooseExpiry(0, '2026-10-22');
      expect(legExpiries()).toEqual(['2026-10-22', NEAR]);
      component.onCustomFrom('2026-10-23');                                // 22 Oct is now before From
      await settle();
      expect(legExpiries()).toEqual([NEAR, NEAR]);
      expect([component.range(), component.customFrom(), component.customTill()]).toEqual(['Custom', '2026-10-23', '2026-10-28']);   // dates unchanged
    });

    it('a replaced leg gets the new expiry\'s strikes and ATM before anything is requested; an unlisted picked strike is reset', async () => {
      await chooseStrike(0, 22700);
      await chooseExpiry(0, '2026-10-22');
      expect(component.legs()[0]).toMatchObject({ expiry: '2026-10-22', strike: 22700 });
      const pending = new Subject<ExpiryStrikesResult>();
      strikesFor = (_s, expiry) => (expiry === NEAR ? pending : of({ ok: true, strikes: STRIKE_GRID }));
      expiryFor = req => reply(req, [NEAR]);
      requests.length = 0;
      await click('.field .seg button', 'Custom');                         // last 30 days: 22 Oct is not listed (only 3 Nov is)
      expect(legExpiries()).toEqual([NEAR, NEAR]);
      expect(requests).toEqual([]);                                        // held until 3 Nov has strikes
      expect(component.loading()).toBe(true);
      pending.next({ ok: true, strikes: [22550, 22650] });
      await settle();
      expect(component.legs().map(l => l.strike)).toEqual([22650, 22650]);   // 22700 is not listed for 3 Nov: the ATM instead
      expect(component.legs()[0].picked).toBeUndefined();
      expect(requests.map(r => [r.expiry, r.strike])).toEqual([[NEAR, 22650], [NEAR, 22650]]);
      expect(requests.some(r => r.expiry === '2026-10-22' || r.strike === 22700)).toBe(false);
    });

    it('a picked strike the new expiry also lists is kept when only the expiry is replaced', async () => {
      await chooseStrike(0, 22700);
      await chooseExpiry(0, '2026-10-22');
      expiryFor = req => reply(req, [NEAR]);
      await click('.field .seg button', 'Custom');
      expect(component.legs()[0]).toMatchObject({ expiry: NEAR, strike: 22700, picked: { strike: true } });
    });

    it('out-of-order expiry answers: a late answer for earlier dates never reconciles the legs', async () => {
      await click('.field .seg button', 'Custom');
      await chooseExpiry(0, '2026-10-22');
      const slow = new Subject<ExpiryReply>();
      expiryFor = req => (req.trade_from === '2026-10-25' ? slow : reply(req, ['2026-10-22', NEAR]));
      component.onCustomFrom('2026-10-25');                                // would drop 22 Oct ...
      component.onCustomFrom('2026-10-20');                                // ... but newer dates answer first and list it
      await settle();
      expect(legExpiries()[0]).toBe('2026-10-22');
      slow.next({ data: { symbol: 'NIFTY', trade_from: '2026-10-25', trade_till: '2026-10-30', expiry_date: [NEAR] } });
      await settle();
      expect(legExpiries()[0]).toBe('2026-10-22');                         // stale: ignored
      expect(component.legs()[0].picked?.expiry).toBe(true);
      expect(toasts('info')).toEqual([]);
    });

    it('a late strike answer for an expiry a leg has left does not change that leg', async () => {
      const late = new Subject<ExpiryStrikesResult>();
      strikesFor = (_s, expiry) => (expiry === '2026-10-22' ? late : of({ ok: true, strikes: STRIKE_GRID }));
      await chooseExpiry(0, '2026-10-22');                                 // its strikes are pending
      expiryFor = req => reply(req, [NEAR]);
      await click('.field .seg button', 'Custom');                         // replaced by 3 Nov
      const before = component.legs().map(l => [l.expiry, l.strike]);
      late.next({ ok: true, strikes: [21000] });
      await settle();
      expect(component.legs().map(l => [l.expiry, l.strike])).toEqual(before);
    });

    it('an invalid Custom range keeps the selections, disables expiry selection, requests nothing and does not touch the dates', async () => {
      await click('.field .seg button', 'Custom');
      await chooseExpiry(0, '2026-10-22');
      const legs = legExpiries();
      const calls = expiryCalls.length;
      requests.length = 0;
      component.onCustomTill('2026-11-15');                                // in the future (within a year of From): invalid, nothing else cleared
      await settle();
      expect(component.rangeError()).not.toBe('');
      expect(legExpiries()).toEqual(legs);
      expect(expirySelects().every(s => s.disabled)).toBe(true);
      expect(allOptions()).toEqual(legs);                                  // only the kept selections, nothing else offered
      expect(expiryCalls.length).toBe(calls);
      expect(requests).toEqual([]);
      expect([component.customFrom(), component.customTill()]).toEqual(['2026-09-30', '2026-11-15']);   // never corrected automatically
      expiryFor = req => reply(req, ['2026-10-22', NEAR]);
      component.onCustomTill('2026-10-29');
      await settle();
      expect(expirySelects().some(s => s.disabled)).toBe(false);
      expect(legExpiries()).toEqual(['2026-10-22', NEAR]);                 // the pick is listed again; the untouched leg follows the new To
    });

    it('a Retry that fails again keeps the selections and the error, and still requests nothing', async () => {
      expiryFor = () => throwError(() => new HttpErrorResponse({ status: 500 }));
      requests.length = 0;
      await click('.field .seg button', '1M');
      const legs = legExpiries();
      await click('.inline-error .inline-retry', 'Retry');
      expect(expiryCalls.at(-1)).toEqual(expiryCalls.at(-2));              // the same dates asked again
      expect(component.expiryError()).toContain('Unable to load expiries');
      expect(legExpiries()).toEqual(legs);
      expect(requests).toEqual([]);
      expect(component.loading()).toBe(false);
    });
  });

  describe('notifications: failures inline with Retry (no duplicate toast), data conditions neutral', () => {
    const errors = () => Array.from(host.querySelectorAll<HTMLElement>('.inline-error'));
    const notes = () => Array.from(host.querySelectorAll<HTMLElement>('.inline-note'));
    const errorFor = (text: string) => errors().find(el => el.textContent?.includes(text));

    it('a failed symbol list stays on screen as an error with Retry, without a toast, and Retry loads it', async () => {
      const eod = TestBed.inject(EodService) as unknown as { getSymbols: () => Observable<string[]> };
      let fail = true;
      eod.getSymbols = () => (fail ? throwError(() => new Error('boom')) : of(['NIFTY', 'BANKNIFTY']));
      fixture = TestBed.createComponent(MultiLegEodComponent);
      component = fixture.componentInstance;
      host = fixture.nativeElement as HTMLElement;
      fixture.detectChanges();
      await settle();
      const error = errorFor('Unable to load the symbol list');
      expect(error?.getAttribute('role')).toBe('alert');
      expect(toasts('error')).toEqual([]);
      fail = false;
      await click('.inline-error .inline-retry', 'Retry');
      expect(component.symbols()).toEqual(['NIFTY', 'BANKNIFTY']);
      expect(component.symbolsError()).toBe('');
      expect(errorFor('Unable to load the symbol list')).toBeUndefined();
    });

    it('failed strikes and expiries are an error with Retry; a symbol that lists none is a neutral note', async () => {
      let fail = true;
      metaFor = symbol => (fail ? throwError(() => new Error('boom')) : of(details(symbol)));
      component.selectSymbol('BANKNIFTY');
      await settle();
      expect(errorFor('Unable to load strikes and expiries for BANKNIFTY')?.getAttribute('role')).toBe('alert');
      expect(toasts('error')).toEqual([]);
      fail = false;
      await click('.inline-error .inline-retry', 'Retry');
      expect(component.metaError()).toBe('');
      expect(component.legs()).toHaveLength(2);
      metaFor = symbol => of({ data: { ...details(symbol).data, expiry_date: [], strike: [] } });
      component.selectSymbol('RELIANCE');
      await settle();
      const note = notes().find(el => el.textContent?.includes('No listed strikes or expiries are available for RELIANCE'));
      expect(note?.getAttribute('role')).toBe('status');
      expect(errors()).toHaveLength(0);
    });

    it('a failed expiry list is shown once, inline, never also as a toast', async () => {
      expiryFor = () => throwError(() => new HttpErrorResponse({ status: 500 }));
      await click('.field .seg button', '1M');
      expect(errors().filter(el => el.textContent?.includes('Unable to load expiries'))).toHaveLength(1);
      expect(toasts('error')).toEqual([]);
    });

    it('a failed strike list is an error with Retry (no toast); Retry asks again and loads the leg', async () => {
      let fail = true;
      strikesFor = (_s, expiry) => (expiry === '2026-10-29' && fail ? of({ ok: false, reason: 'unavailable' }) : of({ ok: true, strikes: STRIKE_GRID }));
      await select(`#${host.querySelector<HTMLSelectElement>('select[id^="ml-expiry-"]')!.id}`, '2026-10-29');
      expect(errorFor('Unable to load the strikes for the 29 Oct 2026 expiry')?.getAttribute('role')).toBe('alert');
      expect(toasts('error')).toEqual([]);
      fail = false;
      requests.length = 0;
      await click('.inline-error .inline-retry', 'Retry');
      expect(component.legs()[0].strike).toBe(22600);
      expect(requests.some(r => r.expiry === '2026-10-29' && r.strike === 22600)).toBe(true);
    });

    it('a leg that fails to load is an error with Retry above the chart, not a toast; Retry requests it again', async () => {
      let fail = true;
      await reloadWith(req => (req.option_type === 'PE' && fail ? throwError(() => new Error('boom')) : of(makeRows(5, 100))));
      expect(errorFor('Unable to load EOD data for')?.getAttribute('role')).toBe('alert');
      expect(toasts('error')).toEqual([]);
      fail = false;
      await click('.inline-error .inline-retry', 'Retry');
      expect(component.failedLegs()).toHaveLength(0);
      expect(component.loadError()).toBe('');
    });

    it('asking to download with no data is information, not an error; an export is a short success', async () => {
      await reloadWith(() => of([]));
      component.downloadCsv();
      expect(toasts('info')).toEqual(['There is no EOD data to download for these dates.']);
      expect(toasts('error')).toEqual([]);
    });

    it('routine automatic updates raise no toast at all', async () => {
      expiryFor = req => reply(req, ['2026-10-22', '2026-11-03', '2026-11-26']);
      await click('.field .seg button', 'Custom');
      component.onCustomFrom('2026-10-01');
      component.onCustomTill('2026-10-28');
      await settle();
      expect(component.legs().map(l => l.expiry)).toEqual(['2026-11-03', '2026-11-03']);   // untouched legs moved with the dates
      expect(TestBed.inject(ToastService).messages()).toEqual([]);
    });
  });

  describe('chart and table messages while the expiry list is not verified', () => {
    const PENDING = 'Leg data loads once the expiry list for these dates is available.';
    const chartEmpty = () => Array.from(host.querySelectorAll<HTMLElement>('.charthead ~ .empty')).map(el => [el.textContent?.trim(), el.getAttribute('role')]);
    const failList = async () => {
      expiryFor = () => throwError(() => new HttpErrorResponse({ status: 500 }));
      requests.length = 0;
      await click('.field .seg button', '1M');
    };

    it('an expiry API failure shows the pending message instead of the empty-data messages, and requests no leg data', async () => {
      await failList();
      expect(chartEmpty()).toEqual([[PENDING, 'status']]);
      expect(host.textContent).not.toContain('No sessions in this range');
      expect(host.textContent).not.toContain('No EOD bars were returned');
      expect(host.textContent).not.toContain('No sessions to show.');
      expect(requests).toEqual([]);
      const error = Array.from(host.querySelectorAll('.inline-error')).find(el => el.textContent?.includes('Unable to load expiries for these dates.'));
      expect(error?.getAttribute('role')).toBe('alert');                   // the API error and its Retry are unchanged
      expect(error?.querySelector('.inline-retry')?.textContent?.trim()).toBe('Retry');
    });

    it('a successful Retry restores the normal chart and requests the legs', async () => {
      await failList();
      expiryFor = req => reply(req, ['2026-10-29', '2026-11-26']);
      await click('.inline-error .inline-retry', 'Retry');
      expect(host.textContent).not.toContain(PENDING);
      expect(component.legDataPending()).toBe(false);
      expect(requests.length).toBeGreaterThan(0);
      expect(component.chart()).not.toBeNull();
      expect(host.querySelector('.legend')).not.toBeNull();
    });

    it('while the list is still loading the normal loading state shows, not the pending message', async () => {
      const slow = new Subject<{ data: { symbol: string; trade_from: string; trade_till: string; expiry_date: string[] } }>();
      expiryFor = () => slow;
      await click('.field .seg button', '1M');
      expect(component.legDataPending()).toBe(false);
      expect(host.textContent).toContain('Loading EOD history…');
      expect(host.textContent).not.toContain(PENDING);
    });

    it('with a verified list and genuinely empty data the normal empty-data messages are unchanged', async () => {
      await reloadWith(() => of([]));
      expect(component.legDataPending()).toBe(false);
      expect(host.textContent).toContain('No sessions in this range');
      expect(host.textContent).toContain('No EOD bars were returned');
      expect(host.textContent).toContain('No sessions to show.');
      expect(host.textContent).not.toContain(PENDING);
    });
  });
});

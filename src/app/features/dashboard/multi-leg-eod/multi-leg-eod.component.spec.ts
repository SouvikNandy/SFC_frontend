import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { Observable, Subject, of, throwError } from 'rxjs';
import { MultiLegEodComponent } from './multi-leg-eod.component';
import { minusOneYear, plusOneYear } from '../../../shared/utils/date-range';
import { EodDataRow, EodRequest } from '../eod/eod.model';
import { EodService } from '../eod/eod.service';

type RowsRequest = Omit<EodRequest, 'page' | 'page_size'>;

const strikes = [22400, 22500, 22600, 22700];
const details = (symbol: string) => ({ data: { symbol, trade_date: '2026-10-15', expiry_date: ['2026-10-29', '2026-11-26'], underlying: 22630, strike: strikes, atm_strike: 22600, market_price: { CE: 1, PE: 1 } } });

/** YYYY-MM-DD, `n` days before today (the component also treats the local calendar day as "today"). */
const isoDaysAgo = (n: number): string => {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate() - n)).toISOString().slice(0, 10);
};

/** `count` consecutive sessions ending `lastDaysAgo` days ago, so they always fall inside the 1W/1M/3M windows. */
const makeRows = (count: number, base: number, lastDaysAgo = 1): EodDataRow[] =>
  Array.from({ length: count }, (_, i) => {
    return { date: isoDaysAgo(lastDaysAgo + count - 1 - i), symbol: 'NIFTY', open: base + i, high: base + i + 3, low: base + i - 3, close: base + i + 1, volume: 1000 * (i + 1), oi: 5000 * (i + 1) };
  });

describe('MultiLegEodComponent', () => {
  let fixture: ReturnType<typeof TestBed.createComponent<MultiLegEodComponent>>;
  let component: MultiLegEodComponent;
  let host: HTMLElement;
  let requests: RowsRequest[];
  let rowsFor: (req: RowsRequest) => Observable<EodDataRow[]>;
  let metaFor: (symbol: string) => Observable<ReturnType<typeof details>>;

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
    requests = [];
    rowsFor = req => of(makeRows(5, req.option_type === 'CE' ? 100 : 50));
    metaFor = symbol => of(details(symbol));
    vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: () => undefined, removeEventListener: () => undefined }));
    await TestBed.configureTestingModule({
      imports: [MultiLegEodComponent],
      providers: [
        provideHttpClient(),
        provideRouter([]),
        { provide: EodService, useValue: {
          getSymbols: () => of(['NIFTY', 'BANKNIFTY', 'RELIANCE']),
          getDdGreeks: ({ symbol }: { symbol: string }) => metaFor(symbol),
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

  afterEach(() => vi.unstubAllGlobals());

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
    expect(component.legs().map(l => [l.optionType, l.strike, l.expiry])).toEqual([['CE', 22600, '2026-10-29'], ['PE', 22600, '2026-10-29']]);
    expect(requests).toHaveLength(2);
    expect(requests[0]).toMatchObject({ symbol: 'NIFTY', option_type: 'CE', strike: 22600, expiry: '2026-10-29' });
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
    expect(requests).toEqual([expect.objectContaining({ option_type: 'CE', strike: 22700, expiry: '2026-10-29' })]);
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
    await select('#ml-expiry-1', '2026-11-26');
    expect(requests.some(r => r.expiry === '2026-11-26')).toBe(true);
    expect(component.series()[0].label).toBe('22700 PE · 26 Nov');
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
    expect(heads).toContain('22600 CE · 29 Oct');
    expect(heads).toContain('22600 PE · 29 Oct');
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
    await click('.legchips button', '22600 CE · 29 Oct');
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
      expect(downloads).toEqual(['NIFTY_22600CE_2026-10-29_22600PE_2026-10-29_EOD.csv']);
      const text = await blobs[0].text();
      expect(text.split('\n')[0]).toBe('Date,22600 CE · 29 Oct,22600 PE · 29 Oct');
      expect(text.split('\n')).toHaveLength(6);
      expect(text.split('\n')[1]).toBe(`${isoDaysAgo(5)},101.00,51.00`);
      await new Promise(resolve => setTimeout(resolve, 600));
      expect(revoked).toEqual(['blob:test/1']);
    });

    it('single-leg export: OHLC, volume and OI for the selected leg only', async () => {
      await click('.legchips button', '22600 PE · 29 Oct');
      await click('.outline');
      expect(downloads).toEqual(['NIFTY_22600PE_2026-10-29_EOD.csv']);
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
});

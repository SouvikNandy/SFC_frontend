import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { environment } from '../../../../environments/environment';
import { EodService } from './eod.service';
import { extractEodPage, isNoTradeBar, readEodPage } from './eod-rows.util';

/** Rows exactly as the live API returns them (checked 2026-10-17): newest first, with `ltp`. */
const live = (date: string, over: Record<string, number> = {}) =>
  ({ date, symbol: 'NIFTY', open: 160.8, high: 209.65, low: 103.4, close: 174.25, ltp: 171.5, volume: 54054, oi: 736710, ...over });

describe('extractEodPage (shared by F&O EOD and Multi-Leg EOD)', () => {
  it('reads the live shape: results + page + has_next + has_previous', () => {
    const rows = [live('2026-10-16')];
    expect(extractEodPage({ results: rows, page: 2, has_next: true, has_previous: true })).toEqual({ results: rows, page: 2, has_next: true, has_previous: true });
  });

  it('accepts a bare array, rows/items/data lists, and one level of `data` nesting', () => {
    const rows = [live('2026-10-16')];
    expect(extractEodPage(rows).results).toBe(rows);
    expect(extractEodPage({ rows }).results).toBe(rows);
    expect(extractEodPage({ items: rows }).results).toBe(rows);
    expect(extractEodPage({ data: rows }).results).toBe(rows);
    expect(extractEodPage({ data: { results: rows, has_next: true } })).toMatchObject({ results: rows, has_next: true });
  });

  it('empty or malformed payloads become an empty page, not an error', () => {
    for (const payload of [null, undefined, 'x', 5, {}, { results: 'nope' }]) {
      expect(extractEodPage(payload)).toEqual({ results: [], page: 1, has_next: false, has_previous: false });
    }
  });

  it('paging flags must be exactly true', () => {
    expect(extractEodPage({ results: [], has_next: 'yes' }).has_next).toBe(false);
  });
});

describe('readEodPage', () => {
  it('maps the live row fields, ignores ltp, and keeps close separate from ltp', () => {
    const [row] = readEodPage({ results: [live('2026-10-16')] }).results;
    expect(row).toEqual({ date: '2026-10-16', symbol: 'NIFTY', open: 160.8, high: 209.65, low: 103.4, close: 174.25, volume: 54054, oi: 736710 });
    expect(row).not.toHaveProperty('ltp');
  });

  it('accepts the alternate field names the F&O EOD screen already tolerates', () => {
    const [row] = readEodPage([{ trade_date: '2026-10-16T00:00:00', close_price: 99.5, open: 1, high: 2, low: 1, volume: 3, oi: 4 }]).results;
    expect(row).toMatchObject({ date: '2026-10-16', close: 99.5 });
  });

  it('a missing field is NaN (never 0); a row without a date is dropped', () => {
    const rows = readEodPage({ results: [{ date: '2026-10-16', close: 10 }, { close: 5 }, null] }).results;
    expect(rows).toHaveLength(1);
    expect(Number.isNaN(rows[0].open)).toBe(true);
    expect(Number.isNaN(rows[0].volume)).toBe(true);
    expect(rows[0].close).toBe(10);
  });

  it('never falls back to ltp when close is missing', () => {
    const [row] = readEodPage({ results: [{ date: '2026-10-16', ltp: 55 }] }).results;
    expect(Number.isNaN(row.close)).toBe(true);
  });
});

describe('isNoTradeBar', () => {
  it('matches the live no-trade rows (zero OHLC and volume, close carried forward)', () => {
    expect(isNoTradeBar({ open: 0, high: 0, low: 0, volume: 0 })).toBe(true);
  });
  it('does not match a traded session, even a quiet one', () => {
    expect(isNoTradeBar({ open: 10, high: 12, low: 9, volume: 5 })).toBe(false);
    expect(isNoTradeBar({ open: 0, high: 5, low: 0, volume: 1 })).toBe(false);
    expect(isNoTradeBar({ open: Number.NaN, high: Number.NaN, low: Number.NaN, volume: Number.NaN })).toBe(false);   // missing ≠ no trades
  });
});

describe('EodService.getAllRows (real contract)', () => {
  let service: EodService;
  let http: HttpTestingController;
  const URL = `${environment.apiBaseUrl}/fo/eod`;
  const request = { symbol: 'NIFTY', option_type: 'CE', strike: 23150, expiry: '2026-10-27', date_from: '2026-01-01', date_till: '2026-10-16' } as const;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(EodService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('asks for 500 rows per request (verified against the live API), never 0, and returns oldest first', () => {
    let rows: { date: string }[] = [];
    service.getAllRows(request).subscribe(value => (rows = value));
    const req = http.expectOne(URL);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ ...request, page: 1, page_size: 500 });
    req.flush({ success: true, message: 'EOD_DATA_FETCHED', data: { results: [live('2026-10-16'), live('2026-10-15')], page: 1, has_next: false, has_previous: false } });
    expect(rows.map(r => r.date)).toEqual(['2026-10-15', '2026-10-16']);
  });

  it('follows has_next across pages and combines them', () => {
    let rows: { date: string }[] = [];
    service.getAllRows(request, 2).subscribe(value => (rows = value));
    http.expectOne(r => r.body.page === 1).flush({ data: { results: [live('2026-10-16'), live('2026-10-15')], page: 1, has_next: true, has_previous: false } });
    http.expectOne(r => r.body.page === 2).flush({ data: { results: [live('2026-10-14')], page: 2, has_next: false, has_previous: true } });
    expect(rows.map(r => r.date)).toEqual(['2026-10-14', '2026-10-15', '2026-10-16']);
  });

  it('follows has_next even when a page holds fewer rows than requested (the backend caps pages at 500)', () => {
    let rows: { date: string }[] = [];
    service.getAllRows(request, 5000).subscribe(value => (rows = value));
    const first = Array.from({ length: 500 }, (_, i) => live(`2026-01-${String((i % 28) + 1).padStart(2, '0')}`, { open: i + 1 }));
    http.expectOne(r => r.body.page === 1 && r.body.page_size === 5000).flush({ data: { results: first, page: 1, has_next: true, has_previous: false } });
    http.expectOne(r => r.body.page === 2).flush({ data: { results: [live('2025-12-01')], page: 2, has_next: false, has_previous: true } });
    expect(rows).toHaveLength(501);   // a 500-row page with has_next=true was NOT treated as the end
  });

  it('an empty history (unlisted strike or expiry) is an empty list, not an error', () => {
    let rows: unknown[] | undefined;
    service.getAllRows(request).subscribe(value => (rows = value));
    http.expectOne(URL).flush({ success: true, message: 'EOD_DATA_FETCHED', data: { results: [], page: 1, has_next: false, has_previous: false } });
    expect(rows).toEqual([]);
  });
});

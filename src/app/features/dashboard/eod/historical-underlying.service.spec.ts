import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { Observable, of, throwError } from 'rxjs';
import { HistoricalUnderlyingResult, HistoricalUnderlyingService } from './historical-underlying.service';
import { EodService } from './eod.service';

const STRIKES = [25000, 25050, 25100, 25150, 25200, 25250, 25300, 25350];
// 26 Jan 2026 (Republic Day), 31 Jan / 1 Feb (weekend) are not sessions.
const SESSIONS = ['2026-01-20', '2026-01-21', '2026-01-22', '2026-01-23', '2026-01-27', '2026-01-28', '2026-01-29', '2026-01-30', '2026-02-02'];

describe('HistoricalUnderlyingService', () => {
  let service: HistoricalUnderlyingService;
  let chartCalls: Array<Record<string, unknown>>;
  let detailCalls: Array<{ symbol: string; trade_date?: string }>;
  let chart: () => Observable<{ data: Array<{ date: string; close: number }> }>;
  let details: (req: { symbol: string; trade_date?: string }) => Observable<unknown>;

  const detailsFor = (session: string, underlying = 25320.65, strike = STRIKES) =>
    of({ success: true, data: { symbol: 'NIFTY', trade_date: session, expiry_date: [], underlying, strike, atm_strike: 99999, market_price: { CE: 1, PE: 1 } } });
  const resolve = (symbol: string, till: string) => new Promise<HistoricalUnderlyingResult>(done => service.resolve(symbol, till).subscribe(done));

  beforeEach(() => {
    chartCalls = [];
    detailCalls = [];
    chart = () => of({ data: SESSIONS.map(date => ({ date, close: 1 })) });
    details = req => detailsFor(req.trade_date as string);
    TestBed.configureTestingModule({
      providers: [{
        provide: EodService,
        useValue: {
          getEodChart: (req: Record<string, unknown>) => { chartCalls.push(req); return chart(); },
          getDdGreeks: (req: { symbol: string; trade_date?: string }) => { detailCalls.push(req); return details(req); },
        },
      }],
    });
    service = TestBed.inject(HistoricalUnderlyingService);
  });

  it('a trading day: that session\'s underlying close, and the listed strike nearest to it (not the backend atm_strike)', async () => {
    const result = await resolve('NIFTY', '2026-01-30');
    expect(result).toEqual({ ok: true, session: '2026-01-30', underlying: 25320.65, strikes: STRIKES, atm: 25300 });
    expect(detailCalls).toEqual([{ symbol: 'NIFTY', trade_date: '2026-01-30' }]);
  });

  it('asks the EOD series for the sessions up to the date, with no current-price call', async () => {
    await resolve('NIFTY', '2026-01-30');
    expect(chartCalls).toEqual([{ symbol: 'NIFTY', option_type: 'XX', date_from: '2026-01-16', date_till: '2026-01-30' }]);
    expect(detailCalls.every(call => !!call.trade_date)).toBe(true);
  });

  it('a Saturday or Sunday uses the previous session (31 Jan / 1 Feb 2026 -> 30 Jan)', async () => {
    expect((await resolve('NIFTY', '2026-01-31') as { session: string }).session).toBe('2026-01-30');
    expect((await resolve('NIFTY', '2026-02-01') as { session: string }).session).toBe('2026-01-30');
  });

  it('an exchange holiday uses the previous session (26 Jan 2026 -> 23 Jan)', async () => {
    const result = await resolve('NIFTY', '2026-01-26');
    expect(result.ok && result.session).toBe('2026-01-23');
    expect(detailCalls.map(call => call.trade_date)).toEqual(['2026-01-23']);
  });

  it('if the newest session has no option data the next earlier one is used', async () => {
    details = req => (req.trade_date === '2026-01-30' ? throwError(() => ({ status: 422 })) : detailsFor(req.trade_date as string, 25120));
    const result = await resolve('NIFTY', '2026-01-30');
    expect(result).toMatchObject({ ok: true, session: '2026-01-29', atm: 25100 });
    expect(detailCalls.map(call => call.trade_date)).toEqual(['2026-01-30', '2026-01-29']);
  });

  it('gives up after a few sessions instead of walking back indefinitely', async () => {
    details = () => throwError(() => ({ status: 422 }));
    expect(await resolve('NIFTY', '2026-01-30')).toEqual({ ok: false, reason: 'unavailable' });
    expect(detailCalls).toHaveLength(3);
  });

  it('no session in the look-back window means no price (never the current one)', async () => {
    chart = () => of({ data: [] });
    expect(await resolve('NIFTY', '2026-01-30')).toEqual({ ok: false, reason: 'no-session' });
    expect(detailCalls).toHaveLength(0);
  });

  it('a failed session lookup is "unavailable", and failures are not cached', async () => {
    chart = () => throwError(() => new Error('boom'));
    expect(await resolve('NIFTY', '2026-01-30')).toEqual({ ok: false, reason: 'unavailable' });
    chart = () => of({ data: SESSIONS.map(date => ({ date, close: 1 })) });
    expect((await resolve('NIFTY', '2026-01-30')).ok).toBe(true);
  });

  it('an answer without a usable underlying or strikes is not an ATM', async () => {
    details = req => detailsFor(req.trade_date as string, 0);
    expect(await resolve('NIFTY', '2026-01-30')).toEqual({ ok: false, reason: 'unavailable' });
    details = req => detailsFor(req.trade_date as string, 25000, []);
    expect(await resolve('NIFTY', '2026-01-30')).toEqual({ ok: false, reason: 'unavailable' });
  });

  it('works for any symbol: a stock with a 10-point strike step, and an index with a 100-point step', async () => {
    details = req => detailsFor(req.trade_date as string, 1395.4, [1380, 1390, 1400, 1410]);
    expect(await resolve('RELIANCE', '2026-01-30')).toMatchObject({ ok: true, atm: 1400 });
    details = req => detailsFor(req.trade_date as string, 59610.45, [59400, 59500, 59600, 59700]);
    expect(await resolve('BANKNIFTY', '2026-01-30')).toMatchObject({ ok: true, atm: 59600 });
  });

  it('successful answers are cached per symbol and date, so repeating a selection makes no new request', async () => {
    await resolve('NIFTY', '2026-01-30');
    await resolve('NIFTY', '2026-01-30');
    expect(chartCalls).toHaveLength(1);
    expect(detailCalls).toHaveLength(1);
    await resolve('NIFTY', '2026-01-29');
    expect(chartCalls).toHaveLength(2);
    await resolve('BANKNIFTY', '2026-01-30');
    expect(chartCalls).toHaveLength(3);
  });

  it('simultaneous requests for the same symbol and date share one call', async () => {
    const [a, b] = await Promise.all([resolve('NIFTY', '2026-01-30'), resolve('NIFTY', '2026-01-30')]);
    expect(a).toEqual(b);
    expect(chartCalls).toHaveLength(1);
  });

  describe('unavailable historical underlying price', () => {
    const noData = (key = 'underlying') => throwError(() => new HttpErrorResponse({ status: 422, error: { success: false, errors: { [key]: ['No data available.'] } } }));
    const serverError = () => throwError(() => new HttpErrorResponse({ status: 500, error: {} }));
    const networkError = () => throwError(() => new HttpErrorResponse({ status: 0, error: new ProgressEvent('error') }));
    const JUNE_2022 = ['2022-05-19', '2022-05-20', '2022-05-23', '2022-05-24', '2022-05-25', '2022-05-26', '2022-05-27', '2022-05-30', '2022-05-31', '2022-06-01', '2022-06-02'];

    it('a date before the backend price history (2 Jun 2022): every session answers "no data", so the result is no-data, not a failure', async () => {
      chart = () => of({ data: JUNE_2022.map(date => ({ date, close: 16621.2 })) });
      details = () => noData();
      expect(await resolve('NIFTY', '2022-06-02')).toEqual({ ok: false, reason: 'no-data' });
      expect(detailCalls.map(call => call.trade_date)).toEqual(['2022-06-02', '2022-06-01', '2022-05-31']);   // the fallback is still tried
    });

    it('never substitutes the futures close from the session series', async () => {
      chart = () => of({ data: JUNE_2022.map(date => ({ date, close: 16621.2 })) });
      details = () => noData();
      const result = await resolve('NIFTY', '2022-06-02');
      expect(JSON.stringify(result)).not.toContain('16621');
      expect(result.ok).toBe(false);
      expect(chartCalls).toHaveLength(1);                                       // the series is asked for session dates only
    });

    it('one session without data does not end the search: the previous session\'s close is used', async () => {
      details = req => (req.trade_date === '2026-01-30' ? noData() : detailsFor(req.trade_date as string, 25418.9, [25350, 25400, 25450]));
      expect(await resolve('NIFTY', '2026-01-30')).toMatchObject({ ok: true, session: '2026-01-29', atm: 25400 });
      expect(detailCalls.map(call => call.trade_date)).toEqual(['2026-01-30', '2026-01-29']);
    });

    it('two sessions without data and a third with a close still resolve', async () => {
      details = req => (req.trade_date === '2026-01-28' ? detailsFor('2026-01-28', 25342.75, [25300, 25350, 25400]) : noData('expiry_date'));
      expect(await resolve('NIFTY', '2026-01-30')).toMatchObject({ ok: true, session: '2026-01-28', atm: 25350 });
    });

    it('a weekend or holiday still maps to the previous session, and that session may itself be the first with data', async () => {
      expect(await resolve('NIFTY', '2026-01-31')).toMatchObject({ ok: true, session: '2026-01-30' });
      expect(await resolve('NIFTY', '2026-01-26')).toMatchObject({ ok: true, session: '2026-01-23' });
      expect(detailCalls.map(call => call.trade_date)).toEqual(['2026-01-30', '2026-01-23']);
    });

    it('the "no data" answer under expiry_date counts as no-data too', async () => {
      details = () => noData('expiry_date');
      expect(await resolve('NIFTY', '2026-01-30')).toEqual({ ok: false, reason: 'no-data' });
    });

    it('a server error (HTTP 500) stays a genuine failure', async () => {
      details = () => serverError();
      expect(await resolve('NIFTY', '2026-01-30')).toEqual({ ok: false, reason: 'unavailable' });
    });

    it('a network failure stays a genuine failure', async () => {
      details = () => networkError();
      expect(await resolve('NIFTY', '2026-01-30')).toEqual({ ok: false, reason: 'unavailable' });
    });

    it('a failed session list stays a genuine failure', async () => {
      chart = () => throwError(() => new HttpErrorResponse({ status: 500 }));
      expect(await resolve('NIFTY', '2022-06-02')).toEqual({ ok: false, reason: 'unavailable' });
      expect(detailCalls).toHaveLength(0);
    });

    it('a genuine failure among "no data" answers is not reported as a data gap', async () => {
      const answers = [noData(), serverError(), noData()];
      let i = 0;
      details = () => answers[i++];
      expect(await resolve('NIFTY', '2026-01-30')).toEqual({ ok: false, reason: 'unavailable' });
    });

    it('a failure on the newest session followed by a session with a close still resolves', async () => {
      details = req => (req.trade_date === '2026-01-30' ? serverError() : detailsFor(req.trade_date as string, 25418.9));
      expect(await resolve('NIFTY', '2026-01-30')).toMatchObject({ ok: true, session: '2026-01-29' });
    });

    it('any other 422 (for example a malformed date) is a failure, not a data gap', async () => {
      details = () => throwError(() => new HttpErrorResponse({ status: 422, error: { errors: { trade_date: ['Date has wrong format.'] } } }));
      expect(await resolve('NIFTY', '2026-01-30')).toEqual({ ok: false, reason: 'unavailable' });
    });

    it('a no-data result is not cached: asking again asks the backend again', async () => {
      chart = () => of({ data: JUNE_2022.map(date => ({ date, close: 1 })) });
      details = () => noData();
      await resolve('NIFTY', '2022-06-02');
      const calls = detailCalls.length;
      await resolve('NIFTY', '2022-06-02');
      expect(detailCalls.length).toBeGreaterThan(calls);
    });
  });
});

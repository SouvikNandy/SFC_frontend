import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { Observable, Subject, of, throwError } from 'rxjs';
import { ExpiryStrikesResult, ExpiryStrikesService } from './expiry-strikes.service';
import { EodService } from './eod.service';

describe('ExpiryStrikesService', () => {
  let service: ExpiryStrikesService;
  let calls: Array<{ symbol: string; expiry: string }>;
  let answer: (req: { symbol: string; expiry: string }) => Observable<unknown>;
  const resolve = (symbol: string, expiry: string) => new Promise<ExpiryStrikesResult>(done => service.resolve(symbol, expiry).subscribe(done));

  beforeEach(() => {
    calls = [];
    answer = req => of({ success: true, data: { symbol: req.symbol, expiry: req.expiry, stikes: [25200, 25100, 25300, 25100] } });
    TestBed.configureTestingModule({
      providers: [{ provide: EodService, useValue: { getDdStrikes: (req: { symbol: string; expiry: string }) => { calls.push(req); return answer(req); } } }],
    });
    service = TestBed.inject(ExpiryStrikesService);
  });

  it('asks dd_strikes with the symbol and expiry and returns the sorted, de-duplicated strikes', async () => {
    expect(await resolve('NIFTY', '2026-02-24')).toEqual({ ok: true, strikes: [25100, 25200, 25300] });
    expect(calls).toEqual([{ symbol: 'NIFTY', expiry: '2026-02-24' }]);
  });

  it('caches a successful answer per symbol and expiry', async () => {
    await resolve('NIFTY', '2026-02-24');
    await resolve('NIFTY', '2026-02-24');
    await resolve('NIFTY', '2026-03-30');
    await resolve('BANKNIFTY', '2026-02-24');
    expect(calls).toHaveLength(3);
  });

  it('shares one in-flight request between callers', async () => {
    const pending = new Subject<unknown>();
    answer = () => pending;
    const first = resolve('NIFTY', '2026-02-24');
    const second = resolve('NIFTY', '2026-02-24');
    pending.next({ success: true, data: { symbol: 'NIFTY', expiry: '2026-02-24', stikes: [1] } });
    pending.complete();
    expect(await first).toEqual({ ok: true, strikes: [1] });
    expect(await second).toEqual({ ok: true, strikes: [1] });
    expect(calls).toHaveLength(1);
  });

  it('the 422 "No data available." and an empty list mean there are no strikes', async () => {
    answer = () => throwError(() => new HttpErrorResponse({ status: 422, error: { errors: { strike_price: ['No data available.'] } } }));
    expect(await resolve('NIFTY', '2026-11-24')).toEqual({ ok: false, reason: 'none' });
    answer = req => of({ success: true, data: { symbol: req.symbol, expiry: req.expiry, stikes: [] } });
    expect(await resolve('NIFTY', '2026-11-25')).toEqual({ ok: false, reason: 'none' });
  });

  it('any other failure is unavailable, and failures are not cached so a retry asks again', async () => {
    answer = () => throwError(() => new HttpErrorResponse({ status: 500 }));
    expect(await resolve('NIFTY', '2026-02-24')).toEqual({ ok: false, reason: 'unavailable' });
    answer = () => of({ success: true, data: { symbol: 'NIFTY', expiry: '2026-02-24', stikes: [25100] } });
    expect(await resolve('NIFTY', '2026-02-24')).toEqual({ ok: true, strikes: [25100] });
    expect(calls).toHaveLength(2);
  });

  it('a validation 422 on another field is a failure, not an empty list', async () => {
    answer = () => throwError(() => new HttpErrorResponse({ status: 422, error: { errors: { expiry: ['This field is required.'] } } }));
    expect(await resolve('NIFTY', '')).toEqual({ ok: false, reason: 'unavailable' });
  });
});

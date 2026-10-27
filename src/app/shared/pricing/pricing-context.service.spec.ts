import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { environment } from '../../../environments/environment';
import { FuturesCloseService } from './futures-close.service';
import { InstrumentKindService } from './instrument-kind.service';
import { PricingContext, PricingContextService, describePricingFailure } from './pricing-context.service';

const KINDS_URL = `${environment.apiBaseUrl}/fo/dd_list_v2`;
const FUTURES_URL = `${environment.apiBaseUrl}/fo/xx_close`;
const KINDS = { success: true, message: 'DD_SYMBOL_LIST_FETCHED', data: { NIFTY: 'INDEX', BANKNIFTY: 'INDEX', RELIANCE: 'STOCK', WEIRD: 'ETF' } };
const serverError = { status: 500, statusText: 'Server Error' };

describe('InstrumentKindService', () => {
  const setup = () => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    return { service: TestBed.inject(InstrumentKindService), http: TestBed.inject(HttpTestingController) };
  };

  it('reads INDEX / STOCK from GET /fo/dd_list_v2 and ignores anything else', () => {
    const { service, http } = setup();
    let kinds: ReadonlyMap<string, string> | null = null;
    service.getKinds().subscribe(value => (kinds = value));
    const request = http.expectOne(KINDS_URL);
    expect(request.request.method).toBe('GET');
    request.flush(KINDS);
    expect(kinds!.get('NIFTY')).toBe('index');
    expect(kinds!.get('RELIANCE')).toBe('stock');
    expect(kinds!.has('WEIRD')).toBe(false);
  });

  it('requests once and serves later callers from the cache', () => {
    const { service, http } = setup();
    service.kindOf('NIFTY').subscribe();
    service.kindOf('RELIANCE').subscribe();
    http.expectOne(KINDS_URL).flush(KINDS);
    service.kindOf('NIFTY').subscribe();
    http.expectNone(KINDS_URL);
  });

  it('does not cache a failure: the next caller asks again', () => {
    const { service, http } = setup();
    let first: unknown = 'unset';
    service.kindOf('NIFTY').subscribe(value => (first = value));
    http.expectOne(KINDS_URL).flush('boom', serverError);
    expect(first).toBeNull();
    let second: unknown = 'unset';
    service.kindOf('NIFTY').subscribe(value => (second = value));
    http.expectOne(KINDS_URL).flush(KINDS);
    expect(second).toBe('index');
  });

  it('answers null for a symbol the backend does not classify', () => {
    const { service, http } = setup();
    let kind: unknown = 'unset';
    service.kindOf('UNKNOWN').subscribe(value => (kind = value));
    http.expectOne(KINDS_URL).flush(KINDS);
    expect(kind).toBeNull();
  });
});

describe('FuturesCloseService', () => {
  const setup = () => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    return { service: TestBed.inject(FuturesCloseService), http: TestBed.inject(HttpTestingController) };
  };

  it('POSTs symbol and expiry to /fo/xx_close and returns the close tagged with that expiry', () => {
    const { service, http } = setup();
    let quote: unknown = 'unset';
    service.getClose('RELIANCE', '2026-10-27').subscribe(value => (quote = value));
    const request = http.expectOne(FUTURES_URL);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ symbol: 'RELIANCE', expiry: '2026-10-27' });
    request.flush({ success: true, data: { trade_date: '2026-10-26', close: 1200.5 } });
    expect(quote).toEqual({ expiry: '2026-10-27', price: 1200.5, tradeDate: '2026-10-26' });
  });

  it('caches a real price per symbol and expiry, and asks again for another expiry', () => {
    const { service, http } = setup();
    service.getClose('RELIANCE', '2026-10-27').subscribe();
    http.expectOne(FUTURES_URL).flush({ success: true, data: { trade_date: '2026-10-26', close: 1200.5 } });
    service.getClose('RELIANCE', '2026-10-27').subscribe();
    http.expectNone(FUTURES_URL);
    service.getClose('RELIANCE', '2026-11-23').subscribe();
    expect(http.expectOne(FUTURES_URL).request.body.expiry).toBe('2026-11-23');
  });

  const cases: Array<[string, unknown, { status: number; statusText: string } | undefined]> = [
    ['an API error', 'boom', serverError],
    ['an unsuccessful response', { success: false, data: '' }, undefined],
    ['a zero close', { success: true, data: { trade_date: '2026-10-26', close: 0 } }, undefined],
    ['a missing close', { success: true, data: {} }, undefined],
  ];
  it.each(cases)('treats %s as no price and does not cache it', (_label, body, init) => {
    const { service, http } = setup();
    let quote: unknown = 'unset';
    service.getClose('RELIANCE', '2026-11-24').subscribe(value => (quote = value));
    http.expectOne(FUTURES_URL).flush(body as never, init as never);
    expect(quote).toBeNull();
    service.getClose('RELIANCE', '2026-11-24').subscribe();
    http.expectOne(FUTURES_URL).flush({ success: true, data: { close: 1 } });
  });
});

describe('PricingContextService', () => {
  const run = (symbol: string, expiry: string, spot: number | null, answer: (http: HttpTestingController) => void): PricingContext => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    const http = TestBed.inject(HttpTestingController);
    let context: PricingContext | undefined;
    TestBed.inject(PricingContextService).resolve(symbol, expiry, spot).subscribe(value => (context = value));
    answer(http);
    return context!;
  };

  it('an index uses the spot index value with 5.5 % / 1 % and never asks for a futures price', () => {
    const context = run('NIFTY', '2026-10-27', 22600, http => {
      http.expectOne(KINDS_URL).flush(KINDS);
      http.expectNone(FUTURES_URL);
    });
    expect(context).toMatchObject({ ok: true, kind: 'index', underlying: 22600, riskFreeRate: 0.055, dividendYield: 0.01, futures: null });
  });

  it('a stock uses the futures close of the SAME expiry with 0.01 % / 0 %, not its spot', () => {
    const context = run('RELIANCE', '2026-10-27', 1201.8, http => {
      http.expectOne(KINDS_URL).flush(KINDS);
      const request = http.expectOne(FUTURES_URL);
      expect(request.request.body).toEqual({ symbol: 'RELIANCE', expiry: '2026-10-27' });
      request.flush({ success: true, data: { trade_date: '2026-10-26', close: 1200.5 } });
    });
    expect(context).toMatchObject({ ok: true, kind: 'stock', underlying: 1200.5, riskFreeRate: 0.0001, dividendYield: 0 });
  });

  it('a stock whose futures close is missing has no context: spot is not substituted', () => {
    const context = run('RELIANCE', '2026-11-24', 1201.8, http => {
      http.expectOne(KINDS_URL).flush(KINDS);
      http.expectOne(FUTURES_URL).flush({ success: false, data: '', errors: {} }, serverError);
    });
    expect(context).toEqual({ ok: false, reason: 'missing-futures-price' });
  });

  it('a symbol with no classification has no context, even with a spot value', () => {
    const context = run('UNKNOWN', '2026-10-27', 100, http => {
      http.expectOne(KINDS_URL).flush(KINDS);
      http.expectNone(FUTURES_URL);
    });
    expect(context).toEqual({ ok: false, reason: 'missing-instrument-type' });
  });

  it('an index without a spot value has no context', () => {
    expect(run('NIFTY', '2026-10-27', null, http => http.expectOne(KINDS_URL).flush(KINDS))).toEqual({ ok: false, reason: 'missing-spot-price' });
  });

  it('describes every failure in words, never as a number', () => {
    for (const reason of ['missing-instrument-type', 'missing-spot-price', 'missing-futures-price', 'futures-expiry-mismatch', 'missing-close-price', 'no-time-to-expiry', 'invalid-strike', 'price-outside-bounds']) {
      expect(describePricingFailure(reason)).toMatch(/[a-z]{4}/);
    }
  });
});

import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { environment } from '../../../environments/environment';
import { TickerItem, TickerService } from './ticker.service';

const URL = `${environment.apiBaseUrl}/fo/ticker`;
const PAYLOAD = {
  success: true,
  data: [
    { symbol: 'NIFTY', price: 22600.5, change: 12.25, positive: true },
    { symbol: 'BANKNIFTY', price: 48000, change: -30, positive: false },
  ],
};

describe('TickerService', () => {
  let service: TickerService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(TickerService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('posts to /fo/ticker and formats the items', () => {
    let items: TickerItem[] = [];
    service.getTicker().subscribe((list) => (items = list));
    const request = http.expectOne(URL);
    expect(request.request.method).toBe('POST');
    request.flush(PAYLOAD);

    expect(items).toEqual([
      { symbol: 'NIFTY', price: '22600.50', change: '+12.25', positive: true, priceValue: 22600.5, changeValue: 12.25 },
      { symbol: 'BANKNIFTY', price: '48000.00', change: '-30.00', positive: false, priceValue: 48000, changeValue: -30 },
    ]);
  });

  it('shares one request between the ticker tape and the market cards, and reuses a successful result', () => {
    const results: TickerItem[][] = [];
    service.getTicker().subscribe((list) => results.push(list));
    service.getTicker().subscribe((list) => results.push(list));
    http.expectOne(URL).flush(PAYLOAD);
    service.getTicker().subscribe((list) => results.push(list));

    http.expectNone(URL);
    expect(results.length).toBe(3);
    expect(results.every((list) => list.length === 2)).toBe(true);
  });

  it('emits an empty list on failure instead of erroring', () => {
    let items: TickerItem[] | null = null;
    service.getTicker().subscribe((list) => (items = list));
    http.expectOne(URL).flush('boom', { status: 500, statusText: 'Server Error' });
    expect(items).toEqual([]);
  });

  it('does not cache a failure: the next caller requests again and gets data', () => {
    service.getTicker().subscribe();
    http.expectOne(URL).flush('boom', { status: 500, statusText: 'Server Error' });

    let items: TickerItem[] = [];
    service.getTicker().subscribe((list) => (items = list));
    http.expectOne(URL).flush(PAYLOAD);
    expect(items.length).toBe(2);
  });

  it('treats an unsuccessful response as empty but retryable', () => {
    let first: TickerItem[] | null = null;
    service.getTicker().subscribe((list) => (first = list));
    http.expectOne(URL).flush({ success: false, data: [] });
    expect(first).toEqual([]);

    service.getTicker().subscribe();
    http.expectOne(URL).flush(PAYLOAD);
  });
});

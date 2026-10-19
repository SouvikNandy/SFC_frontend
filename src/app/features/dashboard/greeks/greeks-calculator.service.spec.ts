import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { environment } from '../../../../environments/environment';
import { HistoricalVolatilityService } from '../historical-volatility/historical-volatility.service';
import { GreeksCalculatorService } from './greeks-calculator.service';

const URL = `${environment.apiBaseUrl}/fo/dd_list`;

describe('GreeksCalculatorService symbol list', () => {
  let service: GreeksCalculatorService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(GreeksCalculatorService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('reads the list from `data`, falling back to `SYMBOL_LIST`, then to an empty list', () => {
    const lists: string[][] = [];
    service.getSymbols().subscribe((list) => lists.push(list));
    http.expectOne(URL).flush({ success: true, data: ['NIFTY', 'BANKNIFTY'] });
    expect(lists[0]).toEqual(['NIFTY', 'BANKNIFTY']);
  });

  it('accepts the legacy SYMBOL_LIST field', () => {
    let list: string[] = [];
    service.getSymbols().subscribe((value) => (list = value));
    http.expectOne(URL).flush({ success: true, SYMBOL_LIST: ['RELIANCE'] });
    expect(list).toEqual(['RELIANCE']);
  });

  it('requests once and serves later callers (including concurrent ones) from the cache', () => {
    const lists: string[][] = [];
    service.getSymbols().subscribe((list) => lists.push(list));
    service.getSymbols().subscribe((list) => lists.push(list));
    http.expectOne(URL).flush({ success: true, data: ['NIFTY'] });
    service.getSymbols().subscribe((list) => lists.push(list));

    http.expectNone(URL);
    expect(lists).toEqual([['NIFTY'], ['NIFTY'], ['NIFTY']]);
  });

  it('gives each caller its own array so one screen cannot change another’s list', () => {
    const lists: string[][] = [];
    service.getSymbols().subscribe((list) => lists.push(list));
    service.getSymbols().subscribe((list) => lists.push(list));
    http.expectOne(URL).flush({ success: true, data: ['NIFTY'] });
    expect(lists[0]).not.toBe(lists[1]);
  });

  it('rejects an unsuccessful response and does not cache it', () => {
    let failed = false;
    service.getSymbols().subscribe({ error: () => (failed = true) });
    http.expectOne(URL).flush({ success: false, message: 'nope' });
    expect(failed).toBe(true);

    let list: string[] = [];
    service.getSymbols().subscribe((value) => (list = value));
    http.expectOne(URL).flush({ success: true, data: ['NIFTY'] });
    expect(list).toEqual(['NIFTY']);
  });

  it('retries after an HTTP failure', () => {
    let failed = false;
    service.getSymbols().subscribe({ error: () => (failed = true) });
    http.expectOne(URL).flush('boom', { status: 500, statusText: 'Server Error' });
    expect(failed).toBe(true);

    let list: string[] = [];
    service.getSymbols().subscribe((value) => (list = value));
    http.expectOne(URL).flush({ success: true, data: ['NIFTY'] });
    expect(list).toEqual(['NIFTY']);
  });

  it('is the same cached request that Historical Volatility uses', () => {
    const volatility = TestBed.inject(HistoricalVolatilityService);
    const lists: string[][] = [];
    service.getSymbols().subscribe((list) => lists.push(list));
    volatility.getSymbols().subscribe((list) => lists.push(list));
    http.expectOne(URL).flush({ success: true, data: ['NIFTY'] });
    expect(lists).toEqual([['NIFTY'], ['NIFTY']]);
  });
});

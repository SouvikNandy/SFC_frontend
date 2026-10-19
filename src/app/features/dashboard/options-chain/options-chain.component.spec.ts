import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { Observable, Subject, of } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ToastService } from '../../../core/services/toast.service';
import { GreeksCalculatorService } from '../greeks/greeks-calculator.service';
import { GreeksSymbolDetails } from '../greeks/greeks.model';
import { LiveDataAccessService } from '../live-data/live-data-access.service';
import { OptionsChainRow, OptionsChainSide, OptionsChainViewModel } from './models/chain.model';
import { OptionsChainComponent } from './options-chain.component';
import { OptionsChainService } from './options-chain.service';

const side = (oi: number): OptionsChainSide => ({
  oi, oiChange: 0, volume: 0, iv: 0, ltp: 1, ltpChange: 0, delta: null, gamma: null, theta: null, vega: null, itm: false,
});
const view = (strike: number): OptionsChainViewModel => ({
  spot: 22600, spotChange: null, spotChangePercent: null, pcr: null, maxPain: null, callOi: null, putOi: null, atmIv: null,
  rows: [{ strike, call: side(1), put: side(2) } as OptionsChainRow],
  chart: { callOi: [], putOi: [], callIv: [], putIv: [] },
});
const details = (symbol: string): GreeksSymbolDetails => ({
  symbol, trade_date: '2026-10-16', expiry_date: ['2026-10-29', '2026-11-05'], underlying: 22600, strike: [22600], atm_strike: 22600, hv20: 15,
});

describe('OptionsChainComponent chain loading', () => {
  let component: OptionsChainComponent;
  let chainCalls: Subject<OptionsChainViewModel>[];
  const toastError = vi.fn();

  beforeEach(async () => {
    chainCalls = [];
    toastError.mockClear();
    await TestBed.configureTestingModule({
      imports: [OptionsChainComponent],
      providers: [
        {
          provide: GreeksCalculatorService,
          useValue: {
            getSymbols: () => of(['NIFTY', 'BANKNIFTY']),
            getSymbolDetails: ({ symbol }: { symbol: string }) => of(details(symbol)),
            calculateAll: () => ({ deltaCall: 0, deltaPut: 0, gamma: 0, thetaCall: 0, thetaPut: 0, vega: 0 }),
          },
        },
        {
          provide: OptionsChainService,
          useValue: {
            getOptionChain: (): Observable<OptionsChainViewModel> => {
              const call = new Subject<OptionsChainViewModel>();
              chainCalls.push(call);
              return call;
            },
          },
        },
        { provide: ToastService, useValue: { error: toastError, success: vi.fn() } },
        { provide: LiveDataAccessService, useValue: { requestedLive: () => false } },
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap({}) } } },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(OptionsChainComponent);
    component = fixture.componentInstance;
    fixture.detectChanges(); // loads symbols, selects NIFTY, loads details, requests the first chain
  });

  afterEach(() => vi.restoreAllMocks());

  it('requests the chain for the default symbol and first expiry, then shows the rows', () => {
    expect(chainCalls.length).toBe(1);
    expect(component.loading).toBe(true);
    chainCalls[0].next(view(22600));
    expect(component.loading).toBe(false);
    expect(component.rows.map((row) => row.strike)).toEqual([22600]);
    expect(component.error).toBe('');
  });

  it('clears the loading state and reports an error when the chain request fails', () => {
    chainCalls[0].error(new Error('500'));
    expect(component.loading).toBe(false);
    expect(component.error).not.toBe('');
    expect(toastError).toHaveBeenCalledTimes(1);
    expect(component.rows).toEqual([]);
  });

  it('keeps the latest expiry when an earlier chain response arrives late', () => {
    chainCalls[0].next(view(22600));
    component.expiry = '2026-11-05';
    component.loadChain();
    component.expiry = '2026-10-29';
    component.loadChain();
    expect(chainCalls.length).toBe(3);

    chainCalls[2].next(view(23000)); // the newest request answers first
    chainCalls[1].next(view(24000)); // the superseded request answers late
    expect(component.rows.map((row) => row.strike)).toEqual([23000]);
    expect(component.loading).toBe(false);
  });

  it('recovers after a failed chain request when the expiry is changed', () => {
    chainCalls[0].error(new Error('500'));
    component.loadChain();
    expect(component.error).toBe('');
    expect(component.loading).toBe(true);
    chainCalls[1].next(view(22600));
    expect(component.loading).toBe(false);
    expect(component.rows.length).toBe(1);
  });

  it('drops a pending chain response when another symbol is selected', () => {
    component.selectSymbol('BANKNIFTY');
    expect(chainCalls.length).toBe(2);
    chainCalls[0].next(view(11111)); // NIFTY response, now stale
    expect(component.rows).toEqual([]);
    chainCalls[1].next(view(50000));
    expect(component.rows.map((row) => row.strike)).toEqual([50000]);
  });
});

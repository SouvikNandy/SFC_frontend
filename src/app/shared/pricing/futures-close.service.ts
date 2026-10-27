import { Injectable } from '@angular/core';
import { Observable, catchError, map, of, shareReplay, tap } from 'rxjs';

import { ApiService } from '../../core/services/api.service';
import { FuturesQuote } from './contract-iv';

/** `POST /fo/xx_close` `{ symbol, expiry }` → `data: { trade_date, close }`, the latest futures close for that expiry. */
interface FuturesCloseRequest {
    symbol: string;
    expiry: string;
}

interface FuturesCloseResponse {
    success: boolean;
    message?: string;
    data?: { trade_date?: string; close?: number };
}

/**
 * Stock-futures close for one symbol and one expiry: the underlying of that expiry's stock options.
 * No price means null (unknown expiry, API error, bad payload); callers must not substitute spot or another expiry.
 */
@Injectable({ providedIn: 'root' })
export class FuturesCloseService {
    constructor(private readonly api: ApiService) { }

    private readonly cache = new Map<string, Observable<FuturesQuote | null>>();

    getClose(symbol: string, expiry: string): Observable<FuturesQuote | null> {
        const key = `${symbol}|${expiry}`;
        const cached = this.cache.get(key);
        if (cached) return cached;
        const request$ = this.api.post<FuturesCloseResponse, FuturesCloseRequest>('/fo/xx_close', { symbol, expiry }).pipe(
            map((response): FuturesQuote | null => {
                const close = response?.success ? response.data?.close : undefined;
                if (typeof close !== 'number' || !Number.isFinite(close) || close <= 0) return null;
                return { expiry, price: close, tradeDate: response.data?.trade_date };
            }),
            catchError(() => of(null)),
            tap(quote => { if (quote === null) this.cache.delete(key); }), // only a real price is kept
            shareReplay({ bufferSize: 1, refCount: false }),
        );
        this.cache.set(key, request$);
        return request$;
    }
}

import { Injectable } from '@angular/core';
import { Observable, catchError, map, shareReplay, throwError } from 'rxjs';
import { ApiService } from '../../../core/services/api.service';
import { BlackScholesGreeks, blackScholesGreeks, normCdf, normPdf } from '../../../shared/pricing/option-pricing';
import { GreeksSymbolDetails, GreeksSymbolDetailsRequest, GreeksSymbolDetailsResponse, GreeksSymbolListResponse } from './greeks.model';

export interface GreeksInput {
    spot: number;
    strike: number;
    rate: number; // percent
    vol: number; // percent
    expiryDays: number;
    dividend: number; // percent
    minimumExpiryDays?: number;
}

@Injectable({ providedIn: 'root' })
export class GreeksCalculatorService {
    constructor(private readonly api: ApiService) { }

    private symbols$: Observable<string[]> | null = null;

    /**
     * All F&O symbols (`/fo/dd_list`), requested once and reused by every screen. A failed or unsuccessful
     * response is not kept, so the next caller requests again. Each caller receives its own array.
     */
    getSymbols(): Observable<string[]> {
        if (!this.symbols$) {
            const shared$ = this.api.get<GreeksSymbolListResponse>('/fo/dd_list').pipe(
                map(response => {
                    if (!response.success) throw new Error('Invalid symbol list response');
                    return response.data ?? response.SYMBOL_LIST ?? [];
                }),
                shareReplay({ bufferSize: 1, refCount: false }),
            );
            const current$: Observable<string[]> = shared$.pipe(
                catchError(error => {
                    if (this.symbols$ === current$) this.symbols$ = null;
                    return throwError(() => error);
                }),
            );
            this.symbols$ = current$;
        }
        return this.symbols$.pipe(map(symbols => symbols.slice()));
    }

    getSymbolDetails(request: GreeksSymbolDetailsRequest): Observable<GreeksSymbolDetails> {
        return this.api.post<GreeksSymbolDetailsResponse, GreeksSymbolDetailsRequest>('/fo/dd_symbol_details', request).pipe(
            map(response => {
                if (!response.success || !response.data) throw new Error('Invalid symbol details response');
                return response.data;
            })
        );
    }

    // All mathematics lives in shared/pricing/option-pricing.ts; these are thin wrappers for the Greeks screen.
    normCdf(x: number) { return normCdf(x); }
    normPdf(x: number) { return normPdf(x); }

    /** Black-Scholes price and Greeks from percent inputs (rate, dividend, vol) and a day count. */
    calculateAll(input: GreeksInput): BlackScholesGreeks {
        const T = Math.max(input.expiryDays, input.minimumExpiryDays ?? 0.0001) / 365;
        return blackScholesGreeks(input.spot, input.strike, input.rate / 100, input.dividend / 100, input.vol / 100, T);
    }

    fmt(n: number, d = 3) { if (!isFinite(n)) return '–'; return n.toLocaleString('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d }); }

    validateInputs(input: GreeksInput) {
        const errors: string[] = [];
        const badFields: string[] = [];
        if (!(input.spot > 0)) { errors.push('Price of the underlying must be greater than 0.'); badFields.push('spot'); }
        if (!(input.strike > 0)) { errors.push('Strike price must be greater than 0.'); badFields.push('strike'); }
        if (!(input.vol > 0)) { errors.push('Annual volatility must be greater than 0%.'); badFields.push('vol'); }
        if (!(input.expiryDays > 0)) { errors.push('Time to expiration must be at least 1 day.'); badFields.push('expiry'); }
        if (isNaN(input.rate)) { errors.push('Enter a risk-free interest rate.'); badFields.push('rate'); }
        if (isNaN(input.dividend)) { errors.push('Enter a dividend yield.'); badFields.push('dividend'); }
        return { errors, badFields };
    }
}

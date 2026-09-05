import { Injectable } from '@angular/core';
import { Observable, map } from 'rxjs';
import { ApiService } from '../../../core/services/api.service';
import { GreeksSymbolDetails, GreeksSymbolDetailsRequest, GreeksSymbolDetailsResponse, GreeksSymbolListResponse } from './greeks.model';

export interface GreeksInput {
    spot: number;
    strike: number;
    rate: number; // percent
    vol: number; // percent
    expiryDays: number;
    dividend: number; // percent
}

@Injectable({ providedIn: 'root' })
export class GreeksCalculatorService {
    constructor(private readonly api: ApiService) { }

    getSymbols(): Observable<string[]> {
        return this.api.get<GreeksSymbolListResponse>('/fo/dd_list').pipe(
            map(response => {
                if (!response.success) throw new Error('Invalid symbol list response');
                return response.data ?? response.SYMBOL_LIST ?? [];
            })
        );
    }

    getSymbolDetails(request: GreeksSymbolDetailsRequest): Observable<GreeksSymbolDetails> {
        return this.api.post<GreeksSymbolDetailsResponse, GreeksSymbolDetailsRequest>('/fo/dd_symbol_details', request).pipe(
            map(response => {
                if (!response.success || !response.data) throw new Error('Invalid symbol details response');
                return response.data;
            })
        );
    }

    // from prototype: erf-based normCdf and normPdf
    private erf(x: number) {
        const sign = x < 0 ? -1 : 1;
        x = Math.abs(x);
        const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741, a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
        const t = 1 / (1 + p * x);
        const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
        return sign * y;
    }

    normCdf(x: number) { return 0.5 * (1 + this.erf(x / Math.SQRT2)); }
    normPdf(x: number) { return Math.exp(-x * x / 2) / Math.sqrt(2 * Math.PI); }

    bsPrice(type: 'call' | 'put', S: number, K: number, r: number, q: number, T: number, sigma: number) {
        const d1 = (Math.log(S / K) + (r - q + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
        const d2 = d1 - sigma * Math.sqrt(T);
        const eqT = Math.exp(-q * T), erT = Math.exp(-r * T);
        if (type === 'call') {
            return S * eqT * this.normCdf(d1) - K * erT * this.normCdf(d2);
        }
        return K * erT * this.normCdf(-d2) - S * eqT * this.normCdf(-d1);
    }

    bsVega(S: number, K: number, r: number, q: number, T: number, sigma: number) {
        const d1 = (Math.log(S / K) + (r - q + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
        return S * Math.exp(-q * T) * this.normPdf(d1) * Math.sqrt(T);
    }

    impliedVolatility(type: 'call' | 'put', marketPrice: number, S: number, K: number, r: number, q: number, T: number) {
        let sigma = 0.25;
        for (let i = 0; i < 60; i++) {
            const price = this.bsPrice(type, S, K, r, q, T, sigma);
            const diff = price - marketPrice;
            if (Math.abs(diff) < 1e-5) return sigma;
            const vega = this.bsVega(S, K, r, q, T, sigma);
            if (vega < 1e-8) break;
            let next = sigma - diff / vega;
            if (!isFinite(next) || next <= 0.0005 || next > 5) break;
            sigma = next;
        }
        let lo = 0.0005, hi = 5;
        for (let i = 0; i < 100; i++) {
            const mid = (lo + hi) / 2;
            const price = this.bsPrice(type, S, K, r, q, T, mid);
            if (price > marketPrice) hi = mid; else lo = mid;
        }
        return (lo + hi) / 2;
    }

    // Black-Scholes greeks matching prototype formulas
    calculateAll(input: GreeksInput) {
        const S = input.spot;
        const K = input.strike;
        const r = input.rate / 100;
        const q = input.dividend / 100;
        const sigma = input.vol / 100;
        const days = input.expiryDays;
        const T = Math.max(days, 0.0001) / 365;

        const d1 = (Math.log(S / K) + (r - q + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
        const d2 = d1 - sigma * Math.sqrt(T);

        const Nd1 = this.normCdf(d1), Nd2 = this.normCdf(d2);
        const Nnd1 = this.normCdf(-d1), Nnd2 = this.normCdf(-d2);
        const nd1 = this.normPdf(d1);

        const eqT = Math.exp(-q * T);
        const erT = Math.exp(-r * T);

        const callPrice = S * eqT * Nd1 - K * erT * Nd2;
        const putPrice = K * erT * Nnd2 - S * eqT * Nnd1;

        const deltaCall = eqT * Nd1;
        const deltaPut = eqT * (Nd1 - 1);

        const gamma = (eqT * nd1) / (S * sigma * Math.sqrt(T));

        const thetaCallYear = -(S * eqT * nd1 * sigma) / (2 * Math.sqrt(T)) - r * K * erT * Nd2 + q * S * eqT * Nd1;
        const thetaPutYear = -(S * eqT * nd1 * sigma) / (2 * Math.sqrt(T)) + r * K * erT * Nnd2 - q * S * eqT * Nnd1;
        const thetaCall = thetaCallYear / 365;
        const thetaPut = thetaPutYear / 365;

        const vega = S * eqT * nd1 * Math.sqrt(T) / 100;

        const rhoCall = K * T * erT * Nd2 / 100;
        const rhoPut = -K * T * erT * Nnd2 / 100;

        return {
            callPrice, putPrice,
            deltaCall, deltaPut,
            gamma,
            thetaCall, thetaPut,
            vega,
            rhoCall, rhoPut,
            nd1, d1, d2
        };
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

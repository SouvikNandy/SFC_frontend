import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { GreeksCalculatorService } from '../greeks/greeks-calculator.service';
import { GreeksSymbolDetails, GreeksSymbolDetailsRequest } from '../greeks/greeks.model';
import { ImpliedVolatilityOptionType, ImpliedVolatilityResult, ImpliedVolatilityTraceStep } from './implied-volatility.model';

const DAYS_YEAR = 365;
const TICK = 0.05;
const SIGMA_MIN = 0.0001;
const SIGMA_MAX = 5;
const MAX_NEWTON = 60;
const PRICE_TOL = 1e-8;
const VEGA_FLOOR = 1e-8;
const IV_PTS_PER_TICK_WARN = 0.5;

@Injectable({ providedIn: 'root' })
export class ImpliedVolatilityService {
    constructor(private readonly greeks: GreeksCalculatorService) { }

    getSymbols(): Observable<string[]> {
        return this.greeks.getSymbols();
    }

    getSymbolDetails(request: GreeksSymbolDetailsRequest): Observable<GreeksSymbolDetails> {
        return this.greeks.getSymbolDetails(request);
    }

    solve(
        side: ImpliedVolatilityOptionType,
        marketPrice: number,
        underlying: number,
        strike: number,
        days: number,
        ratePct: number,
        trace = true,
    ): ImpliedVolatilityResult {
        const validation = this.validate(marketPrice, underlying, strike, days, ratePct);
        if (validation.errors.length) {
            return { ok: false, status: 'invalid_input', message: validation.errors[0], badFields: validation.badFields, trace: [] };
        }

        const rate = ratePct / 100;
        const time = days / DAYS_YEAR;
        const bounds = this.priceBounds(side, underlying, strike, rate, time);
        if (marketPrice < bounds[0] - 1e-9) {
            return {
                ok: false,
                status: 'below_intrinsic',
                bounds,
                trace: [],
                message: `Price ${marketPrice.toFixed(2)} is below the no-arbitrage floor ${bounds[0].toFixed(2)} (discounted intrinsic value). No volatility can produce it.`,
            };
        }
        if (marketPrice > bounds[1] + 1e-9) {
            return {
                ok: false,
                status: 'above_maximum',
                bounds,
                trace: [],
                message: `Price ${marketPrice.toFixed(2)} exceeds the theoretical maximum ${bounds[1].toFixed(2)}. No volatility can produce it.`,
            };
        }

        const steps: ImpliedVolatilityTraceStep[] = [];
        let sigma = 0.25;
        let method: 'newton' | 'bisection' | null = null;
        let iterations = 0;
        for (let iteration = 1; iteration <= MAX_NEWTON; iteration += 1) {
            const price = this.bsPrice(side, underlying, strike, rate, time, sigma);
            const residual = price - marketPrice;
            const vega = this.bsVega(underlying, strike, rate, time, sigma);
            if (trace) steps.push({ iteration, sigma, price, residual, vega });
            if (Math.abs(residual) < PRICE_TOL) {
                method = 'newton';
                iterations = iteration;
                break;
            }
            if (vega < VEGA_FLOOR) break;
            const next = sigma - residual / vega;
            if (!Number.isFinite(next) || next <= SIGMA_MIN || next > SIGMA_MAX) break;
            sigma = next;
        }

        if (!method) {
            let low = SIGMA_MIN;
            let high = SIGMA_MAX;
            let iteration = 0;
            for (iteration = 1; iteration <= 200; iteration += 1) {
                const mid = (low + high) / 2;
                const price = this.bsPrice(side, underlying, strike, rate, time, mid);
                if (trace && iteration % 8 === 0) {
                    steps.push({ iteration: MAX_NEWTON + iteration, sigma: mid, price, residual: price - marketPrice, vega: this.bsVega(underlying, strike, rate, time, mid) });
                }
                if (price > marketPrice) high = mid;
                else low = mid;
                if (high - low < 1e-10) break;
            }
            sigma = (low + high) / 2;
            method = 'bisection';
            iterations = iteration;
        }

        const theoretical = this.bsPrice(side, underlying, strike, rate, time, sigma);
        const residual = theoretical - marketPrice;
        const vega = this.bsVega(underlying, strike, rate, time, sigma);
        const ivPerTick = vega > VEGA_FLOOR ? TICK / vega * 100 : Infinity;
        let status: ImpliedVolatilityResult['status'] = 'ok';
        let message = `Converged by ${method} in ${iterations} iteration${iterations === 1 ? '' : 's'}.`;
        if (ivPerTick > IV_PTS_PER_TICK_WARN) {
            status = 'low_vega';
            const shown = ivPerTick > 100 ? 'more than 100' : ivPerTick.toFixed(2);
            message = `Converged, but one tick of price moves this IV by ${shown} volatility points. Treat the number as indicative only.`;
        } else if (Math.abs(residual) > 1e-4) {
            status = 'poor_fit';
            message = `Best fit leaves a residual of ${residual.toFixed(4)}; treat with caution.`;
        }

        return { ok: true, status, message, method, iterations, ivPct: sigma * 100, theoretical, residual, vega, ivPerTick, bounds, trace: steps };
    }

    bsPrice(side: ImpliedVolatilityOptionType, underlying: number, strike: number, rate: number, time: number, sigma: number): number {
        if (time <= 0 || sigma <= 0) return side === 'call' ? Math.max(underlying - strike, 0) : Math.max(strike - underlying, 0);
        const rootTime = Math.sqrt(time);
        const d1 = (Math.log(underlying / strike) + (rate + 0.5 * sigma * sigma) * time) / (sigma * rootTime);
        const d2 = d1 - sigma * rootTime;
        const discount = Math.exp(-rate * time);
        return side === 'call'
            ? underlying * this.normCdf(d1) - strike * discount * this.normCdf(d2)
            : strike * discount * this.normCdf(-d2) - underlying * this.normCdf(-d1);
    }

    bsVega(underlying: number, strike: number, rate: number, time: number, sigma: number): number {
        if (time <= 0 || sigma <= 0) return 0;
        const d1 = (Math.log(underlying / strike) + (rate + 0.5 * sigma * sigma) * time) / (sigma * Math.sqrt(time));
        return underlying * this.normPdf(d1) * Math.sqrt(time);
    }

    private priceBounds(side: ImpliedVolatilityOptionType, underlying: number, strike: number, rate: number, time: number): [number, number] {
        const discountedStrike = strike * Math.exp(-rate * time);
        return side === 'call'
            ? [Math.max(underlying - discountedStrike, 0), underlying]
            : [Math.max(discountedStrike - underlying, 0), discountedStrike];
    }

    private validate(marketPrice: number, underlying: number, strike: number, days: number, rate: number): { errors: string[]; badFields: string[] } {
        const errors: string[] = [];
        const badFields: string[] = [];
        if (!(marketPrice > 0)) { errors.push('Market price must be greater than 0.'); badFields.push('marketPrice'); }
        if (!(underlying > 0)) { errors.push('Underlying price must be greater than 0.'); badFields.push('underlying'); }
        if (!(strike > 0)) { errors.push('Strike price must be greater than 0.'); badFields.push('strike'); }
        if (!(days > 0)) { errors.push('Days to expiry must be at least 1.'); badFields.push('expiry'); }
        if (!Number.isFinite(rate)) { errors.push('Enter an interest rate.'); badFields.push('rate'); }
        return { errors, badFields };
    }

    private normCdf(value: number): number { return 0.5 * (1 + this.erf(value / Math.SQRT2)); }
    private normPdf(value: number): number { return Math.exp(-value * value / 2) / Math.sqrt(2 * Math.PI); }

    private erf(value: number): number {
        const sign = value < 0 ? -1 : 1;
        const absolute = Math.abs(value);
        const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741, a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
        const t = 1 / (1 + p * absolute);
        return sign * (1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-absolute * absolute));
    }
}

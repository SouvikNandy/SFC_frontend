import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { bsPrice, bsVega, priceBounds, solveImpliedVolatility } from '../../../shared/pricing/option-pricing';
import { GreeksCalculatorService } from '../greeks/greeks-calculator.service';
import { GreeksSymbolDetails, GreeksSymbolDetailsRequest } from '../greeks/greeks.model';
import { ImpliedVolatilityOptionType, ImpliedVolatilityResult, ImpliedVolatilityTraceStep } from './implied-volatility.model';

const DAYS_YEAR = 365;
const TICK = 0.05;
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
        dividendPct: number,
        trace = true,
    ): ImpliedVolatilityResult {
        const validation = this.validate(marketPrice, underlying, strike, days, ratePct, dividendPct);
        if (validation.errors.length) {
            return { ok: false, status: 'invalid_input', message: validation.errors[0], badFields: validation.badFields, trace: [] };
        }

        const rate = ratePct / 100;
        const dividend = dividendPct / 100;
        const time = days / DAYS_YEAR;
        const bounds = priceBounds(side, underlying, strike, rate, dividend, time);
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

        const solved = solveImpliedVolatility(side, marketPrice, underlying, strike, rate, dividend, time, trace);
        const steps: ImpliedVolatilityTraceStep[] = solved.steps;
        const sigma = solved.sigma;
        const method = solved.method;
        const iterations = solved.iterations;

        const theoretical = this.bsPrice(side, underlying, strike, rate, dividend, time, sigma);
        const residual = theoretical - marketPrice;
        const vega = this.bsVega(underlying, strike, rate, dividend, time, sigma);
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

    /** Black-Scholes-Merton price (rate and dividend yield as decimals), for this screen's chart and fit check. */
    bsPrice(side: ImpliedVolatilityOptionType, underlying: number, strike: number, rate: number, dividend: number, time: number, sigma: number): number {
        return bsPrice(side, underlying, strike, rate, dividend, time, sigma);
    }

    bsVega(underlying: number, strike: number, rate: number, dividend: number, time: number, sigma: number): number {
        return bsVega(underlying, strike, rate, dividend, time, sigma);
    }

    private validate(marketPrice: number, underlying: number, strike: number, days: number, rate: number, dividend: number): { errors: string[]; badFields: string[] } {
        const errors: string[] = [];
        const badFields: string[] = [];
        if (!(marketPrice > 0)) { errors.push('Market price must be greater than 0.'); badFields.push('marketPrice'); }
        if (!(underlying > 0)) { errors.push('Underlying price must be greater than 0.'); badFields.push('underlying'); }
        if (!(strike > 0)) { errors.push('Strike price must be greater than 0.'); badFields.push('strike'); }
        if (!(days > 0)) { errors.push('Days to expiry must be at least 1.'); badFields.push('expiry'); }
        if (!Number.isFinite(rate)) { errors.push('Enter an interest rate.'); badFields.push('rate'); }
        if (!Number.isFinite(dividend)) { errors.push('Enter a dividend yield.'); badFields.push('dividend'); }
        return { errors, badFields };
    }
}

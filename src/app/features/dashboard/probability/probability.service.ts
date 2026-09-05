import { Injectable } from '@angular/core';
import { Observable, map } from 'rxjs';
import { ApiService } from '../../../core/services/api.service';
import { GreeksCalculatorService } from '../greeks/greeks-calculator.service';
import { GreeksSymbolDetails, GreeksSymbolDetailsRequest } from '../greeks/greeks.model';
import { ProbabilityApiData, ProbabilityRequest, ProbabilityResponse } from './probability.model';

@Injectable({ providedIn: 'root' })
export class ProbabilityService {
    constructor(private readonly greeks: GreeksCalculatorService, private readonly api: ApiService) { }

    getSymbols(): Observable<string[]> {
        return this.greeks.getSymbols();
    }

    getSymbolDetails(request: GreeksSymbolDetailsRequest): Observable<GreeksSymbolDetails> {
        return this.greeks.getSymbolDetails(request);
    }

    calculate(request: ProbabilityRequest): Observable<ProbabilityResponse['data']> {
        return this.api.post<ProbabilityResponse, ProbabilityRequest>('/tools/probability', request).pipe(
            map(response => {
                if (!response.success || !response.data) throw new Error('Invalid probability response');
                return response.data;
            })
        );
    }

    calculateCustom(request: ProbabilityRequest): ProbabilityApiData {
        const timeYears = request.expiry / 365;
        const sigma = request.iv / 100;
        const logDrift = -0.5 * sigma * sigma;
        const standardDeviation = sigma * Math.sqrt(timeYears);
        const d2 = (Math.log(request.spot / request.target) + logDrift * timeYears) / standardDeviation;
        const direction = request.target < request.spot ? 'below' : 'above';
        const probabilityAbove = this.normCdf(d2) * 100;
        const probabilityBelow = (1 - this.normCdf(d2)) * 100;
        const probabilityTouch = this.touchProbability(request.spot, request.target, logDrift, sigma, timeYears) * 100;
        const curve = Array.from({ length: 161 }, (_, index) => {
            const centre = Math.log(request.spot) + logDrift * timeYears;
            const low = centre - 4 * standardDeviation;
            const high = centre + 4 * standardDeviation;
            const logPrice = low + (high - low) * index / 160;
            const price = Math.exp(logPrice);
            const density = this.normPdf((logPrice - centre) / standardDeviation) / (price * standardDeviation);
            return { price, density };
        });
        return {
            inputs: { spot: request.spot, target: request.target, vol: request.iv, expiry: request.expiry, rate: 0, dividend: 0, day_count: 365, symbol: 'CUSTOM' },
            results: {
                direction,
                probTouchPct: probabilityTouch,
                probExpireBeyondPct: direction === 'below' ? probabilityBelow : probabilityAbove,
                probExpireAbovePct: probabilityAbove,
                probExpireBelowPct: probabilityBelow,
                expectedPrice: request.spot,
                oneSdUpper: request.spot * Math.exp(standardDeviation),
                oneSdLower: request.spot * Math.exp(-standardDeviation),
                movePct: (request.target / request.spot - 1) * 100,
                moveSd: Math.abs(Math.log(request.target / request.spot)) / standardDeviation,
                d2,
                logDrift,
                timeYears,
            },
            charts: { curve, timeYears },
        };
    }

    private touchProbability(spot: number, target: number, drift: number, sigma: number, time: number): number {
        if (target === spot) return 1;
        const boundary = Math.log(target / spot);
        const scale = Math.exp(Math.min(2 * drift * boundary / (sigma * sigma), 700));
        const rootTime = sigma * Math.sqrt(time);
        const probability = target > spot
            ? this.normCdf((drift * time - boundary) / rootTime) + scale * this.normCdf((-boundary - drift * time) / rootTime)
            : this.normCdf((boundary - drift * time) / rootTime) + scale * this.normCdf((boundary + drift * time) / rootTime);
        return Math.max(0, Math.min(1, probability));
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

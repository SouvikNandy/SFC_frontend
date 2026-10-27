import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { normCdf, normPdf } from '../../../shared/pricing/option-pricing';
import { GreeksCalculatorService } from '../greeks/greeks-calculator.service';
import { GreeksSymbolDetails, GreeksSymbolDetailsRequest } from '../greeks/greeks.model';
import { ProbabilityApiData, ProbabilityRequest } from './probability.model';

@Injectable({ providedIn: 'root' })
export class ProbabilityService {
    constructor(private readonly greeks: GreeksCalculatorService) { }

    getSymbols(): Observable<string[]> {
        return this.greeks.getSymbols();
    }

    getSymbolDetails(request: GreeksSymbolDetailsRequest): Observable<GreeksSymbolDetails> {
        return this.greeks.getSymbolDetails(request);
    }

    /**
     * Terminal-price distribution and touch/expiry probabilities for `request.vol` (percent), computed here with the
     * shared pricing maths: zero drift beyond the log-normal correction (rate 0, dividend 0, 365-day year), as the
     * backend result it replaces. The backend `/tools/probability` ignores the volatility it is sent, so it is not used.
     */
    calculate(request: ProbabilityRequest): ProbabilityApiData {
        if (!(request.expiry > 0) || !(request.vol > 0) || !(request.spot > 0) || !(request.target > 0)) {
            throw new Error('Spot, target, volatility and days to expiry must all be greater than 0.');
        }
        const timeYears = request.expiry / 365;
        const sigma = request.vol / 100;
        const logDrift = -0.5 * sigma * sigma;
        const standardDeviation = sigma * Math.sqrt(timeYears);
        const d2 = (Math.log(request.spot / request.target) + logDrift * timeYears) / standardDeviation;
        const direction = request.target < request.spot ? 'below' : 'above';
        const probabilityAbove = normCdf(d2) * 100;
        const probabilityBelow = (1 - normCdf(d2)) * 100;
        const probabilityTouch = this.touchProbability(request.spot, request.target, logDrift, sigma, timeYears) * 100;
        const curve = Array.from({ length: 161 }, (_, index) => {
            const centre = Math.log(request.spot) + logDrift * timeYears;
            const low = centre - 4 * standardDeviation;
            const high = centre + 4 * standardDeviation;
            const logPrice = low + (high - low) * index / 160;
            const price = Math.exp(logPrice);
            const density = normPdf((logPrice - centre) / standardDeviation) / (price * standardDeviation);
            return { price, density };
        });
        return {
            inputs: { spot: request.spot, target: request.target, vol: request.vol, expiry: request.expiry, rate: 0, dividend: 0, day_count: 365, symbol: request.symbol },
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
            ? normCdf((drift * time - boundary) / rootTime) + scale * normCdf((-boundary - drift * time) / rootTime)
            : normCdf((boundary - drift * time) / rootTime) + scale * normCdf((boundary + drift * time) / rootTime);
        return Math.max(0, Math.min(1, probability));
    }
}

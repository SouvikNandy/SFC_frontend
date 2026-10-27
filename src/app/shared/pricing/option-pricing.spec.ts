import { describe, expect, it } from 'vitest';

import {
    MARKET_PARAMS,
    blackScholesGreeks,
    bsPrice,
    bsVega,
    intrinsicValue,
    marketParams,
    normCdf,
    priceBounds,
    solveImpliedVolatility,
} from './option-pricing';

/*
 * Golden values were recorded from the formulas that existed in GreeksCalculatorService and
 * ImpliedVolatilityService before they were consolidated, so this module is a numerical no-op for them.
 */
const S = 22600, K = 22900, R = 0.055, Q = 0.01, T = 6 / 365, SIGMA = 0.17;
const close = (actual: number, expected: number, digits = 9) => expect(actual).toBeCloseTo(expected, digits);

describe('normCdf', () => {
    it('matches known values', () => {
        close(normCdf(0), 0.5, 7);
        close(normCdf(1.96), 0.9750021, 6);
        close(normCdf(-1.96), 0.0249979, 6);
        expect(normCdf(10)).toBeCloseTo(1, 9);
        expect(normCdf(-10)).toBeCloseTo(0, 9);
    });
});

describe('bsPrice / blackScholesGreeks (golden values)', () => {
    it('prices the call and the put', () => {
        close(bsPrice('call', S, K, R, Q, T, SIGMA), 87.58938247126571);
        close(bsPrice('put', S, K, R, Q, T, SIGMA), 370.60939261601015);
    });

    it('returns every Greek unchanged', () => {
        const g = blackScholesGreeks(S, K, R, Q, SIGMA, T);
        close(g.callPrice, 87.58938247126571);
        close(g.putPrice, 370.60939261601015);
        close(g.deltaCall, 0.2876306446616175);
        close(g.deltaPut, -0.7122049852869762);
        close(g.gamma, 0.000692166693601037, 12);
        close(g.thetaCall, -14.784182938923054);
        close(g.thetaPut, -11.955692702715709);
        close(g.vega, 9.879498126907919);
        close(g.rhoCall, 1.0541692909941847);
        close(g.rhoPut, -2.7068123934413704);
        close(g.nd1, 0.3410111992251172, 12);
        close(g.d1, -0.5601810898822767, 12);
        close(g.d2, -0.5819771558839818, 12);
    });

    it('satisfies put-call parity with a dividend yield', () => {
        const call = bsPrice('call', S, K, R, Q, T, SIGMA), put = bsPrice('put', S, K, R, Q, T, SIGMA);
        close(call - put, S * Math.exp(-Q * T) - K * Math.exp(-R * T), 8);
    });

    it('prices a contract at expiry (T = 0) at intrinsic value, and never returns NaN', () => {
        expect(bsPrice('call', 100, 90, 0.055, 0.01, 0, 0.2)).toBe(10);
        expect(bsPrice('put', 100, 90, 0.055, 0.01, 0, 0.2)).toBe(0);
        expect(bsPrice('put', 100, 110, 0.055, 0.01, 0, 0.2)).toBe(10);
        expect(bsPrice('call', 100, 110, 0.055, 0.01, -1, 0.2)).toBe(0);
        expect(bsPrice('call', 100, 90, 0.055, 0.01, 0.1, 0)).toBe(10); // zero volatility
        expect(bsVega(100, 100, 0.055, 0.01, 0, 0.2)).toBe(0);
        expect(intrinsicValue('call', 100, 120)).toBe(0);
    });
});

describe('solveImpliedVolatility (golden values from the old solver)', () => {
    const solve = (side: 'call' | 'put', price: number, s: number, k: number, t: number) => solveImpliedVolatility(side, price, s, k, R, 0, t);

    it('converges by Newton on ordinary contracts', () => {
        const call = solve('call', 124.4, 22600, 22600, 6 / 365);
        close(call.sigma, 0.09857424390870352, 12);
        expect(call.method).toBe('newton');
        expect(call.iterations).toBe(4);
        close(solve('put', 150.7, 22600, 22600, 6 / 365).sigma, 0.13908625578497674, 12);
        close(solve('call', 0.05, 22600, 24000, 6 / 365).sigma, 0.1393025160101983, 12);
        close(solve('put', 310.25, 22600, 21500, 90 / 365).sigma, 0.1903957834299286, 12);
    });

    it('falls back to bisection when Newton cannot converge', () => {
        const call = solve('call', 0.05, 22600, 26000, 3 / 365);
        close(call.sigma, 0.4366940866432379, 9);
        expect(call.method).toBe('bisection');
        expect(call.iterations).toBe(36);
        close(solve('put', 0.05, 22600, 19000, 3 / 365).sigma, 0.5415872007280582, 9);
    });

    it('round-trips: pricing at the solved IV reproduces the market price, for calls and puts and with a dividend yield', () => {
        for (const [side, strike] of [['call', 22000], ['call', 23200], ['put', 22000], ['put', 23200]] as const) {
            const price = bsPrice(side, S, strike, R, Q, 20 / 365, 0.21);
            const { sigma } = solveImpliedVolatility(side, price, S, strike, R, Q, 20 / 365);
            close(sigma, 0.21, 6);
        }
    });

    it('records a trace only when asked', () => {
        expect(solve('call', 124.4, 22600, 22600, 6 / 365).steps).toEqual([]);
        const traced = solveImpliedVolatility('call', 124.4, 22600, 22600, R, 0, 6 / 365, true);
        expect(traced.steps.length).toBe(4);
        expect(traced.steps[0]).toMatchObject({ iteration: 1, sigma: 0.25 });
    });
});

describe('zero time to expiry', () => {
    it('gives intrinsic prices and finite, degenerate Greeks instead of dividing by zero', () => {
        for (const time of [0, -0.01]) {
            const itm = blackScholesGreeks(100, 90, R, Q, 0.2, time);
            expect(itm).toMatchObject({ callPrice: 10, putPrice: 0, deltaCall: 1, deltaPut: 0, gamma: 0, thetaCall: 0, vega: 0, rhoCall: 0 });
            const otm = blackScholesGreeks(100, 110, R, Q, 0.2, time);
            expect(otm).toMatchObject({ callPrice: 0, putPrice: 10, deltaCall: 0, deltaPut: -1 });
            for (const value of [...Object.values(itm), ...Object.values(otm)]) expect(Number.isNaN(value)).toBe(false);
        }
        expect(Number.isNaN(blackScholesGreeks(100, 100, R, Q, 0.2, 0).d1)).toBe(false);
        expect(normCdf(blackScholesGreeks(100, 90, R, Q, 0.2, 0).d2)).toBeCloseTo(1, 6);
    });

    it('also degenerates safely for zero volatility', () => {
        expect(blackScholesGreeks(100, 90, R, Q, 0, 0.1)).toMatchObject({ callPrice: 10, gamma: 0, vega: 0 });
    });

    it('cannot solve an implied volatility without time, and says so with NaN, not a made-up number', () => {
        expect(solveImpliedVolatility('call', 10, 100, 90, R, Q, 0).sigma).toBeNaN();
        expect(solveImpliedVolatility('call', 0, 100, 90, R, Q, 0.1).sigma).toBeNaN();
    });
});

describe('priceBounds', () => {
    it('gives the discounted-intrinsic floor and the theoretical ceiling', () => {
        const [callFloor, callCeiling] = priceBounds('call', 100, 90, 0.05, 0, 1);
        close(callFloor, 100 - 90 * Math.exp(-0.05), 10);
        expect(callCeiling).toBe(100);
        const [putFloor, putCeiling] = priceBounds('put', 100, 120, 0.05, 0.02, 1);
        close(putFloor, 120 * Math.exp(-0.05) - 100 * Math.exp(-0.02), 10);
        close(putCeiling, 120 * Math.exp(-0.05), 10);
        expect(priceBounds('put', 100, 90, 0, 0, 1)[0]).toBe(0);
    });
});

describe('market parameters', () => {
    it('are the approved client values', () => {
        expect(marketParams('index')).toEqual({ riskFreeRate: 0.055, dividendYield: 0.01 });
        expect(marketParams('stock')).toEqual({ riskFreeRate: 0.0001, dividendYield: 0 });
        expect(MARKET_PARAMS.index).toBe(marketParams('index'));
    });
});

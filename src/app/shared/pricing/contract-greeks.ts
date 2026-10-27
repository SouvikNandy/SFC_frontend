import { PricingInputs, solveIvInContext } from './contract-iv';
import { OptionSide, blackScholesGreeks } from './option-pricing';

/** IV and Greeks of one option contract, from its own EOD close. `failure` says why they are missing; never a made-up number. */
export interface ContractGreeks {
    /** Implied volatility, percent; null when it cannot be solved. */
    ivPct: number | null;
    delta: number | null;
    gamma: number | null;
    /** Per calendar day. */
    theta: number | null;
    /** Per 1 volatility point. */
    vega: number | null;
    /** Per 1 point of interest rate. */
    rho: number | null;
    failure?: string;
}

const NONE = (failure: string): ContractGreeks => ({ ivPct: null, delta: null, gamma: null, theta: null, vega: null, rho: null, failure });

/**
 * The single place a contract's IV and Greeks are computed for a given underlying: the IV is solved from the contract's
 * own EOD close (call and put separately), and the Greeks are evaluated at that IV with the same rate and dividend.
 * `days` is calendar days to expiry; a contract with no time left (0) has no IV and therefore no Greeks.
 */
export function contractGreeks(
    inputs: PricingInputs,
    contract: { side: OptionSide; strike: number; days: number; close: number | null | undefined },
): ContractGreeks {
    const solved = solveIvInContext(inputs, contract);
    if (!solved.ok) return NONE(solved.reason);
    const greeks = blackScholesGreeks(inputs.underlying, contract.strike, inputs.riskFreeRate, inputs.dividendYield, solved.ivPct / 100, contract.days / 365);
    const call = contract.side === 'call';
    return {
        ivPct: solved.ivPct,
        delta: call ? greeks.deltaCall : greeks.deltaPut,
        gamma: greeks.gamma,
        theta: call ? greeks.thetaCall : greeks.thetaPut,
        vega: greeks.vega,
        rho: call ? greeks.rhoCall : greeks.rhoPut,
    };
}

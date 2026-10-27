import { Injectable } from '@angular/core';
import { Observable, map, of, switchMap } from 'rxjs';

import { FuturesQuote, PricingInputs, resolveUnderlying } from './contract-iv';
import { FuturesCloseService } from './futures-close.service';
import { InstrumentKindService } from './instrument-kind.service';
import { InstrumentKind, marketParams } from './option-pricing';

export type PricingFailure = 'missing-instrument-type' | 'missing-spot-price' | 'missing-futures-price' | 'futures-expiry-mismatch';

export type PricingContext =
    | ({ ok: true; kind: InstrumentKind; futures: FuturesQuote | null } & PricingInputs)
    | { ok: false; reason: PricingFailure };

/** What the screen shows when the inputs for an option's volatility are not available. Never a number. */
export function describePricingFailure(reason: string): string {
    switch (reason) {
        case 'missing-instrument-type': return 'The instrument type (index or stock) is unavailable, so implied volatility cannot be calculated.';
        case 'missing-spot-price': return 'The spot index value is unavailable, so implied volatility cannot be calculated.';
        case 'missing-futures-price': return 'The futures close for this expiry is unavailable, so implied volatility cannot be calculated.';
        case 'futures-expiry-mismatch': return 'The futures close does not belong to this expiry, so implied volatility cannot be calculated.';
        case 'missing-close-price': return 'No Close (EOD) price for this contract.';
        case 'no-time-to-expiry': return 'Implied volatility needs time to expiry; this contract expires today.';
        case 'invalid-strike': return 'Invalid strike.';
        case 'price-outside-bounds': return 'The Close (EOD) price is outside what any volatility can produce (below the no-arbitrage floor).';
        default: return 'Implied volatility cannot be calculated.';
    }
}

/**
 * The approved pricing inputs for one option expiry:
 *  - index options: the spot index value (`dd_symbol_details.underlying`);
 *  - stock options: the futures close for the SAME expiry (`/fo/xx_close`), never spot and never another expiry;
 *  - rate and dividend from the instrument type (`/fo/dd_list_v2`).
 */
@Injectable({ providedIn: 'root' })
export class PricingContextService {
    constructor(private readonly kinds: InstrumentKindService, private readonly futures: FuturesCloseService) { }

    resolve(symbol: string, expiry: string, spot: number | null | undefined): Observable<PricingContext> {
        return this.kinds.kindOf(symbol).pipe(
            switchMap(kind => (kind === 'stock' ? this.futures.getClose(symbol, expiry) : of(null)).pipe(
                map((quote): PricingContext => {
                    const underlying = resolveUnderlying(kind, { spot, futures: quote, optionExpiry: expiry });
                    if (!underlying.ok) return underlying;
                    const { riskFreeRate, dividendYield } = marketParams(underlying.kind);
                    return { ok: true, kind: underlying.kind, underlying: underlying.underlying, riskFreeRate, dividendYield, futures: quote };
                }),
            )),
        );
    }
}

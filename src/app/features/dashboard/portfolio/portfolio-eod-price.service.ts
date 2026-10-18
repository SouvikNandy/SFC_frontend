import { Injectable, inject } from '@angular/core';
import { Observable, catchError, forkJoin, from, map, mergeMap, of, shareReplay, toArray } from 'rxjs';
import { EodRequest } from '../eod/eod.model';
import { readEodPage } from '../eod/eod-rows.util';
import { EodService } from '../eod/eod.service';
import { PortfolioPosition } from './models/portfolio.model';
import { todayIso } from './portfolio-dates';
import { EOD_LOOKBACK_DAYS, EodQuote, contractKey, needsEodPrice, nearestMonthlyExpiry, pickLatestClose } from './portfolio-eod-price';
import { amount } from './portfolio-format';
import { PortfolioMarketService } from './portfolio-market.service';

/** An EOD close changes once a day; reusing a lookup for a few minutes keeps refreshes cheap. */
const CACHE_MS = 10 * 60 * 1000;
const MAX_PARALLEL = 4;

/** The fields that identify a contract: a position, or the contract chosen in the fill form. */
export type ContractRef = Pick<PortfolioPosition, 'segment' | 'symbol' | 'type' | 'strike' | 'expiry_date'>;

/**
 * Latest EOD close per open contract from the existing `/fo/eod` API, for positions the Portfolio API could not
 * price (`cmp: null`).
 *
 * Options are matched on the exact symbol, CE/PE, strike and expiry. `/fo/eod` ignores `expiry` for futures and its rows
 * carry no expiry (verified live), so the futures series is the one contract the backend serves, the nearest expiry.
 * A futures position is priced only when its expiry is the nearest monthly expiry on that bar's date; otherwise it
 * stays unpriced rather than borrowing another contract's price.
 */
@Injectable({ providedIn: 'root' })
export class PortfolioEodPriceService {
    private readonly eod = inject(EodService);
    private readonly market = inject(PortfolioMarketService);
    private readonly cache = new Map<string, { at: number; value$: Observable<unknown> }>();

    /** Quotes keyed by `contractKey`; contracts without a matching price are absent. Failed lookups are skipped, never guessed. */
    quotesFor(positions: readonly PortfolioPosition[]): Observable<Map<string, EodQuote>> {
        const wanted = new Map<string, PortfolioPosition>();
        for (const p of positions) if (needsEodPrice(p)) wanted.set(contractKey(p), p);
        if (!wanted.size) return of(new Map());
        return from([...wanted]).pipe(
            mergeMap(([key, p]) => this.quoteFor(p).pipe(
                map(quote => [key, quote] as const),
                catchError(() => of([key, null] as const)),
            ), MAX_PARALLEL),
            toArray(),
            map(pairs => new Map(pairs.filter((pair): pair is readonly [string, EodQuote] => pair[1] !== null))),
        );
    }

    /** Latest EOD close for one contract (also prefills the fill form); null when none matches. Errors propagate to the caller. */
    contractQuote(contract: ContractRef): Observable<EodQuote | null> {
        return this.quoteFor(contract);
    }

    private quoteFor(p: ContractRef): Observable<EodQuote | null> {
        if (p.segment === 'OPT') {
            const strike = amount(p.strike);
            if ((p.type !== 'CE' && p.type !== 'PE') || strike === null) return of(null);
            return this.latestClose({ symbol: p.symbol, option_type: p.type, strike, expiry: p.expiry_date.slice(0, 10) });
        }
        return forkJoin([
            this.latestClose({ symbol: p.symbol, option_type: 'XX' }),
            this.cached(`exp|${p.symbol}`, () => this.market.getCatalog(p.symbol).pipe(map(c => c.expiries))),
        ]).pipe(map(([quote, expiries]) =>
            quote && nearestMonthlyExpiry(expiries, quote.date) === p.expiry_date.slice(0, 10) ? quote : null));
    }

    private latestClose(contract: Pick<EodRequest, 'symbol' | 'option_type' | 'strike' | 'expiry'>): Observable<EodQuote | null> {
        const till = todayIso();
        const start = new Date();
        start.setDate(start.getDate() - EOD_LOOKBACK_DAYS);
        const key = ['eod', contract.symbol, contract.option_type, contract.strike ?? '', contract.expiry ?? '', till].join('|');
        return this.cached(key, () => this.eod.getEod({
            ...contract, date_from: todayIso(start), date_till: till, page: 1, page_size: 20,
        }).pipe(map(response => pickLatestClose(readEodPage(response.data).results))));
    }

    private cached<T>(key: string, load: () => Observable<T>): Observable<T> {
        const hit = this.cache.get(key);
        if (hit && Date.now() - hit.at < CACHE_MS) return hit.value$ as Observable<T>;
        const value$ = load().pipe(
            catchError(error => { this.cache.delete(key); throw error; }),
            shareReplay({ bufferSize: 1, refCount: false }),
        );
        this.cache.set(key, { at: Date.now(), value$ });
        return value$;
    }
}

import { Injectable } from '@angular/core';
import { Observable, catchError, map, of, shareReplay, throwError } from 'rxjs';

import { ApiService } from '../../core/services/api.service';
import { InstrumentKind } from './option-pricing';

/** `GET /fo/dd_list_v2` → `data` maps every symbol to "INDEX" or "STOCK" (the original `/fo/dd_list` is unchanged). */
interface SymbolKindsResponse {
    success: boolean;
    message?: string;
    data?: Record<string, string>;
}

/** Whether each F&O symbol is an index or a stock, from the backend; never inferred from the symbol's name. */
@Injectable({ providedIn: 'root' })
export class InstrumentKindService {
    constructor(private readonly api: ApiService) { }

    private kinds$: Observable<ReadonlyMap<string, InstrumentKind>> | null = null;

    /** Requested once and reused; a failed or unsuccessful response is not kept, so the next caller requests again. */
    getKinds(): Observable<ReadonlyMap<string, InstrumentKind>> {
        if (!this.kinds$) {
            const shared$ = this.api.get<SymbolKindsResponse>('/fo/dd_list_v2').pipe(
                map(response => {
                    if (!response?.success || !response.data || typeof response.data !== 'object') throw new Error('Invalid symbol classification response');
                    const kinds = new Map<string, InstrumentKind>();
                    for (const [symbol, kind] of Object.entries(response.data)) {
                        if (kind === 'INDEX') kinds.set(symbol, 'index');
                        else if (kind === 'STOCK') kinds.set(symbol, 'stock');
                    }
                    return kinds as ReadonlyMap<string, InstrumentKind>;
                }),
                shareReplay({ bufferSize: 1, refCount: false }),
            );
            const current$: Observable<ReadonlyMap<string, InstrumentKind>> = shared$.pipe(
                catchError(error => {
                    if (this.kinds$ === current$) this.kinds$ = null;
                    return throwError(() => error);
                }),
            );
            this.kinds$ = current$;
        }
        return this.kinds$;
    }

    /** The symbol's kind, or null when the backend does not classify it or the request failed. */
    kindOf(symbol: string): Observable<InstrumentKind | null> {
        return this.getKinds().pipe(
            map(kinds => kinds.get(symbol) ?? null),
            catchError(() => of(null)),
        );
    }
}

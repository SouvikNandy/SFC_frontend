import { Injectable } from '@angular/core';
import { Observable, map } from 'rxjs';
import { ApiService } from '../../../core/services/api.service';
import {
    HistoricalVolatilityApiRow,
    HistoricalVolatilityRequest,
    HistoricalVolatilityResponse,
    SymbolListResponse,
} from './historical-volatility.model';

@Injectable({ providedIn: 'root' })
export class HistoricalVolatilityService {
    constructor(private readonly api: ApiService) { }

    getSymbols(): Observable<string[]> {
        return this.api.get<SymbolListResponse>('/fo/dd_list').pipe(
            map(response => response.data ?? response.SYMBOL_LIST ?? [])
        );
    }

    calculate(request: HistoricalVolatilityRequest): Observable<HistoricalVolatilityApiRow[]> {
        return this.api.post<HistoricalVolatilityResponse, HistoricalVolatilityRequest>('/tools/hv', request).pipe(
            map(response => response.data ?? [])
        );
    }


}

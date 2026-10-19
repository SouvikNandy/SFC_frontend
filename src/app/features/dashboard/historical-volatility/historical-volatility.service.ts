import { Injectable } from '@angular/core';
import { Observable, map } from 'rxjs';
import { ApiService } from '../../../core/services/api.service';
import { GreeksCalculatorService } from '../greeks/greeks-calculator.service';
import {
    HistoricalVolatilityApiRow,
    HistoricalVolatilityRequest,
    HistoricalVolatilityResponse,
} from './historical-volatility.model';

@Injectable({ providedIn: 'root' })
export class HistoricalVolatilityService {
    constructor(private readonly api: ApiService, private readonly greeks: GreeksCalculatorService) { }

    /** The shared `/fo/dd_list` symbol list. */
    getSymbols(): Observable<string[]> {
        return this.greeks.getSymbols();
    }

    calculate(request: HistoricalVolatilityRequest): Observable<HistoricalVolatilityApiRow[]> {
        return this.api.post<HistoricalVolatilityResponse, HistoricalVolatilityRequest>('/tools/hv', request).pipe(
            map(response => response.data ?? [])
        );
    }
}

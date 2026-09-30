import { Injectable } from '@angular/core';
import { ApiService } from '../../../core/services/api.service';
import { GreeksCalculatorService } from '../greeks/greeks-calculator.service';
import { DdGreeksRequest, DdGreeksResponse, EodRequest, EodResponse } from './eod.model';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class EodService {
    constructor(private readonly api: ApiService, private readonly greeks: GreeksCalculatorService) { }

    /** All F&O symbols (`/fo/dd_list`), shared with the other calculator screens. */
    getSymbols(): Observable<string[]> {
        return this.greeks.getSymbols();
    }

    getEod(request: EodRequest): Observable<EodResponse> {
        return this.api.post<EodResponse, EodRequest>('/fo/eod', request);
    }

    getDdGreeks(request: DdGreeksRequest): Observable<DdGreeksResponse> {
        return this.api.post<DdGreeksResponse, DdGreeksRequest>('/fo/dd_symbol_details', request);
    }
}

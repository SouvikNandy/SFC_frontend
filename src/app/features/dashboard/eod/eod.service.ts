import { Injectable } from '@angular/core';
import { ApiService } from '../../../core/services/api.service';
import { DdGreeksRequest, DdGreeksResponse, EodRequest, EodResponse } from './eod.model';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class EodService {
    constructor(private readonly api: ApiService) { }

    getEod(request: EodRequest): Observable<EodResponse> {
        return this.api.post<EodResponse, EodRequest>('/fo/eod', request);
    }

    getDdGreeks(request: DdGreeksRequest): Observable<DdGreeksResponse> {
        return this.api.post<DdGreeksResponse, DdGreeksRequest>('/fo/dd_greeks', request);
    }
}

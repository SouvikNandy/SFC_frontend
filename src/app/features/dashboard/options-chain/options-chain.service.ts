import { Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import { ApiService } from '../../../core/services/api.service';
import { OptionsChainApiResponse, OptionsChainApiRow, OptionsChainKeyedRow, OptionsChainRequest, OptionsChainViewModel } from './models/chain.model';

@Injectable({ providedIn: 'root' })
export class OptionsChainService {
    constructor(private readonly api: ApiService) { }

    getOptionChain(request: OptionsChainRequest): Observable<OptionsChainViewModel> {
        return this.api.post<OptionsChainApiResponse, OptionsChainRequest>('/tools/options-chain', request).pipe(
            map(response => {
                if (!response.success) throw new Error(response.message || 'Invalid option-chain response');
                return this.normalize(response.data);
            })
        );
    }

    private normalize(data: OptionsChainApiResponse['data']): OptionsChainViewModel {
        const sourceRows = data?.table?.data ?? this.keyedRows(data);
        const spot = this.numberOrNull(data?.spot) ?? (sourceRows.length ? this.numberOrNull((sourceRows[0] as OptionsChainKeyedRow).underlying_price) : null);
        return {
            spot,
            spotChange: this.numberOrNull(data?.spot_chg_num),
            spotChangePercent: this.numberOrNull(data?.spot_chg_per),
            pcr: this.numberOrNull(data?.put_call_ratio),
            maxPain: this.numberOrNull(data?.max_pain),
            callOi: this.numberOrNull(data?.call_oi),
            putOi: this.numberOrNull(data?.put_oi),
            atmIv: this.numberOrNull(data?.iv_atm),
            rows: sourceRows.filter(row => this.isChainRow(row)).map(row => this.mapRow(row, spot)),
            chart: {
                callOi: data?.chart?.call_oi ?? [],
                putOi: data?.chart?.put_oi ?? [],
                callIv: data?.chart?.call_iv ?? [],
                putIv: data?.chart?.put_iv ?? [],
            },
        };
    }

    private mapRow(row: OptionsChainApiRow | OptionsChainKeyedRow, spot: number | null): OptionsChainViewModel['rows'][number] {
        const keyed = 'strike_price' in row;
        const strike = keyed ? row.strike_price : row.strike;
        return {
            strike,
            call: { oi: row.c_oi ?? 0, oiChange: row.c_oi_chg ?? 0, volume: row.c_vol ?? 0, iv: row.c_iv ?? 0, ltp: row.c_ltp ?? 0, ltpChange: row.c_ltp_chg ?? 0, delta: null, gamma: null, theta: null, vega: null, itm: spot !== null && strike < spot },
            put: { oi: row.p_oi ?? 0, oiChange: row.p_oi_chg ?? 0, volume: row.p_vol ?? 0, iv: row.p_iv ?? 0, ltp: row.p_ltp ?? 0, ltpChange: row.p_ltp_chg ?? 0, delta: null, gamma: null, theta: null, vega: null, itm: spot !== null && strike > spot },
        };
    }

    private keyedRows(data: OptionsChainApiResponse['data']): OptionsChainKeyedRow[] {
        if (!data) return [];
        const rows: OptionsChainKeyedRow[] = [];
        for (const [key, value] of Object.entries(data)) {
            if (/^\d+(?:\.\d+)?$/.test(key) && this.isKeyedRow(value)) rows.push(value);
        }
        return rows;
    }

    private isChainRow(value: OptionsChainApiRow | OptionsChainKeyedRow): boolean {
        return 'strike' in value || 'strike_price' in value;
    }

    private isKeyedRow(value: unknown): value is OptionsChainKeyedRow {
        return typeof value === 'object' && value !== null && 'strike_price' in value && 'underlying_price' in value;
    }

    private numberOrNull(value: number | null | undefined): number | null { return typeof value === 'number' && Number.isFinite(value) ? value : null; }
}

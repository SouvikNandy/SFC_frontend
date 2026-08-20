import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { Position } from './models/position.model';

@Injectable({ providedIn: 'root' })
export class PortfolioService {
    private positions: Position[] = [
        { sym: 'NIFTY', sub: '24800 CE · 31 Jul', type: 'CE', qty: 75, avg: 142.3, cmp: 168.9, entryDate: '2026-07-16' },
        { sym: 'NIFTY', sub: '24600 PE · 31 Jul', type: 'PE', qty: -75, avg: 88.1, cmp: 61.45, entryDate: '2026-07-15' },
        { sym: 'BANKNIFTY', sub: '55300 CE · 31 Jul', type: 'CE', qty: 30, avg: 410.0, cmp: 388.8, entryDate: '2026-07-11' },
        { sym: 'RELIANCE', sub: 'Cash · Delivery', type: 'EQ', qty: 100, avg: 1420.5, cmp: 1486.2, entryDate: '2026-07-09' }
    ];

    getPositions(): Observable<Position[]> {
        return of(this.positions.map(p => ({ ...p })));
    }
}

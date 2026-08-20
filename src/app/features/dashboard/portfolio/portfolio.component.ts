import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PortfolioService } from './portfolio.service';
import { Position } from './models/position.model';

@Component({
    selector: 'app-portfolio',
    standalone: true,
    imports: [CommonModule],
    template: `
  <section class="sfc-page-pad portfolio-page">
    <div class="sfc-grid-4 portfolio-stats">
      <div class="stat-card total-pnl">
        <div class="stat-label">Total P&amp;L</div>
        <div class="stat-value num">{{ totalPnlStr }}</div>
        <div class="stat-sub num">+3.42% today</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Market value</div>
        <div class="stat-value num">₹55,86,410</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Margin used</div>
        <div class="stat-value num">₹12,40,000</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Open positions</div>
        <div class="stat-value num">{{ positions.length }}</div>
      </div>
    </div>

    <div class="positions-card">
      <div class="positions-card__head">
        <span class="positions-title">Open Positions</span>
        <div class="positions-actions">
          <span class="muted">CMP is live</span>
          <button class="btn-add" (click)="openAddTrade()">Add Trade</button>
        </div>
      </div>
      <div class="sfc-table-wrap">
        <table class="positions-table">
          <thead>
            <tr>
              <th>Instrument</th>
              <th class="align-right">Qty</th>
              <th class="align-right">Avg price</th>
              <th class="align-right">CMP</th>
              <th class="align-right">P&amp;L</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let p of positions; let i = index">
              <td>
                <div class="inst-symbol">{{ p.sym }}</div>
                <div class="inst-sub">{{ p.sub }}</div>
              </td>
              <td class="num align-right">{{ p.qty }}</td>
              <td class="num align-right">₹{{ p.avg.toFixed(2) }}</td>
              <td class="num align-right">₹{{ p.cmp.toFixed(2) }}</td>
              <td class="num align-right" [class.pnl-positive]="(p.cmp - p.avg) * p.qty >= 0" [class.pnl-negative]="(p.cmp - p.avg) * p.qty < 0">{{ computePnl(p) }}</td>
              <td class="align-right"><button class="btn-exit">Exit</button></td>
            </tr>
            <tr *ngIf="positions.length === 0">
              <td colspan="6" class="muted">No open positions — add a trade to get started.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </section>
  `,
    styleUrls: ['./portfolio.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class PortfolioComponent {
    private readonly svc = inject(PortfolioService);
    positions: Position[] = [];
    totalPnl = 0;

    constructor() {
        this.svc.getPositions().subscribe(p => {
            this.positions = p;
            this.totalPnl = this.positions.reduce((s, pos) => s + (pos.cmp - pos.avg) * pos.qty, 0);
        });
    }

    get totalPnlStr(): string {
        const v = Math.round(this.totalPnl);
        return (v >= 0 ? '+' : '−') + '₹' + Math.abs(v).toLocaleString('en-IN');
    }

    computePnl(p: Position): string {
        const pnl = Math.round((p.cmp - p.avg) * p.qty);
        const sign = pnl >= 0 ? '+' : '−';
        return `${sign}₹${Math.abs(pnl).toLocaleString('en-IN')}`;
    }

    openAddTrade(): void {
        // placeholder for add-trade modal (UI-only migration)
    }
}

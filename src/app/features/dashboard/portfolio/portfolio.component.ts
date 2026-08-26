import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PortfolioService } from './portfolio.service';
import { Position } from './models/position.model';
import { DataTableComponent } from '../../../shared/components/data-table/data-table.component';
import { DataTableAction, DataTableActionEvent, DataTableColumn } from '../../../shared/components/data-table/data-table.types';

@Component({
  selector: 'app-portfolio',
  standalone: true,
  imports: [CommonModule, DataTableComponent],
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
      <app-data-table [columns]="positionColumns" [data]="positions" [loading]="isLoading"
        [actions]="positionActions" emptyMessage="No open positions — add a trade to get started."
        (actionClick)="onTableAction($event)"></app-data-table>
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
  isLoading = true;
  readonly positionColumns: DataTableColumn<Position>[] = [
    { key: 'sym', label: 'Instrument', secondaryFormatter: position => position.sub },
    { key: 'qty', label: 'Qty', type: 'number', align: 'right' },
    { key: 'avg', label: 'Avg price', type: 'currency', align: 'right' },
    { key: 'cmp', label: 'CMP', type: 'currency', align: 'right' },
    {
      key: 'pnl',
      label: 'P&L',
      type: 'change',
      align: 'right',
      value: position => (position.cmp - position.avg) * position.qty,
      formatter: (_value, position) => this.computePnl(position),
    },
  ];
  readonly positionActions: DataTableAction<Position>[] = [{ id: 'exit', label: 'Exit' }];

  constructor() {
    this.svc.getPositions().subscribe(p => {
      this.positions = p;
      this.isLoading = false;
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

  onTableAction(event: DataTableActionEvent<Position>): void {
    if (event.action.id === 'exit') {
    }
  }
}

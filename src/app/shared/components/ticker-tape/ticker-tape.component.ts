import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TickerService, TickerItem } from '../../services/ticker.service';
import { signal } from '@angular/core';

@Component({
    selector: 'app-ticker-tape',
    standalone: true,
    imports: [CommonModule],
    template: `
    <div class="ticker-wrap">
      <div class="ticker-track" [style.animation-duration]="animationDuration">
        <ng-container *ngFor="let item of trackItems">
          <div class="tick">
            <b>{{ item.symbol }}</b>
            <span class="num">{{ item.price }}</span>
            <span class="num" [style.color]="item.positive ? 'var(--teal)' : 'var(--red)'">{{ item.change }}</span>
          </div>
        </ng-container>
      </div>
    </div>
  `,
    styles: [
        `
    .ticker-wrap{ width:100%; background:var(--panel); border-bottom:1px solid var(--border); overflow:hidden; white-space:nowrap; }
    .ticker-track{ display:inline-flex; animation:scrollTicker 34s linear infinite; }
    @keyframes scrollTicker{ from{ transform:translateX(0); } to{ transform:translateX(-50%); } }
    .tick{ font-family:var(--font-mono); font-size:11.5px; padding:7px 18px; display:inline-flex; gap:8px; align-items:center; color:var(--muted); border-right:1px solid var(--border); letter-spacing:0.2px; }
    .tick b{ color:var(--ink); font-weight:600; margin-right:6px }
    .num{ font-family:var(--font-mono); }
    @media (prefers-reduced-motion: reduce){ .ticker-track{ animation:none; } }
    `
    ],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class TickerTapeComponent {
    private readonly svc = inject(TickerService);
    private readonly items = signal<TickerItem[]>([]);

    // CSS animation duration string (can be tuned later); prototype used 34s
    animationDuration = '34s';

    constructor() {
        this.svc.getDemoTicker().subscribe(list => {
            // duplicate list to make seamless scroll: [items, items]
            this.items.set(list.concat(list));
        });
    }

    get trackItems(): TickerItem[] { return this.items(); }
}


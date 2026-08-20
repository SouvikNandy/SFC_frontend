import { ChangeDetectionStrategy, Component, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { HomeService } from './home.service';
import { MarketCard } from './models/home.model';
import { AuthService } from '../../../core/services/auth.service';

@Component({
    selector: 'app-dashboard-home',
    standalone: true,
    imports: [CommonModule],
    template: `
    <section class="sfc-page-pad dashboard-home">
      <div class="dh-welcome">
        <h2 class="dh-title">Welcome back, {{ userName }}</h2>
        <p class="dh-date num">{{ today }}</p>
      </div>

      <div class="dh-section-heading">Market summary</div>
      <div class="sfc-grid-4 dh-summary-grid">
        <ng-container *ngIf="loading(); else grid">
          <div *ngFor="let i of [1,2,3,4]" class="summary-card placeholder"></div>
        </ng-container>
        <ng-template #grid>
          <ng-container *ngFor="let card of cards">
            <div class="summary-card">
              <div class="summary-card__symbol">{{ card.symbol }}</div>
              <div class="summary-card__value num">{{ card.value }}</div>
              <div class="summary-card__pnl num" [class.pnl-positive]="card.up" [class.pnl-negative]="!card.up">{{ card.change }}</div>
            </div>
          </ng-container>
        </ng-template>
      </div>

      <div class="dh-section-heading">Quick links</div>
      <div class="sfc-grid-3 dh-quicklinks">
        <ng-container *ngFor="let q of quickLinks">
          <div class="quick-link-card" (click)="go(q.key)">
            <div class="quick-link-card__title">
              {{ q.title }}
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
            </div>
            <div class="quick-link-card__desc">{{ q.desc }}</div>
          </div>
        </ng-container>
      </div>

      <div class="dh-section-heading">Platform overview</div>
      <div class="platform-overview">
        <p>QuantSFC is an NSE F&amp;O analytics platform: a 5-year historical futures &amp; options database with daily EOD auto-updates, a live options chain, and a full suite of statistical tools — Probability, Greeks, Payoff, Historical Volatility and Implied Volatility — each with a table and chart view.</p>
        <p>Live broker-fed price and Greeks updates are planned for Stage 2. Everything on this page currently reflects the most recent EOD sync.</p>
      </div>
    </section>
  `,
    styleUrls: ['./dashboard-home.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class DashboardHomeComponent {
    private readonly home = inject(HomeService);
    private readonly auth = inject(AuthService);
    private readonly router = inject(Router);

    readonly loading = signal(true);
    readonly error = signal<string | null>(null);
    cards: MarketCard[] = [];
    quickLinks: { key: string; title: string; desc: string }[] = [];

    constructor() {
        this.load();
    }

    get userName(): string {
        const u = this.auth.currentUser();
        return u?.name ?? u?.email ?? 'Trader';
    }

    get today(): string {
        return new Date().toLocaleDateString('en-IN', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
    }

    private load(): void {
        this.loading.set(true);
        this.home.getMarketSummary().subscribe({
            next: (cards) => {
                this.cards = cards;
                this.home.getQuickLinks().subscribe({ next: (q) => { this.quickLinks = q; this.loading.set(false); }, error: () => { this.error.set('Failed to load quick links'); this.loading.set(false); } });
            },
            error: () => { this.error.set('Failed to load market summary'); this.loading.set(false); }
        });
    }

    go(key: string): void {
        // map quicklink keys to existing app routes
        const routeMap: Record<string, string> = {
            portfolio: '/dashboard/portfolio',
            chain: '/dashboard/options-chain',
            greeks: '/dashboard/greeks',
            payoff: '/dashboard/payoff',
            eod: '/dashboard/eod',
            alerts: '/dashboard/price-alerts'
        };

        const path = routeMap[key] ?? '/dashboard';
        this.router.navigateByUrl(path);
    }
}

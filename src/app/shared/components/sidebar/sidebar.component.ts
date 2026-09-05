import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { SidebarService } from '../../services/sidebar.service';
import { AuthService } from '../../../core/services/auth.service';

const NAV_GROUPS = [
  { label: 'Trading', keys: ['home', 'portfolio', 'options-chain', 'eod', 'closed-trades'] },
  { label: 'Tools', keys: ['greeks', 'probability', 'historical-volatility', 'implied-volatility', 'payoff'] },
  { label: 'More', keys: ['blog-reports', 'price-alerts'] }
];

const NAV_LABELS: Record<string, string> = {
  'home': 'Home',
  'portfolio': 'Portfolio',
  'options-chain': 'Options Chain',
  'eod': 'F&O EOD Data',
  'closed-trades': 'Closed Trades',
  'greeks': 'Greeks Calculator',
  'probability': 'Probability Calculator',
  'historical-volatility': 'Historical Volatility',
  'implied-volatility': 'Implied Volatility',
  'payoff': 'Payoff Simulator',
  'blog-reports': 'Blog & Reports',
  'price-alerts': 'Price Alerts'
};

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive],
  template: `
    <aside class="sfc-sidebar" [class.open]="sidebar.isOpen()">
      <div class="sfc-sidebar__inner">
        <div class="sfc-sidebar__brand">
          <img src="assets/images/logo.png" alt="QuantSFC" class="sfc-logo" />
        </div>

        <nav class="sfc-nav">
          <ng-container *ngFor="let group of groups; let gi = index">
            <div class="sfc-nav__group">
              <div class="sfc-nav__heading">{{ group.label }}</div>
              <div *ngFor="let key of group.keys">
                <a [routerLink]="['/dashboard', key]" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: true }" (click)="sidebar.close()" class="nav-item">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    @switch (key) {
                    @case ('home') {
                    <path d="M4 11.5 12 4l8 7.5"></path><path d="M6 10v9.5h12V10"></path><path d="M10 19.5v-6h4v6"></path>
                    }
                    @case ('portfolio') {
                    <circle cx="12" cy="12" r="8"></circle><circle cx="12" cy="12" r="3"></circle>
                    }
                    @case ('options-chain') {
                    <rect x="3" y="3" width="8" height="8" rx="1.5"></rect><rect x="13" y="3" width="8" height="8" rx="1.5"></rect><rect x="3" y="13" width="8" height="8" rx="1.5"></rect><rect x="13" y="13" width="8" height="8" rx="1.5"></rect>
                    }
                    @case ('eod') {
                    <ellipse cx="12" cy="5" rx="8" ry="3"></ellipse><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5"></path><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"></path>
                    }
                    @case ('closed-trades') {
                    <circle cx="12" cy="12" r="9"></circle><polyline points="8,12.5 11,15.5 16,9"></polyline>
                    }
                    @case ('greeks') {
                    <line x1="5" y1="19" x2="5" y2="10"></line><circle cx="5" cy="7" r="2"></circle><line x1="12" y1="19" x2="12" y2="14"></line><circle cx="12" cy="11" r="2"></circle><line x1="19" y1="19" x2="19" y2="6"></line><circle cx="19" cy="16" r="2"></circle>
                    }
                    @case ('probability') {
                    <circle cx="12" cy="12" r="9"></circle><circle cx="12" cy="12" r="4.5"></circle><circle cx="12" cy="12" r="0.8" fill="currentColor"></circle>
                    }
                    @case ('historical-volatility') {
                    <polyline points="2,13 7,13 9,7 13,18 16,13 22,13"></polyline>
                    }
                    @case ('implied-volatility') {
                    <path d="M3 16c4-9 7-9 9-2s5 7 9-2"></path>
                    }
                    @case ('payoff') {
                    <polyline points="3,17 9,11 13,15 21,6"></polyline><polyline points="15,6 21,6 21,12"></polyline>
                    }
                    @case ('blog-reports') {
                    <rect x="4" y="3" width="16" height="18" rx="1.5"></rect><line x1="7.5" y1="8" x2="16.5" y2="8"></line><line x1="7.5" y1="12" x2="16.5" y2="12"></line><line x1="7.5" y1="16" x2="13" y2="16"></line>
                    }
                    @case ('price-alerts') {
                    <path d="M6 10a6 6 0 0 1 12 0c0 4.5 1.5 6 1.5 6h-15S6 14.5 6 10z"></path><path d="M10.5 19a1.5 1.5 0 0 0 3 0"></path>
                    }
                    }
                  </svg>
                  <span class="nav-label">{{ labels[key] }}</span>
                </a>
              </div>
            </div>
          </ng-container>
        </nav>

        <div class="sfc-sidebar__foot">
          <div class="sfc-sidebar-footer">
            <div class="sfc-avatar">{{ userInitial }}</div>
            <div class="sfc-user">
              <div class="sfc-user__name">{{ userName }}</div>
              <a href="#" (click)="logout($event)" class="sfc-logout">Log out</a>
            </div>
          </div>
          <div class="sfc-copyright">© 2026 QuantSFC — quantsfc.com</div>
        </div>
      </div>
    </aside>
  `,
  styleUrls: ['./sidebar.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SidebarComponent {
  readonly groups = NAV_GROUPS;
  readonly labels = NAV_LABELS;
  private readonly router = inject(Router);
  readonly sidebar = inject(SidebarService);
  private readonly auth = inject(AuthService);

  get userName(): string { const u = this.auth.currentUser(); return (u?.first_name && u?.last_name) ? `${u.first_name} ${u.last_name}` : u?.email ?? 'Signed in'; }
  get userInitial(): string { return (this.userName || 'T').charAt(0).toUpperCase(); }

  logout(e?: Event): void { e?.preventDefault(); this.auth.logout().subscribe({ next: () => { this.sidebar.close(); this.router.navigate(['/login']); }, error: () => { this.sidebar.close(); this.router.navigate(['/login']); } }); }
}

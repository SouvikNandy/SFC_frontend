import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { SidebarService } from '../../services/sidebar.service';
import { AuthService } from '../../../core/services/auth.service';
import { Router } from '@angular/router';

@Component({
    selector: 'app-topbar',
    standalone: true,
    template: `
                <header class="sfc-topbar">
                    <button class="sfc-hamburger" type="button" (click)="sidebar.toggle()" aria-label="Open menu">☰</button>
                    <div class="sfc-topbar__title">{{ title }}</div>
                    <div class="sfc-topbar__spacer"></div>
                    <div class="sfc-topbar__user">
                        <span class="sfc-topbar__name">{{ userName }}</span>
                        <button class="sfc-topbar__logout" (click)="logout()">Sign out</button>
                    </div>
                </header>
            `,
    styleUrls: ['./topbar.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class TopbarComponent {
    readonly sidebar = inject(SidebarService);
    private readonly auth = inject(AuthService);
    private readonly router = inject(Router);
    private readonly labels: Record<string, string> = {
        home: 'Home', portfolio: 'Portfolio', 'options-chain': 'Options Chain', eod: 'F&O EOD Data', 'closed-trades': 'Closed Trades',
        greeks: 'Greeks Calculator', probability: 'Probability Calculator', 'historical-volatility': 'Historical Volatility', 'implied-volatility': 'Implied Volatility', payoff: 'Payoff Simulator',
        'blog-reports': 'Blog & Reports', 'price-alerts': 'Price Alerts'
    };

    get title(): string {
        const url = this.router.url || '';
        const seg = url.split('/').filter(Boolean)[1] ?? 'home';
        return this.labels[seg] ?? 'Workspace';
    }

    get userName(): string {
        const user = this.auth.currentUser();
        return user ? (user.name ?? user.email ?? 'Signed in') : 'Signed in';
    }

    logout(): void {
        this.auth.logout().subscribe({
            next: () => this.router.navigate(['/login']),
            error: () => this.router.navigate(['/login'])
        });
    }
}

import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { SidebarService } from '../../services/sidebar.service';
import { AuthService } from '../../../core/services/auth.service';
import { NavigationEnd, Router } from '@angular/router';
import { filter, map, startWith } from 'rxjs';

@Component({
    selector: 'app-topbar',
    standalone: true,
    template: `
                <header class="sfc-topbar">
                    <button class="sfc-hamburger" type="button" (click)="sidebar.toggle()" aria-label="Open menu">☰</button>
                    <div class="sfc-topbar__title">{{ title }}</div>
                    <!-- <div class="sfc-topbar__spacer"></div>
                    <div class="sfc-topbar__user">
                        <span class="sfc-topbar__name">{{ userName }}</span>
                        <button class="sfc-topbar__logout" (click)="logout()">Sign out</button>
                    </div> -->
                </header>
            `,
    styleUrls: ['./topbar.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class TopbarComponent {
    readonly sidebar = inject(SidebarService);
    private readonly auth = inject(AuthService);
    private readonly router = inject(Router);
    private readonly currentUrl = toSignal(
        this.router.events.pipe(
            filter((event): event is NavigationEnd => event instanceof NavigationEnd),
            map(event => event.urlAfterRedirects),
            startWith(this.router.url)
        ),
        { initialValue: this.router.url }
    );
    private readonly labels: Record<string, string> = {
        home: 'Home', portfolio: 'Portfolio', 'options-chain': 'Options Chain', eod: 'F&O EOD Data', 'closed-trades': 'Closed Trades',
        greeks: 'Greeks Calculator', probability: 'Probability Calculator', 'historical-volatility': 'Historical Volatility', 'implied-volatility': 'Implied Volatility', payoff: 'Payoff Simulator',
        'blog-reports': 'Blog & Reports', 'price-alerts': 'Price Alerts'
    };

    get title(): string {
        const url = this.currentUrl() || '';
        const seg = url.split('/').filter(Boolean)[1] ?? 'home';
        return this.labels[seg] ?? 'Workspace';
    }

    get userName(): string {
        const user = this.auth.currentUser();
        return user ? (user.first_name && user.last_name ? `${user.first_name} ${user.last_name}` : user.email ?? 'Signed in') : 'Signed in';
    }

    logout(): void {
        this.auth.logout().subscribe({
            next: () => this.router.navigate(['/login']),
            error: () => this.router.navigate(['/login'])
        });
    }
}

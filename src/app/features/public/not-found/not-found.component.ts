import { ChangeDetectionStrategy, Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { ButtonComponent } from '../../../shared/components/button/button.component';

@Component({
  selector: 'app-not-found',
  standalone: true,
  imports: [CommonModule, ButtonComponent, RouterLink],
  template: `
    <section class="not-found">
      <div class="not-found__content">
        <div class="not-found__code">404</div>
        <h1 class="not-found__title">Page Not Found</h1>
        <p class="not-found__subtitle">The page you're looking for doesn't exist or has been moved.</p>
        
        <div class="not-found__actions">
          <app-button variant="primary" size="lg" (click)="goHome()">
            Back to Dashboard
          </app-button>
          <app-button variant="secondary" size="lg" (click)="goBack()">
            Go Back
          </app-button>
        </div>

        <div class="not-found__links">
          <p class="not-found__links-title">Popular pages:</p>
          <ul class="not-found__links-list">
            <li><a routerLink="/options-chain" class="not-found__link">Options Chain</a></li>
            <li><a routerLink="/greeks" class="not-found__link">Greeks Calculator</a></li>
            <li><a routerLink="/implied-volatility" class="not-found__link">Implied Volatility</a></li>
            <li><a routerLink="/payoff" class="not-found__link">Payoff Simulator</a></li>
            <li><a routerLink="/eod" class="not-found__link">F&amp;O EOD Data</a></li>
          </ul>
        </div>
      </div>
    </section>
  `,
  styleUrls: ['./not-found.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class NotFoundComponent {
  constructor(private readonly router: Router) {}

  goHome(): void {
    this.router.navigateByUrl('/');
  }

  goBack(): void {
    window.history.back();
  }
}

import { ChangeDetectionStrategy, Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { ButtonComponent } from '../../../shared/components/button/button.component';

@Component({
  selector: 'app-not-found',
  standalone: true,
  imports: [CommonModule, ButtonComponent],
  template: `
    <section class="not-found">
      <div class="not-found__content">
        <div class="not-found__code">404</div>
        <h1 class="not-found__title">Page Not Found</h1>
        <p class="not-found__subtitle">The page you're looking for doesn't exist or has been moved.</p>
        
        <div class="not-found__actions">
          <app-button variant="primary" size="lg" (click)="goHome()">
            Back to Home
          </app-button>
          <app-button variant="secondary" size="lg" (click)="goBack()">
            Go Back
          </app-button>
        </div>

        <div class="not-found__links">
          <p class="not-found__links-title">Popular pages:</p>
          <ul class="not-found__links-list">
            <li><a href="/about" class="not-found__link">About</a></li>
            <li><a href="/services" class="not-found__link">Services</a></li>
            <li><a href="/data" class="not-found__link">Data</a></li>
            <li><a href="/tools" class="not-found__link">Tools</a></li>
            <li><a href="/blog" class="not-found__link">Blog</a></li>
            <li><a href="/contact" class="not-found__link">Contact</a></li>
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

import { ChangeDetectionStrategy, Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { ButtonComponent } from '../../../shared/components/button/button.component';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { inject } from '@angular/core';

@Component({
  selector: 'app-services',
  standalone: true,
  imports: [CommonModule, ButtonComponent],
  template: `
    <section class="services">
      <section class="services__hero" aria-labelledby="services-hero-title">
        <div class="services__hero-content">
          <span class="services__eyebrow">What we do</span>
          <h1 id="services-hero-title" class="services__hero-title">Services</h1>
          <p class="services__hero-subtitle">
            Consulting for institutions and businesses, and hands-on training for individuals who
            want to master the markets.
          </p>
        </div>
      </section>

      <div class="services__content">
        <div class="services__max-width">
          <div class="services__category">
            <div class="services__category-header">
              <div class="services__divider"></div>
              <span class="services__category-label">Consulting</span>
            </div>
            <div class="services__services-list">
              @for (service of consultingServices; track service.title) {
                <div class="services__service-card">
                  <div class="services__service-icon">
                    <div class="service__icon" [innerHTML]="service.icon"></div>
                  </div>
                  <div class="services__service-body">
                    <h3 class="services__service-title">{{ service.title }}</h3>
                    <p class="services__service-description">{{ service.description }}</p>
                  </div>
                </div>
              }
            </div>
          </div>

          <div class="services__category">
            <div class="services__category-header">
              <div class="services__divider"></div>
              <span class="services__category-label">Training</span>
            </div>
            <div class="services__services-list">
              @for (service of trainingServices; track service.title) {
                <div class="services__service-card">
                  <div class="services__service-icon">
                    <div class="service__icon" [innerHTML]="service.icon"></div>
                  </div>
                  <div class="services__service-body">
                    <h3 class="services__service-title">{{ service.title }}</h3>
                    <p class="services__service-description">{{ service.description }}</p>
                  </div>
                </div>
              }
            </div>
          </div>

          <div class="services__cta">
            <div>
              <h3 class="services__cta-title">Looking for our analytics tools instead?</h3>
              <p class="services__cta-subtitle">
                Options chain, Greeks, payoff simulator and more.
              </p>
            </div>
            <app-button variant="primary" size="sm" (click)="goToTools()"> View Tools </app-button>
          </div>
        </div>
      </div>
    </section>
  `,
  styleUrls: ['./services.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ServicesComponent {
  private sanitizer = inject(DomSanitizer);

  readonly consultingServices = [
    {
      title: 'Investment Finance',
      description:
        'We propose to provide superior returns for investments through our highly professional asset management services, backed by a team with rich experience in capital markets and asset management.',
      icon: this.sanitizer.bypassSecurityTrustHtml(`
      <svg xmlns="http://www.w3.org/2000/svg"
           width="24"
           height="24"
           viewBox="0 0 24 24"
           fill="none"
           stroke="currentColor"
           stroke-width="1.8"
           stroke-linecap="round"
           stroke-linejoin="round">
        <polyline points="3 17 9 11 13 15 21 6"/>
        <polyline points="15 6 21 6 21 12"/>
      </svg>
    `),
    },
    {
      title: 'Corporate Finance',
      description:
        'SFC provides financial consulting services to its clients with an objective to create significant and lasting value by providing an independent perspective and sound strategies related to capital markets, financial management and investment decisions.',
      icon: this.sanitizer.bypassSecurityTrustHtml(`
      <svg xmlns="http://www.w3.org/2000/svg"
           width="24"
           height="24"
           viewBox="0 0 24 24"
           fill="none"
           stroke="currentColor"
           stroke-width="1.8"
           stroke-linecap="round"
           stroke-linejoin="round">
        <rect x="3" y="7" width="18" height="13" rx="2"/>
        <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
        <line x1="3" y1="13" x2="21" y2="13"/>
      </svg>
    `),
    },
  ];

  readonly trainingServices = [
    {
      title: 'Advance Derivatives Course',
      description:
        'The objective of the program is to develop a sound understanding of risk in the markets and the tools and strategies to manage them. The course also focuses on different trading strategies involving Futures & Options.',
      icon: this.sanitizer.bypassSecurityTrustHtml(`
      <svg xmlns="http://www.w3.org/2000/svg"
           width="24"
           height="24"
           viewBox="0 0 24 24"
           fill="none"
           stroke="currentColor"
           stroke-width="1.8"
           stroke-linecap="round"
           stroke-linejoin="round">
        <path d="M2 9l10-5 10 5-10 5-10-5"/>
        <path d="M6 11v5c0 1.5 3 3 6 3s6-1.5 6-3v-5"/>
      </svg>
    `),
    },
    {
      title: 'SAP TRM',
      description:
        'Description of the core treasury processes for money market, foreign exchange, derivatives, commodities and securities. End-to-end treasury process, including integration with other SAP modules (e.g. FI, CM, BCM, IHC). Risk management process — Market Risk Analyzer, Credit Risk Analyzer, Portfolio Analyzer, Hedge Management, Exposure Management.',
      icon: this.sanitizer.bypassSecurityTrustHtml(`
      <svg xmlns="http://www.w3.org/2000/svg"
           width="24"
           height="24"
           viewBox="0 0 24 24"
           fill="none"
           stroke="currentColor"
           stroke-width="1.8"
           stroke-linecap="round"
           stroke-linejoin="round">
        <line x1="4" y1="6" x2="20" y2="6"/>
        <circle cx="9" cy="6" r="2"/>
        <line x1="4" y1="12" x2="20" y2="12"/>
        <circle cx="15" cy="12" r="2"/>
        <line x1="4" y1="18" x2="20" y2="18"/>
        <circle cx="7" cy="18" r="2"/>
      </svg>
    `),
    },
    {
      title: 'Corporate Finance — Financial Analysis and Valuation',
      description:
        'The course is designed to offer students the intensive instruction and training needed to successfully compete in rapidly developing global financial markets. Advanced coursework in the theories and practice of financial analysis, valuation, credit analysis, and financial instruments and markets expands their analytical capacities to better understand and develop strategic financial decisions.',
      icon: this.sanitizer.bypassSecurityTrustHtml(`
      <svg xmlns="http://www.w3.org/2000/svg"
           width="24"
           height="24"
           viewBox="0 0 24 24"
           fill="none"
           stroke="currentColor"
           stroke-width="1.8"
           stroke-linecap="round"
           stroke-linejoin="round">
        <line x1="6" y1="20" x2="6" y2="10"/>
        <line x1="12" y1="20" x2="12" y2="4"/>
        <line x1="18" y1="20" x2="18" y2="14"/>
      </svg>
    `),
    },
  ];
  constructor(private readonly router: Router) {}

  goToTools(): void {
    this.router.navigateByUrl('/tools');
  }
}


import { ChangeDetectionStrategy, Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { inject } from '@angular/core';

@Component({
  selector: 'app-about',
  standalone: true,
  imports: [CommonModule],
  template: `
    <section class="about">
      <section class="about__hero" aria-labelledby="about-hero-title">
        <div class="about__hero-content">
          <span class="about__eyebrow">QuantSFC · Independent Markets Consulting</span>
          <h1 id="about-hero-title" class="about__hero-title">About Us</h1>
          <p class="about__hero-subtitle">
            A group of capital-markets professionals building trust-based, long-term value for our
            clients.
          </p>
        </div>
      </section>

      <div class="about__content">
        <div class="about__intro">
          <p>
            Our firm has been set up by a group of professionals having rich experience in capital
            markets, consulting and asset management services. The core members have an experience
            of over 30 years in the area of corporate finance, capital markets, investments, trading
            in commodities, stock and forex, financial training in the field of SAP treasury and
            risk management, corporate finance and advanced derivatives and trading strategies.
          </p>
        </div>

        <div class="about__stats">
          @for (stat of stats; track stat.title) {
            <div class="about__stat-tile">
              <p class="about__stat-title">{{ stat.title }}</p>
              <p class="about__stat-value">{{ stat.value }}</p>
            </div>
          }
        </div>

        <div class="about__section">
          <div class="about__section-header">
            <div class="about__divider"></div>
            <span class="about__section-label">What we stand for</span>
          </div>
          <div class="about__values">
            @for (value of values; track value.title) {
              <div class="about__value-card">
                <div class="about__value-icon">
                  <div class="about__value-icon" [innerHTML]="value.icon"></div>
                </div>
                <h3 class="about__value-title">{{ value.title }}</h3>
                <p class="about__value-description">{{ value.description }}</p>
              </div>
            }
          </div>
        </div>

        <div class="about__section">
          <div class="about__section-header">
            <div class="about__divider"></div>
            <span class="about__section-label">Our Team</span>
          </div>
          <div class="about__team">
            @for (member of team; track member.role) {
              <div class="about__team-card">
                <div class="about__team-header">
                  <div class="about__team-icon">
                    <div class="team__icon" [innerHTML]="member.icon"></div>
                  </div>
                  <div>
                    <h3 class="about__team-role">{{ member.role }}</h3>
                    <span class="about__team-label">Core Team</span>
                  </div>
                </div>
                <p class="about__team-description">{{ member.description }}</p>
              </div>
            }
          </div>
        </div>
      </div>
    </section>
  `,
  styleUrls: ['./about.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AboutComponent {
  private sanitizer = inject(DomSanitizer);

  readonly stats = [
    { title: 'Combined experience', value: '30+ years' },
    { title: 'Derivatives & trading', value: '16+ years' },
    { title: 'Corporate finance', value: '15+ years' },
  ];

  readonly values = [
    {
      title: 'Trust',
      description:
        'Build trust-based relationships with our clients for long-term sustainable growth and development.',
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
          <path d="M12 3l8 4v5c0 5-3.5 8.5-8 9-4.5-.5-8-4-8-9V7l8-4z"/>
          <path d="M9 12l2 2 4-4"/>
        </svg>
      `),
    },
    {
      title: 'Ethics',
      description:
        'Maintain uncompromising integrity in all that we do, keeping the interest of the client first.',
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
          <path d="M12 3v18"/>
          <path d="M5 7h6M13 7h6"/>
          <path d="M5 7l-3 6a3 3 0 0 0 6 0l-3-6z"/>
          <path d="M19 7l-3 6a3 3 0 0 0 6 0l-3-6z"/>
          <line x1="8" y1="21" x2="16" y2="21"/>
        </svg>
      `),
    },
    {
      title: 'Relationship',
      description:
        'Partnering with clients to realise shared goals of creating lasting value through a collaborative approach.',
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
          <circle cx="7" cy="12" r="3.5"/>
          <circle cx="17" cy="12" r="3.5"/>
          <line x1="10.5" y1="12" x2="13.5" y2="12"/>
        </svg>
      `),
    },
    {
      title: 'Excellence',
      description:
        'Strive for excellence through a robust approach, progressive development and proprietary knowledge and insights.',
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
          <path d="M12 3l2.6 5.6 6.1.6-4.6 4 1.3 6-5.4-3.2-5.4 3.2 1.3-6-4.6-4 6.1-.6z"/>
        </svg>
      `),
    },
  ];

  readonly team = [
    {
      role: 'Derivatives & Trading Strategy',
      label: 'Core Team',
      description:
        'Over 16 years of experience in Derivative Strategies, Arbitrage Trading, Investment Analysis, Portfolio Management, and training in SAP Treasury and Risk Management.',
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
        <circle cx="12" cy="12" r="9"/>
        <path d="M8 14l2.5-3 2 2 3.5-4.5"/>
      </svg>
    `),
    },
    {
      role: 'Corporate Finance & Strategy',
      label: 'Core Team',
      description:
        'Over 15 years of experience across multiple roles, with specialization in Corporate Finance, Capital Market Strategy, Mergers & Acquisitions, deal structuring and Strategic Alliances.',
      icon:this.sanitizer.bypassSecurityTrustHtml( `
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
      </svg>
    `),
    },
  ];
}

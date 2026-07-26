import { ChangeDetectionStrategy, Component } from '@angular/core';
import { Router } from '@angular/router';

import { ButtonComponent } from '../../../shared/components/button/button.component';
import { CardComponent } from '../../../shared/components/card/card.component';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [ButtonComponent, CardComponent],
  template: `
    <section class="home" aria-labelledby="home-title">
      <section class="home__hero" aria-labelledby="home-hero-title">
        <div class="home__hero-content">
          <p class="home__eyebrow">Independent Markets Consulting</p>
          <h1 id="home-hero-title">Markets clarity,<br /><span>built on trust.</span></h1>
          <p class="home__hero-copy">
            QuantSFC partners with clients to create significant, lasting value — pairing three decades of capital-markets expertise with sharp, data-driven F&amp;O analytics.
          </p>

          <div class="home__actions">
            <app-button variant="primary" size="lg" [pill]="true" (click)="goToData()">
              Browse F&amp;O EOD data — free
            </app-button>
            <app-button variant="secondary" size="lg" [pill]="true" (click)="goToLogin()">
              Create a free account
            </app-button>
          </div>

          <div class="home__stats" aria-label="Key highlights">
            @for (stat of stats; track stat.label) {
              <div class="home__stat">
                <strong>{{ stat.value }}</strong>
                <span>{{ stat.label }}</span>
              </div>
            }
          </div>
        </div>

        <aside class="home__hero-card" aria-label="Market snapshot">
          <div class="home__hero-card-head">
            <div>
              <div class="home__hero-card-title">NIFTY 50</div>
              <div class="home__hero-card-pill">Live</div>
            </div>
            <span class="home__hero-card-trend">+0.26%</span>
          </div>

          <div class="home__price">24,812.35</div>

          <svg viewBox="0 0 320 84" class="home__chart" aria-hidden="true">
            <defs>
              <linearGradient id="homeSpark" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stop-color="#7fa76a" stop-opacity="0.34"></stop>
                <stop offset="1" stop-color="#7fa76a" stop-opacity="0"></stop>
              </linearGradient>
            </defs>
            <path d="M0,64 L40,56 L80,60 L120,42 L160,48 L200,30 L240,36 L280,20 L320,12 L320,84 L0,84 Z" fill="url(#homeSpark)"></path>
            <path d="M0,64 L40,56 L80,60 L120,42 L160,48 L200,30 L240,36 L280,20 L320,12" fill="none" stroke="#7fa76a" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"></path>
          </svg>

          <div class="home__table-head">
            <span>Strike</span>
            <span>LTP</span>
            <span>Chg</span>
          </div>
          <div class="home__table-row">
            <span>24800 CE</span>
            <span>182.40</span>
            <span class="home__table-row--up">+4.2%</span>
          </div>
          <div class="home__table-row">
            <span>24800 PE</span>
            <span>96.15</span>
            <span class="home__table-row--down">−3.1%</span>
          </div>
          <div class="home__table-row">
            <span>24900 CE</span>
            <span>128.75</span>
            <span class="home__table-row--up">+2.8%</span>
          </div>
        </aside>
      </section>

      <section class="home__about" aria-labelledby="home-about-title">
       
        <div class="home__about-grid">
          <div class="home__about-copy">
             <div class="home__section-heading">
          <p class="home__section-label">Who we are</p>
          <h2 id="home-about-title">Three decades of capital-markets expertise, in one team.</h2>
        </div>
            <p>
Our firm has been set up by a group of professionals who have rich experience in capital markets and asset management services. The core team has a combined experience of over 30 years in corporate finance, jobbing, arbitrage and strategy-driven trading.            </p>
            <!-- <p>
              QuantSFC is also into training in advanced derivatives and SAP Treasury &amp; Risk Management, led by professionals who bring decades of experience across capital, forex, commodities and derivatives markets.
            </p> -->
            <p>QuantSFC is also into training in Advanced Derivatives and SAP Treasury & Risk Management, led by team members who are CFA, MBA (Finance) with more than 16 years of experience across Capital, Forex, Commodities and Derivatives markets.</p>
          </div>

          <div class="home__about-cards">


          <div class="card">
            <header class="card__header">
            <div><p class="card__title">Combined experience</p>
            <p class="card__subtitle">30+ years</p>
          </div>
        </header>

        </div>

        <div  class="card">
            <header class="card__header">
            <div><p class="card__title">Derivatives &amp; training</p>
            <p class="card__subtitle">16+ years</p>
          </div>
        </header>

        </div>

        <div  class="card">
            <header class="card__header">
            <div><p class="card__title">Corporate finance</p>
            <p class="card__subtitle">15+ years</p>
          </div>
        </header>

        </div>

           
          </div>
        </div>
      </section>

      <section class="home__services" aria-labelledby="home-services-title">
        <div class="home__section-heading">
          <p class="home__section-label">Our services</p>
        </div>

        <div class="home__services-grid">
          @for (service of services; track service.title) {
            <app-card [svg]="service.svg" [title]="service.title" [subtitle]="service.subtitle" class="home__service-card">
              <p>{{ service.description }}</p>
            </app-card>
          }
        </div>
      </section>

      <section class="home__testimonial" aria-labelledby="home-testimonial-title">
        <div class="home__testimonial-card">
          <p class="home__testimonial-quote">
            “Like so many people I was disappointed in stock market investments. I attended the Derivatives course and my investment knowledge was truly enriched — they made the complex options very simple to understand.”
          </p>
          <p class="home__testimonial-author">— Verified client, Delhi</p>
        </div>
      </section>

      <section class="home__highlights" aria-labelledby="home-highlights-title">
        <div class="home__section-heading">
          <p class="home__section-label">Also on the platform</p>
          <h2 id="home-highlights-title">Free data, premium toolkit, and portfolio visibility in one place.</h2>
        </div>

        <div class="home__highlights-grid">
          @for (highlight of highlights; track highlight.title) {
            <app-card  [title]="highlight.title" [badge]="highlight.badge" class="home__highlight-card">
              <p>{{ highlight.description }}</p>
            </app-card>
          }
        </div>
      </section>
     
     
    

      <section class="home__highlights" aria-labelledby="home-cta-title">
        <div class="home__cta" >
        <div>
          <h2 id="home-cta-title">Ready to see your portfolio live?</h2>
          <p>Create a free account to unlock the full toolkit.</p>
        </div>
        <app-button variant="primary" size="lg" [pill]="true" (click)="goToLogin()">
          Get started
        </app-button>
        </div>
      </section>
    </section>
  `,
  styleUrls: ['./home.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class HomeComponent {
  readonly stats = [
    { value: '30+', label: 'Years combined markets experience' },
    { value: '16+', label: 'Years derivatives & SAP TRM training' },
    { value: '5yr', label: 'Free F&O EOD database' }
  ];

  readonly services = [
    {
      svg: '/assets/svg/cap.svg',
      title: 'Financial training',
      subtitle: 'Advanced derivatives and strategy-led programs',
      description: 'Build a clear understanding of futures, options, treasury risk management, and valuation with practical guidance.'
    },
    {
      svg: 'assets/svg/trend.svg',
      title: 'Investment finance',
      subtitle: 'Research-driven portfolio support',
      description: 'Access a disciplined approach to superior return objectives, portfolio construction, and long-term value creation.'
    },
    {
      svg: '/assets/svg/bag.svg',
      title: 'Financial consulting',
      subtitle: 'Independent perspective and sound strategy',
      description: 'Create lasting value with insight into capital markets, strategic decisions, and advisory-led execution.'
    }
  ];

  readonly highlights = [
    {
      title: 'F&O EOD Data',
      badge: 'Free',
      description: 'A five-year searchable NSE database that is free for everyone.'
    },
    {
      title: 'Options Chain',
      badge: 'Log in',
      description: 'Full chain details with OI, volume, IV and Greeks for active analysis.'
    },
    {
      title: 'Portfolio & Alerts',
      badge: 'Log in',
      description: 'Track live P&L, monitor open positions, and set price alerts.'
    }
  ];

  constructor(private readonly router: Router) { }

  goToData(): void {
    this.router.navigateByUrl('/data');
  }

  goToLogin(): void {
    this.router.navigateByUrl('/login');
  }
}

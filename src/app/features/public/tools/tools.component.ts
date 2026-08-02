import { ChangeDetectionStrategy, Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';

@Component({
  selector: 'app-tools',
  standalone: true,
  imports: [CommonModule],
  template: `
    <section class="tools">
      <div class="tools__content">
        <h1 class="tools__title">Tools</h1>
        <p class="tools__subtitle">EOD data is free for everyone. Everything else unlocks with a free account.</p>
        
        <div class="tools__grid">
          @for (tool of tools; track tool.title) {
            <div class="tools__card" [class.tools__card--free]="tool.free" (click)="handleToolClick(tool)">
              <div class="tools__card-header">
                <span class="tools__card-title">{{ tool.title }}</span>
                <span [class]="tool.free ? 'tools__badge tools__badge--free' : 'tools__badge tools__badge--login'">
                  {{ tool.free ? 'Free' : 'Log in' }}
                </span>
              </div>
              <p class="tools__card-description">{{ tool.description }}</p>
            </div>
          }
        </div>
      </div>
    </section>
  `,
  styleUrls: ['./tools.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ToolsComponent {
  readonly tools = [
    {
      title: 'F&O EOD Data',
      description: '5-year searchable historical database, filterable by symbol, instrument, strike, expiry and date range.',
      free: true
    },
    {
      title: 'Options Chain',
      description: 'Full NIFTY / BANKNIFTY chain — OI, Volume, IV, LTP and optional Greeks.',
      free: false
    },
    {
      title: 'Greeks Calculator',
      description: 'Black–Scholes Delta, Gamma, Theta, Vega and Rho for any contract.',
      free: false
    },
    {
      title: 'Probability Calculator',
      description: 'Likelihood of a price reaching a target by expiry.',
      free: false
    },
    {
      title: 'Historical Volatility',
      description: 'HV-10 / HV-20 / HV-30 for any scrip.',
      free: false
    },
    {
      title: 'Implied Volatility',
      description: 'Live IV for any CE/PE strike, plus the full IV smile.',
      free: false
    },
    {
      title: 'Payoff Simulator',
      description: 'Visualise profit/loss at expiry for any multi-leg strategy.',
      free: false
    },
    {
      title: 'Portfolio Tracking',
      description: 'Live P&L across your open positions.',
      free: false
    },
    {
      title: 'Price Alerts',
      description: 'Push notifications when an instrument touches your target price.',
      free: false
    }
  ];

  constructor(private readonly router: Router) {}

  handleToolClick(tool: any): void {
    if (tool.free) {
      this.router.navigateByUrl('/data');
    } else {
      this.router.navigateByUrl('/login');
    }
  }
}


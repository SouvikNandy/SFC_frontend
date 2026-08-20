import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
    selector: 'app-implied-volatility',
    standalone: true,
    template: `
    <section class="sfc-page">
      <h1>Implied Volatility</h1>
      <p>Implied volatility placeholder.</p>
    </section>
  `,
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class ImpliedVolatilityComponent { }

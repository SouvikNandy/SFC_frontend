import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
    selector: 'app-historical-volatility',
    standalone: true,
    template: `
    <section class="sfc-page">
      <h1>Historical Volatility</h1>
      <p>Historical volatility placeholder.</p>
    </section>
  `,
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class HistoricalVolatilityComponent { }

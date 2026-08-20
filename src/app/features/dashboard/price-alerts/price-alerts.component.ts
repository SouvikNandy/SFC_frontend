import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
    selector: 'app-price-alerts',
    standalone: true,
    template: `
    <section class="sfc-page">
      <h1>Price Alerts</h1>
      <p>Price alerts placeholder.</p>
    </section>
  `,
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class PriceAlertsComponent { }

import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
    selector: 'app-greeks',
    standalone: true,
    template: `
    <section class="sfc-page">
      <h1>Greeks Calculator</h1>
      <p>Greeks placeholder.</p>
    </section>
  `,
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class GreeksComponent { }

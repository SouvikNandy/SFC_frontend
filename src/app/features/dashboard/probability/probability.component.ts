import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
    selector: 'app-probability',
    standalone: true,
    template: `
    <section class="sfc-page">
      <h1>Probability Calculator</h1>
      <p>Probability placeholder.</p>
    </section>
  `,
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class ProbabilityComponent { }

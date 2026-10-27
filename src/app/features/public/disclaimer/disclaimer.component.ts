import { ChangeDetectionStrategy, Component } from '@angular/core';

import { DISCLAIMER_PARAGRAPHS } from '../../../shared/legal/disclaimer';

@Component({
  selector: 'app-disclaimer',
  standalone: true,
  template: `
    <section class="disclaimer">
      <h1 class="disclaimer__title">Disclaimer</h1>
      @for (paragraph of paragraphs; track paragraph) {
        <p class="disclaimer__text">{{ paragraph }}</p>
      }
    </section>
  `,
  styles: [
    `
      .disclaimer {
        max-width: 800px;
        margin: 0 auto;
        padding: 40px 24px 56px;
      }
      .disclaimer__title {
        margin: 0 0 20px;
        font-family: var(--font-display, 'Sora', sans-serif);
        font-size: 28px;
      }
      .disclaimer__text {
        margin: 0 0 16px;
        line-height: 1.7;
        color: var(--ink, #1c2418);
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DisclaimerComponent {
  readonly paragraphs = DISCLAIMER_PARAGRAPHS;
}

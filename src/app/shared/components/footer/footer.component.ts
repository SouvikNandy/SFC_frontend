import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

import { DISCLAIMER_SUMMARY } from '../../legal/disclaimer';

/** Site-wide footer: the client's disclaimer paragraph and a link to the full /disclaimer page. */
@Component({
  selector: 'app-footer',
  standalone: true,
  imports: [RouterLink],
  template: `
    <footer class="site-footer">
      <p class="site-footer__text">
        {{ summary }}
        <a class="site-footer__link" routerLink="/disclaimer">Disclaimer</a>
      </p>
    </footer>
  `,
  styles: [
    `
      .site-footer {
        padding: 16px 24px 20px;
        border-top: 1px solid var(--border, #e3e7e0);
        background: var(--panel, #fff);
        color: var(--muted, #5b6657);
        font-size: 12.5px;
        line-height: 1.55;
      }
      .site-footer__text {
        margin: 0;
        max-width: 960px;
      }
      .site-footer__link {
        margin-left: 6px;
        color: inherit;
        font-weight: 600;
        text-decoration: underline;
        white-space: nowrap;
      }
      @media (max-width: 880px) {
        .site-footer {
          padding: 14px 16px 18px;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FooterComponent {
  readonly summary = DISCLAIMER_SUMMARY;
}

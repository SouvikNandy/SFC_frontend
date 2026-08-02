import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-auth-layout',
  standalone: true,
  imports: [RouterOutlet],
  template: `
    <div class="auth-layout">
      <aside class="auth-hero" aria-label="Authentication highlights">
        <div class="auth-hero__glow"></div>
        <div class="auth-hero__content">
          <div class="auth-hero__brand">
            <span class="auth-hero__logo">Q</span>
            <span class="auth-hero__brand-text">QuantSFC</span>
          </div>
          <p class="auth-hero__eyebrow">NSE F&amp;O · Live Terminal</p>
          <h1>Derivatives analytics, without the noise.</h1>
          <p class="auth-hero__copy">5 years of NSE F&amp;O history, live Greeks, and options chains — built for traders who read the tape, not the headlines.</p>
          <div class="auth-hero__points">
            <div class="auth-hero__point">
              <span></span>
              <p>Historical &amp; EOD Futures + Options database</p>
            </div>
            <div class="auth-hero__point">
              <span></span>
              <p>Option Greeks, Probability &amp; Payoff calculators</p>
            </div>
            <div class="auth-hero__point">
              <span></span>
              <p>Live options chain with OI &amp; IV analytics</p>
            </div>
          </div>
        </div>
        <div class="auth-hero__stats">
          <div>
            <strong>5 yrs</strong>
            <span>historical data</span>
          </div>
          <div>
            <strong>EOD</strong>
            <span>daily auto-updates</span>
          </div>
          <div>
            <strong>NSE</strong>
            <span>F&amp;O bhav copy</span>
          </div>
        </div>
      </aside>
      <main class="auth-main">
        <div class="auth-main__inner">
          <router-outlet />
        </div>
      </main>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        min-height: 100vh;
      }

      .auth-layout {
        min-height: 100vh;
        display: grid;
        grid-template-columns: minmax(0, 1.05fr) minmax(380px, 0.95fr);
        background: var(--color-bg, #f8faf7);
      }

      .auth-hero {
        background: linear-gradient(135deg, rgb(46 77 18 / 0.97), rgb(43 72 16 / 0.98));
        color: var(--color-hero-text, #f5f8f2);
        padding: 64px 56px;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        position: relative;
        overflow: hidden;
      }

      .auth-hero__glow {
        position: absolute;
        inset: -20% -10%;
        opacity: 0.5;
        pointer-events: none;
        background: radial-gradient(circle at 20% 20%, rgba(127, 167, 106, 0.35), transparent 55%), radial-gradient(circle at 80% 70%, rgba(67, 114, 19, 0.30), transparent 50%);
      }

      .auth-hero__content,
      .auth-hero__stats {
        position: relative;
        z-index: 1;
      }

      .auth-hero__brand {
        display: flex;
        align-items: center;
        gap: 10px;
        margin-bottom: 72px;
      }

      .auth-hero__logo {
        width: 38px;
        height: 38px;
        border-radius: 10px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        background: rgba(127, 167, 106, 0.24);
        color: var(--color-hero-text, #f5f8f2);
        font-weight: 700;
        font-family: var(--font-display, 'Sora', sans-serif);
      }

      .auth-hero__brand-text {
        font-size: 1.05rem;
        font-weight: 600;
        letter-spacing: 0.04em;
      }

      .auth-hero__eyebrow {
        color: var(--color-hero-muted, #c7dbb9);
        font-family: var(--font-mono, 'IBM Plex Mono', monospace);
        font-size: 11px;
        letter-spacing: 1.6px;
        text-transform: uppercase;
        margin: 0 0 16px;
      }

      .auth-hero h1 {
        font-family: var(--font-display, 'Sora', sans-serif);
        font-size: 42px;
        line-height: 1.16;
        font-weight: 700;
        margin: 0 0 18px;
        max-width: 440px;
        letter-spacing: -0.6px;
      }

      .auth-hero__copy {
        font-size: 16px;
        line-height: 1.65;
        color: var(--color-hero-muted, #c7dbb9);
        max-width: 400px;
        margin: 0 0 40px;
      }

      .auth-hero__points {
        display: flex;
        flex-direction: column;
        gap: 16px;
      }

      .auth-hero__point {
        display: flex;
        gap: 12px;
        align-items: flex-start;
      }

      .auth-hero__point span {
        width: 20px;
        height: 20px;
        border-radius: 6px;
        background: rgba(127, 167, 106, 0.28);
        display: flex;
        align-items: center;
        justify-content: center;
        flex: none;
        margin-top: 2px;
      }

      .auth-hero__point span::before {
        content: '';
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: #7fa76a;
      }

      .auth-hero__point p {
        font-size: 14.5px;
        color: var(--color-hero-muted, #c7dbb9);
        line-height: 1.5;
        margin: 0;
      }

      .auth-hero__stats {
        display: flex;
        gap: 32px;
        flex-wrap: wrap;
        font-family: var(--font-mono, 'IBM Plex Mono', monospace);
      }

      .auth-hero__stats strong {
        display: block;
        font-size: 22px;
        font-weight: 600;
        color: var(--color-hero-text, #f5f8f2);
      }

      .auth-hero__stats span {
        display: block;
        font-size: 11.5px;
        color: var(--color-hero-stat-muted, #8fae7c);
        margin-top: 2px;
      }

      .auth-main {
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 48px 24px;
      }

      .auth-main__inner {
        width: 100%;
        max-width: 400px;
      }

      @media (max-width: 900px) {
        .auth-layout {
          grid-template-columns: 1fr;
        }

        .auth-hero {
          min-height: 320px;
          padding: 36px 24px;
        }

        .auth-hero__brand {
          margin-bottom: 40px;
        }

        .auth-hero h1 {
          font-size: 28px;
        }
      }
    `
  ],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AuthLayoutComponent { }

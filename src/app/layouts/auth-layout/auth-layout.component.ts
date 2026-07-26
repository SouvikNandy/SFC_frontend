import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-auth-layout',
  standalone: true,
  imports: [RouterOutlet],
  template: `
    <div class="auth-layout">
      <main class="auth-main">
        <router-outlet />
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
        place-items: center;
        padding: 2rem;
      }

      .auth-main {
        width: min(100%, 32rem);
      }
    `
  ],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AuthLayoutComponent {}

import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { HeaderComponent } from '../../shared/components/header/header.component';

@Component({
  selector: 'app-public-layout',
  standalone: true,
  imports: [RouterOutlet, HeaderComponent],
  template: `
    <div class="layout-shell">
      <app-header>
        <span class="brand">SFC Advisor</span>
      </app-header>

      <main class="layout-main">
        <div class="layout-container">
          <router-outlet />
        </div>
      </main>

      <footer class="layout-footer">
        <p>© 2026 SFC Advisor. Built for modern trading experiences.</p>
      </footer>
    </div>
  `,
  styleUrls: ['./public-layout.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PublicLayoutComponent {}

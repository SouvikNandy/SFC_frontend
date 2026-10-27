import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { FooterComponent } from '../../shared/components/footer/footer.component';
import { HeaderComponent } from '../../shared/components/header/header.component';

@Component({
  selector: 'app-public-layout',
  standalone: true,
  imports: [RouterOutlet, HeaderComponent, FooterComponent],
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

      <app-footer></app-footer>
    </div>
  `,
  styleUrls: ['./public-layout.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PublicLayoutComponent {}

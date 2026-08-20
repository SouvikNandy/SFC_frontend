import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { SidebarComponent } from '../../shared/components/sidebar/sidebar.component';
import { TopbarComponent } from '../../shared/components/topbar/topbar.component';
import { TickerTapeComponent } from '../../shared/components/ticker-tape/ticker-tape.component';
import { SidebarService } from '../../shared/services/sidebar.service';
@Component({
  selector: 'app-dashboard-layout',
  standalone: true,
  imports: [RouterOutlet, SidebarComponent, TopbarComponent, TickerTapeComponent],
  template: `
    <div class="sfc-shell">
      <app-sidebar></app-sidebar>
      <div class="sfc-main">
        <app-topbar></app-topbar>
        <app-ticker-tape></app-ticker-tape>
        <main class="sfc-page-pad">
          <router-outlet />
        </main>
      </div>
      <div class="sfc-sidebar-backdrop" [class.open]="sidebar.isOpen()" (click)="sidebar.close()"></div>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        min-height: 100vh;
      }

      .sfc-shell{ display:flex; min-height:100vh; }
      .sfc-main{ flex:1; min-width:0; }
      .sfc-page-pad{ padding:24px 36px; }
      .sfc-sidebar-backdrop{ display:none; }
      .sfc-sidebar-backdrop.open{ display:block; position:fixed; inset:0; background:rgba(18,20,26,0.4); z-index:390; }
    `
  ],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DashboardLayoutComponent {
  readonly sidebar = inject(SidebarService);
}

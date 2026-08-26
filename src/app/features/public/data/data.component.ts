import { ChangeDetectionStrategy, Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { EodComponent } from '../../dashboard/eod/eod.component';

@Component({
  selector: 'app-data',
  standalone: true,
  imports: [CommonModule, EodComponent],
  template: `
    <section class="data">
     
      <div class="data__banner">
        <p class="data__banner-text">
          F&O EOD data is free for everyone. 
          <a href="/login" class="data__banner-link">Log in or register</a> to unlock Portfolio, Options Chain, Greeks & Probability tools, Alerts, and more.
        </p>
      </div>
      <div class="content"> <app-eod></app-eod></div>
     
      <!-- <div class="data__content">
        <div class="data__header">
          <h1 class="data__title">F&O EOD Data</h1>
          <p class="data__subtitle">5-year searchable historical database for NSE F&O contracts</p>
        </div>

        <div class="data__table-wrapper">
          <div class="data__notice">
            <p>Data visualization and interactive table coming soon. Access the complete F&O EOD database with filters by symbol, instrument, strike, expiry and date range.</p>
          </div>
        </div>
      </div> -->
    </section>
  `,
  styleUrls: ['./data.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DataComponent { }

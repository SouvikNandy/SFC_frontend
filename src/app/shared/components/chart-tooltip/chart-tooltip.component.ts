import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export interface ChartTooltipRow {
  label: string;
  value: string;
  tone?: 'call' | 'put' | 'neutral';
}

@Component({
  selector: 'app-chart-tooltip',
  standalone: true,
  template: `
    <div class="chart-tooltip" [style.left.px]="left()" [style.top.px]="top()" role="status">
      <strong>{{ title() }}</strong>
      @for (row of rows(); track row.label) {
        <span><i [class]="'tone-' + (row.tone ?? 'neutral')"></i>{{ row.label }} <b>{{ row.value }}</b></span>
      }
    </div>
  `,
  styleUrls: ['./chart-tooltip.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChartTooltipComponent {
  readonly title = input('');
  readonly rows = input<ChartTooltipRow[]>([]);
  readonly left = input(0);
  readonly top = input(0);
}

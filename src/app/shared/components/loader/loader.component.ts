import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'app-loader',
  standalone: true,
  template: `
    <div class="loader" role="status" [attr.aria-label]="label()">
      <span class="loader__dot"></span>
      <span class="loader__dot"></span>
      <span class="loader__dot"></span>
    </div>
  `,
  styleUrls: ['./loader.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class LoaderComponent {
  label = input('Loading');
}

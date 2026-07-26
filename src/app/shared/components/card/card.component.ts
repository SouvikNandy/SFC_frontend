import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'app-card',
  standalone: true,
  template: `
    <section class="card" [class.card--elevated]="elevated()" [class.card--hero]="hero()">
      @if (title() || subtitle()) {
         @if (badge()) {
              <div class="badge">
                  <p>{{badge()}}</p>

              </div>
            }
        <header class="card__header">
          <div>
            @if (svg()) {
              <div class="svg">
                             <img [src]="svg()" >

              </div>
            }
            
            @if (title()) {
              <h3 class="card__title">{{ title() }}</h3>
            }
            @if (subtitle()) {
              <p class="card__subtitle">{{ subtitle() }}</p>
            }
          </div>
          <ng-content select="[slot='actions']"></ng-content>
        </header>
      }
      <div class="card__body">
        <ng-content></ng-content>
      </div>
    </section>
  `,
  styleUrls: ['./card.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CardComponent {
  title = input<string>('');
  subtitle = input<string>('');
  svg = input<string>('');
  badge = input<string>('');
  elevated = input(false);
  hero = input(false);
}

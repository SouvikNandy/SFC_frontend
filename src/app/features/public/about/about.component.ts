import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-about',
  standalone: true,
  template: '<section><h1>About</h1></section>',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AboutComponent {}

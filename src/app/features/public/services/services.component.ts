import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-services',
  standalone: true,
  template: '<section><h1>Services</h1></section>',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ServicesComponent {}

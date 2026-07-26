import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-contact',
  standalone: true,
  template: '<section><h1>Contact</h1></section>',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ContactComponent {}

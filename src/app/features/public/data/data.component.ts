import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-data',
  standalone: true,
  template: '<section><h1>Data</h1></section>',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DataComponent {}

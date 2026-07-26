import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-tools',
  standalone: true,
  template: '<section><h1>Tools</h1></section>',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ToolsComponent {}

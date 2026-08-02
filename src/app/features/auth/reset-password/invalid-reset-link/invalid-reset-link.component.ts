import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
    selector: 'app-invalid-reset-link',
    standalone: true,
    imports: [RouterLink],
    templateUrl: './invalid-reset-link.component.html',
    styleUrls: ['./invalid-reset-link.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class InvalidResetLinkComponent { }

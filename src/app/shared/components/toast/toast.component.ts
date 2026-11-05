import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ToastService } from '../../../core/services/toast.service';

@Component({
    selector: 'app-toast',
    standalone: true,
    template: `
        <!-- Each toast announces itself: an error as an alert (assertive), success and info as a status (polite). -->
        <div class="toast-stack">
            @for (toast of toastService.messages(); track toast.id) {
                <div class="toast" [class.toast--error]="toast.type === 'error'" [class.toast--success]="toast.type === 'success'"
                    [class.toast--info]="toast.type === 'info'" [attr.role]="toast.type === 'error' ? 'alert' : 'status'" aria-atomic="true">
                    <span>{{ toast.message }}</span>
                    <button type="button" aria-label="Dismiss notification" (click)="toastService.dismiss(toast.id)">×</button>
                </div>
            }
        </div>
    `,
    styleUrls: ['./toast.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class ToastComponent {
    readonly toastService = inject(ToastService);
}

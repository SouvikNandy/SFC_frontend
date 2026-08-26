import { Injectable, signal } from '@angular/core';

export type ToastType = 'success' | 'error';

export interface ToastMessage {
    id: number;
    message: string;
    type: ToastType;
}

@Injectable({ providedIn: 'root' })
export class ToastService {
    readonly messages = signal<ToastMessage[]>([]);
    private nextId = 0;

    success(message: string): void {
        this.show(message, 'success');
    }

    error(message: string): void {
        this.show(message, 'error');
    }

    dismiss(id: number): void {
        this.messages.update(messages => messages.filter(message => message.id !== id));
    }

    private show(message: string, type: ToastType): void {
        const id = ++this.nextId;
        this.messages.update(messages => [...messages, { id, message, type }]);
        window.setTimeout(() => this.dismiss(id), 3500);
    }
}

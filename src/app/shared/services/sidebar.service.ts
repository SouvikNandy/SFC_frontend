import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class SidebarService {
    private _open = signal(false);

    isOpen() { return this._open(); }
    open() { this._open.set(true); }
    close() { this._open.set(false); }
    toggle() { this._open.update(v => !v); }
}

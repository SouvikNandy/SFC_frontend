import { Injectable, signal } from '@angular/core';

import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class WebSocketService {
  readonly connected = signal(false);
  readonly connectionState = signal<'idle' | 'connecting' | 'connected' | 'disconnected'>('idle');

  private socket: WebSocket | null = null;

  connect(): void {
    if (this.socket) {
      return;
    }

    this.connectionState.set('connecting');

    this.socket = new WebSocket(environment.webSocketUrl);

    this.socket.addEventListener('open', () => {
      this.connected.set(true);
      this.connectionState.set('connected');
    });

    this.socket.addEventListener('close', () => {
      this.connected.set(false);
      this.connectionState.set('disconnected');
      this.socket = null;
    });
  }

  disconnect(): void {
    this.socket?.close();
    this.socket = null;
    this.connected.set(false);
    this.connectionState.set('disconnected');
  }
}

import type { WebSocketLike } from '../src/stt';

type Listener = (ev: { data?: unknown; code?: number }) => void;

/** An in-memory WebSocket end: records what it was sent and lets a test play the other side. */
export class FakeSocket implements WebSocketLike {
  sent: (string | ArrayBuffer | Uint8Array)[] = [];
  closed: { code?: number; reason?: string } | null = null;
  private listeners = new Map<string, Listener[]>();
  send(data: string | ArrayBuffer | Uint8Array): void {
    if (this.closed) throw new Error('socket closed');
    this.sent.push(data);
  }
  close(code?: number, reason?: string): void {
    if (this.closed) return;
    this.closed = { code, reason };
    this.emit('close', { code });
  }
  addEventListener(type: 'message' | 'close' | 'error', fn: Listener): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]);
  }
  emit(type: string, ev: { data?: unknown; code?: number } = {}): void {
    for (const fn of this.listeners.get(type) ?? []) fn(ev);
  }
  /** Text frames sent to this end, parsed */
  json(): Record<string, unknown>[] {
    return this.sent.filter((s): s is string => typeof s === 'string').map((s) => JSON.parse(s) as Record<string, unknown>);
  }
  binary(): number {
    return this.sent.filter((s) => typeof s !== 'string').length;
  }
}

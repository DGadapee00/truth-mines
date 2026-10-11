import type { SttDeps, WebSocketLike } from './stt';

// Cloudflare's runtime provides these; they are not in the DOM typings.
declare const WebSocketPair: new () => Record<0 | 1, WebSocketLike & { accept(): void }>;

/**
 * The real WebSocket plumbing for the Cloudflare runtime. It cannot run under Node, so it is kept
 * to these few lines and is first exercised on a deployed Worker (see worker/README.md).
 */
export const workerSttDeps: SttDeps = {
  accept() {
    const pair = new WebSocketPair();
    const server = pair[1];
    server.accept();
    const init = { status: 101, webSocket: pair[0], headers: { 'Sec-WebSocket-Protocol': 'trurl.v1' } };
    return { socket: server, response: new Response(null, init as ResponseInit) };
  },
  async connectUpstream(url, headers) {
    const res = await fetch(url.replace(/^wss:/, 'https:'), { headers: { ...headers, Upgrade: 'websocket' } });
    const ws = (res as unknown as { webSocket?: WebSocketLike & { accept(): void } }).webSocket;
    if (!ws) throw new Error('the speech service did not upgrade');
    ws.accept();
    return ws;
  },
};

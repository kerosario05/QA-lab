import https from 'node:https';
import http from 'node:http';
import type { IncomingMessage, Server } from 'node:http';
import type { Duplex } from 'node:stream';

/**
 * Tunnels `/api/recordings/:recordingId/live` WebSocket upgrades to the engine.
 *
 * The engine listens on 127.0.0.1 only, so the panel reaches the live view of a "remote"
 * recording through this BFF, on the same origin and port as everything else (no IIS, no CORS).
 * It is a transparent byte tunnel built on `node:http` alone -- no WebSocket library, since the
 * server cannot download new packages. The engine keeps full authority: the viewer's first
 * message carries the session token and the engine decides watch/control.
 */

const LIVE_PATH = /^\/api\/recordings\/[^/?#]+\/live(?:[?#].*)?$/;
const HOP_BY_HOP = new Set(['host', 'connection', 'upgrade', 'keep-alive', 'proxy-connection', 'transfer-encoding']);

function reject(socket: Duplex, status: number, message: string): void {
  if (socket.writable) socket.write(`HTTP/1.1 ${status} ${message}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
  socket.destroy();
}

export function isLiveViewUpgrade(url: string | undefined): boolean {
  return Boolean(url && LIVE_PATH.test(url));
}

export function attachLiveViewProxy(server: Server, engineBaseUrl: () => string): void {
  server.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    if (!isLiveViewUpgrade(req.url)) return;
    const base = engineBaseUrl();
    if (!base) {
      reject(socket, 503, 'Engine Not Configured');
      return;
    }
    const target = new URL(req.url!, base);
    const headers: Record<string, string | string[]> = {};
    for (const [name, value] of Object.entries(req.headers)) {
      if (value === undefined || HOP_BY_HOP.has(name.toLowerCase())) continue;
      headers[name] = value;
    }
    headers.connection = 'Upgrade';
    headers.upgrade = 'websocket';

    const upstream = (target.protocol === 'https:' ? https : http).request({
      protocol: target.protocol,
      hostname: target.hostname,
      port: target.port,
      path: `${target.pathname}${target.search}`,
      method: 'GET',
      headers,
    });

    upstream.on('upgrade', (upstreamRes, upstreamSocket, upstreamHead) => {
      // Relay the engine's 101 handshake verbatim, then splice the two sockets.
      const lines = [`HTTP/1.1 ${upstreamRes.statusCode ?? 101} ${upstreamRes.statusMessage ?? 'Switching Protocols'}`];
      for (let i = 0; i < upstreamRes.rawHeaders.length; i += 2) {
        lines.push(`${upstreamRes.rawHeaders[i]}: ${upstreamRes.rawHeaders[i + 1]}`);
      }
      socket.write(`${lines.join('\r\n')}\r\n\r\n`);
      if (upstreamHead?.length) socket.write(upstreamHead);
      if (head?.length) upstreamSocket.write(head);
      upstreamSocket.pipe(socket);
      socket.pipe(upstreamSocket);
      const closeBoth = () => { upstreamSocket.destroy(); socket.destroy(); };
      upstreamSocket.on('error', closeBoth);
      socket.on('error', closeBoth);
      upstreamSocket.on('close', () => socket.destroy());
      socket.on('close', () => upstreamSocket.destroy());
    });

    // The engine refused the upgrade (e.g. 404: no live stream for this recording).
    upstream.on('response', (res) => {
      reject(socket, res.statusCode ?? 502, res.statusMessage ?? 'Bad Gateway');
      res.resume();
    });

    upstream.on('error', (err) => {
      console.log(`[live-view-proxy] engine unreachable: ${err.message}`);
      reject(socket, 502, 'Bad Gateway');
    });

    upstream.end();
  });
}

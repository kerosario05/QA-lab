import http from 'node:http';
import net from 'node:net';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { attachLiveViewProxy, isLiveViewUpgrade } from './live-view-proxy';

const servers: http.Server[] = [];
const sockets = new Set<net.Socket>();
afterEach(async () => {
  for (const socket of sockets) socket.destroy();
  sockets.clear();
  await Promise.all(servers.splice(0).map((s) => new Promise((resolve) => s.close(resolve))));
});

function listen(server: http.Server): Promise<number> {
  servers.push(server);
  // Upgraded sockets leave the HTTP server's own tracking; destroy them explicitly on cleanup.
  server.on('connection', (socket) => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve((server.address() as AddressInfo).port)));
}

/** Fake engine: accepts the live-view upgrade for rec-1 and echoes bytes back; 404 otherwise. */
function fakeEngine(seen: { path?: string; auth?: string }): http.Server {
  const engine = http.createServer((_req, res) => { res.statusCode = 404; res.end(); });
  engine.on('upgrade', (req, socket) => {
    seen.path = req.url;
    seen.auth = req.headers['x-probe'] as string | undefined;
    if (!req.url?.startsWith('/api/recordings/rec-1/live')) {
      socket.write('HTTP/1.1 404 Not Found\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
      socket.destroy();
      return;
    }
    socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: test\r\n\r\n');
    socket.on('data', (chunk) => socket.write(chunk));
  });
  return engine;
}

/** Raw client: sends an upgrade request and collects everything the BFF sends back. */
function rawUpgrade(port: number, path: string, payload?: string): Promise<string> {
  return new Promise((resolve) => {
    const socket = net.connect(port, '127.0.0.1', () => {
      socket.write(`GET ${path} HTTP/1.1\r\nHost: localhost\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: dGVzdA==\r\nSec-WebSocket-Version: 13\r\nX-Probe: kept\r\n\r\n`);
    });
    let received = '';
    socket.on('data', (chunk) => {
      received += chunk.toString();
      if (payload && received.includes('101') && !received.includes(payload)) socket.write(payload);
      if (!payload || received.includes(payload)) { socket.end(); }
    });
    socket.on('close', () => resolve(received));
    setTimeout(() => { socket.destroy(); }, 2000);
  });
}

async function setup() {
  const seen: { path?: string; auth?: string } = {};
  const enginePort = await listen(fakeEngine(seen));
  const bff = http.createServer((_req, res) => res.end('http'));
  attachLiveViewProxy(bff, () => `http://127.0.0.1:${enginePort}`);
  const bffPort = await listen(bff);
  return { seen, bffPort };
}

describe('live view proxy', () => {
  it('matches only the live-view path', () => {
    expect(isLiveViewUpgrade('/api/recordings/abc/live')).toBe(true);
    expect(isLiveViewUpgrade('/api/recordings/abc/live?x=1')).toBe(true);
    expect(isLiveViewUpgrade('/api/recordings/abc/stop')).toBe(false);
    expect(isLiveViewUpgrade('/api/recordings/abc/live/extra')).toBe(false);
  });

  it('tunnels the handshake and bytes both ways to the engine, keeping request headers', async () => {
    const { seen, bffPort } = await setup();
    const received = await rawUpgrade(bffPort, '/api/recordings/rec-1/live', '{"t":"auth","token":"x"}');
    expect(received).toContain('HTTP/1.1 101');
    expect(received).toContain('{"t":"auth","token":"x"}');
    expect(seen.path).toBe('/api/recordings/rec-1/live');
    expect(seen.auth).toBe('kept');
  });

  it('relays an engine refusal (no live stream) instead of hanging', async () => {
    const { bffPort } = await setup();
    const received = await rawUpgrade(bffPort, '/api/recordings/unknown/live');
    expect(received).toContain('404');
  });

  it('answers 502 when the engine is down and 503 when it is not configured', async () => {
    const bff = http.createServer();
    attachLiveViewProxy(bff, () => 'http://127.0.0.1:1');
    const port = await listen(bff);
    expect(await rawUpgrade(port, '/api/recordings/rec-1/live')).toContain('502');

    const unconfigured = http.createServer();
    attachLiveViewProxy(unconfigured, () => '');
    const port2 = await listen(unconfigured);
    expect(await rawUpgrade(port2, '/api/recordings/rec-1/live')).toContain('503');
  });
});

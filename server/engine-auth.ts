import { AsyncLocalStorage } from 'node:async_hooks';
import type { NextFunction, Request, RequestHandler, Response } from 'express';

/**
 * Carries the browser's credentials through to the automation engine.
 *
 * The BFF calls the engine from a dozen providers that were written without a
 * request argument (`requestDiscoveryBatch(payload)` and friends). Threading the
 * header through every signature would touch a lot of unrelated code, so the
 * current request's Authorization is stashed in async-local storage and read
 * back by `engineHeaders()` at the fetch call sites.
 */

type RequestAuth = {
  authorization?: string;
  apiKey?: string;
  /** IP of the PC behind the request; the engine pairs a panel user with the local agent on that PC. */
  clientIp?: string;
};

/** Remote address of the browser/agent, without the IPv4-mapped IPv6 prefix. */
export function clientIpOf(req: { socket?: { remoteAddress?: string } }): string | undefined {
  const raw = req.socket?.remoteAddress;
  if (!raw) return undefined;
  if (raw.startsWith('::ffff:')) return raw.slice(7);
  if (raw === '::1') return '127.0.0.1';
  return raw;
}

const store = new AsyncLocalStorage<RequestAuth>();

/** Express middleware: makes the caller's credentials visible to engine calls. */
export function captureRequestAuth(): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    const authorization = typeof req.headers.authorization === 'string' ? req.headers.authorization : undefined;
    const apiKeyHeader = req.headers['x-api-key'];
    const apiKey = typeof apiKeyHeader === 'string' ? apiKeyHeader : undefined;
    store.run({ authorization, apiKey, clientIp: clientIpOf(req) }, () => next());
  };
}

/**
 * Headers to merge into any fetch aimed at the engine.
 *
 * Falls back to ENGINE_API_KEY so server-initiated work (scheduled jobs, retries
 * with no browser behind them) still authenticates once the engine has
 * AUTH_ENABLED=true.
 */
export function engineHeaders(): Record<string, string> {
  const current = store.getStore();
  const headers: Record<string, string> = {};
  if (current?.authorization) headers.Authorization = current.authorization;
  // Always the socket's address, never a client-sent X-Forwarded-For: the engine trusts
  // this header only from the local BFF.
  if (current?.clientIp) headers['X-Forwarded-For'] = current.clientIp;
  if (current?.apiKey) headers['X-Api-Key'] = current.apiKey;
  else if (!current?.authorization && process.env.ENGINE_API_KEY) {
    headers['X-Api-Key'] = process.env.ENGINE_API_KEY;
  }
  return headers;
}

/** Base URL of the automation engine, without a trailing slash. */
export function engineBaseUrl(): string {
  const base = process.env.RUN_PROVIDER_BASE_URL || process.env.SCENARIO_PREVIEW_BASE_URL || '';
  return base.replace(/\/+$/, '');
}

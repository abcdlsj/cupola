/**
 * One fetch wrapper for the hub. The hub may be the same origin (the hub serves
 * the PWA) or a URL plus read token (a static build). The token lives in
 * localStorage only; it is never put in a URL or a log.
 */

const HUB_KEY = 'cupola.hub';
const TOKEN_KEY = 'cupola.token';

function envBase(): string {
  const value = import.meta.env.VITE_CUPOLA_HUB;
  return typeof value === 'string' ? value : '';
}

function read(key: string): string {
  try {
    return localStorage.getItem(key) ?? '';
  } catch {
    return '';
  }
}

function write(key: string, value: string): void {
  try {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch {
    // Private mode with storage disabled: the session still works in memory.
  }
}

let base = read(HUB_KEY) || envBase();
let token = read(TOKEN_KEY);

export function hubBase(): string {
  return base;
}

/** Blank means "the origin that served this app". */
export function setHub(url: string): void {
  base = url.trim().replace(/\/+$/, '');
  write(HUB_KEY, base);
}

export function setToken(value: string): void {
  token = value.trim();
  write(TOKEN_KEY, token);
}

export class ApiError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

/** The stored token, as an Authorization value, or an empty string. */
export function bearer(): string {
  return token ? `Bearer ${token}` : '';
}

export function apiURL(path: string): string {
  return `${base}${path}`;
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
}

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  let response: Response;
  try {
    response = await fetch(apiURL(path), {
      method: options.method ?? 'GET',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      credentials: base ? 'omit' : 'same-origin',
      signal: options.signal,
    });
  } catch (caught) {
    if (caught instanceof DOMException && caught.name === 'AbortError') throw caught;
    throw new ApiError(0, 'network', 'The hub did not answer.');
  }

  if (response.status === 204) return undefined as T;

  const text = await response.text();
  let payload: unknown;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = undefined;
    }
  }

  if (!response.ok) {
    const error = (payload as { error?: { code?: string; message?: string } } | undefined)?.error;
    throw new ApiError(response.status, error?.code ?? 'http', error?.message ?? `Request failed with ${response.status}.`);
  }

  return payload as T;
}

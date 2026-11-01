import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { apiURL, bearer, hubBase } from './api';
import { invalidateLive } from './queries';

/**
 * The hub's SSE channel. EventSource cannot send an Authorization header, so a
 * static build (hub URL + read token) streams with `fetch`; the same-origin
 * build uses EventSource and its cookie.
 */
export function useStream(enabled: boolean): void {
  const client = useQueryClient();

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;
    const controller = new AbortController();
    let closed = false;
    let retry = 0;
    let timer: number | undefined;

    const schedule = () => {
      if (closed) return;
      retry = Math.min(retry + 1, 6);
      timer = window.setTimeout(connect, 1000 * retry);
    };

    const handle = (chunk: string) => {
      for (const block of chunk.split('\n\n')) {
        const line = block.split('\n').find((entry) => entry.startsWith('data:'));
        if (!line) continue;
        retry = 0;
        invalidateLive(client);
      }
    };

    const connect = () => {
      if (closed) return;
      const headers: Record<string, string> = { Accept: 'text/event-stream' };
      const authorization = bearer();
      if (authorization) headers.Authorization = authorization;
      fetch(apiURL('/api/v1/stream'), {
        headers,
        credentials: hubBase() ? 'omit' : 'same-origin',
        signal: controller.signal,
      })
        .then(async (response) => {
          if (!response.ok || !response.body) {
            schedule();
            return;
          }
          retry = 0;
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            handle(decoder.decode(value, { stream: true }));
          }
          schedule();
        })
        .catch((caught: unknown) => {
          if (caught instanceof DOMException && caught.name === 'AbortError') return;
          schedule();
        });
    };

    connect();
    return () => {
      closed = true;
      controller.abort();
      if (timer) window.clearTimeout(timer);
    };
  }, [client, enabled]);
}

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

    const reconnect = () => {
      if (closed) return;
      retry = Math.min(retry + 1, 6);
      timer = window.setTimeout(connect, 1000 * retry);
    };

    // The hub pushes on every poll; refresh the cached reads at most every two
    // seconds so three boxes polling at 2 s cannot start a refetch storm.
    let flush: number | undefined;
    const schedule = (run: () => void) => {
      if (flush) return;
      run();
      flush = window.setTimeout(() => {
        flush = undefined;
      }, 2000);
    };

    const handle = (chunk: string) => {
      for (const block of chunk.split('\n\n')) {
        const line = block.split('\n').find((entry) => entry.startsWith('data:'));
        if (!line) continue;
        retry = 0;
        schedule(() => invalidateLive(client));
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
            reconnect();
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
          reconnect();
        })
        .catch((caught: unknown) => {
          if (caught instanceof DOMException && caught.name === 'AbortError') return;
          reconnect();
        });
    };

    connect();
    return () => {
      closed = true;
      controller.abort();
      if (timer) window.clearTimeout(timer);
      if (flush) window.clearTimeout(flush);
    };
  }, [client, enabled]);
}

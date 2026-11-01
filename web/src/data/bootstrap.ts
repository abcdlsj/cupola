import { setHub, setToken } from './api';

/**
 * A static PWA is handed a hub by `#hub=…&token=…` once. Accept the values,
 * persist them and strip the fragment so the credentials never reach a log, a
 * screenshot or a shared link.
 */
export function bootstrapFromHash(): void {
  if (typeof window === 'undefined') return;
  const raw = window.location.hash.replace(/^#/, '');
  if (!raw) return;
  const params = new URLSearchParams(raw);
  const hub = params.get('hub');
  const token = params.get('token');
  if (!hub && !token) return;
  if (hub) setHub(hub);
  if (token) setToken(token);
  window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
}

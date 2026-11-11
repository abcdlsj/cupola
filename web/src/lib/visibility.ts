import { useSyncExternalStore } from 'react';

function subscribe(onChange: () => void): () => void {
  document.addEventListener('visibilitychange', onChange);
  return () => document.removeEventListener('visibilitychange', onChange);
}

function snapshot(): boolean {
  return document.visibilityState !== 'hidden';
}

/**
 * False while the tab sits in the background. The live stream and the polling
 * intervals stop then, so a tab left open overnight costs the hub nothing, and
 * the first push after it comes back refills everything at once.
 */
export function useDocumentVisible(): boolean {
  return useSyncExternalStore(subscribe, snapshot, () => true);
}

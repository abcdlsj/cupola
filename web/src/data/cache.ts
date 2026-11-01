// Last-known state for the offline banner. IndexedDB keeps the snapshots
// across reloads; localStorage would overflow on a large fleet.
const DB_NAME = 'cupola-cache';
const STORE = 'kv';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function cacheSet(key: string, value: unknown): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put({ at: Date.now(), value }, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // Offline caching is best effort; a private window can refuse IndexedDB.
  }
}

export async function cacheGet<T>(key: string): Promise<{ at: number; value: T } | null> {
  try {
    const db = await openDB();
    const result = await new Promise<{ at: number; value: T } | null>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const request = tx.objectStore(STORE).get(key);
      request.onsuccess = () => resolve((request.result as { at: number; value: T }) ?? null);
      request.onerror = () => reject(request.error);
    });
    db.close();
    return result;
  } catch {
    return null;
  }
}

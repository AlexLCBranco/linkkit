/**
 * A tiny key-value wrapper over IndexedDB, for a value `localStorage`
 * cannot hold: the backup folder's handle (copied from Boardkit's
 * `store/idb.ts`). Its own database, "linkkit", so it never meets
 * Boardkit's "boardkit" one on the shared site.
 *
 * Every function rejects if IndexedDB is unavailable (private windows,
 * blocked site data); callers treat that as "nothing saved" and carry on.
 */
const DB_NAME = "linkkit";
const STORE = "kv";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Resolves once the work is really done. For a read that is the request's
 * success; for a write, the transaction's completion -- a write the browser
 * refuses (storage full) fails only when the transaction commits, after the
 * request has already reported success.
 */
async function run<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = db.transaction(STORE, mode);
      const request = work(transaction.objectStore(STORE));
      request.onerror = () => reject(request.error);
      if (mode === "readonly") {
        request.onsuccess = () => resolve(request.result);
        return;
      }
      const failed = () =>
        reject(transaction.error ?? request.error ?? new DOMException("The write was not stored", "AbortError"));
      transaction.oncomplete = () => resolve(request.result);
      transaction.onabort = failed;
      transaction.onerror = failed;
    });
  } finally {
    db.close();
  }
}

export function idbGet<T>(key: string): Promise<T | undefined> {
  return run("readonly", (store) => store.get(key) as IDBRequest<T | undefined>);
}

export async function idbSet(key: string, value: unknown): Promise<void> {
  await run("readwrite", (store) => store.put(value, key));
}

export async function idbDelete(key: string): Promise<void> {
  await run("readwrite", (store) => store.delete(key));
}

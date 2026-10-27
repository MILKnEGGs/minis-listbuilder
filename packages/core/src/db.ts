// Local storage. Lists, homebrew rulesets and matches live in this browser's IndexedDB, one database per
// game; nothing is sent anywhere.

import type { Homebrew, List, Match } from './types';

let dbp: Promise<IDBDatabase> | undefined;
let dbName = 'milks-lists';

type Store = 'lists' | 'homebrew' | 'matches';

/** Call once at startup, before any other function here. */
export function useDatabase(game: string): void {
  dbName = `milks-${game}-lists`;
  dbp = undefined;
}

function db(): Promise<IDBDatabase> {
  return (dbp ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(dbName, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore('lists', { keyPath: 'id' });
      req.result.createObjectStore('homebrew', { keyPath: 'id' });
      req.result.createObjectStore('matches', { keyPath: 'listId' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }));
}

function run<T>(store: Store, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return db().then(
    (d) =>
      new Promise<T>((resolve, reject) => {
        const tx = d.transaction(store, mode);
        const req = fn(tx.objectStore(store));
        tx.oncomplete = () => resolve(req.result);
        tx.onerror = () => reject(tx.error);
      }),
  );
}

// $state proxies can't be structured-cloned; store a plain copy.
const plain = <T>(x: T): T => JSON.parse(JSON.stringify(x));

export const listLists = () => run<List[]>('lists', 'readonly', (s) => s.getAll());
export const getList = (id: string) => run<List | undefined>('lists', 'readonly', (s) => s.get(id));
export const putList = (l: List) => run('lists', 'readwrite', (s) => s.put(plain(l)));
export const deleteList = (id: string) => run('lists', 'readwrite', (s) => s.delete(id)).then(() => deleteMatch(id));

export const listHomebrew = () => run<Homebrew[]>('homebrew', 'readonly', (s) => s.getAll());
export const putHomebrew = (h: Homebrew) => run('homebrew', 'readwrite', (s) => s.put(plain(h)));
export const deleteHomebrew = (id: string) => run('homebrew', 'readwrite', (s) => s.delete(id));

export const getMatch = (listId: string) => run<Match | undefined>('matches', 'readonly', (s) => s.get(listId));
export const putMatch = (m: Match) => run('matches', 'readwrite', (s) => s.put(plain(m)));
export const deleteMatch = (listId: string) => run('matches', 'readwrite', (s) => s.delete(listId));

/** Asks the browser not to evict our data when storage runs low (best effort). */
export function requestPersistence(): void {
  navigator.storage?.persist?.().catch(() => {});
}

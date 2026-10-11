/** Minimal Promise wrapper over IndexedDB with a key-value table API. */
export interface KVTable {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T): Promise<void>;
  remove(key: string): Promise<void>;
  keys(): Promise<string[]>;
  getAll<T>(): Promise<Array<{ key: string; value: T }>>;
}

function open(name: string, store: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(name, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(store)) req.result.createObjectStore(store);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function reqOk<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

function txDone(t: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

export function kvTable(dbName: string, store: string): KVTable {
  let db: IDBDatabase | null = null;
  async function ready(): Promise<IDBDatabase> {
    if (db) return db;
    db = await open(dbName, store);
    return db;
  }
  return {
    async get<T>(key: string): Promise<T | undefined> {
      const d = await ready();
      const t = d.transaction(store, 'readonly');
      return (await reqOk(t.objectStore(store).get(key))) as T | undefined;
    },
    async set<T>(key: string, value: T): Promise<void> {
      const d = await ready();
      const t = d.transaction(store, 'readwrite');
      t.objectStore(store).put(value, key);
      await txDone(t);
    },
    async remove(key: string): Promise<void> {
      const d = await ready();
      const t = d.transaction(store, 'readwrite');
      t.objectStore(store).delete(key);
      await txDone(t);
    },
    async keys(): Promise<string[]> {
      const d = await ready();
      const t = d.transaction(store, 'readonly');
      const all = await reqOk(t.objectStore(store).getAllKeys());
      return all as string[];
    },
    async getAll<T>(): Promise<Array<{ key: string; value: T }>> {
      const d = await ready();
      const t = d.transaction(store, 'readonly');
      const all = await reqOk(t.objectStore(store).getAll());
      const ks = await reqOk(t.objectStore(store).getAllKeys());
      return all.map((value, i) => ({ key: ks[i] as string, value: value as T }));
    },
  };
}

export const idb = {
  outbox: kvTable('dakshsetu', 'outbox'),
  cache: kvTable('dakshsetu', 'cache'),
  settings: kvTable('dakshsetu', 'settings'),
};
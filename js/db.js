const DB_NAME = 'glucosa';
const DB_VERSION = 1;
const STORE_READINGS = 'readings';
const STORE_META = 'meta';

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_READINGS)) {
        const store = db.createObjectStore(STORE_READINGS, { keyPath: 'id' });
        store.createIndex('by_timestamp', 'timestamp');
      }
      if (!db.objectStoreNames.contains(STORE_META)) {
        db.createObjectStore(STORE_META, { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(storeName, mode, fn) {
  return openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const transaction = db.transaction(storeName, mode);
        const store = transaction.objectStore(storeName);
        let result;
        Promise.resolve(fn(store)).then((r) => {
          result = r;
        });
        transaction.oncomplete = () => resolve(result);
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      })
  );
}

function reqToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export function getAllReadings() {
  return tx(STORE_READINGS, 'readonly', (store) => reqToPromise(store.getAll()));
}

export function getReading(id) {
  return tx(STORE_READINGS, 'readonly', (store) => reqToPromise(store.get(id)));
}

export function putReading(reading) {
  return tx(STORE_READINGS, 'readwrite', (store) => reqToPromise(store.put(reading))).then(
    () => reading
  );
}

export function deleteReading(id) {
  return tx(STORE_READINGS, 'readwrite', (store) => reqToPromise(store.delete(id)));
}

export function replaceAllReadings(readings) {
  return tx(STORE_READINGS, 'readwrite', (store) => {
    store.clear();
    for (const r of readings) store.put(r);
    return true;
  });
}

export function getMeta(key) {
  return tx(STORE_META, 'readonly', (store) => reqToPromise(store.get(key))).then((row) =>
    row ? row.value : null
  );
}

export function setMeta(key, value) {
  return tx(STORE_META, 'readwrite', (store) => reqToPromise(store.put({ key, value })));
}

export function newId() {
  if (crypto && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return 'r-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

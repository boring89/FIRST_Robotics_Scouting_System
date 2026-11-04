// Records (including photos as data URLs) live in IndexedDB; falls back to memory if unavailable.

const DB_NAME = 'frc-scouting';
const STORE = 'records';
let dbPromise;
const memory = new Map();

function open() {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }).catch((err) => {
    console.warn('IndexedDB unavailable, using in-memory storage', err);
    return null;
  });
  return dbPromise;
}

async function run(mode, fn, fallback) {
  const db = await open();
  if (!db) return fallback();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(req.result);
    tx.onerror = () => reject(tx.error);
  });
}

export const store = {
  all: () => run('readonly', (s) => s.getAll(), () => [...memory.values()]),
  put: (rec) => run('readwrite', (s) => s.put(rec), () => memory.set(rec.id, structuredClone(rec))),
  delete: (id) => run('readwrite', (s) => s.delete(id), () => memory.delete(id)),
};

export const prefs = {
  get(key) {
    try { return localStorage.getItem(key); } catch { return null; }
  },
  set(key, value) {
    try { localStorage.setItem(key, value); } catch { /* storage blocked */ }
  },
};

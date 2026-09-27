const DB_NAME = 'speaking-practice';
const STORE = 'attempts';

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('idb'));
  });
}

/** Stores the attempt, including each answer's audio Blob. */
export async function saveAttempt(attempt) {
  const db = await openDb();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(attempt);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('idb-write'));
      tx.onabort = () => reject(tx.error || new Error('idb-abort'));
    });
  } finally {
    db.close();
  }
}

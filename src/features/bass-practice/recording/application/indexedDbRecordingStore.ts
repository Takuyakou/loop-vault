import type { RecordingStore, StoredRecording } from "./recordingStore";

/**
 * IndexedDB-backed binary take store (contract 02, refined). IndexedDB is
 * binary-safe and persists across restarts in both browsers and the Tauri
 * WebView2 runtime (under the app's user-data dir), so it is the single
 * Vault-independent store for kept takes — no Vault schema is touched and no
 * audio ever enters the Practice JSON.
 *
 * This is a thin runtime adapter; the quota/metadata/orphan policy is tested
 * against an in-memory store, so this file is never required to run in jsdom.
 */

const DB_NAME = "loop-vault-recordings";
const DB_VERSION = 1;
const STORE = "takes";

interface DbRow {
  readonly recordingId: string;
  readonly metadata: unknown;
  readonly data: Uint8Array;
  readonly byteLength: number;
}

export function isIndexedDbAvailable(): boolean {
  return typeof indexedDB !== "undefined";
}

export class IndexedDbRecordingStore implements RecordingStore {
  private dbPromise?: Promise<IDBDatabase>;

  private openDb(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;
    this.dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: "recordingId" });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("IndexedDB open failed"));
    });
    return this.dbPromise;
  }

  private async tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const db = await this.openDb();
    return new Promise<T>((resolve, reject) => {
      const transaction = db.transaction(STORE, mode);
      const request = run(transaction.objectStore(STORE));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
    });
  }

  async put(record: StoredRecording): Promise<void> {
    const row: DbRow = {
      recordingId: record.metadata.recordingId,
      metadata: record.metadata,
      data: record.data,
      byteLength: record.data.byteLength,
    };
    await this.tx("readwrite", (store) => store.put(row));
  }

  async listRawMetadata(): Promise<readonly unknown[]> {
    const rows = await this.tx<DbRow[]>("readonly", (store) => store.getAll() as IDBRequest<DbRow[]>);
    return rows.map((row) => row.metadata);
  }

  async getData(recordingId: string): Promise<Uint8Array | undefined> {
    const row = await this.tx<DbRow | undefined>(
      "readonly",
      (store) => store.get(recordingId) as IDBRequest<DbRow | undefined>,
    );
    return row?.data;
  }

  async delete(recordingId: string): Promise<void> {
    await this.tx("readwrite", (store) => store.delete(recordingId));
  }

  async usedBytes(): Promise<number> {
    const rows = await this.tx<DbRow[]>("readonly", (store) => store.getAll() as IDBRequest<DbRow[]>);
    return rows.reduce((sum, row) => sum + (row.byteLength ?? row.data.byteLength), 0);
  }

  async binaryIds(): Promise<readonly string[]> {
    const keys = await this.tx<IDBValidKey[]>("readonly", (store) => store.getAllKeys() as IDBRequest<IDBValidKey[]>);
    return keys.map(String);
  }
}

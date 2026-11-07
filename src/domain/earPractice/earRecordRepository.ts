import { invoke, isTauri } from "@tauri-apps/api/core";
import { z } from "zod";
import type { PracticeStorage } from "../../features/bass-practice/infra/repository/practiceRepository";
import { BrowserPracticeStorage, TauriPracticeStorage } from "../../features/bass-practice/infra/repository/practiceStorage";
import { earChordRecordSchema, type EarChordRecord } from "./earRecords";

export const EAR_RECORDS_APP = "loopvault-ear-practice";
const MAX_BYTES = 16 * 1024 * 1024;

const envelope = z.object({
  app: z.literal(EAR_RECORDS_APP),
  fileVersion: z.literal(1),
  version: z.literal(1),
  revision: z.number().int().positive(),
  records: z.array(z.unknown()),
}).strict();

export interface EarRecordsLoad {
  records: EarChordRecord[];
  /** Said to the player when something was set aside or could not be read. */
  notice?: string;
  /** A newer version wrote the file: it is read as far as it can be, and never written. */
  readOnly: boolean;
}

const stamp = () => new Date().toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);

/**
 * The ear practice's own records, apart from the Dojo's. It never throws on what it reads: a broken file is
 * set aside and the newest valid backup is used; records that do not fit the schema are left out of the figures
 * (and are kept in the file until the next write, which drops them only if the file itself was valid).
 */
export class EarRecordRepository {
  private revision?: number;
  private token?: string;
  private records: EarChordRecord[] = [];
  private readOnly = false;
  private queue: Promise<unknown> = Promise.resolve();
  constructor(private readonly storage: PracticeStorage) {}

  load(): Promise<EarRecordsLoad> {
    return this.serialize(() => this.read());
  }

  /** Adds records after the ones already kept. Returns the records now kept. */
  append(added: readonly EarChordRecord[]): Promise<EarChordRecord[]> {
    return this.serialize(async () => {
      if (!added.length) return this.records;
      const first = await this.read();
      if (first.readOnly) throw new Error("新しい版の耳の記録です。この版では書き換えません。");
      const checked = added.map((record) => earChordRecordSchema.parse(record));
      try {
        return await this.write([...this.records, ...checked]);
      } catch {
        // Something else wrote in between (or the write failed once): read again and try once more.
        await this.read();
        return this.write([...this.records, ...checked]);
      }
    });
  }

  private async write(records: EarChordRecord[]): Promise<EarChordRecord[]> {
    const revision = (this.revision ?? 0) + 1;
    const contents = `${JSON.stringify({ app: EAR_RECORDS_APP, fileVersion: 1, version: 1, revision, records }, null, 2)}\n`;
    if (new TextEncoder().encode(contents).length > MAX_BYTES) throw new Error("耳の記録の保存上限16MBを超えました。");
    await this.storage.commit(contents, stamp(), this.revision, this.token);
    this.revision = revision;
    this.token = (await this.storage.readCommitted())?.token;
    this.records = records;
    return records;
  }

  private async read(): Promise<EarRecordsLoad> {
    const raw = await this.storage.readCommitted();
    if (!raw) {
      this.revision = undefined;
      this.token = undefined;
      this.records = [];
      this.readOnly = false;
      const aside = (await this.storage.listRecoveryArtifacts().catch(() => [])).length > 0;
      return { records: [], readOnly: false, ...(aside ? { notice: "壊れていた耳の記録を別に保管しました。" } : {}) };
    }
    let parsed: unknown;
    try { parsed = JSON.parse(raw.contents); } catch { parsed = undefined; }
    const future = typeof parsed === "object" && parsed !== null
      && ((Number((parsed as { version?: unknown }).version) > 1) || (Number((parsed as { fileVersion?: unknown }).fileVersion) > 1));
    if (future) {
      // Never written: the figures are shown from what this version understands.
      this.readOnly = true;
      this.revision = raw.revision;
      this.token = raw.token;
      const list = (parsed as { records?: unknown }).records;
      this.records = Array.isArray(list) ? list.flatMap((item) => { const ok = earChordRecordSchema.safeParse(item); return ok.success ? [ok.data] : []; }) : [];
      return { records: this.records, readOnly: true, notice: "新しい版の耳の記録です。この版では読むだけで、書き換えません。" };
    }
    const valid = envelope.safeParse(parsed);
    if (valid.success) {
      this.readOnly = false;
      this.revision = raw.revision;
      this.token = raw.token;
      this.records = valid.data.records.flatMap((item) => { const ok = earChordRecordSchema.safeParse(item); return ok.success ? [ok.data] : []; });
      return { records: this.records, readOnly: false };
    }
    return this.recover(raw.token);
  }

  /** The file cannot be read: set it aside (never deleted) and go on from the newest backup that can. */
  private async recover(token: string): Promise<EarRecordsLoad> {
    await this.storage.quarantineCommitted(stamp(), token);
    this.revision = undefined;
    this.token = undefined;
    this.records = [];
    this.readOnly = false;
    for (const backup of await this.storage.listBackups()) {
      let value: unknown;
      try { value = JSON.parse((await this.storage.readBackup(backup.name)).contents); } catch { continue; }
      const valid = envelope.safeParse(value);
      if (!valid.success) continue;
      const records = valid.data.records.flatMap((item) => { const ok = earChordRecordSchema.safeParse(item); return ok.success ? [ok.data] : []; });
      await this.write(records);
      return { records, readOnly: false, notice: "壊れていた耳の記録を別に保管し、直前のバックアップから戻しました。" };
    }
    return { records: [], readOnly: false, notice: "壊れていた耳の記録を別に保管しました。バックアップが無かったため、空から始めます。" };
  }

  private serialize<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.queue.then(operation, operation);
    this.queue = next.catch(() => undefined);
    return next;
  }
}

export function createEarRecordStorage(): PracticeStorage {
  return isTauri() ? new TauriPracticeStorage(invoke, "ear-practice") : new BrowserPracticeStorage(window.localStorage, "ear-practice");
}
export const createEarRecordRepository = () => new EarRecordRepository(createEarRecordStorage());

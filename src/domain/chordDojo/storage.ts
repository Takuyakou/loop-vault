import { invoke, isTauri } from "@tauri-apps/api/core";
import { sha256Hex } from "../midi/fingerprint";
import { parseDojoStore } from "./store";
import type {
  PracticeBackupMetadata,
  PracticeStorage,
  PracticeStoredDocument,
} from "../../features/bass-practice/infra/repository/practiceRepository";

const BROWSER_DATA_KEY = "loop-vault:chord-dojo-v1:data";
const BROWSER_TEMP_KEY = "loop-vault:chord-dojo-v1:tmp";
const BROWSER_BACKUP_PREFIX = "loop-vault:chord-dojo-v1:backup:";
const BROWSER_CORRUPT_PREFIX = "loop-vault:chord-dojo-v1:corrupt:";

interface KeyValueStorage {
  readonly length: number;
  key(index: number): string | null;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export class BrowserPracticeStorage implements PracticeStorage {
  constructor(private readonly storage: KeyValueStorage) {}

  async readCommitted(): Promise<PracticeStoredDocument | undefined> {
    const contents = this.storage.getItem(BROWSER_DATA_KEY) ?? undefined;
    if (contents !== undefined) { try { this.storage.removeItem(BROWSER_TEMP_KEY); } catch { /* retry on the next load */ } }
    return contents === undefined ? undefined : storedDocument(contents);
  }

  async listRecoveryArtifacts(): Promise<readonly string[]> {
    return this.keys(BROWSER_CORRUPT_PREFIX).filter(isBrowserRecoveryArtifact).sort().reverse();
  }

  async commit(contents: string, timestampToken: string, expectedRevision?: number, expectedToken?: string): Promise<number> {
    const revision = validatedNextRevision(contents, expectedRevision);
    const previous = this.storage.getItem(BROWSER_DATA_KEY);
    const currentRevision = previous === null ? undefined : storedDocument(previous).revision;
    const currentToken = previous === null ? undefined : contentToken(previous);
    if (currentRevision !== expectedRevision || currentToken !== expectedToken) throw new Error("Practice storage rejected a stale revision or content token.");
    let backupKey: string | undefined;
    try {
      this.storage.setItem(BROWSER_TEMP_KEY, contents);
      if (previous !== null) {
        backupKey = this.uniqueKey(BROWSER_BACKUP_PREFIX, timestampToken);
        this.storage.setItem(backupKey, previous);
      }
      this.storage.setItem(BROWSER_DATA_KEY, contents);
    } catch (error) {
      if (backupKey) { try { this.storage.removeItem(backupKey); } catch { /* canonical data remains authoritative */ } }
      throw error;
    } finally {
      try { this.storage.removeItem(BROWSER_TEMP_KEY); } catch { /* canonical data decides commit state */ }
    }
    try { this.rotate(BROWSER_BACKUP_PREFIX, 20); } catch { /* post-commit retention cleanup is best effort */ }
    return revision;
  }

  async quarantineCommitted(timestampToken: string, expectedToken: string): Promise<string> {
    const current = this.storage.getItem(BROWSER_DATA_KEY);
    if (current === null) throw new Error("No Practice file exists to quarantine.");
    if (contentToken(current) !== expectedToken) throw new Error("Practice storage rejected a stale quarantine token.");
    this.rotate(BROWSER_CORRUPT_PREFIX, 19);
    const key = this.uniqueKey(BROWSER_CORRUPT_PREFIX, timestampToken);
    this.storage.setItem(key, current);
    this.storage.removeItem(BROWSER_DATA_KEY);
    return key;
  }

  async listBackups(): Promise<readonly PracticeBackupMetadata[]> {
    return this.keys(BROWSER_BACKUP_PREFIX)
      .sort()
      .reverse()
      .flatMap((name) => {
        const contents = this.storage.getItem(name);
        if (contents === null) return [];
        const revision = strictRevision(contents);
        return revision === undefined ? [] : [{ name, revision, token: contentToken(contents) }];
      });
  }

  async readBackup(name: string): Promise<PracticeStoredDocument> {
    if (!name.startsWith(BROWSER_BACKUP_PREFIX) || !this.keys(BROWSER_BACKUP_PREFIX).includes(name)) {
      throw new Error("Practice backup name is invalid.");
    }
    const selected = this.storage.getItem(name);
    if (selected === null || strictRevision(selected) === undefined) {
      throw new Error("Practice backup is invalid.");
    }
    return storedDocument(selected);
  }

  async restoreBackup(name: string, backupToken: string, expectedRevision?: number, expectedToken?: string): Promise<PracticeStoredDocument> {
    const selected = await this.readBackup(name);
    if (selected.token !== backupToken) throw new Error("Practice storage rejected a changed backup token.");
    const contents = withCurrentVersionAndRevision(selected.contents, expectedRevision === undefined ? 1 : expectedRevision + 1);
    const timestampToken = backupTimestamp(name) ?? timestampTokenFromDate(new Date());
    const revision = await this.commit(contents, timestampToken, expectedRevision, expectedToken);
    return { contents, revision, token: contentToken(contents) };
  }

  private uniqueKey(prefix: string, timestampToken: string): string {
    const base = `${prefix}${timestampToken}-`;
    const highest = this.keys(base).reduce((maximum, key) => {
      const suffix = key.slice(base.length);
      return /^\d{6}$/.test(suffix) ? Math.max(maximum, Number(suffix)) : maximum;
    }, -1);
    if (highest >= 999_999) throw new Error("Practice artifact sequence exhausted.");
    return `${base}${String(highest + 1).padStart(6, "0")}`;
  }

  private rotate(prefix: string, maximum: number): void {
    const keys = this.keys(prefix).sort().reverse();
    keys.slice(maximum).forEach((key) => this.storage.removeItem(key));
  }

  private keys(prefix: string): string[] {
    return Array.from({ length: this.storage.length }, (_, index) => this.storage.key(index))
      .filter((key): key is string => Boolean(key?.startsWith(prefix)));
  }
}

type PracticeInvoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;

export class TauriPracticeStorage implements PracticeStorage {
  constructor(private readonly invokeCommand: PracticeInvoke = <T>(command: string, args?: Record<string, unknown>) => invoke<T>(command, args)) {}
  async readLegacy(): Promise<PracticeStoredDocument | undefined> {
    const previous = await this.call<PracticeStoredDocument | null>("read_previous_theme_chord_dojo_file");
    const document = previous ?? (await this.call<PracticeStoredDocument | null>("read_legacy_chord_dojo_file")) ?? undefined;
    if (document) {
      parseDojoStore(document.contents);
      if (containsAlteredClassification(JSON.parse(document.contents))) throw new Error("旧練習記録に未対応の分類があります。元の記録を保持しています。");
    }
    return document;
  }
  async readCommitted(): Promise<PracticeStoredDocument | undefined> {
    return (await this.call<PracticeStoredDocument | null>("load_chord_dojo_file")) ?? undefined;
  }
  async listRecoveryArtifacts(): Promise<readonly string[]> {
    return this.call<string[]>("list_chord_dojo_recovery_artifacts");
  }
  async commit(contents: string, timestampToken: string, expectedRevision?: number, expectedToken?: string): Promise<number> {
    return this.call<number>("save_chord_dojo_file", { contents, timestampToken, expectedRevision, expectedToken });
  }
  async quarantineCommitted(timestampToken: string, expectedToken: string): Promise<string> {
    return this.call<string>("quarantine_chord_dojo_file", { timestampToken, expectedToken });
  }
  async listBackups(): Promise<readonly PracticeBackupMetadata[]> {
    return this.call<PracticeBackupMetadata[]>("list_chord_dojo_backups");
  }
  async readBackup(name: string): Promise<PracticeStoredDocument> {
    return this.call<PracticeStoredDocument>("read_chord_dojo_backup", { name });
  }
  async restoreBackup(name: string, backupToken: string, expectedRevision?: number, expectedToken?: string): Promise<PracticeStoredDocument> {
    return this.call<PracticeStoredDocument>("restore_chord_dojo_backup", { name, backupToken, expectedRevision, expectedToken });
  }
  private async call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
    try { return await this.invokeCommand<T>(command, args); }
    catch (error) { throw normalizePracticeStorageError(error); }
  }
}

export function normalizePracticeStorageError(error: unknown): Error {
  if (error instanceof Error) return error;
  const message = practiceStorageErrorMessage(error) ?? "Practice storage operation failed.";
  const normalized = new Error(message) as Error & { cause?: unknown };
  normalized.cause = error;
  return normalized;
}

function practiceStorageErrorMessage(error: unknown): string | undefined {
  if (typeof error === "string" && error.trim()) return error;
  if (!error || typeof error !== "object") return undefined;
  const record = error as Record<string, unknown>;
  for (const value of [record.message, record.error, record.cause]) {
    const message = practiceStorageErrorMessage(value);
    if (message) return message;
  }
  return undefined;
}

export function createRuntimePracticeStorage(): PracticeStorage {
  if (isTauri()) return new TauriPracticeStorage();
  return new JazzBrowserPracticeStorage(window.localStorage);
}

export class MemoryPracticeStorage implements PracticeStorage {
  committed?: string;
  readonly backups = new Map<string, string>();
  readonly corrupt = new Map<string, string>();
  readonly operations: string[] = [];
  failCommit = false;
  failPostCommitCleanup = false;
  failListBackups = false;
  failListRecoveryArtifacts = false;
  private sequence = 0;

  async readCommitted(): Promise<PracticeStoredDocument | undefined> {
    this.operations.push("read");
    return this.committed === undefined ? undefined : storedDocument(this.committed);
  }
  async listRecoveryArtifacts(): Promise<readonly string[]> {
    if (this.failListRecoveryArtifacts) throw new Error("injected recovery artifact listing failure");
    return [...this.corrupt.keys()].filter(isMemoryRecoveryArtifact).sort().reverse();
  }
  async commit(contents: string, timestampToken: string, expectedRevision?: number, expectedToken?: string): Promise<number> {
    this.operations.push("write-temp");
    if (this.failCommit) throw new Error("injected write failure");
    const revision = validatedNextRevision(contents, expectedRevision);
    const currentRevision = this.committed === undefined ? undefined : storedDocument(this.committed).revision;
    const currentToken = this.committed === undefined ? undefined : contentToken(this.committed);
    if (currentRevision !== expectedRevision || currentToken !== expectedToken) throw new Error("Practice storage rejected a stale revision or content token.");
    if (this.committed !== undefined) this.backups.set(`${timestampToken}-${String(this.sequence++).padStart(6, "0")}`, this.committed);
    this.operations.push("flush-close"); this.operations.push("rename"); this.committed = contents;
    if (this.failPostCommitCleanup) this.operations.push("post-commit-cleanup-warning");
    else {
      const excess = [...this.backups.keys()].sort().reverse().slice(20); excess.forEach((key) => this.backups.delete(key));
    }
    return revision;
  }
  async quarantineCommitted(timestampToken: string, expectedToken: string): Promise<string> {
    if (this.committed === undefined) throw new Error("missing");
    if (contentToken(this.committed) !== expectedToken) throw new Error("Practice storage rejected a stale quarantine token.");
    const path = `loopvault/chord-dojo-v1.corrupt-${timestampToken}-${String(this.sequence++).padStart(6, "0")}.json`;
    this.corrupt.set(path, this.committed); this.committed = undefined; this.operations.push("quarantine");
    const excess = [...this.corrupt.keys()].sort().reverse().slice(20); excess.forEach((key) => this.corrupt.delete(key));
    return path;
  }
  async listBackups(): Promise<readonly PracticeBackupMetadata[]> {
    if (this.failListBackups) throw new Error("injected backup listing failure");
    return [...this.backups.entries()].sort(([left], [right]) => right.localeCompare(left)).flatMap(([name, contents]) => {
      const revision = strictRevision(contents);
      return revision === undefined ? [] : [{ name, revision, token: contentToken(contents) }];
    });
  }
  async readBackup(name: string): Promise<PracticeStoredDocument> {
    const selected = this.backups.get(name);
    if (selected === undefined || strictRevision(selected) === undefined) throw new Error("Practice backup is invalid.");
    return storedDocument(selected);
  }
  async restoreBackup(name: string, backupToken: string, expectedRevision?: number, expectedToken?: string): Promise<PracticeStoredDocument> {
    const selected = await this.readBackup(name);
    if (selected.token !== backupToken) throw new Error("Practice storage rejected a changed backup token.");
    const contents = withCurrentVersionAndRevision(selected.contents, expectedRevision === undefined ? 1 : expectedRevision + 1);
    const revision = await this.commit(contents, backupTimestamp(name) ?? timestampTokenFromDate(new Date()), expectedRevision, expectedToken);
    return { contents, revision, token: contentToken(contents) };
  }
}

function storedDocument(contents: string): PracticeStoredDocument {
  return { contents, revision: strictRevision(contents) ?? 0, token: contentToken(contents) };
}

function contentToken(contents: string): string { return `sha256-${sha256Hex(new TextEncoder().encode(contents))}`; }

function strictRevision(contents: string): number | undefined {
  try {
    const parsed = JSON.parse(contents) as Record<string, unknown>;
    const revision = parsed.revision;
    return parsed.app === "loopvault-chord-dojo"
      && (parsed.fileVersion === 1 || parsed.fileVersion === 2 || parsed.fileVersion === 3 || parsed.fileVersion === 4)
      && Number.isSafeInteger(revision)
      && (revision as number) >= 1
      ? revision as number
      : undefined;
  } catch {
    return undefined;
  }
}

function validatedNextRevision(contents: string, expectedRevision?: number): number {
  const revision = strictRevision(contents);
  const expectedNext = expectedRevision === undefined ? 1 : expectedRevision + 1;
  if (revision !== expectedNext) throw new Error("Practice document revision is not the next revision.");
  return revision;
}

function withCurrentVersionAndRevision(contents: string, revision: number): string {
  const parsed = JSON.parse(contents) as Record<string, unknown>;
  return JSON.stringify({ ...parsed, fileVersion: 4, revision }, null, 2) + "\n";
}

function backupTimestamp(name: string): string | undefined {
  return name.match(/(\d{8}-\d{6})-\d{6}(?:\.json)?$/)?.[1];
}

function timestampTokenFromDate(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
}

function isBrowserRecoveryArtifact(name: string): boolean {
  return /^loop-vault:chord-dojo-v1:corrupt:\d{8}-\d{6}-\d{6}$/.test(name);
}

function isMemoryRecoveryArtifact(name: string): boolean {
  return /^loopvault\/chord-dojo-v1\.corrupt-\d{8}-\d{6}-\d{6}\.json$/.test(name);
}

/** New records have their own namespace: old EXEs cannot quarantine or replace them. */
export class ThemeBrowserPracticeStorage extends BrowserPracticeStorage {
 constructor(private readonly original:KeyValueStorage,current='loop-vault:chord-dojo-theme-v1:'){
  const legacy='loop-vault:chord-dojo-v1:';
  const translate=(name:string)=>name.replace(legacy,current);
  super({get length(){return original.length;},key(index){const name=original.key(index);return name?.startsWith(current)?name.replace(current,legacy):null;},getItem(name){return original.getItem(translate(name));},setItem(name,value){original.setItem(translate(name),value);},removeItem(name){original.removeItem(translate(name));}});
 }
 async readLegacy(){const contents=this.original.getItem(BROWSER_DATA_KEY);if(contents===null){for(let i=0;i<this.original.length;i++){const name=this.original.key(i);if(name?.startsWith(BROWSER_BACKUP_PREFIX)||name?.startsWith(BROWSER_CORRUPT_PREFIX))throw new Error('旧練習記録の復旧が必要です。元の記録を保持しています。');}return;}return storedDocument(contents);}
}

/** Register-aware records are isolated from every previous strict-schema reader. */
export class RangeBrowserPracticeStorage extends ThemeBrowserPracticeStorage {
 constructor(private readonly previous:KeyValueStorage){super(previous,'loop-vault:chord-dojo-theme-ranges-v1:');}
 override async readLegacy(){
  const prefix='loop-vault:chord-dojo-theme-v1:',contents=this.previous.getItem(prefix+'data');
  if(contents!==null)return storedDocument(contents);
  for(let i=0;i<this.previous.length;i++)if(this.previous.key(i)?.startsWith(prefix))throw new Error('以前の練習記録の復旧が必要です。元の記録を保持しています。');
  return super.readLegacy();
 }
}

export const JAZZ_DOJO_PREFIX = 'loop-vault:chord-dojo-txt-jazz-v1:';

/** Altered lesson symbols must never reach a previous strict-schema reader. */
export class JazzBrowserPracticeStorage extends ThemeBrowserPracticeStorage {
 constructor(private readonly prior:KeyValueStorage){super(prior,JAZZ_DOJO_PREFIX);}
 override async readCommitted(){
  const contents=this.prior.getItem(JAZZ_DOJO_PREFIX+'data');
  if(contents!==null){
   let version:unknown;try{version=JSON.parse(contents)?.fileVersion;}catch{/* Repository recovers only this namespace's validated backups. */}
   if(typeof version==='number'&&version>4)throw new Error('この練習記録は新しい版で保存されています。元の記録を保持しています。');
   return storedDocument(contents);
  }
  if((await super.listBackups()).length)return;
  for(let i=0;i<this.prior.length;i++)if(this.prior.key(i)?.startsWith(JAZZ_DOJO_PREFIX))throw new Error('新しい練習記録の復旧が必要です。元の記録を保持しています。');
 }
 override async readLegacy(){
  const prefix='loop-vault:chord-dojo-theme-ranges-v1:',contents=this.prior.getItem(prefix+'data');
  if(contents!==null){parseDojoStore(contents);if(containsAlteredClassification(JSON.parse(contents)))throw new Error('旧練習記録に未対応の分類があります。元の記録を保持しています。');return storedDocument(contents);}
  for(let i=0;i<this.prior.length;i++)if(this.prior.key(i)?.startsWith(prefix))throw new Error('以前の練習記録の復旧が必要です。元の記録を保持しています。');
  return new RangeBrowserPracticeStorage(this.prior).readLegacy();
 }
}

function containsAlteredClassification(value:unknown):boolean {
 if(!value||typeof value!=='object')return false;
 if(Array.isArray(value))return value.some(containsAlteredClassification);
 const record=value as Record<string,unknown>;
 return record.altered===true||Object.values(record).some(containsAlteredClassification);
}

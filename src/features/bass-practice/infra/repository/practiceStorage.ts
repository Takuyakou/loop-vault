import { invoke, isTauri } from "@tauri-apps/api/core";
import { sha256Hex } from "../../../../domain/midi/fingerprint";
import type {
  PracticeBackupMetadata,
  PracticeStorage,
  PracticeStoredDocument,
} from "./practiceRepository";

const BROWSER_DATA_KEY = "loop-vault:practice-v1:data";
const BROWSER_TEMP_KEY = "loop-vault:practice-v1:tmp";
const BROWSER_BACKUP_PREFIX = "loop-vault:practice-v1:backup:";
const BROWSER_CORRUPT_PREFIX = "loop-vault:practice-v1:corrupt:";

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
    const contents = withRevision(selected.contents, expectedRevision === undefined ? 1 : expectedRevision + 1);
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
  async readCommitted(): Promise<PracticeStoredDocument | undefined> {
    return (await this.call<PracticeStoredDocument | null>("load_practice_file")) ?? undefined;
  }
  async listRecoveryArtifacts(): Promise<readonly string[]> {
    return this.call<string[]>("list_practice_recovery_artifacts");
  }
  async commit(contents: string, timestampToken: string, expectedRevision?: number, expectedToken?: string): Promise<number> {
    return this.call<number>("save_practice_file", { contents, timestampToken, expectedRevision, expectedToken });
  }
  async quarantineCommitted(timestampToken: string, expectedToken: string): Promise<string> {
    return this.call<string>("quarantine_practice_file", { timestampToken, expectedToken });
  }
  async listBackups(): Promise<readonly PracticeBackupMetadata[]> {
    return this.call<PracticeBackupMetadata[]>("list_practice_backups");
  }
  async readBackup(name: string): Promise<PracticeStoredDocument> {
    return this.call<PracticeStoredDocument>("read_practice_backup", { name });
  }
  async restoreBackup(name: string, backupToken: string, expectedRevision?: number, expectedToken?: string): Promise<PracticeStoredDocument> {
    return this.call<PracticeStoredDocument>("restore_practice_backup", { name, backupToken, expectedRevision, expectedToken });
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
  return new BrowserPracticeStorage(window.localStorage);
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
    const path = `loopvault/practice-v1.corrupt-${timestampToken}-${String(this.sequence++).padStart(6, "0")}.json`;
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
    const contents = withRevision(selected.contents, expectedRevision === undefined ? 1 : expectedRevision + 1);
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
    return parsed.app === "loopvault-practice"
      && parsed.fileVersion === 1
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

function withRevision(contents: string, revision: number): string {
  const parsed = JSON.parse(contents) as Record<string, unknown>;
  return `${JSON.stringify({ ...parsed, revision }, null, 2)}\n`;
}

function backupTimestamp(name: string): string | undefined {
  return name.match(/(\d{8}-\d{6})-\d{6}(?:\.json)?$/)?.[1];
}

function timestampTokenFromDate(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
}

function isBrowserRecoveryArtifact(name: string): boolean {
  return /^loop-vault:practice-v1:corrupt:\d{8}-\d{6}-\d{6}$/.test(name);
}

function isMemoryRecoveryArtifact(name: string): boolean {
  return /^loopvault\/practice-v1\.corrupt-\d{8}-\d{6}-\d{6}\.json$/.test(name);
}

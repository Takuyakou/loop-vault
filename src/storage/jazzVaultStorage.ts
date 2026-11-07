import { BACKUP_DIR, DATA_PATH, VAULT_DIR, JsonVaultRepository, hasAlteredClassification, VaultRepositoryError, type JsonVaultRepositoryOptions, type VaultBackup, type VaultImportOptions, type VaultStorage } from "../domain/repository";
import { parseVaultFileJson } from "../domain/schema";

export const JAZZ_VAULT_DIR = `${VAULT_DIR}/txt-jazz-v3`;
export const JAZZ_VAULT_DATA_PATH = `${JAZZ_VAULT_DIR}/data.json`;
export const JAZZ_VAULT_MIGRATION_COPY = `${JAZZ_VAULT_DIR}/legacy-import.json`;

/** Isolates new records from every old EXE, including its explicit recovery. */
export class JazzVaultStorage implements VaultStorage {
  private initialized?: Promise<void>;
  private recoveryDepth = 0;
  constructor(private readonly storage: VaultStorage) {}

  private ready(): Promise<void> {
    if (this.recoveryDepth > 0) return Promise.resolve();
    return this.initialized ??= this.initialize().catch(error => {
      this.initialized = undefined;
      throw error;
    });
  }

  async assertLoadable(): Promise<void> {
    await this.ready();
    if (!(await this.storage.exists(JAZZ_VAULT_DATA_PATH))) await this.refuseExistingArtifacts();
  }

  async explicitRecovery<T>(action: () => Promise<T>, preserveCommitted = true): Promise<T> {
    // Keep the previous committed bytes even for an explicitly requested replace.
    if (preserveCommitted && await this.storage.exists(JAZZ_VAULT_DATA_PATH)) {
      let index = 0;
      while (await this.storage.exists(`${JAZZ_VAULT_DIR}/recovery-before-${index}.json`)) index++;
      await this.storage.copyFile(JAZZ_VAULT_DATA_PATH, `${JAZZ_VAULT_DIR}/recovery-before-${index}.json`);
    }
    this.recoveryDepth++;
    try { return await action(); } finally { this.recoveryDepth--; }
  }

  private async refuseExistingArtifacts(): Promise<void> {
    if (await this.storage.exists(JAZZ_VAULT_DIR)) {
      if ((await this.storage.listFiles(JAZZ_VAULT_DIR)).length > 0
        || ((await this.storage.exists(`${JAZZ_VAULT_DIR}/backups`))
          && (await this.storage.listFiles(`${JAZZ_VAULT_DIR}/backups`)).length > 0)) {
        throw migrationError("新しいVaultの復旧が必要です。元の記録は保持しています。設定でバックアップを復元するか、正常なVaultを読み込んでください。");
      }
    }
  }

  private async initialize(): Promise<void> {
    if (await this.storage.exists(JAZZ_VAULT_DATA_PATH)) return;
    // An interrupted migration, damaged file moved aside, or existing backup is
    // recovery state, never permission to reimport an older EXE's later changes.
    await this.refuseExistingArtifacts();
    if (!(await this.storage.exists(DATA_PATH))) {
      const oldFiles = await this.storage.exists(VAULT_DIR) ? await this.storage.listFiles(VAULT_DIR) : [];
      const oldBackups = await this.storage.exists(BACKUP_DIR) ? await this.storage.listFiles(BACKUP_DIR) : [];
      if (oldBackups.length || oldFiles.some(name => name.startsWith("data."))) {
        throw migrationError("旧Vaultの復旧が必要です。元の記録は保持しています。");
      }
      return;
    }
    const raw = await this.storage.readText(DATA_PATH);
    const parsed = parseVaultFileJson(raw);
    let version: unknown;
    try { version = (JSON.parse(raw) as {fileVersion?: unknown}).fileVersion; } catch { /* full parser supplies the rejection */ }
    if (!parsed.ok || parsed.quarantine.length || (version !== 1 && version !== 2)) {
      throw migrationError("旧Vaultを安全に移行できません。元の記録とバックアップを保持しています。");
    }
    // The permanent byte-for-byte copy is outside rotating backups. A failed
    // write leaves artifacts and blocks a silent retry from a different source.
    if (hasAlteredClassification(parsed.vault)) {
      throw migrationError("旧Vaultに未対応の分類情報があります。元の記録は保持しています。");
    }
    await this.storage.ensureDir(JAZZ_VAULT_DIR);
    await this.storage.writeText(JAZZ_VAULT_MIGRATION_COPY, raw);
    // Retain v1's existing oversized read-only recovery contract as well as
    // byte identity. All subsequent writes still use the existing size budget.
    await this.storage.writeText(`${JAZZ_VAULT_DATA_PATH}.tmp`, raw);
    await this.storage.rename(`${JAZZ_VAULT_DATA_PATH}.tmp`, JAZZ_VAULT_DATA_PATH);
  }

  private path(path: string): string {
    if (path === VAULT_DIR) return JAZZ_VAULT_DIR;
    if (!path.startsWith(`${VAULT_DIR}/`)) throw migrationError("Vault内部の保存先が不正です。");
    return `${JAZZ_VAULT_DIR}/${path.slice(VAULT_DIR.length + 1)}`;
  }

  async ensureDir(path: string): Promise<void> { await this.ready(); await this.storage.ensureDir(this.path(path)); }
  async exists(path: string): Promise<boolean> { await this.ready(); return this.storage.exists(this.path(path)); }
  async readText(path: string, options?: {external?: boolean}): Promise<string> {
    await this.ready(); return this.storage.readText(options?.external ? path : this.path(path), options);
  }
  async writeText(path: string, contents: string, options?: {external?: boolean}): Promise<void> {
    await this.ready(); await this.storage.writeText(options?.external ? path : this.path(path), contents, options);
  }
  async rename(from: string, to: string): Promise<void> { await this.ready(); await this.storage.rename(this.path(from), this.path(to)); }
  async copyFile(from: string, to: string): Promise<void> { await this.ready(); await this.storage.copyFile(this.path(from), this.path(to)); }
  async removeFile(path: string): Promise<void> { await this.ready(); await this.storage.removeFile(this.path(path)); }
  async listFiles(path: string): Promise<string[]> { await this.ready(); return this.storage.listFiles(this.path(path)); }
}

/** Loading never retries missing data as empty; explicit recovery stays usable. */
export class JazzVaultRepository extends JsonVaultRepository {
  private readonly jazzStorage: JazzVaultStorage;
  constructor(storage: VaultStorage, options?: JsonVaultRepositoryOptions) {
    const jazzStorage = new JazzVaultStorage(storage);
    super(jazzStorage, options);
    this.jazzStorage = jazzStorage;
  }
  override async load() { await this.jazzStorage.assertLoadable(); return super.load(); }
  override async importFrom(path: string, options?: VaultImportOptions) {
    if (options?.mode === "merge") await this.jazzStorage.assertLoadable();
    return this.jazzStorage.explicitRecovery(() => super.importFrom(path, options));
  }
  override async listBackups(): Promise<VaultBackup[]> {
    return this.jazzStorage.explicitRecovery(async () => {
      const backups = await super.listBackups();
      if (await this.jazzStorage.exists(`${VAULT_DIR}/legacy-import.json`)) {
        backups.push({name:"legacy-import.json",path:`${VAULT_DIR}/legacy-import.json`,createdAt:""});
      }
      return backups;
    }, false);
  }
  override async restore(backupName: string) {
    return this.jazzStorage.explicitRecovery(async () => {
      if (backupName !== "legacy-import.json") return super.restore(backupName);
      const raw = await this.jazzStorage.readText(`${VAULT_DIR}/legacy-import.json`);
      const result = parseVaultFileJson(raw);
      if (!result.ok || result.quarantine.length) throw migrationError("移行前のコピーを安全に復元できません。元の記録は保持しています。");
      await super.save(result.vault);
      return {vault:result.vault,quarantine:[],created:false};
    });
  }
}

function migrationError(message: string): VaultRepositoryError {
  return new VaultRepositoryError("migration-recovery", message);
}

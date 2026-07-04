import {
  parseVaultFileJson,
  vaultFileSchema,
  type QuarantinedRecord,
} from "./schema";
import type { VaultFile } from "./types";

export const VAULT_DIR = "loopvault";
export const DATA_PATH = `${VAULT_DIR}/data.json`;
export const TEMP_DATA_PATH = `${DATA_PATH}.tmp`;
export const BACKUP_DIR = `${VAULT_DIR}/backups`;
export const MAX_BACKUPS = 20;

export interface VaultBackup {
  name: string;
  path: string;
  createdAt: string;
}

export interface VaultLoadResult {
  vault: VaultFile;
  quarantine: QuarantinedRecord[];
  created: boolean;
}

export interface VaultRepository {
  load(): Promise<VaultLoadResult>;
  save(vault: VaultFile): Promise<void>;
  exportTo(path: string): Promise<void>;
  importFrom(path: string): Promise<VaultLoadResult>;
  listBackups(): Promise<VaultBackup[]>;
  restore(backupName: string): Promise<VaultLoadResult>;
}

export interface VaultStorage {
  ensureDir(path: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  readText(path: string, options?: { external?: boolean }): Promise<string>;
  writeText(
    path: string,
    contents: string,
    options?: { external?: boolean },
  ): Promise<void>;
  rename(from: string, to: string): Promise<void>;
  copyFile(from: string, to: string): Promise<void>;
  removeFile(path: string): Promise<void>;
  listFiles(path: string): Promise<string[]>;
}

type RepositoryErrorKind =
  | "invalid-json"
  | "invalid-vault"
  | "backup-not-found";

export class VaultRepositoryError extends Error {
  constructor(
    readonly kind: RepositoryErrorKind,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "VaultRepositoryError";
  }
}

export interface JsonVaultRepositoryOptions {
  now?: () => Date;
  maxBackups?: number;
}

export class JsonVaultRepository implements VaultRepository {
  private readonly now: () => Date;
  private readonly maxBackups: number;

  constructor(
    private readonly storage: VaultStorage,
    options: JsonVaultRepositoryOptions = {},
  ) {
    this.now = options.now ?? (() => new Date());
    this.maxBackups = options.maxBackups ?? MAX_BACKUPS;
  }

  async load(): Promise<VaultLoadResult> {
    await this.ensureVaultDirs();

    if (!(await this.storage.exists(DATA_PATH))) {
      return {
        vault: createEmptyVault(),
        quarantine: [],
        created: true,
      };
    }

    await this.createStartupBackup();

    const raw = await this.storage.readText(DATA_PATH);
    return {
      ...(this.parseLoadedVault(raw)),
      created: false,
    };
  }

  async save(vault: VaultFile): Promise<void> {
    await this.ensureVaultDirs();
    const serialized = serializeVault(vault);
    await this.storage.writeText(TEMP_DATA_PATH, serialized);
    await this.storage.rename(TEMP_DATA_PATH, DATA_PATH);
  }

  async exportTo(path: string): Promise<void> {
    const loadResult = await this.load();
    await this.storage.writeText(path, serializeVault(loadResult.vault), {
      external: true,
    });
  }

  async importFrom(path: string): Promise<VaultLoadResult> {
    const raw = await this.storage.readText(path, { external: true });
    const loadResult = {
      ...this.parseLoadedVault(raw),
      created: false,
    };
    await this.save(loadResult.vault);
    return loadResult;
  }

  async listBackups(): Promise<VaultBackup[]> {
    await this.storage.ensureDir(BACKUP_DIR);
    const names = await this.storage.listFiles(BACKUP_DIR);

    return names
      .filter(isBackupFileName)
      .sort((a, b) => b.localeCompare(a))
      .map((name) => ({
        name,
        path: joinVaultPath(BACKUP_DIR, name),
        createdAt: backupNameToIso(name),
      }));
  }

  async restore(backupName: string): Promise<VaultLoadResult> {
    if (!isBackupFileName(backupName)) {
      throw new VaultRepositoryError(
        "backup-not-found",
        `Invalid backup name: ${backupName}`,
      );
    }

    const backupPath = joinVaultPath(BACKUP_DIR, backupName);

    if (!(await this.storage.exists(backupPath))) {
      throw new VaultRepositoryError(
        "backup-not-found",
        `Backup was not found: ${backupName}`,
      );
    }

    const raw = await this.storage.readText(backupPath);
    const loadResult = {
      ...this.parseLoadedVault(raw),
      created: false,
    };
    await this.save(loadResult.vault);
    return loadResult;
  }

  private async ensureVaultDirs(): Promise<void> {
    await this.storage.ensureDir(VAULT_DIR);
    await this.storage.ensureDir(BACKUP_DIR);
  }

  private async createStartupBackup(): Promise<void> {
    const backupPath = joinVaultPath(BACKUP_DIR, backupFileName(this.now()));
    await this.storage.copyFile(DATA_PATH, backupPath);
    await this.rotateBackups();
  }

  private async rotateBackups(): Promise<void> {
    const backups = await this.listBackups();
    const excess = backups.slice(this.maxBackups);

    await Promise.all(
      excess.map((backup) => this.storage.removeFile(backup.path)),
    );
  }

  private parseLoadedVault(raw: string): Omit<VaultLoadResult, "created"> {
    const result = parseVaultFileJson(raw);

    if (!result.ok) {
      throw new VaultRepositoryError(
        result.error.kind,
        result.error.kind === "invalid-json"
          ? result.error.message
          : "Vault file failed schema validation",
        result.error,
      );
    }

    return {
      vault: result.vault,
      quarantine: result.quarantine,
    };
  }
}

export function createEmptyVault(): VaultFile {
  return {
    app: "loopvault",
    fileVersion: 1,
    settings: { monthlyGoal: 1 },
    ideas: [],
  };
}

export function serializeVault(vault: VaultFile): string {
  return `${JSON.stringify(vaultFileSchema.parse(vault), null, 2)}\n`;
}

export function backupFileName(date: Date): string {
  const year = date.getFullYear();
  const month = pad2(date.getMonth() + 1);
  const day = pad2(date.getDate());
  const hour = pad2(date.getHours());
  const minute = pad2(date.getMinutes());
  return `data-${year}${month}${day}-${hour}${minute}.json`;
}

function backupNameToIso(name: string): string {
  const match = /^data-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})\.json$/.exec(
    name,
  );

  if (!match) {
    return "";
  }

  const [, year, month, day, hour, minute] = match;
  return new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
  ).toISOString();
}

function isBackupFileName(name: string): boolean {
  return /^data-\d{8}-\d{4}\.json$/.test(name);
}

function joinVaultPath(...parts: string[]): string {
  return parts.map((part) => part.replace(/^\/+|\/+$/g, "")).join("/");
}

function pad2(value: number): string {
  return value.toString().padStart(2, "0");
}

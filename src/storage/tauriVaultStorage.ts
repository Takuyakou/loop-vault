import {
  BaseDirectory,
  copyFile,
  exists,
  mkdir,
  readDir,
  readTextFile,
  remove,
  rename,
  stat,
  writeTextFile,
} from "@tauri-apps/plugin-fs";
import type { VaultStorage } from "../domain/repository";
import {
  assertExternalVaultByteLength,
  utf8ByteLength,
} from "../security/intakeBudgets";

const appData = { baseDir: BaseDirectory.AppData };

function options(external?: boolean) {
  return external ? undefined : appData;
}

export class TauriVaultStorage implements VaultStorage {
  async ensureDir(path: string): Promise<void> {
    await mkdir(path, { ...appData, recursive: true });
  }

  async exists(path: string): Promise<boolean> {
    return exists(path, appData);
  }

  async readText(
    path: string,
    readOptions: { external?: boolean } = {},
  ): Promise<string> {
    if (readOptions.external) {
      const metadata = await stat(path);
      assertExternalVaultByteLength(metadata.size);
    }
    const contents = await readTextFile(path, options(readOptions.external));
    if (readOptions.external) {
      assertExternalVaultByteLength(utf8ByteLength(contents));
    }
    return contents;
  }

  async writeText(
    path: string,
    contents: string,
    writeOptions: { external?: boolean } = {},
  ): Promise<void> {
    await writeTextFile(path, contents, options(writeOptions.external));
  }

  async rename(from: string, to: string): Promise<void> {
    await rename(from, to, {
      oldPathBaseDir: BaseDirectory.AppData,
      newPathBaseDir: BaseDirectory.AppData,
    });
  }

  async copyFile(from: string, to: string): Promise<void> {
    await copyFile(from, to, {
      fromPathBaseDir: BaseDirectory.AppData,
      toPathBaseDir: BaseDirectory.AppData,
    });
  }

  async removeFile(path: string): Promise<void> {
    await remove(path, appData);
  }

  async listFiles(path: string): Promise<string[]> {
    const entries = await readDir(path, appData);
    return entries.filter((entry) => entry.isFile).map((entry) => entry.name);
  }
}

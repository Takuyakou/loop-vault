import type { VaultStorage } from "../domain/repository";

export class BrowserMemoryVaultStorage implements VaultStorage {
  private readonly files = new Map<string, string>();
  private readonly directories = new Set<string>();

  async ensureDir(path: string): Promise<void> {
    this.directories.add(path);
  }

  async exists(path: string): Promise<boolean> {
    return this.files.has(path) || this.directories.has(path);
  }

  async readText(path: string): Promise<string> {
    const contents = this.files.get(path);
    if (contents === undefined) {
      throw new Error(`Missing file: ${path}`);
    }
    return contents;
  }

  async writeText(path: string, contents: string): Promise<void> {
    this.files.set(path, contents);
  }

  async rename(from: string, to: string): Promise<void> {
    const contents = await this.readText(from);
    this.files.set(to, contents);
    this.files.delete(from);
  }

  async copyFile(from: string, to: string): Promise<void> {
    this.files.set(to, await this.readText(from));
  }

  async removeFile(path: string): Promise<void> {
    this.files.delete(path);
  }

  async listFiles(path: string): Promise<string[]> {
    const prefix = `${path}/`;
    return [...this.files.keys()]
      .filter((filePath) => filePath.startsWith(prefix))
      .map((filePath) => filePath.slice(prefix.length))
      .filter((name) => !name.includes("/"));
  }
}

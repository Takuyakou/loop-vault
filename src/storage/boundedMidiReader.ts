import { readFile, stat } from "@tauri-apps/plugin-fs";
import {
  assertMidiByteLength,
  assertMidiFileCount,
  assertMidiTotalBytes,
} from "../security/intakeBudgets";

export async function readBoundedMidiPath(path: string): Promise<Uint8Array> {
  const [bytes] = await readBoundedMidiPaths([path]);
  return bytes;
}

export async function readBoundedMidiPaths(
  paths: readonly string[],
): Promise<Uint8Array[]> {
  assertMidiFileCount(paths.length);
  const metadata = await Promise.all(paths.map((path) => stat(path)));
  assertMidiTotalBytes(metadata.map(({ size }) => size));

  const files = await Promise.all(paths.map(async (path) => {
    const bytes = await readFile(path);
    assertMidiByteLength(bytes.byteLength);
    return bytes;
  }));
  assertMidiTotalBytes(files.map(({ byteLength }) => byteLength));
  return files;
}

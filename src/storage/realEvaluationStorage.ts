import { appDataDir } from "@tauri-apps/api/path";
import { BaseDirectory, exists, mkdir, readFile, remove, stat, writeTextFile } from "@tauri-apps/plugin-fs";
import { openPath } from "@tauri-apps/plugin-opener";
import type { SongIdea } from "../domain/types";
import { fingerprintMidiBytes, legacyFingerprintMidiBytes } from "../domain/midi/fingerprint";
import type { LocalMidiSourceIndexEntry } from "../domain/midi/realEvaluation/types";

export const evaluationDirectoryRelativePath = "loopvault/evaluation";
const sourceIndexPath = `${evaluationDirectoryRelativePath}/source-index.json`;
const differenceReviewsPath = `${evaluationDirectoryRelativePath}/difference-reviews.jsonl`;
const promotedCorrectionsPath = `${evaluationDirectoryRelativePath}/promoted-corrections.jsonl`;
const realCasesPath = `${evaluationDirectoryRelativePath}/real-midi-cases.jsonl`;
const appData = { baseDir: BaseDirectory.AppData };

export async function openRealEvaluationFolder(): Promise<void> {
  if (!("__TAURI_INTERNALS__" in window)) return;
  await mkdir(evaluationDirectoryRelativePath, { ...appData, recursive: true });
  await openPath(`${await appDataDir()}${evaluationDirectoryRelativePath}`);
}

export async function deleteDifferenceReviews(): Promise<void> {
  await removeIfExists(differenceReviewsPath);
}

export async function deletePromotedCorrections(): Promise<void> {
  await removeIfExists(promotedCorrectionsPath);
}

export async function deleteRealEvaluationData(): Promise<void> {
  await Promise.all([
    removeIfExists(differenceReviewsPath),
    removeIfExists(promotedCorrectionsPath),
    removeIfExists(realCasesPath),
  ]);
}

export async function rebuildLocalMidiSourceIndex(ideas: readonly SongIdea[]): Promise<number> {
  if (!("__TAURI_INTERNALS__" in window)) return 0;
  const entries: LocalMidiSourceIndexEntry[] = [];
  for (const idea of ideas) {
    for (const asset of idea.assets.filter((item) => item.type === "midi" && item.path)) {
      try {
        const bytes = await readFile(asset.path!);
        const details = await stat(asset.path!);
        const shared = {
          assetId: asset.id,
          lastKnownPath: asset.path,
          fileName: fileNameFromPath(asset.path!),
          size: details.size,
          modifiedAt: details.mtime?.toISOString(),
        };
        entries.push(
          { fingerprint: fingerprintMidiBytes(bytes), ...shared },
          { fingerprint: legacyFingerprintMidiBytes(bytes), ...shared },
        );
      } catch {
        // Missing assets stay in the Vault but are omitted from the local index.
      }
    }
  }
  const unique = [...new Map(entries
    .sort((left, right) => left.fingerprint.localeCompare(right.fingerprint) || (left.assetId ?? "").localeCompare(right.assetId ?? ""))
    .map((entry) => [entry.fingerprint, entry])).values()];
  await mkdir(evaluationDirectoryRelativePath, { ...appData, recursive: true });
  await writeTextFile(sourceIndexPath, `${JSON.stringify(unique, null, 2)}\n`, appData);
  return unique.length;
}

async function removeIfExists(path: string): Promise<void> {
  if (!("__TAURI_INTERNALS__" in window)) return;
  if (await exists(path, appData)) await remove(path, appData);
}

function fileNameFromPath(path: string): string {
  return path.replace(/\\/g, "/").split("/").pop() || "source.mid";
}

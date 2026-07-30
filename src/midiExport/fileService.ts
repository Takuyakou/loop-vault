import { save as showSaveDialog } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import type { ProgressionMidiExportResult } from "../domain/midiExport";

export const DEFAULT_PROGRESSION_MIDI_FILE_NAME = "loop-vault-progression.mid";

export interface SavedProgressionMidiFile {
  status: "saved";
  bytesLength: number;
}

export interface CancelledProgressionMidiSave {
  status: "cancelled";
}

export type ProgressionMidiSaveResult =
  | SavedProgressionMidiFile
  | CancelledProgressionMidiSave;

export interface PreparedProgressionMidiDragFile {
  dragToken: string;
  fileName: string;
  tempPath: string;
  bytesLength: number;
  preparedAt: number;
  expiresAt: number;
  contentHash: string;
  reused: boolean;
}

export interface MidiExportFileDependencies {
  showSaveDialog(options: {
    defaultPath: string;
    filters: Array<{ name: string; extensions: string[] }>;
  }): Promise<string | null>;
  invoke<T>(command: string, args?: Record<string, unknown>): Promise<T>;
}

const defaultDependencies: MidiExportFileDependencies = {
  showSaveDialog,
  invoke,
};

export async function saveProgressionMidi(
  result: ProgressionMidiExportResult,
  dependencies: MidiExportFileDependencies = defaultDependencies,
): Promise<ProgressionMidiSaveResult> {
  const selectedPath = await dependencies.showSaveDialog({
    defaultPath: DEFAULT_PROGRESSION_MIDI_FILE_NAME,
    filters: [{ name: "MIDI", extensions: ["mid", "midi"] }],
  });
  if (selectedPath === null) return { status: "cancelled" };

  const filePath = ensureMidiExtension(selectedPath);
  const saved = await dependencies.invoke<{ bytesLength: number }>(
    "save_progression_midi",
    {
      filePath,
      bytes: Array.from(result.bytes),
    },
  );
  return { status: "saved", bytesLength: saved.bytesLength };
}

export async function prepareProgressionDragFile(
  result: ProgressionMidiExportResult,
  dependencies: Pick<MidiExportFileDependencies, "invoke"> = defaultDependencies,
): Promise<PreparedProgressionMidiDragFile> {
  return dependencies.invoke<PreparedProgressionMidiDragFile>(
    "prepare_progression_midi_drag",
    {
      fileName: DEFAULT_PROGRESSION_MIDI_FILE_NAME,
      bytes: Array.from(result.bytes),
    },
  );
}

export async function cleanupStaleProgressionMidiExports(
  dependencies: Pick<MidiExportFileDependencies, "invoke"> = defaultDependencies,
): Promise<{ removed: number; skipped: number }> {
  return dependencies.invoke("cleanup_stale_progression_midi_exports");
}

export function ensureMidiExtension(filePath: string): string {
  if (/\.midi?$/i.test(filePath)) return filePath;
  return `${filePath}.mid`;
}

export function sanitizeProgressionMidiFileName(value: string): string {
  const normalized = value
    .split("")
    .map((character) =>
      character.charCodeAt(0) <= 31 || '<>:"/\\|?*'.includes(character)
        ? "-"
        : character,
    )
    .join("")
    .replace(/[. ]+$/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 96);
  const base = normalized.replace(/-+$/g, "");
  const safe = base && !isWindowsReservedName(base) ? base : "loop-vault-progression";
  return ensureMidiExtension(safe);
}

function isWindowsReservedName(value: string): boolean {
  const stem = value.replace(/\.[^.]+$/, "").toUpperCase();
  return /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/.test(stem);
}

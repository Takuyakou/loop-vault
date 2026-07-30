import { invoke } from "@tauri-apps/api/core";
import type { ProgressionMidiExportResult } from "../domain/midiExport";
import {
  prepareProgressionDragFile,
  type PreparedProgressionMidiDragFile,
} from "./fileService";

export interface NativeProgressionMidiDragResult {
  status: "dropped" | "cancelled" | "error";
  effect: number;
  errorCode?: number;
}

export interface NativeProgressionMidiDragDependencies {
  prepare(
    result: ProgressionMidiExportResult,
  ): Promise<PreparedProgressionMidiDragFile>;
  invoke(
    command: string,
    args?: Record<string, unknown>,
  ): Promise<NativeProgressionMidiDragResult>;
}

const defaultDependencies: NativeProgressionMidiDragDependencies = {
  prepare: prepareProgressionDragFile,
  invoke,
};

export async function startProgressionMidiDrag(
  result: ProgressionMidiExportResult,
  dependencies: NativeProgressionMidiDragDependencies = defaultDependencies,
): Promise<NativeProgressionMidiDragResult> {
  const prepared = await dependencies.prepare(result);
  return dependencies.invoke("start_progression_midi_drag", {
    dragToken: prepared.dragToken,
  });
}

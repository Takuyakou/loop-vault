import {
  progressionToMidiModel,
  savedProgressionToMidiInput,
} from "./model";
import { serializeProgressionMidi } from "./serializer";
import type {
  ProgressionMidiExportResult,
  SavedProgressionMidiAdapterOptions,
  SavedProgressionMidiSource,
} from "./types";

export function buildProgressionMidi(
  block: SavedProgressionMidiSource,
  options: SavedProgressionMidiAdapterOptions = {},
): ProgressionMidiExportResult {
  const model = progressionToMidiModel(savedProgressionToMidiInput(block, options));
  return {
    ...model,
    bytes: serializeProgressionMidi(model),
  };
}


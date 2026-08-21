import { describe, expect, it } from "vitest";
import {
  IntakeBudgetError,
  MAX_EXTERNAL_VAULT_BYTES,
  MIDI_INTAKE_LIMITS,
  assertExternalVaultByteLength,
  assertMidiByteLength,
  assertMidiFileCount,
  assertMidiTotalBytes,
} from "./intakeBudgets";

describe("intake budgets", () => {
  it("accepts exact MIDI and Vault boundaries", () => {
    expect(() => assertMidiFileCount(MIDI_INTAKE_LIMITS.maxFiles)).not.toThrow();
    expect(() => assertMidiByteLength(MIDI_INTAKE_LIMITS.maxBytesPerFile)).not.toThrow();
    expect(() => assertMidiTotalBytes(Array(4).fill(MIDI_INTAKE_LIMITS.maxBytesPerFile))).not.toThrow();
    expect(() => assertExternalVaultByteLength(MAX_EXTERNAL_VAULT_BYTES)).not.toThrow();
  });

  it("rejects over-limit or invalid values with a safe error", () => {
    expect(() => assertMidiFileCount(MIDI_INTAKE_LIMITS.maxFiles + 1)).toThrow(IntakeBudgetError);
    expect(() => assertMidiByteLength(MIDI_INTAKE_LIMITS.maxBytesPerFile + 1)).toThrow(IntakeBudgetError);
    expect(() => assertMidiTotalBytes([
      MIDI_INTAKE_LIMITS.maxBytesPerFile,
      MIDI_INTAKE_LIMITS.maxBytesPerFile,
      MIDI_INTAKE_LIMITS.maxBytesPerFile,
      MIDI_INTAKE_LIMITS.maxBytesPerFile,
      1,
    ])).toThrow(IntakeBudgetError);
    expect(() => assertExternalVaultByteLength(MAX_EXTERNAL_VAULT_BYTES + 1)).toThrow(IntakeBudgetError);
    expect(() => assertMidiByteLength(Number.NaN)).toThrow(IntakeBudgetError);
  });
});

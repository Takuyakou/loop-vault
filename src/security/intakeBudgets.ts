export const MIDI_INTAKE_LIMITS = Object.freeze({
  maxFiles: 16,
  maxBytesPerFile: 16 * 1024 * 1024,
  maxTotalBytes: 64 * 1024 * 1024,
  maxTracks: 256,
  maxEvents: 500_000,
  maxNotes: 250_000,
  maxMetadataCodeUnitsPerEvent: 16_384,
  maxMetadataCodeUnitsTotal: 1_048_576,
  maxDurationBeats: 100_000,
});

export const MAX_EXTERNAL_VAULT_BYTES = 16 * 1024 * 1024;

export class IntakeBudgetError extends Error {
  constructor(readonly code: string) {
    super("The selected file exceeds Loop Vault's safe import limits.");
    this.name = "IntakeBudgetError";
  }
}

export function assertMidiFileCount(count: number): void {
  if (!Number.isSafeInteger(count) || count < 1 || count > MIDI_INTAKE_LIMITS.maxFiles) {
    throw new IntakeBudgetError("midi-file-count");
  }
}

export function assertMidiByteLength(length: number): void {
  if (!Number.isSafeInteger(length) || length < 1 || length > MIDI_INTAKE_LIMITS.maxBytesPerFile) {
    throw new IntakeBudgetError("midi-file-bytes");
  }
}

export function assertMidiTotalBytes(lengths: readonly number[]): void {
  assertMidiFileCount(lengths.length);
  let total = 0;
  for (const length of lengths) {
    assertMidiByteLength(length);
    total += length;
    if (!Number.isSafeInteger(total) || total > MIDI_INTAKE_LIMITS.maxTotalBytes) {
      throw new IntakeBudgetError("midi-total-bytes");
    }
  }
}

export function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

export function assertExternalVaultByteLength(length: number): void {
  if (!Number.isSafeInteger(length) || length < 1 || length > MAX_EXTERNAL_VAULT_BYTES) {
    throw new IntakeBudgetError("vault-file-bytes");
  }
}

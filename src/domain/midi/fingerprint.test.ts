import { describe, expect, it } from "vitest";
import { fingerprintMidiBytes, legacyFingerprintMidiBytes, sha256Hex } from "./fingerprint";

describe("MIDI fingerprint", () => {
  it("matches the SHA-256 known vector", () => {
    expect(sha256Hex(new TextEncoder().encode("abc"))).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("is deterministic and keeps the legacy fingerprint available", () => {
    const bytes = new Uint8Array([1, 2, 3]);
    expect(fingerprintMidiBytes(bytes)).toMatch(/^sha256-[a-f0-9]{64}$/);
    expect(fingerprintMidiBytes(bytes)).toBe(fingerprintMidiBytes(bytes));
    expect(legacyFingerprintMidiBytes(bytes)).toMatch(/^fnv1a32-[a-f0-9]{8}$/);
  });
});

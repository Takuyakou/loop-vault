import { describe, expect, it } from "vitest";
import {
  DEFAULT_PREVIEW_SOUND,
  loadPreviewSound,
  normalizePreviewSound,
  savePreviewSound,
} from "./previewSoundPreference";

function memoryStorage(initial?: string) {
  const values = new Map<string, string>();
  if (initial !== undefined) values.set("loop-vault:preview-sound:v1", initial);
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  };
}

describe("preview sound preference", () => {
  it("uses piano for missing or invalid values", () => {
    expect(DEFAULT_PREVIEW_SOUND).toBe("piano");
    expect(normalizePreviewSound("unknown")).toBe("piano");
    expect(loadPreviewSound(memoryStorage())).toBe("piano");
    expect(loadPreviewSound(memoryStorage("not-json"))).toBe("piano");
  });

  it("round-trips the electric piano choice", () => {
    const storage = memoryStorage();
    savePreviewSound("electric-piano", storage);
    expect(loadPreviewSound(storage)).toBe("electric-piano");
  });
});

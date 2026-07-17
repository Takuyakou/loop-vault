import { describe, expect, it } from "vitest";
import { loadLiveMidiPreferences, saveLiveMidiPreferences } from "./preferences";

function storage(initial?: string) {
  let value = initial ?? null;
  return {
    getItem: () => value,
    setItem: (_key: string, next: string) => { value = next; },
    value: () => value,
  };
}

describe("Live MIDI preferences", () => {
  it("loads old or empty preferences with defaults", () => {
    expect(loadLiveMidiPreferences(storage(JSON.stringify({})))).toEqual({ alwaysOnTop: true, showHistory: true });
    expect(loadLiveMidiPreferences(storage("broken"))).toEqual({ alwaysOnTop: true, showHistory: true });
  });

  it("round-trips preferred device and mini bounds outside Vault data", () => {
    const target = storage();
    saveLiveMidiPreferences({
      preferredInput: { backendId: "id", name: "Keyboard", previousIndex: 1 },
      miniBounds: { x: 10, y: 20, width: 340, height: 200 },
      alwaysOnTop: true,
      showHistory: false,
    }, target);
    expect(loadLiveMidiPreferences(target)).toMatchObject({
      preferredInput: { backendId: "id", name: "Keyboard", previousIndex: 1 },
      miniBounds: { x: 10, y: 20, width: 340, height: 200 },
      showHistory: false,
    });
    expect(target.value()).not.toContain("fileVersion");
  });
});

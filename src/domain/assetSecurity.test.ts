import { describe, expect, it } from "vitest";
import { assetExtension, canOpenAssetPath } from "./assetSecurity";

describe("asset security", () => {
  it("allows music project and audio assets", () => {
    expect(canOpenAssetPath("C:\\Loops\\track.flp")).toBe(true);
    expect(canOpenAssetPath("C:/Loops/render.WAV")).toBe(true);
    expect(canOpenAssetPath("C:/Loops/export.zip")).toBe(true);
  });

  it("blocks executable file extensions", () => {
    expect(canOpenAssetPath("C:\\Tools\\setup.exe")).toBe(false);
    expect(canOpenAssetPath("C:\\Tools\\danger.bat")).toBe(false);
  });

  it("extracts extensions case-insensitively", () => {
    expect(assetExtension("C:/Music/Idea.MP3")).toBe(".mp3");
  });
});

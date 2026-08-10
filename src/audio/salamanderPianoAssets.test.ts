import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import manifest from "./assets/salamander-piano/asset-manifest.json";

const assetDirectory = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "assets/salamander-piano",
);

describe("Salamander piano asset gate", () => {
  it("keeps every bundled sample and license byte-for-byte identical to the manifest", () => {
    expect(manifest.license).toBe("CC-BY-3.0");
    expect(manifest.distributionCommit).toBe("efd8296360f9526e379bfbe5c1698ff54d6a1d34");
    expect(manifest.assets).toHaveLength(9);
    expect(readdirSync(assetDirectory).filter((path) => path.endsWith(".mp3")).sort())
      .toEqual(manifest.assets.filter((asset) => asset.path.endsWith(".mp3")).map((asset) => asset.path).sort());

    for (const asset of manifest.assets) {
      const bytes = readFileSync(resolve(assetDirectory, asset.path));
      expect(bytes.length, asset.path).toBe(asset.bytes);
      expect(createHash("sha256").update(bytes).digest("hex"), asset.path).toBe(asset.sha256);
    }
  });

  it("records the original author, fixed source commits, license, and offline runtime policy", () => {
    const source = readFileSync(resolve(assetDirectory, "SOURCE.md"), "utf8");
    expect(source).toContain("Alexander Holm");
    expect(source).toContain("3382bf9496bba2486f5ab0de55a264d1dfc38404");
    expect(source).toContain("efd8296360f9526e379bfbe5c1698ff54d6a1d34");
    expect(source).toContain("no CDN or runtime download");
  });
});

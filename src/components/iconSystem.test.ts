import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const sourceRoots = ["src/components", "src/views"];

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.name.endsWith(".tsx") && !entry.name.endsWith(".test.tsx") ? [path] : [];
  });
}

const files = sourceRoots.flatMap(sourceFiles);

describe("icon system", () => {
  it("does not use legacy text glyphs as button icons", () => {
    const glyphs = [0x2605, 0x2606, 0x203a, 0x21b6, 0x21b7, 0x2699]
      .map((codePoint) => String.fromCodePoint(codePoint));

    for (const file of files) {
      const source = readFileSync(file, "utf8");
      for (const glyph of glyphs) {
        expect(source, `${file} still contains the legacy ${glyph} glyph`).not.toContain(glyph);
      }
      expect(source, `${file} still uses the letter C as a copy icon`)
        .not.toMatch(/>\s*C\s*<\/button>/);
    }
  });

  it("uses only the 16px and 20px Lucide sizes", () => {
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      if (!source.includes('from "lucide-react"')) continue;

      const sizes = [...source.matchAll(/size=\{(\d+)\}/g)].map((match) => Number(match[1]));
      expect(sizes.length, `${file} must set every Lucide icon size explicitly`).toBeGreaterThan(0);
      expect(sizes.every((size) => size === 16 || size === 20), file).toBe(true);
    }
  });
});

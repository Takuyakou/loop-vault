import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { filesContaining, GALLERY_SOURCE, readGalleryMarker } from "./check-gallery-excluded.mjs";

test("the gallery source defines one marker", () => {
  assert.match(readGalleryMarker(readFileSync(GALLERY_SOURCE, "utf8")), /^lv-p89-/);
  assert.throws(() => readGalleryMarker("export const OTHER = 1;"), /not found/);
});

test("finds the marker in built files and nothing when it is absent", () => {
  const dist = mkdtempSync(join(tmpdir(), "lv-gallery-"));
  mkdirSync(join(dist, "assets"));
  writeFileSync(join(dist, "index.html"), "<div id=root></div>");
  writeFileSync(join(dist, "assets", "index.js"), "console.log('app')");
  assert.deepEqual(filesContaining(dist, "lv-p89-marker"), []);
  writeFileSync(join(dist, "assets", "gallery.js"), "x='lv-p89-marker'");
  assert.equal(filesContaining(dist, "lv-p89-marker").length, 1);
});

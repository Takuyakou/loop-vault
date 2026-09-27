/* global process, console, URL */
// P8.9-02: the dev-only component gallery must never reach the production build.
// The marker string lives once, in the gallery source (P89_GALLERY_MARKER); this
// check fails if that string appears anywhere in dist/.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const GALLERY_SOURCE = "src/components/ui/ComponentGallery.tsx";

export function readGalleryMarker(source) {
  const match = /export const P89_GALLERY_MARKER = "([^"]+)"/.exec(source);
  if (!match) throw new Error(`P89_GALLERY_MARKER not found in ${GALLERY_SOURCE}`);
  return match[1];
}

export function filesContaining(directory, needle) {
  const hits = [];
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) hits.push(...filesContaining(path, needle));
    else if (/\.(html|js|mjs|css|json|map)$/.test(entry) && readFileSync(path, "utf8").includes(needle)) hits.push(path);
  }
  return hits;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const root = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
  const marker = readGalleryMarker(readFileSync(join(root, GALLERY_SOURCE), "utf8"));
  const hits = filesContaining(join(root, "dist"), marker);
  if (hits.length) {
    console.error(`Component gallery found in the production build: ${hits.join(", ")}`);
    process.exit(1);
  }
  console.log("Component gallery is not in dist/.");
}

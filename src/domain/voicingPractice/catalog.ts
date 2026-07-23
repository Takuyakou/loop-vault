import type { StyleCatalogEntry, VoicingStyleId } from "./types";
import { getStyleCompatibility } from "./compatibility";

export const VOICING_STYLE_CATALOG: readonly StyleCatalogEntry[] = [
  {
    id: "shell-17",
    labelKey: "shell-17",
    supports: (chord) => getStyleCompatibility(chord, "shell-17").supported,
  },
  {
    id: "open-17",
    labelKey: "open-17",
    supports: (chord) => getStyleCompatibility(chord, "open-17").supported,
  },
  {
    id: "rootless-ab",
    labelKey: "rootless-ab",
    supports: (chord) => getStyleCompatibility(chord, "rootless-ab").supported,
  },
] as const;

export function isVoicingStyleId(value: string): value is VoicingStyleId {
  return VOICING_STYLE_CATALOG.some((entry) => entry.id === value);
}

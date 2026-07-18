import type { SuppressedAutoTag } from "../types";
import { isKnownProgressionTagId, PROGRESSION_TAXONOMY_VERSION } from "./taxonomy";
import type { DerivedProgressionTag } from "./types";

export function applyAutoTagSuppression(
  tags: readonly DerivedProgressionTag[],
  suppressed: readonly SuppressedAutoTag[] = [],
): DerivedProgressionTag[] {
  const ids = new Set(suppressed.map((entry) => entry.tagId));
  return tags.filter((tag) => !ids.has(tag.tagId));
}

export function suppressAutoTag(
  suppressed: readonly SuppressedAutoTag[] = [],
  tagId: string,
): SuppressedAutoTag[] {
  if (!isKnownProgressionTagId(tagId) || suppressed.some((entry) => entry.tagId === tagId)) {
    return [...suppressed];
  }
  return [...suppressed, { tagId, taxonomyVersion: PROGRESSION_TAXONOMY_VERSION }];
}

export function restoreAutoTag(
  suppressed: readonly SuppressedAutoTag[] = [],
  tagId: string,
): SuppressedAutoTag[] {
  return suppressed.filter((entry) => entry.tagId !== tagId);
}

export function canonicalManualTag(tag: string): string {
  const normalized = tag.trim().toLocaleLowerCase().replace(/^([a-z][a-z0-9-]*):/, "$1.");
  return isKnownProgressionTagId(normalized) ? normalized : tag.trim();
}

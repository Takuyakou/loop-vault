export {
  buildProgressionIndex,
  classifyProgression,
  filterProgressionIndex,
  removeIdeaFromProgressionIndex,
  replaceIdeaInProgressionIndex,
} from "./index";
export { deriveMoodTags, MOOD_CONFIDENCE_THRESHOLD } from "./deriveMoodTags";
export {
  applyAutoTagSuppression,
  canonicalManualTag,
  restoreAutoTag,
  suppressAutoTag,
} from "./suppression";
export {
  getProgressionTagDefinition,
  isKnownProgressionTagId,
  progressionTagLabel,
  progressionTaxonomy,
  PROGRESSION_TAXONOMY_VERSION,
} from "./taxonomy";
export type {
  DerivedProgressionTag,
  ProgressionClassificationInput,
  ProgressionClassificationResult,
  ProgressionIndex,
  ProgressionIndexEntry,
  ProgressionIndexFilter,
  ProgressionSourceKind,
  ProgressionSourceMetadata,
  ProgressionTagCategory,
} from "./types";

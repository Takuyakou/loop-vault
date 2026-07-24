import {
  legacyProgressionFingerprint,
  progressionFingerprint,
} from "./practice/progressionFingerprint";
import { parseKeySignature } from "./practiceTransposition/keyCatalog";
import { selectConfirmationPitchClasses } from "./practiceTransposition/practiceProgress";
import type {
  ProgressionPracticeProgress,
} from "./practice/types";
import type {
  SavedProgressionBlock,
  SongIdea,
  VaultFile,
} from "./types";

export function normalizeVaultPracticeCompatibility(
  vault: VaultFile,
): VaultFile {
  let vaultChanged = false;
  const ideas = vault.ideas.map((idea) => {
    const progressionBlocks = idea.progressionBlocks?.map((block) => {
      const normalized = normalizeBlockPracticeCompatibility(idea, block);
      if (normalized !== block) vaultChanged = true;
      return normalized;
    });
    if (!progressionBlocks || !vaultChangedForBlocks(
      idea.progressionBlocks,
      progressionBlocks,
    )) {
      return idea;
    }
    return { ...idea, progressionBlocks };
  });

  return vaultChanged ? { ...vault, ideas } : vault;
}

function normalizeBlockPracticeCompatibility(
  idea: SongIdea,
  block: SavedProgressionBlock,
): SavedProgressionBlock {
  const current = block.practice;
  if (!current) return block;
  const effectiveKeySignature = block.detectedKey ?? idea.key;
  let practice = normalizeLegacyFingerprint(
    block,
    current,
    effectiveKeySignature,
  );
  practice = normalizeLegacyConfirmationKeys(
    block,
    practice,
    effectiveKeySignature,
  );
  return practice === current ? block : { ...block, practice };
}

function normalizeLegacyFingerprint(
  block: SavedProgressionBlock,
  practice: ProgressionPracticeProgress,
  effectiveKeySignature: string | undefined,
): ProgressionPracticeProgress {
  if (
    block.detectedKey !== undefined
    || effectiveKeySignature === undefined
    || practice.progressionFingerprint !== legacyProgressionFingerprint(block)
  ) {
    return practice;
  }
  return {
    ...practice,
    progressionFingerprint: progressionFingerprint(
      block,
      effectiveKeySignature,
    ),
  };
}

function normalizeLegacyConfirmationKeys(
  block: SavedProgressionBlock,
  practice: ProgressionPracticeProgress,
  effectiveKeySignature: string | undefined,
): ProgressionPracticeProgress {
  const provisional = practice.provisional;
  if (
    (provisional?.level !== 4 && provisional?.level !== 5)
    || provisional.confirmationPitchClasses !== undefined
    || effectiveKeySignature === undefined
  ) {
    return practice;
  }
  const sourceKey = parseKeySignature(effectiveKeySignature);
  if (!sourceKey) return practice;
  return {
    ...practice,
    provisional: {
      ...provisional,
      confirmationPitchClasses: selectConfirmationPitchClasses(
        provisional.level,
        sourceKey.tonicPitchClass,
        stableMigrationSeed(
          `${block.id}:L${provisional.level}:${sourceKey.tonicPitchClass}`,
        ),
      ),
    },
  };
}

function stableMigrationSeed(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function vaultChangedForBlocks(
  previous: readonly SavedProgressionBlock[] | undefined,
  next: readonly SavedProgressionBlock[],
): boolean {
  return previous?.some((block, index) => block !== next[index]) ?? false;
}

import { describe, expect, it } from 'vitest';
import { parseExtendedTextProgression } from '../extendedTextProgression';
import { extendedTextSaveData } from '../extendedTextSave';
import { makeIdea } from '../testFactory';
import { buildProgressionVoicingPracticeHandoffFromVault } from '../progressionVoicingPractice';
import { splitCard, mergeWithNext, moveBoundary } from '../correction/cardEdits';
import { deleteProgressionCard, progressionToWorkspace, progressionVersion, workspaceToProgression } from './progressionWorkspace';
import { progressionPracticeIdeas, progressionPracticeProjection } from './progressionPracticeProjection';
import type { SavedProgressionBlock } from '../types';

function fixture(text = '| C % | F | G | Am |'): SavedProgressionBlock {
  const data = extendedTextSaveData(parseExtendedTextProgression(text));
  return { id: 'text-test', tags: [], chords: [...data.chords], summaryText: data.summaryText, textSource: data.textSource,
    capturedAt: '2026-10-04T00:00:00.000Z', analyzerVersion: 'synthetic', bpm: 120, detectedKey: 'C major',
    timeSignature: '4/4', sourceStartBeat: 0, sourceEndBeat: data.scoreLengthBeats, startBar: 1, endBar: 4, lengthBars: 4 };
}
function handoff(block: SavedProgressionBlock) {
  const idea = makeIdea({ progressionBlocks: [block] });
  return buildProgressionVoicingPracticeHandoffFromVault(progressionPracticeIdeas([idea]), { ideaId: idea.id, blockId: block.id });
}
describe('read-only edited text practice projection', () => {
  it('retains unchanged source identity and its exact repeated attacks', () => {
    const block = fixture(); expect(progressionPracticeProjection(block)).toBe(block);
    const result = handoff(block); expect(result.ok).toBe(true);
    if (result.ok) expect(result.handoff.snapshots.saved?.events[0]?.attackBeats).toEqual([0, 2]);
  });
  it('makes range copies playable in original bar coordinates without modifying saved text', () => {
    const block = fixture(); const before = structuredClone(block);
    const range = progressionVersion(block, progressionToWorkspace(block), 'range', { startBar: 2, endBar: 2 });
    const result = handoff(range); expect(result.ok).toBe(true);
    if (result.ok) { expect(result.handoff.snapshots.saved?.lengthBeats).toBe(4); expect(result.handoff.snapshots.saved?.events[0]?.startBeat).toBe(0); }
    expect(range.textSource).toBe(block.textSource); expect(block).toEqual(before);
  });
  it('accepts split, merge, boundary and all delete modes through the unchanged handoff', () => {
    const block = fixture(); const model = progressionToWorkspace(block); const id = model.cards[0]!.id;
    const edits = [splitCard(model, id), mergeWithNext(model, id), moveBoundary(model, id, 3),
      ...(['extend-previous', 'extend-next', 'close-gap', 'replace-no-chord'] as const).map(mode => deleteProgressionCard(block, model, id, mode))];
    for (const edit of edits) {
      expect(edit.changed).toBe(true); const saved = workspaceToProgression(block, edit.model);
      expect(handoff(saved).ok).toBe(true); expect(saved.textSource).toBe(block.textSource);
    }
  });
  it('retains source grid rejection instead of hiding an unsupported subdivision', () => {
    const block = fixture('| C F G |'); const model = progressionToWorkspace(block);
    const range = progressionVersion(block, model, 'range', { startBar: 1, endBar: 1 });
    expect(handoff(range).ok).toBe(false);
  });
});

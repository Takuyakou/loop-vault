import type { SavedProgressionBlock, SongIdea } from '../types';
import { beatsPerBar } from '../midi/timing';

/** Read-only practice-boundary projection. Never persisted or used for re-analysis. */
export function progressionPracticeProjection(block: SavedProgressionBlock): SavedProgressionBlock {
  const source = block.textSource;
  if (!source || block.chords.length === 0) return block;
  const meter = beatsPerBar(block.timeSignature);
  const sorted = [...block.chords].sort((a, b) => a.bar - b.bar || a.beat - b.beat);
  const origin = block.sourceStartBeat !== undefined && block.sourceEndBeat !== undefined
    ? block.sourceStartBeat : (sorted[0]!.bar - 1) * meter + sorted[0]!.beat - 1;
  const spans = sorted.map(card => {
    const absolute = (card.bar - 1) * meter + card.beat - 1;
    const end = absolute + card.durationBeats;
    const matching = source.harmonicSpans.filter(span => span.chordLabel === card.chord.label
      && span.startBeat < end && span.startBeat + span.durationBeats > absolute);
    const original = matching[0] ?? source.harmonicSpans[0];
    if (!original) return undefined;
    const retained = matching.flatMap(span => span.attacks).filter(attack => attack.beat >= absolute && attack.beat < end);
    // A split or shifted boundary creates a card onset; existing reattacks inside
    // unchanged harmony remain exact. Original source spans stay provenance only.
    const attacks = [{ beat: absolute - origin, kind: 'written' as const, span: original.sourceSpan },
      ...retained.filter(attack => attack.beat > absolute).map(attack => ({ ...attack, beat: attack.beat - origin }))]
      .sort((a, b) => a.beat - b.beat).filter((attack, index, list) => index === 0 || attack.beat !== list[index - 1]!.beat);
    return { ...original, writtenChord: matching.length ? original.writtenChord : card.chord.label,
      chordLabel: card.chord.label, startBeat: absolute - origin, durationBeats: card.durationBeats, attacks,
      semanticAlterations: matching.length ? original.semanticAlterations : undefined };
  });
  if (spans.some(span => span === undefined)) return block;
  const harmonicSpans = spans.filter(span => span !== undefined);
  const same = source.harmonicSpans.length === harmonicSpans.length && source.harmonicSpans.every((span, index) => {
    const next = harmonicSpans[index]!;
    return span.startBeat === next.startBeat && span.durationBeats === next.durationBeats
      && span.chordLabel === next.chordLabel && span.attacks.length === next.attacks.length
      && span.attacks.every((attack, i) => attack.beat === next.attacks[i]!.beat);
  });
  return same ? block : { ...block, textSource: { ...source, harmonicSpans } };
}

export function progressionPracticeIdeas(ideas: readonly SongIdea[]): SongIdea[] {
  return ideas.map(idea => {
    if (!idea.progressionBlocks) return idea;
    const blocks = idea.progressionBlocks.map(progressionPracticeProjection);
    return blocks.every((block, index) => block === idea.progressionBlocks![index])
      ? idea : { ...idea, progressionBlocks: blocks };
  });
}

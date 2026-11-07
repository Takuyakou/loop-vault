import { parseChordLabel } from '../../src/domain/chords';
import {
  TARGETS, cellKey, type MasterTarget,
} from '../../src/domain/master251/model';
import type { ProgressionVoicingPracticeSnapshot } from '../../src/domain/progressionVoicingPractice';
import { eRankerCostModel } from '../../src/domain/eRankerFingering';
import { rankPracticeHandFingerings } from '../../src/voicingPractice/rankPracticeFingerings';

/**
 * Verification-only regeneration from exact canonical pitches/hands.
 * Does not import canonical-fingering.json, read personal preferences, or write files.
 * UI keeps consuming the reviewed fixed artifact rather than this generator.
 */
export function regenerateMasterFingerings(targets: readonly MasterTarget[] = TARGETS) {
  return targets.map(target => {
    const cell = cellKey(target.form, target.key);
    const events = target.chords.map((chord, index) => {
      const parsed = parseChordLabel(chord.symbol);
      if (!parsed) throw new Error('Invalid canonical chord');
      return {
        id: cell + ':' + index,
        startBeat: index * target.beatsPerChord,
        durationBeats: target.beatsPerChord,
        chord: parsed,
        voicing: { kind: 'custom' as const, midiNotes: chord.notes },
      };
    });
    const snapshot: ProgressionVoicingPracticeSnapshot = {
      version: 1,
      fingerprint: 'master251-verification:' + cell,
      source: {
        kind: 'vault',
        reference: { ideaId: 'synthetic-master251', blockId: 'synthetic-master251' },
      },
      selection: 'custom',
      bpm: target.bpm,
      meter: { numerator: 4, denominator: 4 },
      lengthBeats: target.chords.length * target.beatsPerChord
        + target.restAfterProgressionBeats,
      events,
      spans: events.map((event, eventIndex) => ({
        kind: 'chord' as const, eventIndex,
        startBeat: event.startBeat, durationBeats: event.durationBeats,
      })),
    };
    const hands = target.chords.map(chord => ({
      left: chord.referenceHands.lh,
      right: chord.referenceHands.rh,
    }));
    const unresolved = events.map(() => false);
    const left = rankPracticeHandFingerings(
      snapshot, hands, 'custom', 'left', undefined,
      { costModel: eRankerCostModel(), cyclic: true }, unresolved, target.bpm,
    );
    const right = rankPracticeHandFingerings(
      snapshot, hands, 'custom', 'right', undefined,
      { costModel: eRankerCostModel(), cyclic: true }, unresolved, target.bpm,
    );
    return {
      cell,
      chords: target.chords.map((chord, index) => {
        const lh = left[index], rh = right[index];
        if (lh?.status !== 'supported' || rh?.status !== 'supported')
          throw new Error('Unsupported canonical hand');
        return {
          degree: chord.degree,
          notes: chord.notes,
          referenceHands: chord.referenceHands,
          fingers: { lh: lh.fingers, rh: rh.fingers },
        };
      }),
    };
  });
}

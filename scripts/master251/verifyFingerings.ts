import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { regenerateMasterFingerings } from './regenerateFingerings';
import { TARGETS, cellKey } from '../../src/domain/master251/model';
import { masterTemplateFingers } from '../../src/domain/master251/canonicalTemplates';
import profile from '../../src/domain/master251/canonical-fingering.json' with { type: 'json' };
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

/** Retain the historical generic whole-sequence evidence independently of Master pedagogy. */
export function verifyGenericMasterFingerings() {
  const cells = regenerateMasterFingerings();
  const notesSha256 = hash(TARGETS.map(target => ({
    cell: cellKey(target.form, target.key),
    chords: target.chords.map(chord => ({
      notes: chord.notes, referenceHands: chord.referenceHands,
    })),
  })));
  const fingerprint = hash({ context: profile.genericBaseline.context, chosen: cells });
  assert.equal(notesSha256, profile.genericBaseline.notesSha256);
  assert.equal(fingerprint, profile.genericBaseline.fingerprint);
  return { cells, notesSha256, fingerprint, context: profile.genericBaseline.context };
}

/** Reproduce both-hand teaching templates and audit the untouched generic solver. The fixed artifact is never solver input. */
export function verifyMasterFingerings() {
  const generic = verifyGenericMasterFingerings();
  const cells = generic.cells.map((row, index) => ({
    ...row,
    chords: row.chords.map((chord, chordIndex) => ({
      ...chord,
      fingers: {
        lh: masterTemplateFingers(TARGETS[index].form, TARGETS[index].key, 'lh', chordIndex),
        rh: masterTemplateFingers(TARGETS[index].form, TARGETS[index].key, 'rh', chordIndex),
      },
    })),
  }));
  assert.deepEqual(cells, profile.cells);
  const fingerprint = hash({ context: profile.context, chosen: cells });
  assert.equal(generic.notesSha256, profile.notesSha256);
  assert.equal(fingerprint, profile.fingerprint);
  return {
    status: 'pass' as const, cells, notesSha256: generic.notesSha256, fingerprint,
    context: profile.context, genericFingerprint: generic.fingerprint,
    proofScope: 'Master both-hand Form templates; generic historical-output reproduction retained; physical performance pending',
  };
}

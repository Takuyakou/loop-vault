# Contract 02 — Text Progression Capacity

## Limits

Change Text Progression Entry bounds to:

- maximum bars: **32**
- maximum chord tokens: **128**
- maximum input length: **8192 UTF-16 code units**

If Stage00 proves 8192 is enforced by a shared security/intake contract that cannot be safely changed in isolation, stop and report rather than bypassing it. Otherwise update all duplicated constants/messages/tests consistently.

## Grammar remains unchanged

For P5.30, Text Entry remains:

- 4/4 only;
- 1 chord per bar = 4 beats;
- 2 chords per bar = 2 + 2 beats;
- 4 chords per bar = 1 + 1 + 1 + 1 beats.

Do not add arbitrary duration syntax, 3-chord bars, rests, repeats, Hold/Re-strike, or groove notation.

## Validation

- 32 bars accepted; 33 bars rejected with a user-safe error.
- 128 chord tokens accepted when structurally valid; 129 rejected.
- No silent truncation.
- Error messages identify the violated bound and, where available, the bar/token position.
- UI counters may show `bars / 32` and `chords / 128` if this improves clarity without visual clutter.

## End-to-end invariants

A valid long text progression must retain exact event timing through:

Text parse → Draft → Vault save → reload → Voicing Loop source/snapshot.

No step may round 1/2/4-beat events to four beats. No Vault schema/fileVersion change.

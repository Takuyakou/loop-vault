# Contract 11 — Human-approved Product Decisions

## Authorization and provenance

Following the Stage00 audit, the user authorized completion of P5.31 through
Stage04, approved the minimal `#5` representation extension, and explicitly
approved the following Stage03 slash policy in chat on 2026-09-14.
These are Loop Vault product decisions, **not evidence that a teacher taught
slash-chord handling**. Historical Stage00 findings remain accurate for its
verified commit; their authorization blockers are now resolved by this decision.

## Explicit altered fifth

Extend the chord type and save validation only as needed to preserve explicit
`#5` identity, including `B7(#9,#5)`. Do not silently substitute `b13`, retain an
unwanted natural fifth, or discard the alteration. Existing saved data is not
rewritten; no migration or fileVersion bump is authorized by this approval.
Keep ambiguous unparenthesized forms such as `C#5` fail closed.

## Upper Structure + Separate Slash Bass

For a slash chord `X/Y`:

1. Canonical chord identity and displayed identity remain `X/Y`.
2. Resolve the Left-hand lesson target from upper structure `X` with the existing
   Lesson Rule Table unchanged.
3. Bass `Y` does not change that Left-hand voicing rule.
4. Never erase, ignore, or remove `/Y` from canonical chord identity.
5. Treat `Y` as an independent Bass reference, not a Left-hand lesson target.
6. Reference playback, card audition, and model sound play the slash Bass
   reference together with the resolved Left-hand notes.
7. Keyboard visualization distinguishes Left-hand targets from Bass reference.
8. Practice target notes consist only of the upper-structure Left-hand notes.
9. If `X` itself is unsupported by the Lesson Rule Table, remain unsupported and
   fail closed.
10. No silent fallback to Basic, Source MIDI, or Custom is permitted.

Required paired fixtures: `Am11/B`, `Am9/C`, `Am11`, and `Am9`. Verify identity,
target notes, separately represented bass pitch/octave, combined playback,
keyboard roles, and unsupported-upper-structure behavior. Choose a deterministic
bass register consistent with existing bass-reference conventions and record it
explicitly; the approval supplies role separation, not a teacher-derived register.

## Boundaries

Do not introduce scoring, a new generator, clock, persistence redesign, or
unrelated musical rules. No merge, push, tag, release, or P5.32 is authorized.

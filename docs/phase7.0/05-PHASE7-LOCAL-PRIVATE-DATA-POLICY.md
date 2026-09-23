# Phase 7 — Local / Private MIDI Policy

## Chords.mid and other private user files

Use only as ignored-local evaluation evidence.

Never commit:
- MIDI/audio itself
- absolute path
- raw note dump
- exact private transcription
- checksum if it can identify the private artifact
- filename when privacy policy requires anonymity

Tracked report may contain:
- anonymous local ID
- category counts
- pass/fail aggregate
- generalized failure mechanism
- source-unchanged boolean

## Local Chords.mid target behavior

Test that short intermediate harmonic states are not removed simply because they are short.
Known user concern includes one-beat chromatic passing-harmony behavior.
Do not hard-code any named progression, bar position, root, filename, or exact note set.

The real file is a regression witness, not training truth for ad-hoc tuning.
Generalization must be established with synthetic/public-safe counterparts.

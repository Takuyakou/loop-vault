<!-- phase-id: 5.18 -->

# Contract 03 — Chord Context Playback

## Determinism and register
The same snapshot signature, selected section, effective BPM, meter, and
voicing preset produce the same chord events, upper voicings, and timing.
There is no unseeded random behavior.

Bass owns MIDI 28–55. Chord accompaniment uses chord tones only in MIDI 57–76
inclusive. It never adds a low root or slash-bass note. Slash bass remains
harmonic metadata for deterministic upper-structure selection, so it cannot
mask the target bass.

## Layers and defaults
Listen layers: Bass only; Chords only; Bass + Chords; Bass + Chords +
Metronome. Default: Bass + Chords.

Play layers: Chords only; Chords + Metronome; Metronome only; No accompaniment.
Default: Chords only. Target bass never auto-plays in Play mode.

Relative to the existing global master-volume path, defaults are target bass
0 dB, chords -12 dB, and metronome -9 dB. Per-layer controls may not bypass the
global master volume.

## Timing and lifecycle
All layers share the snapshot onset/duration, effective BPM, meter, and
count-in time base. A repeated start replaces prior playback safely. Stop,
tab/mode/route leave, and unmount release every layer; no stuck notes or
scheduled callbacks remain. Existing Chord Dojo and other preview behavior are
not altered by this contract.
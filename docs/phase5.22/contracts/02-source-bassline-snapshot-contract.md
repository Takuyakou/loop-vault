# Contract 02 — SourceBasslineSnapshot

Snapshot is immutable musical source data. The optional persistent field is never backfilled. A transient Voice id selects extraction input but is not persisted.

## Conceptual schema

```ts
type ExactBeat = { numerator: number; denominator: number };

type SourceBasslineSnapshotV1 = {
  schemaVersion: 1;
  sourceKind: "selected-bass-voice";
  snapshotSignature: string;
  capturedMeter: { numerator: 4; denominator: 4 };
  length: ExactBeat;
  capturedHarmony?: {
    schemaVersion: 1;
    signature: string;
    spans: Array<{
      start: ExactBeat;
      duration: ExactBeat;
      rootPitchClass: number;
      bassPitchClass: number | null;
      allowedPitchClasses: number[];
    }>;
  };
  notes: Array<{
    pitch: number;
    start: ExactBeat;
    duration: ExactBeat;
    velocity: number;
    continuesFromBefore: boolean;
    continuesAfterEnd: boolean;
  }>;
};
```

The implementation may use a convention-consistent type name, but may not weaken these facts.

## Integer timing authority

`PreAnalysisNote.startBeat` and `durationBeats` are floating-point presentation/analysis values and are not a persistence authority. Stage 01 must carry an extraction-only integer path from the raw parser/source note (`startTick`, `durationTick`, `ticksPerQuarter`) through selected-Voice extraction. Reverse reconstruction with `Math.round(beat * ppq)` or equivalent is forbidden.

`ExactBeat` is built only from authoritative integers and reduced canonically: safe-integer numerator, positive safe-integer denominator, `gcd(abs(numerator), denominator) = 1`, zero only as `0/1`. Arithmetic and comparison use BigInt before checked conversion.

## Authoritative source and range

The source is the MIDI source that owns the explicitly selected Bass Voice. Snapshot eligibility requires an explicit, source-matched range that is:

- bar aligned (`startBeat = 1`, full final bar);
- 1..12 bars in one constant 4/4 meter;
- within that source's duration;
- expressible exactly as integer source ticks;
- free of unresolved start-position/time-signature alignment warnings.

Automatic candidates and manual ranges may satisfy this contract. A manual range is eligible only when it belongs to the same selected source and has proven raw-tick boundaries, constant 4/4 meter, exact bar alignment, and 1..12 complete bars. Arbitrary or unprovable manual ranges, multi-source ranges whose selected Voice cannot be aligned exactly, and ranges crossing a meter change are ineligible. The progression still saves without a snapshot after clear disclosure. Persisted chord-coverage fields such as `sourceStartBeat`/`sourceEndBeat` are never reused as source-note range authority.

## Boundary semantics

Boundary option A is locked. Persist the exact intersection with the authoritative half-open range `[start, end)`. A note ending at range start or starting at range end is excluded. A crossing note is clipped and carries the corresponding continuation boolean; no onset is silently invented. No quantization or float serialization is allowed.

## Canonical notes and signatures

Preserve every selected-Voice note intersecting the range, including simultaneous and overlapping notes. Persistence-time minimum-note collapse is forbidden.

Canonical note order is exact start, pitch, exact duration, velocity, `continuesFromBefore` (`false` before `true`), then `continuesAfterEnd`. Exact duplicates serialize identically, so their internal source index is transient and excluded.

`capturedHarmony.signature` and `snapshotSignature` are distinct lowercase SHA-256 hex digests of canonical UTF-8 JSON:

- harmony signature input: `schemaVersion` and canonical harmony spans only, excluding `signature`;
- snapshot signature input: snapshot schema/source/meter/length, canonical notes, and canonical captured-harmony payload or explicit `null`, excluding both signature fields.

Canonical JSON uses a versioned fixed property order, no insignificant whitespace, canonical reduced fractions, and canonical arrays. Harmony spans order by exact start, exact duration, root, required nullable bass, then lexicographic allowed pitch classes. The harmony signature input is exactly `{ schemaVersion: 1, spans: orderedSpans }`; `signature` is excluded.

## Forbidden fields

The entire `sourceBassline` subtree is strict. It rejects a source path, filename, track/Voice display name, Voice id, device id, raw MIDI bytes, private title/memo, Analyzer confidence, complete analyzer result, or any unknown key.
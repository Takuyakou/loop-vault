# Contract 02 — Attack Provenance Model

## Purpose

Distinguish attacks that merely share a wide analysis window from attacks that plausibly belong to the same harmonic sub-state.

## Required observables

Where available:

```text
windowIndex
windowStartBeat
windowEndBeat
absoluteAttackBeat
relativeAttackBeat
beatBucket
subWindowBucket
pitchClass
voiceRole
structuralBass
durationOverlap
attackClusterId
```

Private reports aggregate/anonymize.

## Partition experiments

### W2 — legacy
One 2-beat bucket.

### B1 — beat partition
Split the 2-beat window into two 1-beat buckets.

### AC — attack-cluster partition
Group attacks by deterministic diagnostic onset clusters.

Do not promote any partition.

## Hard negatives

Partitioning must not falsely split:
- one rolled/arpeggiated chord intended as one harmony;
- sustained/re-struck same harmony;
- pad/legato chord;
- syncopated attack belonging to one harmony;
- legitimate extended chord attacked in layers.

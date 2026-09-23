# Protected Contracts

P5.40 must preserve these contracts unless a later separately authorized stage presents direct evidence that one is itself defective.

## Source truth

- input MIDI bytes must remain unchanged;
- parsed notes must remain unchanged;
- onset and duration must remain unchanged;
- source ordering must remain unchanged;
- no diagnostic runner may quantize or rewrite the source.

## Family A

Protect the already promoted presentation-grouping behavior, its defaults, rollback behavior, source-meter/source-coordinate invariants and source-truth consumers.

## Family B

Protect the current production trigger policy, minimum bucket evidence, default-on behavior, explicit-off rollback, known regression fixtures and FC-REAL-02 temporal separation.

A P5.40 ranking experiment must not silently redefine a Family B trigger.

## P5.39 Shadow baseline

Until Stage01 is explicitly authorized, preserve:

- existing 252 candidates in original root-major quality order;
- 12 Target A candidates;
- 12 Target B candidates;
- total 276 visits/window;
- <=300/window hard bound;
- both frozen 0.35 penalties;
- candidate order;
- scoring formula;
- tie-break;
- canonical notation;
- ambiguity handling;
- omission semantics;
- existing Target A/B archetypes;
- Model A sequence.

## Production isolation

P5.40-00 is investigation-only. Expected production diff:

```text
src/** = 0
parser = 0
schema = 0
fileVersion = 0
migration = 0
analyzer default = 0
Family A production = 0
Family B production = 0
smoothing production = 0
```

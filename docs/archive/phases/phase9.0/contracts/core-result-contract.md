# Phase 9 Core Result — research contract v1

This is an in-memory research result. It does not change Product types or Vault v2. It represents source facts independently from harmonic guesses. Persistence of excluded-note evidence is a P9.8 decision; eventual post-save restoration remains mandatory.

## AnalysisResult

| Field | Required content |
| --- | --- |
| sourceTruth | Source PPQ, meter, tempo/provenance, byte digest, and immutable note events with stable IDs, MIDI number, onset/offset ticks, track and channel. |
| harmonicInterpretation | Proposed span and factorized identity (root, observed bass, quality, extensions, alterations, omissions), or UNKNOWN. Display spelling is separate. |
| excludedNotes | Stable note ID, MIDI number, source tick, duration, role reason, confidence in [0,1], and restoration eligibility. Exclusion never deletes sourceTruth. |
| boundaryCandidates | Source tick, harmonic/voicing/note-event type, confidence and evidence IDs. |
| topKIdentities | Ranked factorized identities, score, evidence IDs and calibrated ambiguity; candidate membership is distinct from rank. |
| uncertainty | Confidence, margin and explicit UNKNOWN/review state. |
| attacks | Source note ID, attack tick, re-strike relationship, and evidence ID. |
| reviewReasons | Code, affected source IDs, confidence and suggested correction action. |

All arrays preserve deterministic order. Any source note referenced by a result must exist in sourceTruth. Root and observed bass are separate fields. The raw correction vector has split, merge, noteAdd, noteRemove, rootFix, bassFix, qualityFix and tensionFix counts. It is not UI interaction cost.

## Invariants

1. Source note bytes/timing are immutable in research evaluation. Harmonic filtering may classify notes but must retain restoration evidence.
2. Tier 1 scoring uses source note numbers and timing, not a generated voicing from a chord label.
3. Boundary type is explicit; short passing harmony is not rejected solely by duration.
4. UNKNOWN and Top-K may exist in research output without being written to Vault v2.
5. A future P9.8 storage decision must prove post-save restoration and rollback. This contract does not choose a schema.

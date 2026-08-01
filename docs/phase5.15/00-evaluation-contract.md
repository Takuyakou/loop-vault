# Phase 5.15 Evaluation Contract

## Data gate

`npm run eval:p515:validate` must pass before any Analyzer invocation. It checks:

- unique case IDs and complete partition membership;
- all 36 MIDI files, SHA-256, byte length, SMF format, PPQ, BPM, meter, track
  and note counts, clip length, and logical markers;
- marker-to-independent-oracle identity and PPQ representability;
- non-overlapping positive-duration expected segments;
- Type 0 physical-track structure;
- duplicate, PPQ, velocity, track-order, and tempo-map invariant groups;
- deterministic and semantically identical generator output;
- byte-exact regeneration into an isolated temporary repository;
- strict discriminated MIDI-event schemas and recursive private/absolute-path
  rejection;
- exact source-recipe note multisets (track, channel, pitch, effective
  onset/end, velocity, and duplicate multiplicity), plus marker/controller
  semantics;
- v1-compatible base/supplemental manifests and the complete MIDI directory
  layout rebuilt solely from the tracked v2 contract;
- when ignored local recipes/corpora exist, byte/hash/stable-deep drift
  verification against the same tracked contract. Both ignored corpus roots
  must be real repository-contained directories, and manifests/MIDI are read
  through identity-checked file handles.

Failure stops the stage. Binary MIDI remains ignored. The tracked v2 manifest
and generator are the reproducible source, so clean checkout validation does
not depend on `test/phase5.15*` or `.local-evaluation/`.
`npm run generate:p515:temp` creates an OS-owned temporary parent, materializes
and verifies the corpus at a nonexistent child path, then removes the parent.
Direct `--output <directory>` use accepts only a nonexistent target. It rejects
every existing target, including an empty directory or link/junction, scans the
complete in-memory manifest payload before writing, and promotes one fully
staged top-level tree with a single directory rename. On the supported Windows
release platform that promotion is no-replace: if another writer creates the
destination first, no generated child enters that tree and private staging is
removed. A destination-specific PID/nonce parent lock serializes cooperating
generators and uses atomic capture for stale-owner recovery. A competing target
or malformed lock fails closed; no existing directory is overwritten or deleted.
`generate:p515:contract` is
verification-only by default. `--write` is an explicit first-initialization
operation and refuses to overwrite a mismatching tracked oracle. There is no
CLI schema-upgrade overwrite; upgrades require code, a new fixture, and a
reviewed manual diff.

## Frozen partitions

The exact membership and hashes are in `00-partition-lock.json`.

- Development: 12 targeted fixtures.
- Validation: 13 fixtures, evaluated once per stage.
- Invariant: duplicate, PPQ, velocity, track order, and tempo-map checks.
- Round-trip Baseline: local cases 10/11 plus the 21-event Phase 5.14 exporter
  matrix.
- Runtime-only: case 36, Voicing Gold development 40-file batch, SURAN, and
  Endless.
- Holdout: Phase 4.7 fresh holdout plus a Phase 5.14 vocabulary subset. Results
  stay unopened until P5.15-06.
- Final Real-song Smoke: at most three files, once, after automated gates.

## Comparison levels

1. **Exact Event**: canonical identity, onset, and duration all match within
   one source tick. Only representable `exact-event` rows enter this metric's
   denominator.
2. **Canonical Identity**: spelling aliases normalize by pitch class, triad,
   seventh, extensions, alterations, and non-root bass.
3. **Probe Beat**: the expected identity must cover each probe; merging
   adjacent equal identities is allowed. Case 08 uses this mode.
4. **Invariant Deep Equal**: normalized timeline, primary rank, confidence,
   and alternatives must be deeply equal.
5. **Boundary-only**: silence and boundary placement are scored separately
   from chord vocabulary. Case 35 uses this mode.
6. **Representability-aware**: parser unsupported, detector-vocabulary
   unsupported, notation alias, and true detection error must remain separate.

`N.C.` has `comparisonPass=true` only when no predicted chord has any positive
overlap with the expected silent range; timing tolerance is never applied.
Boundary-only cases containing `N.C.` pass only when both their boundary F1 is
perfect and every expected silent region is silent.
Boundary scoring treats a non-terminal detected chord end as a transition as
well as a non-origin chord onset. Therefore an ideal silent gap has a chord-off
and chord-on boundary even though no synthetic Analyzer row represents the
silence; any spurious chord inside that gap adds two false boundaries.
`N.C.` is excluded from root/quality/seventh/tension/slash denominators.
Slash accuracy includes only rows whose expected identity has a non-root bass;
a non-slash prediction never counts as a slash success. Timing error summaries
include only matched rows with `timingMetricEligible=true`, while unmatched
rows are reported by a separate count/rate. Representability-aware rows that the parser or detector
vocabulary cannot express are reported but excluded from accuracy denominators.
A separate `comparisonPass` field reports each mode's declared comparison
policy. Boundary-only and invariant-deep-equal events use `null` because those
policies are decided once at case/group level. Canonical, probe, invariant, and
representability-aware rows never enter the Exact Event numerator or denominator.
A notation-only alias is not an accuracy failure after canonical normalization.
`sus2` and `add9`, and `sus4` and `7sus4`, are distinct when the observed third
or seventh makes them distinguishable.

## Metrics

Accuracy:

- exact event, canonical exact, usable, root, quality, seventh, tension, slash
  bass;
- boundary precision/recall/F1;
- onset and duration MAE/p95;
- rank 1, Top-3 canonical, Top-3 root, candidate recall, manual input rate;
- duplicate output count.

Invariance:

- duplicate, PPQ, velocity, track order, tempo-map, deterministic output hash.

Evidence:

- exact duplicate count and IDs;
- event-local support duration/coverage/source count;
- adjacent-only and passing-tone rejection;
- root/third/seventh shell support;
- slash support;
- boundary proposal provenance and rejection reason.

The Evidence fields above are required for the feature stages. P5.15-00 marks
them unavailable because the current Analyzer does not expose them.

Runtime:

- median/p95/max;
- three-minute case median/p95/max and maximum post-analysis RSS observation
  (not a worker-sampled peak), plus twenty repeated-analysis
  heap/RSS observations;
- 40-file batch total;
- Candidate Catalog size;
- Live MIDI confirmed p50/p90;
- Chord Dojo p50/p95.

## Predeclared feature threshold candidates

These values are frozen candidates, not product changes. Each feature stage may
compare them on Development and once on Validation; Holdout is prohibited.

| Feature | Candidate threshold / rule |
|---|---|
| Exact evidence dedup | same source asset, logical voice, track, channel, pitch, effective onset and end; velocity delta `0`; different source/voice/track/channel/re-articulation is never merged |
| Event-local tension | support at least `0.5` beat and coverage at least `0.5`; adjacent-only evidence is rejected; support below `0.25` beat or coverage below `0.25` is passing/weak |
| Syncopated boundary | proposal must be PPQ-representable; comparison tolerance is one tick; adoption requires two independent harmonic evidence classes, one of which is bass/root or third/seventh shell change |
| Shell seventh | observed root, third, and seventh are all required; plain seventh wins only when no accepted event-local extension exists |
| Suspended quality | third present with 2/9 implies `add9`; third absent implies `sus2`; seventh distinguishes `sus4` from `7sus4`; octave alone never decides |

## Adoption and regression gates

A feature is eligible only when:

- its targeted Development failures improve;
- Validation canonical exact, root, quality, seventh, tension, slash, boundary
  F1, rank 1, Top-3, candidate recall, and manual-input rate do not regress by
  more than `0.02` absolute;
- all invariant groups remain exact;
- diagnostic provenance coverage is `100%` for affected decisions;
- three-minute max, 40-file total, Live MIDI, and Chord Dojo do not exceed
  `1.25x` their P5.15-00 baselines;
- rollback is a single feature flag with no saved-data migration.

Holdout is evaluated once in P5.15-06. A material Holdout regression rejects
the feature or combination. Thresholds are not retuned after Holdout. If
retuning would be required, Phase 5.15 ends and a new phase must start.

The P5.15-00 baseline command is completely read-only by default. It validates
generated MIDI bytes and semantics in memory (temporary materialization remains
the separate `eval:p515:validate` gate), builds the four report candidates in
memory, compares their deterministic fields with the
tracked reports, prints one privacy-safe JSON current-observation summary to
stdout, and never rewrites reports or locks. The JSON includes case 36
median/p95/max, maximum observed post-analysis RSS and repeated-memory samples;
40-file batch status/timing; SURAN, Endless, and all-instruments status/timing;
and Live MIDI and Chord Dojo metrics. It contains no Holdout result, path, or
personal identifier. Runtime/memory samples are not byte-stable verification
fields and remain excluded from deterministic report comparison. It
strictly parses both locks with closed Zod schemas and stable canonical deep
comparison. It recomputes the product/default mode/fileVersion/feature flags,
round-trip result, synthetic inventory, privacy counters, evaluator policies,
evaluation-contract documents, source manifests/validators, and complete local
dependency graphs before Analyzer execution. The strict lock freezes ChordDrip
100, Chapter 3 100/399, Voicing Gold development and validation, the Phase 4.5
40-file alias, the burned Voicing Gold holdout as diagnostic-only, Phase 4.7
development and validation, SURAN, Endless, and all-instruments. It also freezes
current Analyzer, Accuracy-First, and Candidate Union metrics for non-Holdout
selections. Voicing Gold dev/validation uses its own Phase 4.3 condition-D
source-faithful oracle, not the separate R2 Harmony Support corpus. Phase 4.7
safe evaluation first requires the exact 36-file 12/12/12 partition, unique
file IDs/paths, and fileId/split/MIDI-path consistency. Voicing Gold safe
evaluation likewise requires its exact 60-file 40/10/10 partition and
repository-contained split/MIDI paths. The baseline parent passes the fixed
reviewed-lock path and its handle-read SHA-256 to every safe subprocess. Safe
CLI modes have no corpus-discovery fallback and fail without that contract.
Each child rechecks the manifest hash, uses only the lock's exact ordered
selection, and captures every MIDI through an identity-checked handle; length
and SHA-256 of those captured bytes must match before those same bytes can be
passed to Analyzer. A static replacement or a namespace swap after the parent
check therefore fails before Analyzer, and the Voicing child follows the same
contract. The parent itself also opens the baseline lock once and derives both
its parsed contract and the SHA-256 passed to children from those same captured
bytes. Voicing's `note-events.jsonl` is a selection-associated supplemental
input in each dev/validation lock entry; its relative path, byte length, and
SHA-256 are verified from one identity-checked handle before the captured bytes
are parsed, and rows are used only for the frozen MIDI selection. R2 is not
invoked by this non-Holdout baseline path. Holdout remains
unopened. Present suites
must match full selection/content/file hashes; absent ignored suites are
`SKIPPED` while their locked metrics and fingerprints remain unchanged.
Current build status is separate from frozen build fingerprints. Product name
and version come from Tauri/package metadata, and bundle names are discovered
from the build tree rather than constructed from architecture/locale literals.
The build-output counter remains `0`. Historical reviewed files already below
`artifacts` are counted separately rather than misclassified as executable
build output; the prospective staging guard still rejects any new or modified
path in either category.

`npm run eval:p515:baseline -- --refresh-reports` is the only report update
mode. The fixed `docs/phase5.15` root must resolve inside the real repository
and may not contain a symlink, junction, or reparse-point escape. All four
payloads are scanned in memory as source values, parsed JSON, and raw JSON
before writing. Refreshes are serialized by an exclusive operation lock. Old
tracked reports are hard-link-backed up and a transaction journal is durable
before promotion begins. Journal auxiliary names are exact transaction-ID and
target-name bindings, distinct, and forbidden from colliding with reports or
control files. Every backup inode and SHA-256 is verified before the first
target changes. For each promotion, the old target is atomically renamed to a
unique transaction-and-target-bound capture. The captured inode and SHA-256
are verified before the new hard link is created at the now-empty target with
exclusive `link()` semantics. `EEXIST` never overwrites a competing file: the
old capture is restored only through another exclusive link while the target
is empty; otherwise the competing bytes and capture are preserved and recovery
fails closed. The version-2 journal records old/new device/inode evidence,
both capture names, and every per-entry transition (`prepared`,
`old-captured`, `promoted`, `new-captured`, `restored`). A same-bytes
replacement with a different inode is rejected rather than accepted as the old
target. PID/nonce recovery claims and stale snapshots capture the
initial inode through a file handle and compare inode plus PID/nonce after
atomic rename, so same-value ABA replacements are rejected and can be safely
reclaimed after a claim-holder crash, and exact orphan auxiliaries left before
journal creation are cleaned only while holding the operation lock. Rollback
uses the same no-overwrite protocol: it atomically renames the promoted target
to its transaction-bound rollback capture, verifies the captured new
device/inode and SHA-256, then exclusively links the verified old target
capture into the empty target name. A backup-name swap cannot alter the
captured old inode. A competing target created after rollback capture is never
overwritten, and a process kill after either capture or verification is
re-entered from the journal and exact capture evidence. Rollback
persists a `rolled-back` state before cleanup, so a second crash during cleanup
is re-enterable without already-deleted backups. Each report replacement is atomic within that single
run; the four-file update is not claimed to be batch-atomic. An error restores
all old report bytes, and a killed process leaves enough journal and inode/hash
evidence for exact recovery. Default evaluation never performs recovery or
cleanup: a journal fails closed with instructions to run the explicit
`npm run eval:p515:baseline -- --recover-reports` mode. Existing report targets
must be regular files. The command cannot
overwrite either reviewed lock.

The partition and baseline locks are reviewed files fixed by this PR. There is
no lock initialization, overwrite, or rotation CLI. A reviewed lock-schema
migration uses the separate command
`npm run eval:p515:baseline -- --emit-reviewed-lock-candidate`; combining it
with `--refresh-reports` is rejected. Candidate generation always reads the
existing frozen baseline, preserving unavailable external-suite and build
fingerprints as well as reviewed wall-clock observations. The fixed
repository-root candidate path is privacy-scanned and
validated before an exclusive new-file-only atomic publication. Existing
files, symlinks, and junctions are rejected, and candidate failure changes no
report or lock. A reviewed candidate is schema-checked and requires exactly
one non-empty executable, MSI, and NSIS fingerprint.

Baseline Git provenance records the reviewed capture branch/commit/tree. The
current execution branch, including a later stacked branch or detached HEAD, is
observational and is not an immutable comparison field.

Boundary matching is one-to-one maximum-cardinality matching within one source
tick over non-origin onsets and non-terminal chord ends. Exact beat `0` is the
only excluded clip-origin transition; every non-zero
pickup, including `1/PPQ`, is scored. One predicted onset cannot satisfy two
adjacent expected boundaries, so precision, recall, and F1 cannot exceed `1`.

## Feature flags and rollback

The reserved flags are:

- `enableExactNoteEvidenceDedup`
- `enableEventLocalTensionEvidence`
- `enableSyncopatedShellBoundary`
- `enableShellSeventhPreference`
- `enableSuspendedQualityDisambiguation`

All are absent/`OFF` at baseline. They are non-persistent Analyzer-profile
controls, implemented one stage at a time. Stable remains the current product
behavior until P5.15-06 decides otherwise. No master flag and no vault schema
field is allowed.

## Privacy and diagnostic log

Allowed diagnostics: feature-flag state, synthetic case ID, counts, score/rank,
support evidence, boundary source/rejection, and deterministic hashes.

Forbidden diagnostics: personal filename, absolute path, raw personal MIDI
bytes, memo, source title, and user identifier.

The recursive privacy gate covers the complete contract plus every P5.15
JSON/Markdown/text artifact. JSON is scanned as raw text and parsed values. It
rejects Windows drive paths, UNC paths, file URIs, POSIX absolute paths anywhere
in a string, email/user identifiers, and forbidden private metadata fields even
when their values are relative while
allowing ordinary corpus-relative fixture names.

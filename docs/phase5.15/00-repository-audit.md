# Phase 5.15-00 Repository Audit

## Gate result

P5.15-00 is based on `master` commit
`2eb36b63a064c4ee44e0d071836b2d722f534502`. The Phase 5.14 stack is
integrated and the user-confirmed FL Studio native-drag smoke passed on
2026-07-30. The default analyzer remains `phase4-v1`, the vault
`fileVersion` remains `1`, and no Analyzer, exporter, UI, or vault-schema
product code is changed by this stage.

The original two local P5.15 manifests were generation recipes, not a valid
evaluation contract:

- source rows and logical expected chord segments were mixed for multi-track
  cases;
- case 32 had no manifest event even though the Type 0 MIDI contained
  `Cmaj7` and `Am7` markers;
- the duplicate-invariance group `02 -> 03` was not declared;
- supplemental cases had no comparison mode or checksum/count metadata;
- `test/phase5.15/generate_phase515_corpus.py` was a 294-byte regeneration
  note, not an executable generator.

Analyzer execution was stopped at that gate. The data contract was repaired
first. `scripts/phase515/fixtures/manifest-v2.json` now embeds the complete
validated v1 source recipe, separates MIDI source events from independent
logical expected segments, assigns all 36 cases,
declares every invariant pair, records SHA-256/count/SMF/clip-length/marker
metadata, and contains the semantic source needed by `generateCorpus.ts`.
Logical expected segments come from the independent recipe oracle (with an
explicit two-segment oracle for case 32); MIDI markers are a redundant
validation target and cannot define their own expected answer. Validation
proves 36/36 MIDI are parseable, deterministic, and byte-exact when regenerated
into a temporary clean repository using only the tracked contract.
The source-recipe gate also compares the exact note multiset and semantic
marker/controller events, then rebuilds the v2 contract in a temporary
location and requires stable deep/hash equality with the tracked oracle. If the
ignored local corpus is present, the same comparison is run as an integration
drift gate; otherwise it is explicitly reported skipped.
Only after this gate passed was the non-Holdout baseline evaluated.

## Pipeline map

| Concern | Current implementation / harness |
|---|---|
| Parser, tempo, meter, note normalization | `src/domain/midi/legacy.ts`, analyzer modes routed by `src/domain/midi/analysis.ts` |
| Sustain handling | legacy note extraction and effective note ranges; fixture 21 has CC64 source events in the v2 contract |
| Source, track, channel, voice identity | `src/domain/midi/legacy.ts`, `src/domain/midi/preAnalysis/*` |
| Role assignment | `inferTrackRoles` exported from `src/domain/midi/analysis.ts`; Phase 5.1 input-selection harness |
| Boundary proposal and segment construction | legacy analyzer, Phase 4 analyzer, and boundary reranker modules |
| Pitch-class evidence, candidate generation, scoring | legacy/Phase 4 analyzer modules and `src/domain/midi/candidates.ts` |
| Candidate Union and catalog | `src/domain/midi/accuracyCandidateUnion.ts`, `candidateCatalog.ts` |
| Evaluation identity and representability | `src/domain/chordIdentity.ts`, `src/domain/midi/evaluation/metricsV2.ts` |
| Phase 5.14 exporter | `src/domain/midiExport.ts` |
| Phase 5.14 round trip | `scripts/evaluate-phase514-round-trip.ts`; frozen again in `00-roundtrip-baseline.json` |
| Runtime | `scripts/benchmark-midi-analysis.ts`, Live MIDI and Chord Dojo benchmarks, P5.15 baseline harness |
| P5.15 data integrity | `scripts/phase515/corpusContract.ts`, generator, validator, and mutation tests |

The current Analyzer does not expose exact-note dedup provenance, event-local
tension support, adjacent-only evidence, passing-tone classification, shell
core support, or boundary proposal/rejection provenance. The baseline records
these as diagnostic gaps rather than fabricating values.

## Corpus audit

| Name in work instructions | Canonical repository location | Decision |
|---|---|---|
| P5.15 base 12 | `test/phase5.15/` | Local ignored MIDI; covered by tracked v2 semantic contract |
| P5.15 supplemental 24 | `test/phase5.15-supplemental/` | Local ignored MIDI; covered by tracked v2 semantic contract |
| Chord Drip Corpus | `docs/loop-vault-evaluation-corpus/manifest.json` | Existing canonical 100-file corpus |
| Chapter 3 | `.local-evaluation/chapter3-seed/` with `test/loop-vault-chapter3-seed/` fallback | Existing canonical local corpus |
| Existing Voicing Gold | `test/loop-vault-voicing-gold-corpus-v1/` | Existing 60-file corpus; old holdout is burned and diagnostic-only |
| Phase 4.5 | Voicing Gold development split | Alias/split, not an independent corpus |
| Phase 4.7 | `.local-evaluation/loop-vault-bass-companion-identity-gold-v1/` | Existing 36-file corpus; its holdout selection is hash-locked |
| Phase 5 Accuracy First | Existing four-corpus suite | Evaluation suite, not an independent corpus |
| Candidate Union corpus | Phase 5 Accuracy First suite | Feature evaluation, not an independent corpus |
| Phase 5.14 vocabulary matrix | Runtime-generated by exporter harness | 21 events; 19 exact and 2 representational ambiguities |
| SURAN | `.local-evaluation/phase4.1/fixtures/suran-remix.mid` | Runtime-only; beat-aligned fixture is a different asset |
| Endless | `.local-evaluation/phase4.1.1/fixtures/endless.mid` | Runtime-only; 350-byte synthetic file is a different asset |
| all-instruments | `.local-evaluation/midi/all_instruments.mid` | Existing runtime/role diagnostic |
| 40-file batch | Voicing Gold development split | Alias/split, not an independent corpus |

Exact checksums, file counts, fixture metadata, and alias decisions are in
`00-data-inventory.json`.

## Partition and Holdout policy

Development, Validation, Round-trip Baseline, Invariant, and Runtime-only
membership was fixed before Analyzer changes. Case 25 is the tempo-map
singleton invariant, cases 10/11 are the local Phase 5.14 round-trip file
bucket, and case 36 is Runtime-only.

The Phase 4.7 fresh holdout and a four-entry Phase 5.14 vocabulary subset are
locked only by selection/content hashes. No Analyzer output for either
selection is present in the P5.15-00 reports. The burned Voicing Gold holdout
and user real MIDI are excluded. Holdout may be evaluated once in P5.15-06;
failure ends tuning for this phase.

Normal baseline reruns are verification-only. Strict closed schemas and full
stable-canonical deep comparison cover every partition/policy key, git baseline
identity, product flags/default mode/fileVersion, round-trip result, synthetic
inventory, evaluator/policy/document/manifest-validator/dependency-graph
fingerprints, build artifacts, privacy counters, and frozen Holdout data.
Available ignored inputs are rehashed before Analyzer execution. The baseline
lock freezes full file selections and content fingerprints for ChordDrip 100,
Chapter 3 100/399, Voicing Gold development/validation, its 40-file Phase 4.5
alias, the burned Voicing Gold holdout as diagnostic-only, Phase 4.7
development/validation, SURAN, Endless, and all-instruments. The safe
P5.15 wrapper evaluates only non-Holdout files and freezes current,
Accuracy-First, and Candidate Union metrics. Voicing Gold dev/validation uses
its own Phase 4.3 condition-D source-faithful voicing oracle; the separate R2
Harmony Support corpus is not mislabeled as Voicing Gold. Phase 4.7 Holdout
remains unopened. The wrapper requires Phase 4.7's exact 36-file 12/12/12
partition plus fileId/split/path agreement, and Voicing Gold's exact 60-file
40/10/10 partition plus repository-contained split paths, before selecting
dev/validation. An absent ignored suite is current
`exists=false`/`SKIPPED` while its frozen metric/fingerprint remains separate
and unchanged. Any manifest, selection, content, length, or ordering drift in
a present suite is rejected.

Default `eval:p515:baseline` validates generated MIDI bytes and semantics in
memory, builds four report candidates in memory, and performs no filesystem
writes. Runtime-variable samples
remain a single stdout JSON current-observation summary containing case 36
runtime/RSS/repeated-memory values, the 40-file batch, SURAN, Endless,
all-instruments, Live MIDI, and Chord Dojo. Paths, personal identifiers, and
Holdout results are absent, and these observations remain outside deterministic
comparison. Only explicit `--refresh-reports` accepts the fixed real
`docs/phase5.15` root, rejects symlink/junction/reparse escapes, scans every new
payload as source/parsed/raw JSON, and serializes refresh with an exclusive
operation lock. It stages every payload and backs up every old tracked report
before writing a recovery journal. Journal auxiliary names are exact
transaction/target bindings and cannot collide with reports or control files.
All backup inode/hash evidence is verified before the first replacement. Each
old target is then atomically renamed to an exact transaction-bound capture,
whose device/inode/hash is verified before an exclusive `link()` publishes the
new inode at the empty target. The version-2 journal persists old/new inode
evidence, promotion/rollback capture names, and each entry's boundary status.
Same-bytes different-inode substitutions fail closed. `EEXIST` preserves the
competing target and fails closed instead of overwriting it. PID/nonce claims
and stale snapshots capture their
initial inode and atomically recheck it after rename, so same-value ABA
substitutions fail closed while genuine stale owners remain reclaimable. Exact
pre-journal orphans are cleaned only under the operation lock. Rollback
atomically renames the promoted target to a distinct transaction-bound capture,
validates its new inode/hash, and restores the verified old target capture only
with an exclusive `link()`. A third-party target appearing after capture is
preserved and recovery fails closed. Process kills after either capture or
verification are re-entered exactly from the persisted status and capture
evidence. Rollback
persists a `rolled-back` state before cleanup, so cleanup remains re-enterable
after another process kill. Replacements are per-file atomic within the
single serialized run, not falsely described as four-file batch-atomic.
Failures roll back. A journal makes default verification fail closed without
writing; explicit `--recover-reports` recovers an interrupted transaction
exactly from journaled inode/hash evidence. Neither reviewed lock can be
overwritten.

Existing-corpus evaluators constrain both manifest and MIDI reads to a real
corpus root inside the real repository root. A corpus root which is itself a
symlink/junction/reparse point is rejected. Phase 4.7 partition reads also
require the frozen 36-file shape, 12 files per split, unique identities/paths,
and exact split/file-id/path agreement, so Holdout path substitution fails
closed without opening Analyzer results. The ignored synthetic corpus uses the
same real-root check and identity-checked manifest/MIDI handles. The parent
supplies every safe subprocess with the fixed reviewed-lock path and its
handle-read SHA-256; safe standalone modes refuse to self-select without it.
Children verify manifest hashes and the exact ordered lock selection, then
validate handle-captured MIDI length/hash before passing those same bytes to
Analyzer. Deterministic tests cover both a static dev-to-Holdout replacement
and a post-open namespace swap. The parent lock is likewise captured once, and
the same bytes are parsed and hashed for child authorization. Voicing uses this
same contract for `note-events.jsonl`: its selection association, relative
path, byte length, and SHA-256 are frozen in the dev/validation suite entries,
and its same-handle bytes are verified before parsing. Only rows associated
with the frozen MIDI selection are consumed. The
non-Holdout path does not invoke R2.

The lock files are fixed reviewed content in this PR; no initialization,
overwrite, or rotation CLI exists. A reviewed schema migration uses the
separate `--emit-reviewed-lock-candidate` mode, which cannot be combined with
report refresh. It always reads the frozen baseline so unavailable external,
build, and reviewed wall-clock observations survive, then emits only the fixed repository-root
candidate with an exclusive new-file-only promotion. Existing files and links
are rejected and candidate failure leaves reports and locks unchanged.

The baseline lock preserves reviewed Git provenance. Verification on the next
stacked branch or detached HEAD does not reinterpret the current branch name as
immutable provenance.

Build-artifact current status and frozen fingerprints are separate. The
current scan derives product/version from Tauri and package metadata and
discovers executable/MSI/NSIS names from the build tree. Missing outputs are
`SKIPPED`; extra candidates fail closed, and a present reviewed set must be
exactly one executable, one MSI, and one NSIS. Stale frozen rows are never
presented as current. Vault `fileVersion` is
parsed from `schema.ts` and checked against `repository.ts` and `vaultStore.ts`;
all three are directly fingerprinted.

The runtime RSS field is `maxObservedPostAnalysisRssBytes`: it is the largest
in-process observation taken after analysis calls, not a worker-sampled peak.

## Safety

- tracked MIDI: `0`
- tracked `.local-evaluation`: `0`
- tracked build outputs: `0`
- separately inventoried reviewed artifacts: `77` historical `artifacts`
  files, all predating Phase 5.15 and frozen transparently in the lock; the
  prospective staging guard rejects every new or modified `artifacts` or
  build-output path
- personal MIDI in reports or contract: none
- absolute personal paths in generated reports: none
- clean-checkout validation source: tracked v2 contract only
- Analyzer product code changes: none
- Phase 5.14 exporter changes: none
- vault schema / `fileVersion` changes: none
- user-owned `.agents/` and `.claude/`: untouched
- full-repository ESLint excludes `.agents/` and `.claude/` because they are
  user/tool-owned untracked trees outside product and Stage 00 scope
- staged-file enforcement reads `git diff --cached --name-only -z` as bytes and
  NUL-splits filenames, including Unicode/newline names; MIDI and build-output
  checks are case-insensitive and cover Rust/Vite/Playwright/dependency outputs

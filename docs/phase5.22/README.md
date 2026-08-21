<!-- phase-id: 5.22 -->

# Phase 5.22 — Source Bassline Practice
## Detached Source Bassline Snapshot / Bassline Echo Integration

## Status

`P5.22-00 IN PROGRESS — WORKING-TREE CONTRACT AND BASELINE PASS, COMMIT PENDING`

## Required Reading Order

Start with [execution state](execution-state.json), [work instructions](work-instructions.md), the linked contracts below, and the active Stage report.

### Single entry point

この `README.md` を Phase 5.22 の単一入口とする。

Codex / Claude Code は着手・再開のたびに次の順で読む。

1. repository root `AGENTS.md`
2. repository root `CLAUDE.md`
3. `docs/phase5.22/README.md`
4. `docs/phase5.22/execution-state.json`
5. `docs/phase5.22/work-instructions.md`
6. `docs/phase5.22/proposal/ORIGINAL-PROPOSAL.md`
7. `docs/phase5.22/proposal/P5.22-DESIGN-REVIEW.md`
8. `docs/phase5.22/contracts/01-scope-product-contract.md`
9. `docs/phase5.22/contracts/02-source-bassline-snapshot-contract.md`
10. `docs/phase5.22/contracts/03-versioning-timing-bounds-contract.md`
11. `docs/phase5.22/contracts/04-capture-opt-in-voice-selection-contract.md`
12. `docs/phase5.22/contracts/05-practice-source-level-section-contract.md`
13. `docs/phase5.22/contracts/06-lifecycle-history-export-contract.md`
14. `docs/phase5.22/contracts/07-security-privacy-contract.md`
15. Active Stage の audit/report
16. `docs/phase5.22/backlog/FUTURE-EXTENSIONS.md`

Git reality と docs が食い違う場合は Git を優先し、差異を report に記録する。

---

## Purpose

MIDI Captureでユーザーが確定したBass Voiceの実ノート列を、
元ファイルに依存しないdetached snapshotとしてVaultへ保持し、
Bassline Echoの追加sourceとして練習できるようにする。

```text
MIDI Capture
  ↓
Bass Voiceをユーザー確定
  ↓
対象ブロック区間の全Bass note eventを保存
  ↓
Detached SourceBasslineSnapshot
  ↓
Vault / Export / Import
  ↓
Bassline Echo
  ├─ Generated
  ├─ Preset
  ├─ Vault-generated
  └─ Source Bassline
       ├─ Level 1 Root-focused
       ├─ Level 2 Chord-tone simplified
       └─ Level 3 Source line
```

---

## Architecture decision — B+

案Bを採用する。ただし、練習用に加工済みの単音列ではなく、
**後から何度でも教材を再生成できる最小限の原資料**として保存する。

### B+ principles

1. 保存時に最低音だけへ潰さない。
2. 選択Bass Voiceの同時発音を含む全ノートeventを保持する。
3. 単音化・root化・chord-tone化はPractice target生成時に行う。
4. raw MIDI bytes / path / filename / track name / device情報は保存しない。
5. source snapshotはimmutable。コード編集で書き換えない。
6. Level 1/2は保存せず、Level 3/source snapshotから決定的に導出する。
7. `Transfer`を「次の区間」の意味へ変更しない。区間移動は専用UIにする。
8. VaultとPracticeは既存の物理key/pathのまま`fileVersion = 2`へ移行する。旧VaultはTypeScript parse/storeがv2をfuture readonlyとして非書込みにし、旧PracticeはRust+TypeScriptのv1 validatorがv2をwrite前拒否する。どちらも既存データを変更しない。

---

## In scope

- SourceBasslineSnapshot domain
- Bass Voice note extraction
- all-note preservation
- section-boundary overlap semantics
- timing precision decision
- per-snapshot note/byte budget and 16 MiB whole-Vault budgets
- backward/forward compatibility
- Capture時のBass Voice選択
- explicit opt-in persistence
- Vault export/import validation
- Progression Detail availability/status
- Bassline Echo source option
- 1〜2 bar practice windows
- Level 3 Source line
- Level 1/2 deterministic simplification
- Record & Compare reuse
- Practice History factual reference
- source/current-progression mismatch disclosure
- full release/product acceptance

---

## Non-goals

- 新しい6つ目のPractice mode
- source MIDI fileの再読込依存
- raw MIDI保存
- file path/filename/track name保存
- 自動採点
- 音声解析
- source basslineの自動作曲的修正
- 量子化・humanize・timing補正
- AI skeleton extraction
- source MIDI全曲保存
- 既存ブロックへの遡及生成
- Contract 06の緩和
- `Transfer = 次の区間`への意味変更
- P5.23

---

## Protected surfaces

- P5.15
- Analyzer / Role v2 / Harmonic Core
- MIDI chord scoring / boundaries / candidates
- MIDI Exporter既存挙動
- Chord Dojo
- Live MIDI
- FreePats assets
- P5.17 RecordingTake store
- P5.18〜P5.21.1 Practice contracts
- P1 Security Hardening intake budgets
- test-output hygiene
- `docs/CURRENT_STATE.md`

必要なVault schema/version変更は、Stage00で明示的に承認された
SourceBasslineSnapshot追加に限定する。

---

## Preconditions

開始時に確認する。

- P1 Security Hardeningがmasterへ統合済み
- P5.21.1 accepted codeがmasterの祖先
- P5.20 / current functional behaviorがmasterに存在
- master clean
- P5.15 frozen commitsは非祖先

推奨 branch:

`feat/p522-source-bassline-practice`

---

## Stages

### P5.22-00 — Repository Audit / B+ Contract / Baseline

production featureを実装しない。

監査・固定:

- Bass Voice note availability
- CaptureDraft→SavedProgressionBlock save path
- Vault schema / unknown-field behavior
- fileVersion 1 vs 2
- raw parser由来のexact integer timing path
- authoritative source-matched range and section-boundary note semantics
- per-snapshot note/byte budget and 16 MiB whole-Vault budget
- explicit selected Voice confirmation with no silent preselection
- current progression edit semantics
- Level 1/2 derivation authority
- Bassline Echo monophony/polyphony capability
- History/reference contract
- export/import/privacy
- synthetic/real acceptance fixtures

### P5.22-01 — Snapshot Domain / Extraction / Compatibility

- SourceBasslineSnapshot
- all-note extractor
- overlap/boundary flags
- deterministic ordering
- size validation
- schema/version path
- legacy/future compatibility
- pure tests

### P5.22-02 — Capture Opt-in / Persistence / Vault

- Bass Voice candidate selection
- explicit save opt-in
- disclosure / count / export notice
- CaptureDraft→Vault
- export/import
- duplicate/delete semantics
- Progression Detail status

### P5.22-03 — Bassline Echo Source / Level 3 / Section Loop

- `元ベースライン` source
- availability/reason
- source preview
- 1〜2 bar windows
- previous/next window
- Level 3
- polyphonic source handling/disclosure
- Chord Context / Record & Compare integration

### P5.22-04 — Level 1/2 / History / Lifecycle

- Root-focused deterministic derivation
- Chord-tone simplified derivation
- exact difference disclosure
- source/current-progression mismatch
- History factual reference
- restart/import/delete behavior

### P5.22-05 — Hardening / Release / Product Acceptance

- full regression
- security/import budgets
- performance
- Web/Tauri
- artifacts
- human acceptance
- master未mergeで停止

---

## Completion conditions

- user-confirmed Bass Voice only
- explicit opt-in only
- all notes preserved in source snapshot
- no raw MIDI/path/name/device persistence
- source-note timing is derived only from raw integer ticks within an authoritative source-matched range; exact harmony may be omitted while retaining the all-note snapshot and Level 3
- boundary-crossing notes are represented honestly
- snapshot has finite note/byte limits and all Vault operations enforce the 16 MiB serialized-document limit
- old Vault remains readable
- forward data-loss risk is resolved by evidence-based fileVersion decision
- Source Bassline appears inside Bassline Echo, not as new mode
- Level 3 is available first
- L1/L2 are deterministic and transparent, or unavailable when exact captured harmony is not provable
- source snapshot is immutable after progression edits
- History does not duplicate note array
- the new `sourceBassline` export/import subtree remains free of its forbidden fields; no claim is made about legacy outer provenance fields
- full gates PASS
- human acceptance before merge

---

## Stop conditions

- Bass notes are unavailable at save boundary
- preserving exact notes would require persisting or re-reading raw MIDI bytes/path; a transient already-parsed integer-tick seam is explicitly allowed
- fileVersion1 would silently lose sourceBassline and version2 migration cannot be made safe
- timing cannot round-trip without unacceptable drift
- note budgets cannot be enforced at import/store boundaries
- existing Bassline Echo cannot represent a safe Level3 target and no honest projection is possible
- Level1/2 requires AI/heuristic claims beyond locked deterministic rules
- P1 intake hardening must be weakened
- unexpected Vault/Practice migration risk
- P5.15/Analyzer/MIDI Exporter changes required
- test-output hygiene regression

停止時に reset / stash / discard を行わない。

---

## Next action

`P5.22-00`の改訂contractとbaseline Gateはworking tree上でPASS。

次にdocs-only Stage commitを作成し、そのexact commitでGateを再実行してstate/reportへhashを記録するclosureを行う。P5.22-01は開始しない。

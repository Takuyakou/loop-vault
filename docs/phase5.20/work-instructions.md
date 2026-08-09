<!-- phase-id: 5.20 -->
# Phase 5.20 Work Instructions — Text Progression Entry

## Goal

Add a second, text-first Capture input mode that converts an explicitly valid
chord progression into the existing CaptureDraft and normal Vault save flow.
The text parser, diagnostics, cards, voicing inspector, and capability matrix
must be deterministic, truthful about provenance, and compatible with existing
Capture editing and downstream contracts.

## Scope

- Capture-local MIDI/Text input selection; text is authoritative only until it
  is converted once into a session-only CaptureDraft.
- Grammar v1, diagnostics, key candidate/confirmation, BPM and 4/4 timing.
- Existing compact card visual language, selected-card inspector, Auto audition,
  existing Live MIDI Custom Voicing capture, capability matrix, and normal save.

## Non-goals

- Composition assistance, PXF, MIDI export, a new persisted progression type,
  a Vault/Practice schema or fileVersion migration, source-MIDI reconstruction,
  a click-to-compose voicing editor, and P5.21.

## Definition of Done

The complete phase has an explicitly valid text-to-Draft bridge, exact timing,
truthful source/voicing state, verified downstream capability, the full release
gate set, human acceptance, and a clean worktree. Each completed stage records
all required passing gates and its commit hash in execution-state.json.
## Stage00 Locked Decisions

This section supersedes any tentative wording below.

- Git reality: merged P5.19 is the prerequisite. No tracked P5.19.1 phase or
  commit exists, so it is not a blocker.
- Grammar v1: 4/4 only; 1/2/4 chords per bar; 4/2/1 beats; bounded to 12 bars,
  48 tokens, and 4,096 UTF-16 code units; no partial conversion.
- `N.C.` and rest syntax are diagnostic-only in v1 because silent text-rest
  preview is not established.
- Key state is unknown/inferred/confirmed; only confirmed key supports Roman or
  numeric entry, degree display, and persisted `detectedKey`.
- Custom Voicing is **AUTHORIZED** only through existing Live MIDI capture into
  `practiceVoicingOverride`; no schema/fileVersion/new storage or click editor.
## 0. Mission
コード進行をテキストで入力し、既存CaptureDraft・ProgressionGrid・編集・保存パイプラインへ正確に接続する。

## 1. Start-up audit
- branch / HEAD / master HEAD
- `git status --short`
- worktrees
- merge/rebase/cherry-pick状態
- P5.19.1 completion ancestor
- P5.19〜P5.17 ancestors
- test-output hygiene ancestor
- P5.15 non-ancestor
- phase-doc validator

Dirtyならreset/stash/discardせず停止。

## 2. Required repository audit
### Capture
- Capture route/tabs
- `CaptureDraft` exact type
- ProgressionGrid / compact card component
- Quick Editor / boundary drag / Undo/Redo
- preview / save dialog
- `createIdeaFromDraft()` / append flow

### Parser
- `parseChordLabel()`
- `labelFromSymbol()`
- Fast Label Entry
- canonical identity
- slash bass / aliases / degree input / autocomplete / N.C.

### Timing
- meter model
- beat precision
- 1/2/3/4 chords per bar
- max bars/events
- Contract 06

### Key
- inference
- user-confirmed
- unknown
- degree conversion
- persistence

### Voicing
- existing Auto Voicing generator
- progression-aware or per-chord
- voice-leading/common-tone/register/crossing behavior
- exact note pitches in CaptureDraft/Vault
- existing Voicing Memory
- MIDI input path

### Downstream
- Vault search / degree search
- Chord Dojo
- Bass Practice
- Chord Context
- Root Motion
- source/origin display

## 3. Grammar v1
P5.20-00で正式固定。

### Bar notation
`| Dm7 G7 | Cmaj9 | Am7 |`

### Simple notation
`Dm7 G7 Cmaj9 Am7` → 1コード=1小節。

### Slash chord
`C/E`, `G7/B`, `C6/9`は1 token。`/`を区切りに使わない。

### Aliases
既存canonical parserを正本とする。提案候補: `CM7/Cmaj7/CΔ7`, `Cm7/Cmin7/C-7`, `C°/Cdim`, `C+/Caug` 等。

### Roman numeral
現在Fast Label Entryが安全に対応する場合のみ。user-confirmed key必須。inferred keyでは解決しない。

### v1で勝手に追加しない
`%`, `x4`, comments, section headers, `:2`, lyric-mixed text, arbitrary repeat grammar。

### N.C.
現在domain/downstreamを監査してP5.20-00で決定。

## 4. Timing
4/4の安全候補:
- 1 chord/bar → 4 beats
- 2 → 2 each
- 4 → 1 each

3 chord/barは現在timeline/persistenceがexactに表現可能な場合だけ許可。無理なら明確なdiagnostic。

## 5. Parser architecture
Persistent modelは増やさないがtransient parser typesは許可。

```text
Lexer
→ Parser
→ TextProgressionParseResult
→ CapabilityEvaluator
→ toCaptureDraft()
```

Parse resultはraw token / canonical token / source range / bar / timing / diagnosticを保持。

## 6. Error UX
Valid tokenはカード表示、invalid tokenはそのカードだけ要修正。silent substitution禁止。未解決中はDraft作成禁止。

## 7. UI/UX
順序:
1. コード進行入力
2. 解析結果をcompact cardで確認
3. 保存後に使える機能
4. Draft作成

### Cards
新しい巨大カード禁止。現行progression detail / ProgressionGridを監査してcomponent/variant/tokenを再利用。

優先表示:
- index
- duration/bar position
- canonical chord
- degree
- voicing state

Bar単位でgroup。

### Voicing Inspector
カード選択時だけ詳細表示:
- selected chord
- `Voicing: Auto`
- generated notes
- mini keyboard（既存再利用可能なら）
- audition
- 条件付きCustom action

## 8. Voicing
### Auto Voicing
P5.20必須。既存generator/previewを再利用。元MIDI Voicing Memoryと誤認させない。

### Generator audit
P5.20-00でper-chord/progression-aware、voice leading、common tones、register、crossingを記録。hidden scopeとして全面書換えしない。

### Custom Voicing
P5.20内で許可する条件:
- CaptureDraftがexact notesを既に保持
- Vault persistenceも既存契約で保持
- schema/fileVersion変更0
- new storage 0
- migration 0
- MIDI input infrastructure再利用可
- downstream互換

満たさなければ `DEFERRED — P5.20.1 Voicing Capture / Override`。

## 9. Key
Absolute chord inputはkey未確定でもVault contractが許すなら保存可。Inferenceは候補。Roman inputはconfirmed key必須。Degree表示はinferred/confirmed/unknownを区別。

## 10. Capability matrix
最低限:
- Vault Save
- Chord Dojo
- Bass Practice
- Chord Context
- Root Motion
- Voicing Memory

各項目はsupported/unsupported/unknown + factual reason。1つのglobal valid flag禁止。

## 11. CaptureDraft bridge
`進行を作成`時にtext→Draftへ一方向変換。以後はDraftが正本。既存Grid/Quick Editor/Undo/Preview/Saveへ接続。

## 12. Save/source
既存save pipelineのみ使用。`sourceFileNameなし=手入力`と決め打ちせず監査。安全に派生できなければsource badgeは後回し。

## 13. Auto title
例: `Dm7→G7→Cmaj9…`。confirmed keyならprefix可。inferred keyだけなら推定表示または省略。保存前編集可。

## 14. Stage instructions
### P5.20-00
production変更なし。grammar/timing/key/parser/card/voicing/capability/Draft/sourceを監査・契約固定。Custom Voicing判定を必ず記録。baseline gates後停止。

### P5.20-01
lexer/parser/canonicalization/timing/Roman(if approved)/diagnostics/capability/property-fuzz tests。

### P5.20-02
Capture tabs、textarea、live parse、compact cards、diagnostics、Inspector、Auto audition、条件付きCustom、capability、Draft bridge、既存save。

### P5.20-03
save/reload、Vault検索、度数検索、Chord Dojo、Bass Practice、Chord Context、Root Motion、noneligible save、a11y、Web/Tauri、artifacts、人間受入。

## 15. Automated tests
Parser: bar/simple/slash/C6/9/aliases/Unicode/Roman confirmed/unconfirmed/malformed/empty/repeated separators/long input/bounded runtime。

Timing: 1/2/4 chords、3 chord policy、meter、exact bar sums。

Cards: count/group/canonical/degree/duration/invalid/selected/long label/existing visual contract。

Voicing: Auto label/generated notes/preview/lifecycle/no source-MIDI claim。Customはauthorized時のみ。

Draft: bars/identity/onset/duration/key/no fake confidence/no MIDI evidence/no path/one-way authority。

Capability: Contract06/noneligible/unsupported meter/unsupported voicing quality/Root Motion/Voicing Memory。

E2E: Capture→text→cards→fix error→select card→Auto audition→capability→Draft→Quick Editor→Preview→Save→Vault/downstream。

## 16. Full release gates
- phase docs / validator
- lint / app TS / E2E TS
- P5.20 focused
- Capture/Vault/Chord Dojo/Bass Practice regressions
- full Vitest / Rust / full Playwright
- a11y / keyboard / reduced motion / 320px / 200%
- Web/Tauri build
- relevant benchmarks
- `git diff --check`
- post-test/build clean

Protected: tracked MIDI0, recordings0, `.local-evaluation`0, personal path0, Vault schema0, Practice schema0, P5.15 diff0, Analyzer/MIDI Exporter diff0, visual baseline diff0, Cargo EOL diff0。

## 17. Product artifacts
Direct exe / MSI / NSIS。relative path/bytes/SHA-256/build commit/app version/build date/grammar/card reuse/voicing decision/capability contractをreport。未commit。

## 18. Human acceptance
- text input primary
- cards directly below
- existing detail density/style
- aliases/slash/errors
- key candidate/confirm/degree
- card selection/Inspector/Auto audition
- Custom only if authorized
- capability
- noneligible Vault save
- Draft/Quick Editor/preview/save
- Vault/Chord Dojo/Bass Practice/Root Motion
- 320px/200%/keyboard/a11y
- final clean status

## 19. Commit rules
Explicit paths only。`git add -A` / `git add .`禁止。Stageごとにtest/report/state/commit/post-clean。master merge/push/P5.21禁止。

## 20. Final determination
- `READY FOR PRODUCT ACCEPTANCE — Text Progression Entry`
- `BLOCKED — Text Progression contract incompatible`
- `FAIL — Text Progression Entry is not production-safe`

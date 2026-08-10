<!-- phase-id: 5.20 -->
# Phase 5.20 — Text Progression Entry

## Status

- **Status:** in progress — automated re-verification is complete at `571b651`; human product re-acceptance is pending.
- **Active stage:** P5.20-03 (voicing-selection human re-acceptance pending)
- **Completed stages:** P5.20-00, P5.20-01, P5.20-02
- **Next action:** perform the documented voicing-selection human re-acceptance on `571b651`; do not merge, push, or start P5.21.

## Required Reading Order

1. [Root safety rules](../../AGENTS.md)
2. [Claude entry point](../../CLAUDE.md)
3. [Phase README](README.md)
4. [Execution state](execution-state.json)
5. [Work instructions](work-instructions.md)
6. [Original proposal](proposal/ORIGINAL-PROPOSAL.md)
7. [Design review](proposal/P5.20-DESIGN-REVIEW.md)
8. [Scope and input contract](contracts/01-scope-input-contract.md)
9. [Parser and grammar contract](contracts/02-parser-grammar-contract.md)
10. [Draft and voicing contract](contracts/03-draft-voicing-contract.md)
11. [Capability and downstream contract](contracts/04-capability-downstream-contract.md)
12. [UI card and inspector contract](contracts/05-ui-card-inspector-contract.md)
13. [Privacy and safety contract](contracts/06-privacy-safety-contract.md)
14. [Stage00 repository audit](audit/P5.20-00-repository-audit.md)
15. [Stage00 report](reports/P5.20-00-audit-baseline.md)

## Single entry point
このREADMEをP5.20の単一入口とする。着手・再開時は次を順番に読む。

1. `AGENTS.md`
2. `CLAUDE.md`
3. `docs/phase5.20/README.md`
4. `docs/phase5.20/execution-state.json`
5. `docs/phase5.20/work-instructions.md`
6. `docs/phase5.20/proposal/ORIGINAL-PROPOSAL.md`
7. `docs/phase5.20/proposal/P5.20-DESIGN-REVIEW.md`
8. `docs/phase5.20/contracts/01-scope-input-contract.md`
9. `docs/phase5.20/contracts/02-parser-grammar-contract.md`
10. `docs/phase5.20/contracts/03-draft-voicing-contract.md`
11. `docs/phase5.20/contracts/04-capability-downstream-contract.md`
12. `docs/phase5.20/contracts/05-ui-card-inspector-contract.md`
13. `docs/phase5.20/contracts/06-privacy-safety-contract.md`
14. Active Stageのaudit/report
15. `references/P5.20-UI-UX-MOCK.html`（存在時、UI参考のみ）

Gitとexecution-stateが食い違う場合はGitを優先し、差異をStage reportへ記録する。

---

## Purpose
MIDIを経由せず、コードネームをテキストで宣言してVaultへ追加できる2本目のCapture入口を作る。

```text
コード進行を入力
→ parse / canonicalize
→ 入力欄直下に既存ProgressionGrid系のcompactコードカードを生成
→ 選択カードをVoicing Inspectorで確認・試聴
→ downstream capabilityを確認
→ CaptureDraftへ一方向変換
→ 既存Quick Editor / Undo / Preview / Save
```

P5.20は入力路のPhase。次コード候補・作曲支援は含めない。

## Core decisions
- Captureに`MIDIから` / `コードを入力`の2入口。
- 入力→解析カード→capability→CaptureDraftの順。
- 新しい巨大コードカードを作らない。既存コード進行詳細/ProgressionGridのcompact UIを正とする。
- テキストとCaptureDraftを双方向同期しない。Draft生成後はDraftが正本。
- コードidentityはユーザー宣言値。key/degree/timing/voicing/capabilityは推定・生成・判定として区別。
- テキスト入力のVoicingは既定`Auto`。元MIDIのVoicing Memoryと誤表示しない。
- Custom VoicingはP5.20-00で既存モデルを監査し、schema/fileVersion/new storage変更なしで保存可能な場合のみP5.20内で許可。必要ならP5.20.1へ延期。
- Vault保存可否とChord Dojo/Bass Practice/Chord Context/Root Motion適合を別々に表示。

## In scope
- progression text parser
- bar notation / simple notation
- existing chord parser/canonical identity reuse
- key candidate / user confirmation
- BPM / meter
- token/card diagnostics
- compact analysis cards
- selected-card Voicing Inspector
- Auto Voicing audition
- conditional Custom Voicing feasibility
- capability matrix
- CaptureDraft bridge
- downstream regression
- a11y / responsive / Web/Tauri acceptance

## Non-goals
- 次コード候補
- Chord Sketch作曲支援
- 類似進行/スタイル提案
- web/歌詞テキスト抽出
- PXF
- progression MIDI export
- 新しいVault storage type
- schema/fileVersion変更を伴うCustom Voicing
- P5.21

## Protected surfaces
- P5.15
- Vault schema/fileVersion
- Practice storage format
- Analyzer
- MIDI Exporter
- Live MIDI
- FreePats assets
- P5.17 RecordingTake store
- P5.18〜P5.19 source/practice contracts
- existing P5.18.2/P5.19 UI/UX system
- test-output hygiene
- `docs/CURRENT_STATE.md`

## Preconditions
- P5.19が正式完了・master統合済み
- P5.19 / P5.18.2 / P5.18.1 / P5.18 / P5.17が祖先
- test-output hygieneが祖先
- P5.15は非祖先
- clean master

推奨branch: `feat/p520-text-progression-entry`

## Stages
### P5.20-00 — Audit / Grammar / Contract / Baseline
production実装なし。CaptureDraft、parser、timing、key、card、voicing、capability、save/downstreamを監査して契約固定。

### P5.20-01 — Parser / Diagnostics / Capability Evaluator
lexer/parser、canonicalization、bar timing、診断、capability、property/fuzz/boundary tests。

### P5.20-02 — Capture UI / Compact Cards / Voicing Inspector / Draft Bridge
Capture tabs、input-first UI、既存compact cards、Inspector、Auto Voicing、条件付きCustom Voicing、Draft変換、既存editor/preview/save。

### P5.20-03 — Downstream Hardening / Release / Product Acceptance
Vault/検索/Chord Dojo/Bass Practice/Chord Context/Root Motion、a11y、Web/Tauri、artifacts、人間受入。master未mergeで停止。

## Completion conditions
- text inputから直下にcompact cardsが出る
- cardsは既存progression detailと同じvisual language
- token/card単位エラー
- unresolved error中はDraft作成不可
- key candidateとconfirmedを区別
- Auto Voicing明示・試聴可
- Custom Voicingは監査承認時のみ
- capability理由が機能別に正確
- 非適合でもVault save可能な場合は保存可能
- Draft後は既存pipelineを利用
- schema変更0
- full gates PASS

## Stop conditions
- P5.19未完了
- 2つ目のchord identity systemが必要
- CaptureDraftにschema rewriteが必要
- approved grammarのtimingを正確に表現できない
- Custom Voicingにschema/fileVersion/new storageが必要
- ProgressionGrid再利用が大規模破壊を要求
- inferred keyを事実保存しないと成立しない
- Vault/Practice schema変更が必要
- P5.15/Analyzer/MIDI Exporter変更が必要
- test-output hygiene退行

停止時reset/stash/discard禁止。

## Next action
`P5.20-00`のみ実行。P5.20-01以降へ自動で進まない。

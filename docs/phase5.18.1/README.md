<!-- phase-id: 5.18.1 -->

# Phase 5.18.1 — Bassline Preset Library & Vault Source Picker

## Status

P5.18.1-04 GATES PASS — Migration / Product Hardening; awaiting P5.18.1-05 authorization



## Single entry point

この `README.md` を Phase 5.18.1 の単一入口とする。

Claude Code / Codex は着手・再開のたびに、次の順で読む。

1. リポジトリルートの `AGENTS.md`
2. リポジトリルートの `CLAUDE.md`
3. `docs/phase5.18.1/README.md`
4. `docs/phase5.18.1/execution-state.json`
5. `docs/phase5.18.1/work-instructions.md`
6. `docs/phase5.18.1/proposal/PRESET-CATALOG.md`
7. `docs/phase5.18.1/proposal/P5.18.1-DESIGN-REVIEW.md`
8. `docs/phase5.18.1/contracts/01-scope-contract.md`
9. `docs/phase5.18.1/contracts/02-preset-library-contract.md`
10. `docs/phase5.18.1/contracts/03-source-picker-contract.md`
11. `docs/phase5.18.1/contracts/04-history-migration-contract.md`
12. `docs/phase5.18.1/contracts/05-privacy-safety-contract.md`
13. `docs/phase5.18.1/contracts/06-chord-context-section-extension-contract.md`
14. Active Stage に対応する `audit/` と `reports/` の既存成果物

Git の実態と `execution-state.json` が違う場合は、Git を優先して差異を Stage report に残す。

---

## Required Reading Order

1. [Root safety rules](../../AGENTS.md)
2. [Claude entry point](../../CLAUDE.md)
3. [Phase README](README.md)
4. [Execution state](execution-state.json)
5. [Work instructions](work-instructions.md)
6. [Preset catalog proposal](proposal/PRESET-CATALOG.md)
7. [Design review](proposal/P5.18.1-DESIGN-REVIEW.md)
8. [Scope contract](contracts/01-scope-contract.md)
9. [Preset library contract](contracts/02-preset-library-contract.md)
10. [Source picker contract](contracts/03-source-picker-contract.md)
11. [History migration contract](contracts/04-history-migration-contract.md)
12. [Privacy and safety contract](contracts/05-privacy-safety-contract.md)
13. [P5.18 section length extension](contracts/06-chord-context-section-extension-contract.md)
14. [Stage 00 audit](audit/P5.18.1-00-repository-audit.md)
15. [Stage 00 report](reports/P5.18.1-00-audit-baseline.md)
## Purpose

Bassline Echo のコード進行ソースを、現在の既定1進行だけから次へ拡張する。

```text
Bassline Echo
├─ プリセットから選ぶ
└─ Vaultから選ぶ
```

主な目的は次の2点。

1. 役割の異なる複数の練習用コード進行を、最初から選べるようにする。
2. Bassline Echo 内から直接 `Vaultから選ぶ` を押し、保存済み進行を教材にできるようにする。

Progression Detail から Bass Practice を開く既存導線があっても、それだけを Vault 利用手段にはしない。
Bassline Echo 自体に明示的な Vault picker を置く。

---

## Product decision

### Source selector

Bassline Echo の練習設定に、常に識別可能なソース選択を置く。

```text
練習するコード進行

[プリセット] [Vaultから選ぶ]
```

推奨表示:

- 選択中の source kind
- 進行名
- コード列
- キー / mode
- 小節または section
- original BPM
- `変更する`

### Preset library

最低8種類の役割が異なるプリセットを提供する。

現在の既定進行は削除しない。

- 現在の既定進行がカタログの1つと同一なら、既存 ID と履歴互換を保ったままその項目として扱う。
- 同一でない場合は、既存進行を `Existing Default / Classic` として残し、8候補を追加する。結果として9件でもよい。
- 既存 History、fixture、seed、test が参照する ID を壊さない。

### Vault source

Bassline Echo 画面から直接 picker を開けること。

- Vault は read-only
- raw MIDI や個人 path を Practice へ持ち込まない
- 長い進行は P5.18 で固定された安全な section 単位から選択
- 選択を確定するまで、現在の source を変更しない
- Cancel で元の選択を維持
- source deleted / edited に安全

---

## In scope

- Bassline Echo の source selector
- 既定プリセットライブラリ
- プリセットのキー変更 / deterministic transposition
- カテゴリ表示
- 現行既定進行の後方互換
- Bassline Echo 内の `Vaultから選ぶ` ボタン
- Vault picker
- Vault progression の検索・選択
- P5.18 section selector の再利用
- 選択済み source summary
- Preset / Vault の History 区別
- source edit / delete 耐性
- Generated bassline / Chord Context / Record & Compare との接続
- production build と product acceptance

---

## Non-goals

- コード進行そのもののランダム生成
- 元 MIDI ベースライン抽出
- 新しいベースライン生成アルゴリズム
- 自動採点
- Root Motion Echo
- 新しい Vault schema
- Vault favorite / recent metadata の新設
- Vault の書き換え
- AI による進行推薦
- ストリーク / レベル演出
- P5.19 の着手
- P5.15 の再開
- P5.18 chord playback の再設計
- P5.17 recording storage の再設計

---

## Protected surfaces

変更禁止、または最小 integration seam だけを許可する。

- Vault schema / file version
- Vault mutation
- Analyzer
- MIDI Exporter
- Live MIDI
- Chord Dojo
- P5.15
- P5.16 FreePats assets / mapping
- P5.17 RecordingTake binary-store contract
- P5.18 chord accompaniment engine contract, except for the bounded P5.18.1 section-length amendment in Contract 06
- `docs/CURRENT_STATE.md`（復活禁止）
- 個人 MIDI / 実録音 / 個人絶対 path

---

## Phase precondition

P5.18 が正式完了し、clean な master へ統合済みであること。

確認できない場合は、Phase 5.18.1 の実装へ進まず停止する。

推奨 branch:

`feat/p5181-bassline-preset-vault-picker`

---

## Stages

### P5.18.1-00 — Repository Audit / Contract / Baseline

- Phase ID `5.18.1` を既存 phase-docs validator が扱えるか確認
- 現在の既定進行、ID、fixture、History参照を監査
- P5.18 source model / Vault snapshot / section contract を監査
- Vault picker に再利用できる既存 search/list UI を監査
- 8プリセットの representability を固定
- baseline Gate を記録

production 機能を実装しない。

### P5.18.1-01 — Preset Domain / Catalog / Compatibility

- preset manifest
- deterministic transposition
- category / skill tags
- section definition
- current default compatibility / alias
- tests

### P5.18.1-02 — Vault Source Picker

- Bassline Echo 内の `Vaultから選ぶ`
- picker dialog / drawer / page
- search / selection / cancel / empty / error
- safe section selection
- read-only snapshot
- keyboard / accessibility

### P5.18.1-03 — Bassline Echo Source Integration

- Preset / Vault source selector
- selected source summary
- Bassline generation
- P5.18 Chord Context
- P5.17 Record & Compare
- source switching lifecycle
- History factual metadata

### P5.18.1-04 — Migration / Product Hardening

- existing History / settings compatibility
- deleted / edited Vault source
- unsupported chord
- large Vault
- feature rollback
- accessibility / viewport / resource safety

### P5.18.1-05 — Release Gates / Product Acceptance

- full gates
- direct executable / MSI / NSIS
- human UI / audio acceptance
- master 未 merge で停止

---

## Stage progression

- Stage Gate を通過してから次へ進む
- Stage ごとに report と `execution-state.json` を更新
- Stage ごとに明示 path commit
- `git add -A` / `git add .` 禁止
- master merge 禁止
- push 禁止
- P5.19 着手禁止

---

## Completion conditions

- Bassline Echo 画面に source selector がある
- `Vaultから選ぶ` が Bassline Echo から直接開ける
- Vault picker から選択し、練習開始できる
- Preset / Vault が明確に区別される
- 既定プリセットが最低8役割
- 現在の既定進行が後方互換で残る
- 同じ preset / key / section / level / seed なら同じ課題
- Vault は read-only
- 長い進行は安全な section から選べる
- unsupported chord を黙って置換しない
- History が source kind を事実として保持
- P5.18 Chord Context が選択 source を使用
- P5.17 Record & Compare が非退行
- production-default E2E PASS
- full regression / Web / Tauri build PASS
- product acceptance 待ちで停止

---

## Stop conditions

次の場合は安全に停止する。

- P5.18 が未完了 / 未統合
- phase-docs validator が patch phase ID を安全に扱えず、最小修正でも解決できない
- 現行既定進行の ID / History を破壊しないと移行できない
- Vault schema 変更が必要
- Vault mutation が必要
- raw MIDI / private path を保持しないと picker が成立しない
- P5.15 を取り込む必要がある
- Analyzer / MIDI Exporter の変更が必要
- Contract 06 の境界内に section-length extension を閉じ込められない
- preset quality を無断で別 quality に簡略化しないと表現できない
- source switch で Practice / recording / playback resource leak が解消できない
- 意図不明な既存変更がある

停止時に reset / stash / discard / 強制 checkout を行わない。

---

## Next action

P5.18.1-04 is complete and recorded. Await explicit human authorization before starting
`P5.18.1-05 — Release / Acceptance`; do not begin it automatically.

<!-- phase-id: 5.18 -->

# Phase 5.18 — Chord Context Practice

## Status
`IN PROGRESS - P5.18-01 complete; P5.18-02 is the next authorized stage`

## Single entry point
この `README.md` を Phase 5.18 の単一入口とする。

Claude Code / Codex は、P5.18 に着手・再開するたびに以下の順で読むこと。

## Required Reading Order

1. リポジトリルートの [AGENTS.md](../../AGENTS.md)
2. リポジトリルートの [CLAUDE.md](../../CLAUDE.md)
3. [Phase README](README.md)
4. [execution-state.json](execution-state.json)
5. [work-instructions.md](work-instructions.md)
6. [Contract 01](contracts/01-scope-contract.md)
7. [Contract 02](contracts/02-vault-snapshot-contract.md)
8. [Contract 03](contracts/03-playback-contract.md)
9. [Contract 04](contracts/04-record-compare-integration-contract.md)
10. [Contract 05](contracts/05-privacy-safety-contract.md)
11. 現在の Active Stage に対応する [reports/](reports/README.md) 成果物

Git の実態と `execution-state.json` が食い違う場合は Git の実態を優先し、差異を report に記録する。

---

## Purpose
Bassline Echo を「ベース音だけを覚えて弾く練習」から、
**コード進行の文脈の中でベースを弾く練習**へ拡張する。

P5.18 の主役は Vault に保存済みのコード進行。

```text
Vault に保存したコード進行
→ Bass Practice を開始
→ ベース + コードでお手本を聴く
→ コードだけを鳴らす
→ 実ベースを弾く
→ P5.17 Record & Compare で録音・聴き返す
→ 自己評価
```

Generated Progression / Generated Bassline Echo は既存互換として残す。

## Product principles
1. **Vault First** — 保存済みコード進行を主要教材にする。
2. **Read Only** — Practice から Vault を変更しない。
3. **Ear First** — 記譜中心にしない。
4. **Honest Practice** — 自動採点・能力スコアを追加しない。
5. **Bass Owns the Low End** — コード伴奏が低域を奪わない。
6. **Deterministic Playback** — 同じ入力・設定から同じ voicing / timing。
7. **P5.17 Reuse** — Record & Compare を再実装しない。

## In scope
### Target mode
P5.18 の対象は **Bassline Echo のみ**。

### Practice sources
- `Vault Progression` — 主役
- `Generated Progression` — 既存互換 / fallback

### Listen modes
- Bass only
- Chords only
- Bass + Chords
- Bass + Chords + Metronome

### Play modes
- Chords only
- Chords + Metronome
- Metronome only
- No accompaniment

### Tempo
- 元進行 BPM を既定値として利用
- 練習中だけ手動 BPM override
- 明示操作による `+4 BPM`
- Vault の BPM は変更しない
- 自己評価を根拠に自動で BPM を上げない

### Record & Compare
P5.17 の録音基盤をそのまま利用する。
- コード伴奏を鳴らしながら録音可能
- Target と My Take は同時再生しない
- リアルタイム入力モニターは追加しない
- スピーカー使用時は「ヘッドホン推奨」を表示する

## Non-goals
- 元 MIDI 内の実ベースライン抽出
- ピッチ / リズム / 音価の自動判定
- DI / マイク自動採点
- MIDI 演奏採点
- Root Motion Echo
- Chord Dojo 合同セッション
- ポジション制約判定
- 五線譜モード
- AI 伴奏
- 複雑なバッキングパターン生成
- Vault への書き戻し
- P5.15 の再開
- P5.17 録音エンジン再設計
- Degree Echo multi-bar 拡張
- 元 MIDI Bassline Practice

## Protected surfaces
- Vault schema
- Vault mutation
- Analyzer
- MIDI Exporter
- Live MIDI
- Chord Dojo
- P5.15
- P5.16 FreePats asset / mapping
- P5.17 RecordingTake 保存契約
- `docs/CURRENT_STATE.md`（復活禁止）
- 個人 MIDI / 個人絶対 path / 実録音

## Source-of-truth rules
- Git / working tree が最優先
- 本 README は Phase 入口
- `work-instructions.md` は詳細仕様
- `execution-state.json` は再開状態
- `contracts/` は固定契約
- `reports/` は実施結果

## Stages
### P5.18-00 — Repository Audit / Contract / Baseline
production 実装をせず、Vault snapshot / Bassline Echo / Playback / chordVoicing / metronome / P5.17 を監査して契約を固定。

### P5.18-01 — Chord Accompaniment Engine
deterministic voicing、bass-safe register、mix、timing、stop/dispose。

### P5.18-02 — Vault Progression Source / Section Selection
Progression Detail handoff、read-only snapshot、区間選択、edited/deleted source。

### P5.18-03 — Bassline Echo Listen / Play Integration
Listen 4 モード、Play 4 モード、既存 Bassline Echo へ統合。

### P5.18-04 — Record & Compare / Tempo / History
P5.17 再利用、manual BPM、+4 BPM、History factual metadata。

### P5.18-05 — Product Hardening / Release Gates / Hardware Acceptance
a11y、resource safety、Playwright、Tauri、実機 acceptance。

## Stage progression rule
- Stage Gate を通るまで次へ進まない
- Stage ごとに report と `execution-state.json` を更新
- Stage ごとに明示 path commit
- master merge禁止
- push禁止
- P5.19へ進まない

## Completion gates
- Vault Progression から起動可能
- Vault mutation 0
- Generated source 非退行
- Listen 4 モード / Play 4 モード
- chord accompaniment が bass register を侵食しない
- Stop / tab / route leave で stuck sound 0
- P5.17 Record & Compare と同時利用可能
- manual BPM / +4 BPM が Vault を変更しない
- History は事実だけを保存
- edited/deleted source に安全
- full regression PASS
- Tauri release build PASS
- target Windows + MOTU M4 で hardware acceptance PASS

## Stop conditions
以下は停止して報告する。
- Vault schema 変更なしでは成立しない
- P5.15 が必要
- P5.17 RecordingTake schema の破壊的変更が必要
- Analyzer 変更が必要
- Chord Dojo を壊す必要がある
- schema 制約を無視した長尺化が必要
- audio resource leak を解消できない
- production Tauri と Web で重大な差
- source 削除で過去 History が壊れる
- 個人 MIDI / 実録音 / 絶対 path が commit 対象になる
- 自動採点を追加しないと成立しない

停止時に reset / stash / 破棄をしない。

## Branch / worktree policy
P5.17 完了後の clean な master を開始点にする。

推奨 branch:
`feat/p518-chord-context-practice`

既存 P5.15 / P5.16 / P5.17 worktree を変更しない。

## Next action
`P5.18-00 — Repository Audit / Contract / Baseline`

まず監査だけを行い、現在 schema / timing / Vault snapshot の実態から安全な区間長を固定する。
P5.18-01 以降へ自動で進まない。

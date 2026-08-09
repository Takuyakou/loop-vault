<!-- phase-id: 5.18.2 -->

# Phase 5.18.2 Work Instructions — Vault Source Discoverability

## 0. Mission
P5.18.1のVault pickerは安全だが、タイトルを出さないため目的の曲由来進行を見つけづらい。
P5.18.2ではライブVaultのタイトルをUI表示専用に使い、発見性だけを改善する。
同時にProgression Detail → Bass Practice導線を監査し、既存なら固定、退行なら最小復旧する。

## Scope

- P5.18.2-00 audits the existing live Vault title, P5.18.1 picker boundary, Progression Detail handoff, and test-output hygiene baseline only.
- Later stages may add a UI-only title ViewModel, title search, and accessible picker presentation without changing the Vault schema or mutation behavior.

## Non-goals

- Persisting a Vault title in snapshots, Practice JSON, History, recording metadata, reports, or logs.
- Vault schema or mutation changes; Analyzer, MIDI Exporter, Chord Dojo, Live MIDI, P5.15, P5.19, and unrelated playback changes.

# 1. Start-up audit
- branch / HEAD / master HEAD
- `git status --short`
- worktrees
- merge / rebase / cherry-pick状態
- P5.18.1 merge ancestor
- test-output hygiene `81a6890` ancestor
- P5.15 non-ancestor
- `docs/CURRENT_STATE.md` absent
- phase-doc validator

dirtyならreset/stash/discardせず停止。

# 2. Required audit
## Vault title
特定する:
- progression entityのtitle/name/label field
- optional/required
- normalization / empty / whitespace
- Unicode / duplicate / long title
- existing UI usage
- repository/search API
- privacy classification

## P5.18.1 picker
- candidate mapping
- safe snapshot builder
- search predicate
- transaction
- section selection
- confirmation lifecycle
- History persistence

safe snapshotにtitleを追加しない。

## Progression Detail entry
現状を確認:
- `この進行をBass Practiceで練習` 相当actionの有無
- feature flag条件
- handoff
- P5.16/P5.18 test証拠
- production UIでの表示可否

判定:
1. exists-and-works → regression testのみ
2. exists-but-hidden/broken → 最小修正
3. historically existed but regressed → 復旧
4. never existed → Stage00で記録し、human approvalなしに新routeを設計しない

# 3. Live title boundary
UI/application presentation boundaryに safe snapshotとは別の表示用候補を置く。
概念例:
```ts
type VaultPickerCandidateView = {
  displayTitle: string;
  searchableTitle: string;
  safeSnapshot: VaultChordContextSnapshot;
};
```

## displayTitle
- live title
- trim
- empty/whitespaceは `無題の進行` 等へfallback
- persisted snapshotへコピー禁止

## Search
従来の key / section / chord 検索を維持し、normalized live titleを追加。
- case-insensitive where applicable
- Unicode-safe
- trim
- duplicate titleでも他情報で区別
- queryをHistoryへ保存しない

# 4. Picker UI
推奨表示:
```text
Suran - Sunny サビ
Cmaj7 | Am7 | Dm7 | G7
C major · Bars 5–8 · 92 BPM
```

タイトルを主ラベル、コード列/key/sectionを補助にする。
長いtitleはlayoutを壊さず、accessible full nameを維持。

# 5. Privacy invariant
Allowed:
- picker UI表示
- picker search
- Progression Detail既存表示

Forbidden:
- VaultChordContextSnapshot
- Practice JSON
- History
- RecordingTake metadata
- report
- console log / telemetry
- 実ユーザーtitleをtest fixtureへコピー

fixtureは架空タイトルのみ。

# 6. Progression Detail entry
既存導線がある場合は同じsafe snapshot handoffを再利用。
duplicate route/store/source modelを作らない。

存在しない場合はStage00で停止し、追加案を提案。明示承認後のみ実装。

# 7. Source lifecycle
P5.18.1 transaction維持。
- open/highlight: active source不変
- cancel: 不変
- confirm: existing chooseProgression lifecycle
- edited: live title/current source、過去History不変
- deleted: picker候補から消える、過去History/retained takeは保持、自動置換なし

# 8. Test-output hygiene
`81a6890` の契約をAcceptance Gateにする。
Full Playwright / Tauri後:
- tracked visual baseline差分 0
- Cargo.toml EOL差分 0
- generated output ignored
- 新規lint warning 0
- 新規React act warning 0
- `git status --short` clean

baseline更新は `npm run test:e2e:update-baselines` のみ。
通常release gateでは実行しない。

# 9. Stage instructions
## P5.18.2-00
production code変更禁止。
監査: title field/privacy、picker mapping/search、Progression Detail、test-output hygiene、current E2E。
固定: ViewModel境界、fallback、search normalization、privacy negative fields、Progression Detail determination、test matrix。
Gate: phase docs、validator、focused baseline、lint、app/E2E typecheck、Bass Practice/P5.18.1 regression、git diff check。
停止。

## P5.18.2-01
- display-only ViewModel
- title normalization/fallback
- search predicate/index
- safe snapshot separation
- title/missing/whitespace/Unicode/duplicate/special char tests
- serialization negative tests

## P5.18.2-02
- title-first picker row
- chord/key/section secondary info
- search UX
- keyboard/a11y/320px/200%
- Progression Detail: existsならregression、brokenならminimal fix、never-existedなら承認済みの場合のみ追加

## P5.18.2-03
- large Vault
- duplicate/long/Unicode title
- deleted/edited source
- title leakage scan
- source transaction regression
- P5.18.1/P5.18/Bass Practice regression
- full Vitest/Playwright/Rust/Web/Tauri
- test-output hygiene
- artifacts
- Product Acceptance report

最終: `READY FOR PRODUCT ACCEPTANCE — Vault Source Discoverability`
masterへmergeせず停止。

# 10. Test matrix
## ViewModel/search
- normal/Japanese/emoji/symbol title
- empty/whitespace/duplicate/long
- Latin case-insensitive
- Japanese substring
- title + chord query
- no-title fallback
- title absent from snapshot/History/RecordingTake serialization

## Picker
- title visible
- chord preview/key/section visible
- title search
- chord search regression
- no result
- cancel/confirm
- transaction preservation
- keyboard/screen reader/narrow viewport

## Progression Detail
Stage00判定に応じて:
- action visibility
- handoff
- Bassline Echo opens with Vault source
- no Vault mutation
- route compatibility

## Privacy
changed source/report artifactをscan:
- private field names
- source filesystem path
- personal absolute path
- raw title persistence
- raw MIDI
- recording

# 11. Full release gates
- `npm run validate:phase-docs`
- validator tests
- `npm run lint`
- app/E2E TypeScript
- P5.18.2 tests
- P5.18.1/P5.18/Bass Practice regressions
- full Vitest
- Rust
- production-default/full Playwright
- a11y/keyboard/reduced-motion/320px/200%
- Web build
- Tauri build
- relevant resource benchmark
- `git diff --check`
- post-test/build `git status --short`

Protected:
- tracked MIDI/real recordings/.local-evaluation 0
- personal absolute path 0
- title persistence 0
- P5.15 diff 0
- Vault schema/mutation 0
- Analyzer/MIDI Exporter diff 0
- Chord Dojo/Live MIDI/FreePats/Record&Compare/ChordContext non-regression
- tracked visual evidence diff 0
- Cargo.toml EOL diff 0
- CURRENT_STATE absent

# 12. Product acceptance artifacts
Generate direct exe / MSI / NSIS.
Report relative path / bytes / SHA-256 / build commit / version / build date / title privacy boundary / Progression Detail determination。
Generated artifactsはcommitしない。

# 13. Human acceptance checklist
1. Bassline Echo
2. `Vaultから選ぶ`
3. title表示
4. title検索
5. chord検索
6. 日本語title
7. 長いtitle
8. 同名title区別
9. 無題fallback
10. candidate閲覧だけではsource不変
11. cancelで不変
12. confirmで変更
13. section
14. Bassline start
15. Chord Context
16. Record & Compare
17. Historyにtitleが保存されない
18. Progression Detail導線
19. restart
20. Vault mutation 0
21. stuck sound 0
22. 探しやすさ改善

# 14. Commit rules
explicit paths only / no add -A / no add . / no generated output / no user title in report / post-commit clean / execution-state更新 / no master merge / no push / no P5.19。

# 15. Final report
- determination
- branch/HEAD/Stage chain
- title field audit
- ViewModel boundary/search
- privacy negative evidence
- Progression Detail determination/fix
- test counts
- Playwright/Rust/Web/Tauri
- test-output hygiene
- protected surfaces
- artifacts/SHA-256
- git status
- master unmerged
- push not performed
- P5.19 not started

Final:
- `READY FOR PRODUCT ACCEPTANCE — Vault Source Discoverability`
- `BLOCKED — title boundary or progression-detail contract incompatible`
- `FAIL — Vault discoverability change is not production-safe`


## Definition of Done

- The live Vault title is available only to picker presentation and search, never to detached snapshots, Practice/History/recording persistence, reports, or logs.
- The existing P5.18.1 source transaction and Progression Detail handoff remain safe and accessible.
- Release gates leave no tracked visual-evidence or Cargo.toml line-ending diff, and the phase remains unmerged and unpushed until human authorization.

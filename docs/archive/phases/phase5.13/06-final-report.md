# Loop Vault Phase 5.13 最終報告

## 調査範囲

App shell、Home、Capture empty / pre-analysis / result / correction、Vault、detail、
Live MIDI、Chord Dojo、Settings、Dialog、Toast、empty/loading/error、long contentを監査した。
主要フロー、状態管理、共有component、tokens、focus、keyboard、responsive、
reduced motion、performance、Playwright起動経路を確認した。

## 主な改善

- semantic token、共有Button/IconButton/Panel/Badge/state componentを整備した。
- App shellのcurrent location、global actions、保存状態、narrow layoutを整理した。
- Captureを「MIDI → part確認 → Analyze → candidate編集 → 保存」の順で読める構成にした。
- loading、最終処理、成功、回復可能error、empty、disabled reasonを区別した。
- コードの検出値、編集中値、選択状態を混同しない表示とARIAへ修正した。
- 未保存編集の候補切替とroute離脱を確認Dialogで保護した。
- Vaultを50件超で仮想化し、1,000件fixtureでも表示中rowだけをmountする。
- focus ring、skip link、dialog semantics、field name/autocomplete、contrastを修正した。

## UX上の変化

- MIDI読込開始地点はCaptureのdrop zoneとfile pickerの2経路を維持した。
- 読込後はpart確認とAnalyzeが同じ作業面にあり、次の操作を画面下まで探さない。
- 解析完了時はcandidate一覧と現在の編集対象、保存操作を同じ文脈で確認できる。
- 誤検出を変更して別候補へ移る時は、破棄・保存継続・cancelを選べる。
- 保存後はVault検索、詳細、Dojoへ一続きで移動できる。
- errorは原因だけでなく再試行または代替操作を示す。

## Playwright

- 4 projects、27 tests。
- keyboard-only 4 tests。
- viewport / overflow 6 tests。
- axe 3 tests、critical / serious 0件。
- visual evidence 16状態、pixel diff 5画面。
- failure screenshot / video / trace / HTML report生成を確認。

## Performance / Bundle

- 100,000 note piano-rollはCanvas描画を維持。
- 1,000 Vault progressionはvirtualized listを使用し、DOM rowは100未満。
- production JS: 1,318.86 kB / gzip 384.80 kB。
- production CSS: 46.71 kB / gzip 10.00 kB。
- 500kB超chunk warningはP2として残る。Phase 5.13では構造変更を避けた。

## 不変条件

- MIDI Analyzerと候補選定を変更していない。
- Vault schemaを変更していない。
- `fileVersion = 1`。
- default analyzer modeは`phase4-v1`。
- Rust/Tauri commandを変更していない。
- tracked MIDI 0、tracked `.local-evaluation` 0。

## 最終Gate

- lint: PASS。
- TypeScript: PASS。
- Playwright TypeScript: PASS。
- Vitest: 238 files / 1,845 tests PASS。
- Rust: 24 tests PASS。
- Playwright: 27 tests PASS。
- Web build: PASS。
- Tauri build: PASS。
- `git diff --check`: PASS。

生成物:

- `src-tauri/target/release/loop-vault.exe`
- `src-tauri/target/release/bundle/msi/Loop Vault_0.1.0_x64_en-US.msi`
- `src-tauri/target/release/bundle/nsis/Loop Vault_0.1.0_x64-setup.exe`

## 残件

- route-level code splitting。
- 専門編集補助操作の一部hit area。
- Tauri file picker、OS MIDI device、window closeのWindows実機確認。
- MIDI Export / FL Studio dragはPhase 5.13対象外。
- npm auditのhigh severity 2件は依存更新の影響確認が必要で、自動fixしていない。

## Rollback

P5.13-00〜07はstacked PRとして分割した。各PRを依存順の逆からrevertでき、
Analyzer/schema変更を含まないためUI単位で戻せる。mainへは未マージ。

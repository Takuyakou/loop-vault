# Phase 13 Bass Practice — 実装報告

## 最終状態
`P13.0-01 = IMPLEMENTATION COMPLETE / READY_FOR_HUMAN_PRODUCT_ACCEPTANCE`

- branch: `feat/phase13-bass-practice`
- 最終検証コードHEAD: `00615cfda382a0061312d1ccf9386ee5e490ae87`
- 開始base: `8d107d3225201658a167cd3319eb73c85adcb492`
- この報告とexecution-stateの追記は検証結果を記録するdocumentation-only変更。検証コードは変更していない。
- masterへの統合、push、tag、releaseは実行していない。

## 実装内容（区切り0〜5）
1. 既存4モード、設定、録音、SMF parser、単音化、保存経路を監査。既存作業用checkoutを再利用した。
2. 5モードのタブ、自己評価／録音後判定バッジ、共通の弦数・利き手・フレット設定、キー操作、課題／段階／図、録音と記録の右欄を統合。既存の問題生成、ヒント、自己評価、移調、保存形式は維持。
3. 独立したMIDIベースライブラリv1を追加。トラック先選びと手動選択、伴奏選択、ドラム除外、全meter検査、最低音を残す既存単音化、低音域のオクターブ選択、お気に入り、検索、名前変更、削除確認を実装。
4. 1/2/4/8/全部の区間、60/80/100%テンポ、曲全体の帯、FreePatsベース／エレピ伴奏／共有クリック、任意フレット図、1小節count-in、録音自動停止、試聴／重ね合わせを接続。
5. MIDIモードだけPCMを端末内workerで解析。音高、開始時刻、1対1対応、補正、合った／音が違う／早い／遅い／抜け／余分の印と記録を追加。中断・無音・クリッピングでは記録しない。録音の永続化は明示的な「残す」だけ。ホームの今日の練習へ完了attemptを加算。

区切り別の詳細: [監査](../audit/baseline.md)、[共通枠](01-shared-frame.md)、[ライブラリ](02-library.md)、[再生・録音](03-playback-recording.md)、[解析](04-analysis.md)、[統合とfailure isolation](05-integration.md)。

## 保存と保護契約
- Vault v2と既存Practice JSON schemaは変更していない。新しい曲はVaultへ挿入しない。
- native保存先はアプリデータの独立した `loopvault/bass-midi-library-v1.json`。既存atomic replace、revision/tokenのCAS、temp、最大20backup、隔離と検証済みbackup復元を再利用。
- 不明な将来versionは変更せず、隔離済みデータしかない場合は無断初期化しない。
- 保存対象は選択したトラックの音と必要な曲・attempt設定のみ。raw MIDI、元ファイルのpath、未選択トラックを保存しない。
- MIDI 2MB、全50,000音、ベース5,000音、200曲、各200attempt、ライブラリ16MB上限を明示。超過はエラーであり、既存データを削除しない。
- 実ユーザーのMIDI、録音、Vault、入力機器IDは調査・記録していない。

## 最終コードHEADのGate
以下はすべて `00615cfda382a0061312d1ccf9386ee5e490ae87` でfresh実行した。

| Gate | 実測 |
| --- | --- |
| MIDI focused Vitest | 17/17 PASS（library／analysis／recording） |
| Repository ESLint / class / source contracts | PASS |
| App / E2E TypeScript | PASS |
| Phase-doc / AI-handoff | PASS |
| Privacy/security scan | PASS |
| Production build / gallery exclusion | PASS |
| Runner contracts | 27/27 PASS |
| Full Vitest | 3,835/3,835 PASS |
| Repository-wide Playwright | 235/235 PASS、0 FAIL / 0 UNRUN |
| git diff --check | PASS |
| Cargo check offline | PASS |
| Native lib tests offline | 43/43 PASS |
| Windows build（no-bundle） | PASS |
| EXEコピーSHA照合／Windows x64 PE | PASS |

最終fresh FULL: **339.8秒**、rawログ **29,803 B**。PASSキャッシュは使用していない。ローカルログは `.local-evaluation/phase13/fresh-full-final.log` と `.local-evaluation/test-logs/2026-10-08T07-17-15-868Z-full.log`。

初回FULLは `8a3d560d` でPlaywright 232 PASS / 3 FAIL。共通枠への移動に伴う古い参照2件と、320pxのスクロール元変更1件を修正した。続くfocusedで音の立ち上がりの不安定な短い推定が別音となる問題を分離し、public PCMの決定的回帰を追加した。修正後に最終HEADをcommitし、FULLを再実行した。skip、retry追加、snapshot強制更新、timeout延長による回避はしていない。

追加で試したstrict Clippy（`-D warnings`）は既存8warningでFAIL。必須native Gateのcheck/testは上記のとおりPASSであり、範囲外のRustコードは変更していない。

[最終Gateの機械可読provenance](../evidence/final-verification.json)。

## 公開音源による判定資格
契約 `p13-freepats-v1`、公開同梱FreePatsの120ケース。実ユーザーの音声は使用していない。

| 指標 | 基準 | 実測 |
| --- | --- | --- |
| pitch accuracy（octave許容） | ≥95% | 100% |
| onset median / P90 | ≤20 / ≤40ms | 0 / 5ms |
| mark accuracy | ≥90% | 99.44% |
| extra recall | ≥80% | 100% |
| false extra / clean case | ≤10% | 0 |
| latency最大誤差 | ≤15ms | 2.5ms |
| 8小節BPM100解析 | ≤2,000ms | 300.0ms |

[機械可読evidence](../evidence/audio-qualification.json)。音声からのnote抽出へtarget notesは渡さず、PCM抽出後にのみ比較する。旧4モードには解析completionを接続していない。

## Responsive / Accessibility
1920×1080、1440×900、960×1032、768×640で5モードを自動撮影。desktopは図と右欄を独立スクロール、MIDI操作帯は図と分離して画面内に保持。1100px以下は自然な縦積みにし、メイン領域をスクロール元とする。320px、200%表示、旧キーボード操作も最終FULLでPASS。MIDI importはEsc、focus trap、元buttonへのfocus復帰を持ち、MIDI画面axeのserious/critical違反は0。

撮影結果はGit管理外 `.local-evaluation/phase13/screens/`。1440×900は参考サイズであり固定製品要件ではない。狭い画面では内容と操作帯・履歴へスクロール到達できることも検証した。

## Windows EXE
- ファイル: `Loop-Vault-Phase13-00615cfd.exe`
- サイズ: 24,774,656 B
- SHA-256: `4A189A62E900A303E62E9280F0C7E154465D89D4EA36DAB34EA883532533A1B3`
- インストーラーは生成していない。Dドライブ内でproduction webを再buildし、Tauri release buildを実行した。
- production buildにE2E用の固定日時・fixture環境を引き継いでいない。galleryの非混入も再確認した。
- native実機の起動・入力機器による録音確認はHuman Product Acceptanceで行う。

## Git reality / 並行作業
開始時はlocal master `8d107d32` を基準にした。作業中に別のP12作業でmasterは `fb426bb8246fc2ab55df50063bc8d83bef73693c` へ86commit進んだ。候補へこのP12追加差分は取り込んでいない。今回の結果は開始baseからのPhase 13候補の検証であり、最新P12と組み合わせた検証ではない。将来のmaster統合前にはApp、PracticeWorkspace、ホーム等の重なる経路を双方保持して確認する必要がある。

無関係な既存untrackedのテスト監査レポート、rule-coverage調査レポート、diagnosticsは保持。Phase 13のtracked変更のみcommitした。master/originは同期していない。

## 残る制約とHuman Acceptance
- 実機の短いベース録音約10件による判定確認は未実施。公開合成fixtureのGateは実演奏への精度保証ではない。
- 単音、28〜450Hzの目安判定。スライド、強いノイズ、連続同音・レガート再打鍵は誤分割／未検出の可能性がある。
- 録音は既存60秒上限を維持し、スケジューリング余裕込みで59.8秒を超える区間は短縮／テンポ変更を案内。聴くだけの長い区間とは区別する。
- constant 4/4のみ。テンポ変化は最初のテンポを使用し警告。SMFにtempoが無ければ120 BPM。
- お手本と録音の重ね合わせは補正した開始offsetを使うが、機器とブラウザdecodeによるsample精度の同期は保証しない。
- 旧練習の既存操作と状態遷移を優先し、MIDIのキー割当は入力欄とnative button activationを奪わない。

確認手順: EXEを起動 → Bass Practiceの「MIDI のベースライン」で読み込み → 入力機器／チャンネルを選び「録って弾く」。録音を永続化したい場合だけ「残す」を押す。Human acceptanceとmaster統合判断前で停止する。

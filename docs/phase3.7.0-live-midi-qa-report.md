# Loop Vault Phase 3.7.0 Live MIDI Mini Mode QA報告書

作成日: 2026-07-17
対象: Phase 3.7.0 L0-L6
対象ブランチ: `docs/p3-7-0-l6-qa-report`

## 1. 結論

Live MIDI Mini Modeの実装、純粋domainテスト、ウィンドウ変形テスト、WebView上のミニ表示確認、Web/Tauriビルド、Windowsインストーラー生成まで完了した。

Windowsは次のMIDI入力ポートを認識している。

- `MOTU M Series MIDI In`
- `APC40 mkII`

ただし、このQA実行中に物理鍵盤の演奏操作およびSynthesiaの起動操作は行っていない。そのため、実演奏時の体感遅延、サステインペダル、グリッサンド、物理切断、Synthesiaとの同時利用は**未測定**であり、利用可否を断定しない。

## 2. 実装範囲

| Stage | 実装内容 | 主な根拠 |
|---|---|---|
| L0 | 現行構造、終了処理、永続化境界、依存候補の監査 | `docs/phase3.7.0-live-midi-audit.md` |
| L1 | RustのMIDI列挙・接続・切断、10msイベントバッチ、`connectionId` | `src-tauri/src/live_midi/` |
| L2 | Note state、CC64、Bass選択、コード判定、安定化、履歴 | `src/domain/liveMidi/` |
| L3 | 同一ウィンドウのmini化・復元、位置補正、preferences | `src/liveMidi/miniWindowController.ts`, `src/liveMidi/preferences.ts` |
| L4 | 日本語/英語のLive MIDI UI、接続状態、コード・音・Bass・履歴表示 | `src/components/LiveMidiMiniMode.tsx`, `src/liveMidi/liveMidiStore.ts` |
| L5 | 履歴範囲を既存Ideaまたは新規Ideaへ任意取り込み | `src/components/LiveMidiImportDialog.tsx`, `src/domain/liveMidi/historyImport.ts` |
| L6 | 自動検証、WebView確認、Windows MIDIポート確認、本報告 | 本ファイル |

## 3. ウィンドウQA

| 確認項目 | 結果 | 根拠・備考 |
|---|---|---|
| ヘッダーからmini起動 | PASS | `src/components/AppShell.tsx` |
| 同一windowでmini化 | PASS | 新規WebView/windowを作らず表示とTauri window属性を変更 |
| normal -> mini -> normal | PASS | `src/liveMidi/miniWindowController.test.ts` |
| maximized/fullscreen復元 | PASS | 変形前snapshotを復元するテストあり |
| 画面外復元防止 | PASS | monitor work areaへのclampテストあり |
| 10往復 | PASS | snapshot/restoreを10回繰り返す回帰テストあり |
| always-on-top | PASS | mini開始時に有効、復帰時に元状態へ戻す |
| Escで復帰 | 実装済み | `src/App.tsx` のkeydown処理。手動キー入力は未実施 |
| xボタンで終了 | 実装済み | Playback停止、Live MIDI停止、既存flush後に`exit_app` |
| 340x200表示 | PASS | WebView smoke testで`scrollWidth=340`, `scrollHeight=200`、overflowなし |

WebView smoke testではmini画面に戻るボタン、デバイス選択、接続状態、現在コード、構成音、Bass、履歴が表示され、コンソールerror/warningは発生しなかった。

## 4. MIDI・domain QA

自動テストで次を確認した。

- Note On / Off、velocity 0、同音duplicate count、channel分離
- channel別CC64、sustain保持・解放
- held最低音をsustained最低音より優先するBass選択
- major/minor/7/maj7/m7/sus/add9/9/11/13、転回形、slash、unknown、2音以下
- block chord、80ms arpeggio、passing tone、subset/full release、hysteresis
- 400ms履歴commit、重複抑制、最大64件
- reconnect/device switch時のclear、古い`connectionId` batchの破棄
- duplicate device nameを名前だけで自動選択しないこと
- preferencesの旧値parse、Vaultとは別の`localStorage`保存

Rustはraw MIDI transportのみを担当し、コード解釈は行わない。TypeScript domainはReact、Zustand、Tauri API、`Date.now()`、`Math.random()`へ依存しない。

### タイミング定数

| 項目 | 値 | 意味 |
|---|---:|---|
| gather | 80ms | 分散入力された音を集める |
| stable | 120ms | コード切替の確定待ち |
| release grace | 250ms | subset/release順の揺れを抑える |
| bass grace | 120ms | Bass変化の許容値として定義 |
| full release | 300ms | 全解放後に`—`へ戻す |
| history commit | 400ms | 履歴へ追加する安定時間 |

これらはアルゴリズム上の予算であり、MIDIデバイス入力からWebView描画までの実測値ではない。物理入力による中央値180ms目標、arpeggio最終音から250ms以内の体感確認は未実施。

## 5. デバイス・Synthesia QA

Windows WinMM列挙ではMIDI入力2ポートを確認した。Rust側は`midir`を使用し、列挙・open・closeを提供する。デバイス選択はbackend IDを優先し、重複名だけでは自動再接続しない。

| シナリオ | 結果 |
|---|---|
| OSでのMIDI入力列挙 | PASS: 2ポート |
| Loop Vault単独で物理演奏 | 未実施 |
| サステインペダル実機 | 未実施 |
| 高速コード/arpeggio/glissando実機 | 未実施 |
| 物理切断/reconnect | 未実施 |
| Synthesia単独 | 未実施 |
| Synthesia + Loop Vault同時 | 未実施・可否未確定 |

Synthesiaとの同時利用はWindows driverおよびデバイスのmulti-client対応に依存する。MIDI Thruと仮想MIDIルーターはPhase 3.7.0の対象外。

## 6. 履歴取り込みとデータ保全

- Live履歴はセッション内だけに保持し、自動でVaultへ保存しない。
- ユーザーが取り込みを確定した場合のみ、既存store action経由でIdeaへ追記または新規Ideaを作成する。
- repositoryへ直接書き込まず、既存の`applyVaultChange()`とautosave経路を通る。
- 保存ブロックは`origin: "live-midi"`、`userVerified: false`、`analyzerVersion: "live-chord-v1"`を持つ。
- 未検証Liveコードへ`confidence: 1.0`を付けない。timeline上は`confidence: 0`とする。
- device、window bounds、note state、Live履歴はVault `data.json`へ保存しない。
- `fileVersion`は`1`のまま、`defaultAnalyzerMode`は`legacy`のまま。

## 7. 検証結果

| コマンド | 結果 |
|---|---|
| `npm run lint` | PASS |
| `npm test -- --run` | PASS: 96 files / 565 tests |
| `npx tsc --noEmit` | PASS |
| `cargo test` | PASS: 1 test |
| `npm run build` | PASS |
| `npm run tauri build` | PASS |
| WebView 340x200 smoke test | PASS |

生成物:

- `src-tauri/target/release/loop-vault.exe`
- `src-tauri/target/release/bundle/msi/Loop Vault_0.1.0_x64_en-US.msi`
- `src-tauri/target/release/bundle/nsis/Loop Vault_0.1.0_x64-setup.exe`

## 8. 未解決事項・制約

1. 物理鍵盤、ペダル、glissando、切断/reconnect、Synthesia同時利用の実機操作QAが残る。
2. `bassGraceMs`は定数化されているが、「直前Bassだけを独立して120ms保持する」専用stateはない。現在はheld-priorityとコード全体のrelease/stabilize処理で短い揺れを吸収する。
3. `midir`からOS固有の永続device IDを取得できないため、backend IDは列挙indexと名前から作る。重複名が曖昧な場合はユーザー再選択が必要。
4. 物理切断はfrontendの2秒pollingで検出するため、OS callbackによる即時検出ではない。
5. Web buildに500kB超のchunk警告が残る。ビルドと実行を妨げるエラーではない。
6. MIDI Thru、複数device統合、velocity表示、live key/degree、event録音はバックログのまま。

## 9. 手動確認チェックリスト

1. `MOTU M Series MIDI In`または`APC40 mkII`を選び、単音・和音・転回形を演奏する。
2. サステインを踏みながらBassを離し、held音がBassとして優先されることを確認する。
3. block chord、arpeggio、glissandoを弾き、表示の追従とちらつきを確認する。
4. 演奏中にdeviceを切断・再接続し、古いnoteが残らないことを確認する。
5. mini/normal、maximize/fullscreen、Esc、x終了を実機windowで確認する。
6. Synthesia単独、Loop Vault単独、同時起動の順に入力可否を記録する。
7. 履歴を新規Ideaと既存Ideaへ取り込み、Vault再起動後も保存されていることを確認する。

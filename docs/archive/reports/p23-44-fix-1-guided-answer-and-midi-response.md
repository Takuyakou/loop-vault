# P23-44-fix-1: 誤答表示・ボイシング採取・MIDI入力・確認進捗

- ブランチ: `feat/p23-44-fix-1-guided-answer-and-midi-response`
- 実装 HEAD: **`b31fd30b`**
- 状態: **READY_FOR_HUMAN_PRODUCT_ACCEPTANCE**
- P23-44 の見本・確認・結果の流れを保ち、試用で見つかった前提不具合を修正。
- merge / push / tag / release なし。EXE は試用候補としてローカルビルド。

## 1. 誤答の見本を自動表示

- 誤答・構成音不足・未入力・自己確認「まだ難しい」の確定後、**「見本を見る」を押さずに** 同じ鍵盤へ参照音と音名を表示。
- 表示は「弾き方の例: F3 · A♭3 · C4。転回・省略も合格です。」。カード下段は 結果 → 見本（表示＋「見本を聴く」）→「次へ」。
- 正答は簡潔な結果と「次へ」だけ。invalid は従来の「もう一度」で同一問題へ再 arm。
- 見本の表示・試聴では確定 trial を変更しない。鍵盤の位置は結果表示の前後で変えない。

## 2. 和音採取の途中確定を修正

`CourseCapture` の境界を次のように変更した。

- 必要音の**異なるピッチクラス**がそろうまで 60ms settle を開始しない。
- オクターブを重ねただけでは必要音が完成した扱いにしない。
- 最初の打鍵からは既存の capture window(1500ms) を使う。必要音がそろわない場合は window 末で incomplete。
- 必要音がそろった時点で `completionAt` を記録し、速度は「最初の打鍵 → 必要音がそろった時点」で計算。settle 待ちを演奏時間に足さない。
- Lv1/2 は `waitForInput` を使い、無入力 10 秒の response timeout では確定しない。最初の打鍵後は通常の capture window。
- Lv3 の速度評価・進級条件は不変。

確認(unit):
- F2 を先に弾き、80ms 後に A♭3・C4 を足すと、F2 だけでは確定せず、3 音がそろってから合格。
- F2+F3 のオクターブ重ねだけでは 3 ピッチクラスにならず、C4 を足すまで確定しない。
- Lv1/2 の waitForInput は 60 秒進めても無入力確定しない。

## 3. MIDI 入力音の遅れ

原因: ホームでは `ChordDojoView` の MIDI 入力モニターが鳴っていたが、ガイドを開くと `audible=false` でモニターを破棄し、`GuidedCourseView` が新しいモニターを作り直していた。新しいモニターは `Tone.loaded()` で Salamander ピアノを再ロードするため、ガイド最初の打鍵が準備待ちになる。

修正:
- `ChordDojoView` が MIDI 入力モニターを所有し、ホーム→ガイドで破棄しない。
- `GuidedCourseView` は `useDojoMidi(false)` で接続状態・設定だけを使い、モニターを二重に作らない。
- 入力モニターは従来どおり `Tone.immediate()` で発音する。判定待ちやプレビュー先読みは変更していない。

測定:
- 内部のモニター生成・`Tone.loaded()` 待ちの経路をコードで確認し、修正後はガイド遷移で再生成されないことを確認した。
- 実機 MIDI の「MIDI 受信 → 内部発音 → Windows 出力」の実時間は、この環境に実機・ループバックがないため未測定。初音の遅れが解消したと断定せず、再生成経路の除去として報告する。

## 4. 確認の進捗と案内

- 見本画面に「コード名から弾く20問＋耳で弾く10問。途中で戻っても続きから再開できます」を1行表示。
- 確認中のカウンターを課題別に変更:
  - 名前: 「コード名 8 / 20」
  - 耳: 「耳 1 / 10」
  - 復習: 「復習 3 / 10」
- 分母・位置は実際の bank set から計算。途中で戻っても active attempt の同じ位置を開く。
- Lv1/2 の MIDI 確認では、控えめな「わからない」を表示。明示操作として正答に数えず、wrong として記録し、見本を自動表示して「次へ」。MIDI なしは従来の「まだ難しい」。

## 5. 検証

| 対象 | 結果 |
|---|---|
| guidedCourse unit/domain | **38/38 PASS** |
| コース E2E(P23-40/42/44) | **15/15 PASS** |
| P12-1 通常 Dojo | **40/40 PASS**(混在実行で1件の Space 抑止 flake の後、単独再実行で PASS) |
| visual | **6/6 PASS** |
| App / E2E TypeScript | PASS |
| ESLint / class lint / source contracts | PASS |
| production build | PASS |
| phase docs / AI handoff / diff check | PASS |
| fresh FULL | **未実行**(P23-44-fix-1 は限定修正。P23-45 の統合候補で実行する) |

画像: [fix-1 assets](p23-44-fix-1-assets)（自動見本 1440/768、 give-up、名前/耳の進捗、見本カード）。

## 6. EXE

- 標準の `src-tauri/target/release/loop-vault.exe` は、試用中の既存プロセス(PID 51176、22:01 起動)がファイルをロックしているため上書きできなかった。
- ロックを避けて別 target にビルド:
  - ファイル: `src-tauri/target-p23-44-fix-1/release/loop-vault.exe`
  - SHA-256: `79F7FBD7BBDCE81667564C84E35838965E8FE9F53820987009067A62D9360429`
  - ビルド日時: `2026-11-18 00:06`
- 既存の標準 EXE はそのまま。試用中のアプリを閉じれば、次回同じ標準パスへ更新できる。

## 7. 未確認・制約

- 実機 MIDI の初音・連続打鍵の実時間、Windows 出力遅延は未測定。モニター再生成の除去までを確認。
- 画像の人間目視、実音の聴取は Human Acceptance に残す。
- P23-40 の判定・保存・進級・翌日条件・Vault は不変。

# P17-02 Stage 01: MIDI の取り込みで「小節を消して詰める」(報告)

対象: `feat/p17-bar-cut`(master `ca8ff752` から)。**マージ・push はしていない。**
Stage 00 の監査: `docs/reports/p17-02-00-audit.md`。実装はその §13 までの承認(案A・範囲の一覧・¼拍の吸収・またぐ保存・記録は元の位置)に沿う。

---

## 1. できたこと

- **入口**
  - 小節の行を**右クリック** → 「◯小節を消して詰める」。
  - カードを**右クリック** → メニューの「消す」に「◯〜◯小節を消して詰める」(そのカードがかかる小節。1小節なら「◯小節」)。
  - 最後の1小節は選べない(メニューの項目が「最後の1小節は消せません」で押せない)。
- **消したとき**
  - 小節ごと時間を消し、後ろを前に詰める。カード・小節数・再生・シーク・追従・全体の帯が同じだけ縮む。
  - 消した小節の音はモデルから消える(P17-01 の「使っていない音(破線)」にはしない)。
  - 消す小節をまたぐ1つの元の音は、前後の範囲から切る。同じカードの中で画面の時間がつながる断片は1本にまとめる(カードをまたぐ場合は今までどおり2回鳴る)。
  - ¼拍未満になった切れ端は、隣のカードへ吸収する。
  - カードの名前・連打の数・「このままでよい」は残る。読みが変わる場合は今までどおり「音からの判別」を出すだけ。
  - 区切りは作り直さず、**番号で詰める**。長さが変わった区切りだけ「n回出てくる」(`repeatCount`)を外す。
  - おすすめの範囲は画面の時間へ移し、詰めた所にかかるものは出さない。
  - 保存する範囲・選択・保存済みの印は、同じ内容を指すように動かす。
  - **Ctrl+Z 1回**で詰める前に戻る(やり直すも1回)。元の MIDI(`sourceData`)と解析は変えない。

---

## 2. 時間の対応(案A)

### 2.1 `src/domain/correction/barMap.ts`(新規)

- `removedBars: BeatRange[]` を**元の拍**で持つ(昇順・重ならない)。
- `sourceToScreen(beat)` — 元の拍 → 画面の拍。消した範囲の中は `undefined`。
- `screenToSource(start, end)` — 画面の範囲 → **元の範囲の一覧**。詰めた所の両側にかかるカードは2範囲になる。長さの合計は画面の範囲と一致する。
- `spanCrossesRemoved` / `screenBarsToSourceBars` / `barsOfRange`。
- `shiftSaveRange` / `shiftRangeKey` — 保存する範囲と保存済みの印を、詰めた分だけ動かす(またいだ範囲は縮む。全部消えたら外す)。
- `recommendedOnScreen` — おすすめの範囲を画面へ移し、詰めた所にかかるものは除く。
- `shiftSegments` — 区切りを番号で詰める。長さが変わった区切りだけ `repeatCount` を外す。8小節の代わりの区切りは名前(小節)も直す。

**合成**: 詰めるたびに、その小節の**画面の範囲**を今の写像で元の拍に戻してから `removedBars` に足す。写像は常に「元の拍の集合」1つで表されるので、何回詰めても関数の合成にならず、重ねて正しく変換できる(テストで2回詰めを確認)。

### 2.2 モデル

- `CorrectionContext.removedBars?: readonly BeatRange[]`(既定は空)。
- `cutFragments(card, context)` は `screenToSource` の**各範囲**から元の音を切り、`sourceToScreen` で画面へ戻す。同じ `sourceNoteId`・高さで画面の時間がつながる断片は1本にまとめる。`continuesFromBefore` は「元の音がカードの最初の範囲より前から続く」で決める。
- `cutBars(model, startBar, endBar)`(`cardEdits.ts`):
  - 前のカードはそのまま。後ろのカードは左へ。重なるカードは外側だけ残す(両側に残るカードは1枚のまま縮む)。
  - ¼拍未満は左(無ければ右)の隣へ吸収。
  - 古い断片を新しい画面の時間へ移してから `recut` するので、**使っている/外した・直した高さ**が保たれる。
  - 足した音は残ったカードに付き、消えたカードの分は消える。
  - 1回の履歴(`kind: "bar-cut"`)。

---

## 3. 保存

### 3.1 保存の候補(`saveCandidate.ts`)

- `cardTimelineItem` の `sameSpan` と `userEdited` の判定を、`screenToSource` で**元の時間に戻して**比べる。詰めた後ろの、中身を変えていないカードが「直した」にならない(2音未満の保存失敗も出ない)。
- `buildSaveCandidate` は `removedBars` / `crossesCut` / `sourceBars` を返す。
  - `crossesCut`: 保存する範囲が詰めた所をまたぐ(元の範囲が2つ以上)。
  - `sourceBars`: 1範囲に戻るときの元の小節。

### 3.2 Vault に書くとき(`vaultStore.ts`)

- `sourceStartBeat`/`sourceEndBeat` は、保存するコードの範囲を `screenToSource` で戻して記録する。**またぐ範囲は両方付けない**。
- ボイシング:
  - 1範囲に戻るときは、コードの位置を元の時間に戻して `attachSourceVoicing` に渡す(`SourceVoicingContext.position`)。
  - **またぐ範囲では位置からの抽出をしない**(聞こえていた音をそのまま保存する)。
- ベースライン: `forSave(candidate, sourceBars | null)`。1範囲なら元の小節で assessment を作り、またぐなら付けない。
- 保存の欄に1行: 「詰めた所をまたぐため、元の MIDI の位置は残りません。ボイシングとベースラインは元の音から取りません。」(区切りごとに保存の行にも「元の位置は残りません」)。
- `ProgressionSaveMetadata.removedBars` は保存の間だけ渡し、Vault には書かない。

### 3.3 記録(Correction Log・修正イベント・保存フィードバック)

- `originals` は**画面の位置のまま**(指示どおり。`createCandidateFromTimelineRange` が画面の小節で切るため)。
- `startBeat`/`endBeat` を作る所だけ、`screenToSource` で元の位置に戻す:
  - `buildLabelCorrectionLogs`(`eventFingerprint`/`noteSnapshotHash` も元の位置に戻る)
  - `buildCorrectionEvents`
  - `buildProgressionSaveFeedbackEvent`
- 2範囲以上(その音自体が詰めた所をまたぐ)は、これまでどおり `detected` の位置を使う。
- 詰めていないときは写像が恒等なので、値は1つも変わらない(§5 の master 比較)。

---

## 4. 変えていないもの

`sourceData`・解析(`fullTimeline`)・保存の形式(schema)・進行ページの保存と4モードの削除・P17-01 のメニュー/`Delete`・カードの名前/つなぐ/分ける/境目の規則。

---

## 5. テスト

| 種別 | 結果 |
|---|---|
| 追加した単体(`barMap` / `barCut` / master 比較) | **25/25 PASS** |
| 関係する単体(`correction` / `correction-workspace` / `capture` / `store` / `midi` / `sourceBassline` / `voicing` / `progressionWorkspace`、追加分を含む) | **1156/1156 PASS** |
| 追加した e2e(`e2e/bar-cut.spec.ts`) | **6/6 PASS** |
| 画面写真(`e2e/p17-02-screens.spec.ts`) | PASS(4枚) |
| 型 / E2E 型 / Lint | PASS |
| `npm run test:full` | **PASS** — Vitest **6258/6260**(2 skip は既存)、Playwright **774/776**(2 skip)、他の全ゲート PASS。ログ `.local-evaluation/test-logs/2026-10-25T12-36-58-467Z-full.log` |

### 5.1 追加した単体

- `barMap.test.ts`(9)
  - 詰めていないときは恒等。
  - 元 → 画面の両端(消した範囲の開始・終了)。
  - 画面 → 元の範囲の一覧(前・後・またぐ・長さの合計)。
  - 範囲が詰めた所にかかるかの判定(端だけ触れるのは可)。
  - 画面の小節 → 元の小節(1範囲のときだけ)。
  - **2回詰めても**1つの写像として正しい(合成)。
  - 保存する範囲・保存済みの印の移動。
  - 区切りの番号詰めと `repeatCount`(長さが変わった所だけ外す)。
  - おすすめの範囲の移動と除外。
- `barCut.test.ts`(13)
  - 真ん中の小節: カード・小節数・元の音が不変・写像。
  - 区切りの番号と `repeatCount`。名前つきの区切りは作り直さない。
  - 最後の1小節は消せない。
  - **2回詰め**の合成。
  - 左へ動くだけのカードの音の状態(使う/外す)が残る。
  - ¼拍未満の吸収。
  - 詰めた所をまたぐ1枚のカード: 2範囲から切り、画面で1本に。`sourceNoteId` も保つ。
  - 後ろの範囲の保存: `sourceStartBeat/EndBeat` が元の位置、`userEdited` が false、元の解析のボイシングを再利用。
  - またぐ範囲の保存: 元の位置なし、位置からのボイシングなし。
  - またがない範囲: 元の時間に戻した位置でボイシングを取る。
  - `original` が画面の位置のままであること(前提の確認)と、Log・イベント・フィードバックだけが元の位置になること(指紋も一致)。
  - 音自体が詰めた所をまたぐ場合は `detected` の位置。
- `p17-02-no-cut.test.ts`(3)
  - **master 比較**: `plain-8` / `plain-8`+名前 / `melody-track-8`+分ける+名前 の3通りで、Vault のブロック・Correction Log・修正イベント・保存フィードバックが master と同一。
  - 詰めていないときは `removedBars: []` / `crossesCut: false`。
  - `original` が画面の小節のまま。
- `workspaceBassline.test.tsx`: 元の小節を渡すとその小節のベースを保存し、またぐ(`null`)と付けないことを追加。

**master 比較の作り方**: master `ca8ff752` の worktree で同じ採取テストを実行して golden(`p17-02-no-cut.golden.json`)を作り、実装後の出力と**バイト単位で一致**することを確認した(採取用の一時ファイルと一時 export は master の worktree から削除済み)。golden は比較テストの中で固定値として使う。

### 5.2 追加した e2e

- 小節の行の右クリック → 2小節を消す → 7枚・7小節。`Ctrl+Z` で8枚に戻る。
- 最後の1小節はメニューが押せない。
- 2小節ぶんのカード(stabs-8)のメニュー → 1〜2小節を消して詰める → 3枚・6小節。
- 保存: またぐ範囲(曲全体)では1行が出て、後ろだけの範囲(3〜7小節)では出ない。保存して Vault の進行を開ける。
- おすすめの範囲: 詰めた所にかかるものは消え、残りは「2〜5」「5〜6」に移る。
- 詰めた後も再生でき、位置の表示が7小節になる。

**既存 e2e の調整(期待は変えていない)**: P17-01 の「取り込みのメニューに進行ページの『消して詰める』は無い」は、新しい「◯小節を消して詰める」が部分一致したため、`/^消して詰める/` に変えた(進行ページの4モードはそのまま)。

### 5.3 `npm run test:full`

- **1回目**: Vitest **6258/6260 PASS**(2 skip は既存)、他のゲート PASS。Playwright で2件失敗。
  1. `e2e/card-delete.spec.ts`: 新しい「2小節を消して詰める」が `/消して詰める/` に一致した(テストの探し方だけの問題)。`/^消して詰める/` に修正。
  2. `e2e/correction-workspace.spec.ts`: 小節の行の `title` を変えていたため、既存の期待と不一致。`title` は元の「◯小節の頭のカードを選ぶ」に戻した(右クリックの説明は下のショートカット欄に出す)。
- 修正後、関係する e2e 62/62 PASS。
- **2回目**: **PASS** — Vitest **6258/6260**(2 skip)、Playwright **774/776**(2 skip)、Git diff check を含む他の全ゲート PASS(593.2s)。ログ `.local-evaluation/test-logs/2026-10-25T12-36-58-467Z-full.log`。
  - FULL の中で P17-01 の画面写真も撮り直されたため、下のショートカット欄の1行ぶんを反映して更新した。

---

## 6. 画面写真(`docs/reports/p17-02/`)

- `bar-menu-1440x900.png` — 小節の行の右クリックメニュー
- `after-cut-1440x900.png` — 2小節を消した直後(7枚・保存の1行)
- `card-menu-cut-1440x900.png` — 2小節のカードのメニュー
- `card-menu-cut-1280x720.png` — 同じメニュー(1280×720)

---

## 7. 停止

ここで止まる。実機で、小節の行とカードのメニューから詰める・`Ctrl+Z`・保存(またぐ/またがない)を確かめてください。

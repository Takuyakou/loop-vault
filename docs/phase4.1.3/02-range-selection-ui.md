# Loop Vault P4.1.3-M2 — Full Timeline 範囲選択UI

- 作成日: 2026-07-26
- `defaultAnalyzerMode` は `phase4-v1` のまま
- 自動Catalog / Recommendation / Timeline / 保存schema は無変更

---

## 1. 入口

Full Timeline セクションの末尾に、候補カード編集とは別の入口を置いた。

```text
[範囲から候補を作成]
```

押すとパネルが開く。閉じている間は既存の表示と何も変わらない。

---

## 2. 二つの選択方法

M0 の測定対象は 96〜160小節の曲だった。**ドラッグだけでは足りない。** 14小節目と32小節目が同時に画面へ入らないことがあり、ポインタが無い環境では一切選べない。

| 方法 | 使いどころ |
|---|---|
| 小節ストリップをドラッグ | 対象が画面に見えているとき |
| 数値入力（開始小節・開始拍・終了小節・終了拍） | 遠い2点、長尺MIDI、ポインタなし |

どちらも同じ状態を更新するので、途中で切り替えられる。

---

## 3. ドラッグと入力で正規化を分けた

**これは実装中に見つかった実際の不具合である。**

ドラッグには向きが無いので、2端を並べ替えるのが正しい（右から左へ引いても同じ範囲になる）。ところが入力には向きがある。最初は両方を同じ `clampTimelineRange` に通していたため、

> 空の状態で「開始小節 = 14」と入力する → 開始1・終了14 に並べ替えられる

という挙動になっていた。**ユーザーが最初に入力した数字が終了小節になり、開始が1のまま残る。** テストで露見したので、名前の付いた端への入力は並べ替えを通さない形へ直した。

端が他方を追い越した場合は反転させず、他方が追従する。追従先は「その小節の反対の端」にした:

- 開始を動かして追い越した → 終了はその小節の**最終拍**
- 終了を動かして追い越した → 開始はその小節の**1拍目**

小節単位で入力していったときに、範囲が小節まるごとを覆う。ここで相手の拍をそのままコピーすると「14〜32小節」が「32小節の1拍目まで」になり、ユーザーが指定した小節より1拍短くなる。

---

## 4. 選択中の表示

```text
選択範囲: 14小節1拍目 〜 32小節4拍目
長さ: 19小節
コードイベント: 19件

[この範囲を候補にする] [選択解除]
```

- `aria-live="polite"` で読み上げる
- コードが1つも鳴っていない範囲は警告し、作成ボタンを無効化する
- 最初のコードが範囲より前から鳴っている場合は伝える（間違いではないが、起きたことは言う）

---

## 5. 操作性

| キー | 動作 |
|---|---|
| Esc | 選択解除 |
| Enter | 確定（作成） |
| Shift + ←/→ | 終端を1拍 |
| Alt + ←/→ | 終端を1小節 |

小節ストリップの各小節は `button` なので、**ポインタが無くても Tab で到達できる**。選択状態は `aria-pressed` と**下線**の両方で示す。色だけの選択は、それが見えない読者には存在しない。

---

## 6. Draft

`ManualCandidateDraft` を作って親へ渡すだけで、**自動Catalogには入れない**。

```ts
type ManualCandidateDraft = {
  draftId: string;
  source: "manual-range";
  sourceTimelineFingerprint: string;
  selectedRange: { startBar; startBeat; endBar; endBeat };
  events: CandidateChordEvent[];
  originalEvents: CandidateChordEvent[];   // 編集の出発点。編集で書き換えない
  repairOperations: ManualRepairOperation[];
  createdAt: string;
  isDirty: boolean;
  beatsPerBar: number;
  lengthBars: number;
  warnings: string[];
};
```

`sourceTimelineFingerprint` は、再解析後に古い Draft を編集して2つの曲が混ざるのを防ぐためだけのもの。FNV-1a で十分で、守っている相手は攻撃ではなく取り違えである。

Draft はセッション内のみ。自動保存しない。

---

## 7. テスト（新規55件）

`src/domain/midi/timelineRangeSelection.test.ts`（34件） / `src/components/TimelineRangeSelector.test.tsx`（21件）

| 観点 | 内容 |
|---|---|
| 長さ | 1 / 4 / 8 / 11 / 13 / 16 / 17 / **19** / 21 / **22** / 23 / 27 / 32 / 64小節 |
| ドラッグ | 順方向・逆方向・曲末で停止・ポインタ非押下では伸びない |
| 端の移動 | 1拍・1小節・開始のみ・追い越し時に反転しない・曲末で停止 |
| 入力 | 開始小節→終了小節の順で正しく19小節になる・曲外を丸める |
| キーボード | Esc / Enter / Shift+矢印 / Alt+矢印 / ポインタなしで曲末へ到達 |
| 内容 | 1小節2コード・範囲前から持続するコード・無音範囲の拒否 |
| a11y | `aria-pressed` と下線・`aria-live` の読み上げ |
| 非破壊 | **Draft作成後も Catalog Pattern数・Recommendation が完全一致** |
| 非破壊 | **元 Timeline が1バイトも変わらない** |
| 決定性 | 同じ範囲から3回作って同一 |

**19小節・22小節を特別扱いするコードは無い。** 長さ別の分岐を入れていないことは、上の14種類の長さを同じ経路で通すテストで示している。

---

## 8. M2 受け入れ条件

| 条件 | 結果 |
|---|---|
| H3 の19小節・22小節をUIから1回の範囲選択でDraft化 | **PASS**（`selectedRange` と `lengthBars` を直接検証） |
| 特定長のハードコードなし | **PASS**（14種の長さが同じ経路） |
| 自動Catalog Pattern数不変 | **PASS** |
| Recommendation不変 | **PASS** |
| Timeline不変 | **PASS** |
| 全テストPASS | **PASS**（1358 passed / 172 files） |

---

## 9. 検証

`npm run lint` PASS / `npx tsc --noEmit` PASS / `npm test -- --run` **1358 passed (172 files)** / `npm run build` PASS / `cargo test` PASS

---

## 10. M3 への引き渡し

Draft は作れるようになった。M3 は既存の Quick Chord Editor をこの Draft へつなぎ、範囲の伸縮とコード編集を可能にする。`repairOperations` はすでに `create-from-range` を1件記録している。

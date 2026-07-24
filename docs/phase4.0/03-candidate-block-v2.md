# Loop Vault Phase 4.0 — P4.0-03 Candidate Block v2

- 作成日: 2026-07-25
- Branch: `feature/p40-03-candidate-event-model`（base: `test/p40-02-evaluation-contract-v2`）
- **Analyzerの主コードは変更していない**

## 1. 結論

Candidateの実体を「小節ごとに1コードへ圧縮した文字列」から「Full Timelineと重なるイベント列」へ変えた。

P4.0-00で特定した2つの欠落は、いずれも検出ではなくこの圧縮が原因だった。両方とも解消した。

コーパス100件での実測:

| 現象 | v1 | v2 |
|---|---:|---:|
| 2つ目のコードを失った小節 | **398** | 0 |
| 持続中なのに `N.C.` と表示した小節 | **46** | 0 |
| dedupで構造の違う候補が衝突したブロック | 18 (1.82%) | **0** |
| 影響を受けたケース | 86 / 100 | — |

## 2. 何が壊れていたか

v1の `chordLabelsByBar()` は各小節を代表コード1件へ潰し、その表示文字列を候補のidentityに使っていた。

```ts
const items = timeline.filter((item) => item.bar === bar);
labels.push(items.sort(...)[0]?.chord.label ?? "N.C.");
```

ここから3つの問題が生じていた。

1. **1小節2コードの片方が消える** — 最長durationの1件だけが残る
2. **持続コードの後半が `N.C.` になる** — `item.bar === bar` は**開始小節のみ**を照合するため、bar 7開始で8拍続くコードは bar 8 に一致しない
3. **構造の違う候補が同一視される** — `dedupeKey` が表示文字列だった

## 3. Candidate Block v2

`src/domain/midi/candidateBlock.ts` を追加した。

### 3.1 イベント列

ブロックと**重なる**全イベントを持つ（開始が内側のものだけではない）。

```ts
export interface CandidateChordEvent {
  sourceEventId?: string;
  relativeStartBeat: number;   // ブロック先頭からの拍、窓でクリップ
  durationBeats: number;       // ブロック内で鳴る長さ
  sourceDurationBeats: number; // 元イベントの全長
  carriedIn: boolean;          // 前から持続して入ってきたか
  bar: number;
  beat: number;
  chord: ChordSymbol;
  identityKey: string;
  confidence: number;
  warnings: string[];
  source: ChordTimelineItem;   // 保存時にalternatives/voicingを失わないため
}
```

### 3.2 Stats と density class

```ts
export interface CandidateChordStats {
  eventCount: number;
  harmonicChangeCount: number;
  uniqueChordCount: number;
  chordEventsPerBar: number;
  densityClass: "vamp" | "compact" | "standard" | "dense";
}
```

分類基準（P4.0-00の分布を見て確定）:

| class | 条件 |
|---|---|
| vamp | uniqueChordCount ≤ 1 |
| dense | chordEventsPerBar ≥ 2 |
| compact | harmonicChangeCount ≤ 5 |
| standard | 上記以外 |

コーパスでの分布（raw 991ブロック）:

```text
standard 519 / compact 302 / dense 153 / vamp 17
```

**コード数が少ないことを低品質とみなさない。** vampは独立クラスであり、P4.0-04の選定多様性で使う。

### 3.3 Structured signature

dedupとrepeat判定に表示文字列を使わない。

```text
quantise(relativeStartBeat) : quantise(durationBeats) : chordIdentityKey
```

- 拍は 1/960 単位の整数へ量子化し、浮動小数のずれで signature が割れないようにする
- `chordIdentityKey`（P4.0-01）を使うため、異名同音は同一signature（`Gbadd9` = `F#add9`）
- slash bass差は別signature（`C6` ≠ `C6/E`）

`relativeSignature()` も追加した。最初のコードのルートからの相対音程で表現し、移調された同じ進行を検出できる。P4.0-04のrepeat cycle検出で使う想定。

### 3.4 Summary formatter

構造から表示文字列を作る。**1セル = 1小節**を維持するのでセル数と小節数が常に一致する。

```text
| Dmaj7 | Dm7 | C#m7 | F#m11 · C7 | Bm7 | Em11 | Gmaj9/A | — |
```

- 1小節2コードは ` · ` で並記
- 持続の継続小節は `—`
- **本当にイベントがない小節だけ** `N.C.`

`N.C.` がイベント欠損と混同されなくなった。

## 4. 拍子の扱い

v1は小節番号で直接照合していたため拍子に依存しなかったが、v2は拍へ線形化する。`beatsPerBar` を `extractBlockCandidates()` から各関数へ渡し、4/4固定にしていない。3/4のテストを追加した。

## 5. 保存変換

`toSavedProgressionBlock()` はイベント列がある場合それを使う（`candidateEventsAsTimeline()`）。

- 1小節2コードを維持
- 持続durationを維持
- **前から持続して入ってきたコードを保存ブロックの先頭へ含める**（v1では欠落していた）
- ブロック末尾を越える部分はクリップ
- `source` 経由で alternatives と voicingMemory を保持
- `sourceStartBeat` / `sourceEndBeat` も同じイベント列から計算

これにより「候補に表示された内容」と「保存された内容」が一致する。

## 6. Acceptance（計画書§9.9）

`endless-endless-chord.mid`（8小節）:

```text
bars-1-8  | Dmaj7 | Dm7 | C#m7 | F#m11 · C7 | Bm7 | Em11 | Gmaj9/A | — |
          8bars / 8events / 8chords / changes 8 / 1per bar / standard
bars-5-8  | Bm7 | Em11 | Gmaj9/A | — |
          4bars / 3events / 3chords / changes 3 / 0.75per bar / compact
```

| 条件 | 結果 |
|---|---|
| 8実イベントがCandidateに存在 | OK（`8events`） |
| `C7` が消えない | OK（`F#m11 · C7`） |
| `Gmaj9/A` の持続が維持 | OK（`Gmaj9/A | —`、`N.C.` は消滅） |
| 8小節と8コードを混同しない | OK（`8bars / 8events / 8chords` と分離表示） |
| 構造的に異なる候補がdedupされない | OK（signatures unique 6/6） |
| Analyzer labelはlegacyのまま | OK |
| baseline Root / Quality不変 | OK（下記） |

## 7. 検出精度は変わっていない

| Metric | P4.0-02 | P4.0-03 | 差 |
|---|---:|---:|---:|
| Root | 57.76% | 57.76% | 0.00 |
| Quality | 60.29% | 60.29% | 0.00 |
| Surface Exact | 13.69% | 13.69% | 0.00 |
| Top-3 | 20.10% | 20.10% | 0.00 |
| Corrections | 918 | 918 | 0 |

評価は `fullTimeline` を見るため、候補構造の変更は精度指標に影響しない。

**候補の選出順は変わる。** `dedupeKey` が変わったことでdedup結果が変わり、順位も動く。これは本Stageの目的そのものである。

## 8. UI

候補ヘッダーを `1-4小節 (4)` から `1-4小節・5コード` に変更した。`(4)` は小節範囲と重複しており情報量がなかった。内部statsは診断レポート側に置き、通常UIへ出しすぎない。

## 9. 互換性

- Candidateは非永続のまま
- `fileVersion = 1` 変更なし
- 保存schema変更なし
- `ProgressionBlockCandidate` の新フィールドは optional。既存consumerは `chords` をそのまま使える
- 既存テストは全て変更なしで通過

## 10. テスト

`src/domain/midi/candidateBlock.test.ts`（22件）。

1小節1コード / 1小節2コード / 2小節持続 / 境界をまたぐイベント / `N.C.` / 反復ラベル / slash差 / 異名同音 / 構造dedup / 位置違い / 移調 / 表示summary / 保存変換 / 3拍子。

全体: **152ファイル / 1094テスト中1093 PASS**。失敗1件はP4.0-00で報告済みのmaster由来の既存失敗。

| 検証 | 結果 |
|---|---|
| `npm run lint` | PASS |
| `npx tsc --noEmit` | PASS |
| `npm run build` | PASS |
| `npm run eval:midi:datasets` | baseline完全一致 |

## 11. 成果物

```text
docs/phase4.0/03-candidate-block-v2.md          本書
docs/phase4.0/03-dedup-collision-report.json    コーパス全体の衝突・欠落計測
src/domain/midi/candidateBlock.ts               v2構造
src/domain/midi/candidateBlock.test.ts          22件
scripts/evaluate-dedup-collisions.ts            v1キー vs v2 signature
```

## 12. 次Stageへの申し送り

1. **P4.0-04** — `relativeSignature()` は実装済みで、repeat cycle検出にそのまま使える。density classも確定した。2小節窓の追加と `rankingScore` 飽和の解消が残件。
2. **P4.0-04** — Block Gate（`blockRecallAtIoU50`）のbaselineを本Stageの構造の上で測る必要がある。Gate規則はP4.0-02で固定済み。
3. `chords` と `events` が併存している。将来的に `chords` を廃止できるが、UI・保存・テストの参照が多いため本Stageでは残した。

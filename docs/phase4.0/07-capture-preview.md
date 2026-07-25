# Loop Vault Phase 4.0 — P4.0-07 保存前の元Voicing試聴とWarning UX

- 作成日: 2026-07-25
- Branch: `test/p40-06-block-recall`（P4.0-06のblock recall計測を含む）

## 1. 結論

候補を試聴したときの音と、保存後に聴こえる音が一致するようにした。

原因は単純だった。元MIDIのvoicing抽出が**保存時にしか走っていなかった**ため、Capture画面では常に生成voicingで鳴り、保存後に初めて元の響きへ変わっていた。ユーザーが選んだコードと、ユーザーが聴いたコードが違う状態だった。

## 2. 実装

### 2.1 抽出を共有する

`src/domain/voicing/sourceVoicing.ts` を追加し、**Capture試聴と保存が同じ関数を呼ぶ**ようにした。片方だけ直しても乖離が再発しないよう、経路を1本にすることで一致を保証する。

```text
解析完了
  → 候補イベントへ元MIDI voicingを付与（キャッシュ付き）
  → 既存のresolveVoicingForUseがsource voicingを選ぶ
  → 試聴・保存とも同じ音
```

保存側（`attachExtractedVoicing`）は、すでにvoicingが付いているイベントをそのまま使う。二重抽出をせず、試聴時に確定した音がそのまま保存される。

### 2.2 キャッシュ

計画書§13.3のキーを実装した。

```text
sourceFingerprint | bar | beat | durationBeats | root | quality | bass | extractorVersion
```

- コードを編集すると別キーになるため、差し替え前のコードのvoicingを流用しない
- voicingが取れなかったことも記録し、同じ区間を何度も走査しない
- 解析ごとに作られ、**永続化しない**

### 2.3 fallbackを偽らない

抽出できなかったイベントには `sourceVoicing` を付けない。`resolveVoicingForUse` は `origin: "generated"` を返し、元MIDIがないのに「元MIDI」と表示することはない（§13.4）。

## 3. Warning表示

### 3.1 表示されていなかったwarningがあった

検出器は `sparse-evidence` を出すが、ラベル表のキーは `sparse-notes` だった。一致しないため humanize fallback が働き、**日本語UIに "Sparse Evidence" と英語が出ていた**。

両方のキーを登録して修正した。古い綴りで保存されたmemoも読める。

### 3.2 理由を出す

`要確認` だけでなく、なぜ確認が要るのかを出す（§13.6）。

| warning | 表示 |
|---|---|
| `missing-quality-defining-tone` | 3rdなど和音を決める音が鳴っていない |
| `ambiguous-quality` | メジャーかマイナーか判別しにくい |
| `sparse-evidence` | 音数が少ないため要確認 |
| `melody-heavy` | メロディ混在の可能性 |

### 3.3 誤ったラベルを直した

`ambiguous-bass` の表示は「低音の解釈に注意」だったが、**実際の発火条件はTop1とTop2の総合スコアが僅差であることで、低音とは関係ない**（P4.0-00 §4.4で指摘）。

「候補が僅差」へ変更した。warningキー自体は保存済みmemoとの互換のため変更していない。

Analyzer由来の内部warning（`legacy-primary` / `hybrid-reranked` / `voice-aware-reranked` 等）も日本語ラベルを与え、生の内部文字列がUIへ出ないようにした。

## 4. Block recall（P4.0-06の積み残し）

Gate条件 `no-block-recall-regression` を未計測のまま残していたので実測した。

各コーパスケースは1つの生成進行なので、正解ブロックはクリップ全体（1..totalBars）とした。

| Analyzer | IoU50 | IoU80 | 完全一致 |
|---|---:|---:|---:|
| legacy | 100.0% | 100.0% | 100.0% |
| legacy-boundary-rerank | 100.0% | 100.0% | 100.0% |
| voice-aware-rerank-v1 | 100.0% | 100.0% | 100.0% |
| phase4-v1 | 100.0% | 100.0% | 100.0% |

phase4-v1 の legacy に対する差は **+0.00pp** で **PASS**。これで凍結Gateの全条件が評価済みになった。

## 5. テスト

`src/domain/voicing/sourceVoicing.test.ts`（10件）。

- 元MIDIからvoicingを取ること（fixture `Dm7` → `[38, 53, 57, 60]`）
- **保存前後で `resolveVoicingForUse` の出力が一致すること**
- source dataがない場合・区間に音がない場合に付与しないこと
- fallbackが `generated` を返し元MIDIを偽らないこと
- キャッシュが区間・コード・ファイル・extractorVersionで分かれること
- voicingが無いことも記録して再走査しないこと

`src/views/captureLabels.test.ts` に3件追加（`sparse-evidence` の日本語化、phase4 warningの理由表示、`ambiguous-bass` の実態に合わせた文言）。

全体: **155ファイル / 1143テスト中1142 PASS**。失敗1件はP4.0-00で報告済みのmaster由来の既存失敗。

| 検証 | 結果 |
|---|---|
| `npm run lint` | PASS |
| `npx tsc --noEmit` | PASS |
| `npm run build` | PASS |

## 6. 未実施

- **Voicing source chip（`元MIDI` / `自動` の表示切替）** — 未実装。`resolveVoicingForUse` は `origin` を返すのでUIから判別できるが、表示は追加していない
- `sustained-across-bar` warning — 未実装
- warning calibration（`warningPrecision` / `warningRecall` の実測）— 未実施。現状は発火条件を実データで確認したのみ

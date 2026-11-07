# TXT-JAZZ Stage 00 — 解析・正規化・表示の監査

開始点・実測対象: local master `21d4828d0d62b35da574a2a32e3c2bfa39eea3a9`、専用ブランチ `feat/txt-jazz-stage00`。製品コード・既存テストは変更していない。Stage 01 の実装・alt 表現の選択は行っていない。

## 読み取りと方法

Git → 人間の AGENTS → 追跡版 AGENTS → handoff README/HANDOFF → phase workflow → TXT-JAZZ README/受領 v3 全文 → 関連 Phase 8.8 README/work-instructions/state/最終handoff/PRE handoff・P12.4 調査/実装報告 → 実コード・既存テストの順で照合した。既存文書の過去の状態より、対象 commit の現在コードを優先した。

一時 Vitest probe で実際の `parseTextProgression('| '+token+' |')` / `parseExtendedTextProgression('| '+token+' |')` を呼んだ。§4 全表、§10.1 の25行、人間確認の12トークン、全角・異体字の追加例を合併し103 unique入力。§4 C の説明中の `/` / `alt` も保守的に追加採取した。入力全文、token/range、診断、構造、共有coreの結果、構造からの表示名、normalization、12キー移調を [parser-current-tokens.json](../evidence/parser-current-tokens.json) に記録した。仮テストが通ったのは「現状の採取が完了した」という意味であり、TXT-JAZZ 製品要件が PASS したという意味ではない。

分類は入力全体が変換可能で、期待する意味構造を保持するものを「正しく読める」、全体変換が不可なら「読めない」、変換可で別の意味なら「誤って読める」とする。`Cdim` は品質 `dim` の既存動作を保存する扱い。現在の品質名は `min` / `min7` / `min7b5` / `min6` / `min9`。仕様中の minor/m7/m7b5/m6/m9 は名称差として比較した。`dom9` / `dom13` / `sixNine` は既存の 9 / 13 / 6+9 を表す品質として比較し、生の内部構造を以下に明示する。仕様の `dom7+tensions` / `six+tension9` に書き換えていない。表示の正準形との差は別記する。

## 現状の結果

通常: 正しく読める57、読めない46、意味の誤読0。拡張: 正しく読める58、読めない45、意味の誤読0。これは103追加監査入力の集計であり、全ての既存parser入力の一般的な正しさを主張しない。

- A群で既に通るのは通常 `CmMaj7` / `C-maj7` / `CminMaj7`、拡張 `CmMaj7` / `CminMaj7`。表示は `CmMaj7` で、仕様の `Cm(maj7)` と異なる。主要な `Cm(maj7)` / `CmM7` / 全角括弧版 / alt は現在読めない。
- 明示テンション `G7(b9,#9,b13)` は両方で root7/dom7/[b9,#9,b13]/bassなし、表示も明示テンションを保持する。alt に置き換えられない。ASCII b/# の現在表示規則を仕様も許容している。
- `C6/9` / `C69` / `C6(9)` は両方で root0/sixNine/[]/bassなし。分数ベース9への誤認はない。`C9` / `C7(9)` は dom9、`C13` / `C7(13)` は dom13。既存品質を変える必要があるという意味ではない。
- 通常と拡張の可否差13件: `C-maj7`、`C-7b5`、`C-`、`C-7`、`C-9`、`C-6`、`B♭7`、`G♭7♯9`、`E♭maj7`、`A♭maj7`、`Ｂ♭７`、`C6／9`、`C7（b9，#9）`。標準のダッシュminor aliasは拡張に存在せず、拡張のUnicode/full-width正規化は標準に存在しない。
- 人間確認12個（繰り返し含む）は通常6個、拡張9個が個別に通る。進行全体は両方とも変換不可。`Cm(maj7)` の2箇所と `G7alt` は両方で不可、3つの Unicode flat根音は通常のみ不可。§10.1 既存25行には manual の `Fm7` / `E♭maj7` / `A♭maj7` が無いので監査表には追加した。

列の内部構造は root pitch class / quality / tensions / alt有無 / bass pitch class / label。成功0-basedピッチクラスは C0/D2/E4/F5/G7/A9/B11。`G7 alt` の通常欄に残る G7 は部分解析の結果であり、診断があるため保存可能な成功ではない。

| 入力 | 出典 | 通常分類 | 通常内部構造・表示 | 拡張分類 | 拡張内部構造・表示 |
|---|---|---|---|---|---|
| `Cm(maj7)` | A,table,manual | 読めない | — | 読めない | — |
| `CmMaj7` | A | 正しく読める | 0 / minMaj7 / [] / なし / なし / `CmMaj7` | 正しく読める | 0 / minMaj7 / [] / なし / なし / `CmMaj7` |
| `Cm(Maj7)` | A | 読めない | — | 読めない | — |
| `CmM7` | A,B,table | 読めない | — | 読めない | — |
| `Cm(M7)` | A | 読めない | — | 読めない | — |
| `CmΔ7` | A | 読めない | — | 読めない | — |
| `Cm(Δ7)` | A | 読めない | — | 読めない | — |
| `Cm△7` | A | 読めない | — | 読めない | — |
| `C-maj7` | A | 正しく読める | 0 / minMaj7 / [] / なし / なし / `CmMaj7` | 読めない | — |
| `C-(maj7)` | A | 読めない | — | 読めない | — |
| `C-Δ7` | A,table | 読めない | — | 読めない | — |
| `Cmin(maj7)` | A | 読めない | — | 読めない | — |
| `CminMaj7` | A | 正しく読める | 0 / minMaj7 / [] / なし / なし / `CmMaj7` | 正しく読める | 0 / minMaj7 / [] / なし / なし / `CminMaj7` |
| `Cm(maj9)` | A,table | 読めない | — | 読めない | — |
| `CmM9` | A | 読めない | — | 読めない | — |
| `CmΔ9` | A | 読めない | — | 読めない | — |
| `C-(maj9)` | A | 読めない | — | 読めない | — |
| `G7alt` | A,table,manual | 読めない | — | 読めない | — |
| `G7(alt)` | A,table | 読めない | — | 読めない | — |
| `Galt` | A,table | 読めない | — | 読めない | — |
| `Cm(maj7)/G` | A,table | 読めない | — | 読めない | — |
| `G7alt/B` | A,table | 読めない | — | 読めない | — |
| `C6/9` | B,table | 正しく読める | 0 / sixNine / [] / なし / なし / `C6/9` | 正しく読める | 0 / sixNine / [] / なし / なし / `C6/9` |
| `Cm7b5` | B | 正しく読める | 0 / min7b5 / [] / なし / なし / `Cm7b5` | 正しく読める | 0 / min7b5 / [] / なし / なし / `Cm7b5` |
| `Cm7(b5)` | B | 読めない | — | 読めない | — |
| `Cø` | B | 正しく読める | 0 / min7b5 / [] / なし / なし / `Cm7b5` | 正しく読める | 0 / min7b5 / [] / なし / なし / `Cø` |
| `Cø7` | B,table | 読めない | — | 読めない | — |
| `C-7b5` | B | 正しく読める | 0 / min7b5 / [] / なし / なし / `Cm7b5` | 読めない | — |
| `Cdim7` | B | 正しく読める | 0 / dim7 / [] / なし / なし / `Cdim7` | 正しく読める | 0 / dim7 / [] / なし / なし / `Cdim7` |
| `C°7` | B,table | 読めない | — | 読めない | — |
| `Co7` | B | 正しく読める | 0 / dim7 / [] / なし / なし / `Cdim7` | 正しく読める | 0 / dim7 / [] / なし / なし / `Co7` |
| `C7b9` | B | 正しく読める | 0 / dom7 / [b9] / なし / なし / `C7(b9)` | 正しく読める | 0 / dom7 / [b9] / なし / なし / `C7b9` |
| `C7(b9)` | B | 正しく読める | 0 / dom7 / [b9] / なし / なし / `C7(b9)` | 正しく読める | 0 / dom7 / [b9] / なし / なし / `C7(b9)` |
| `C7#9` | B | 正しく読める | 0 / dom7 / [#9] / なし / なし / `C7(#9)` | 正しく読める | 0 / dom7 / [#9] / なし / なし / `C7#9` |
| `C7(#9)` | B | 正しく読める | 0 / dom7 / [#9] / なし / なし / `C7(#9)` | 正しく読める | 0 / dom7 / [#9] / なし / なし / `C7(#9)` |
| `C7#11` | B | 正しく読める | 0 / dom7 / [#11] / なし / なし / `C7(#11)` | 正しく読める | 0 / dom7 / [#11] / なし / なし / `C7#11` |
| `C7(#11)` | B | 正しく読める | 0 / dom7 / [#11] / なし / なし / `C7(#11)` | 正しく読める | 0 / dom7 / [#11] / なし / なし / `C7(#11)` |
| `C7b13` | B | 正しく読める | 0 / dom7 / [b13] / なし / なし / `C7(b13)` | 正しく読める | 0 / dom7 / [b13] / なし / なし / `C7b13` |
| `C7(b13)` | B | 正しく読める | 0 / dom7 / [b13] / なし / なし / `C7(b13)` | 正しく読める | 0 / dom7 / [b13] / なし / なし / `C7(b13)` |
| `C7(b9,#9)` | B | 正しく読める | 0 / dom7 / [b9,#9] / なし / なし / `C7(b9,#9)` | 正しく読める | 0 / dom7 / [b9,#9] / なし / なし / `C7(b9,#9)` |
| `C7(b9,b13)` | B | 正しく読める | 0 / dom7 / [b9,b13] / なし / なし / `C7(b9,b13)` | 正しく読める | 0 / dom7 / [b9,b13] / なし / なし / `C7(b9,b13)` |
| `C7(#9,b13)` | B | 正しく読める | 0 / dom7 / [#9,b13] / なし / なし / `C7(#9,b13)` | 正しく読める | 0 / dom7 / [#9,b13] / なし / なし / `C7(#9,b13)` |
| `C7(b9,#11)` | B | 正しく読める | 0 / dom7 / [b9,#11] / なし / なし / `C7(b9,#11)` | 正しく読める | 0 / dom7 / [b9,#11] / なし / なし / `C7(b9,#11)` |
| `C9` | B | 正しく読める | 0 / dom9 / [] / なし / なし / `C9` | 正しく読める | 0 / dom9 / [] / なし / なし / `C9` |
| `C13` | B | 正しく読める | 0 / dom13 / [] / なし / なし / `C13` | 正しく読める | 0 / dom13 / [] / なし / なし / `C13` |
| `C7(9)` | B | 正しく読める | 0 / dom9 / [] / なし / なし / `C9` | 正しく読める | 0 / dom9 / [] / なし / なし / `C7(9)` |
| `C7(13)` | B | 正しく読める | 0 / dom13 / [] / なし / なし / `C13` | 正しく読める | 0 / dom13 / [] / なし / なし / `C7(13)` |
| `C7sus4` | B | 正しく読める | 0 / dom7sus4 / [] / なし / なし / `C7sus4` | 正しく読める | 0 / dom7sus4 / [] / なし / なし / `C7sus4` |
| `C7sus` | B | 正しく読める | 0 / dom7sus4 / [] / なし / なし / `C7sus4` | 正しく読める | 0 / dom7sus4 / [] / なし / なし / `C7sus` |
| `C9sus4` | B | 正しく読める | 0 / dom7sus4 / [9] / なし / なし / `C9sus4` | 正しく読める | 0 / dom7sus4 / [9] / なし / なし / `C9sus4` |
| `C9sus` | B | 正しく読める | 0 / dom7sus4 / [9] / なし / なし / `C9sus4` | 正しく読める | 0 / dom7sus4 / [9] / なし / なし / `C9sus` |
| `C69` | B | 正しく読める | 0 / sixNine / [] / なし / なし / `C6/9` | 正しく読める | 0 / sixNine / [] / なし / なし / `C69` |
| `C6(9)` | B,table | 正しく読める | 0 / sixNine / [] / なし / なし / `C6/9` | 正しく読める | 0 / sixNine / [] / なし / なし / `C6(9)` |
| `Cmaj7` | B | 正しく読める | 0 / maj7 / [] / なし / なし / `Cmaj7` | 正しく読める | 0 / maj7 / [] / なし / なし / `Cmaj7` |
| `CΔ7` | B | 正しく読める | 0 / maj7 / [] / なし / なし / `Cmaj7` | 正しく読める | 0 / maj7 / [] / なし / なし / `CΔ7` |
| `C△7` | B | 正しく読める | 0 / maj7 / [] / なし / なし / `Cmaj7` | 正しく読める | 0 / maj7 / [] / なし / なし / `C△7` |
| `CΔ` | B | 読めない | — | 読めない | — |
| `Cmaj7#11` | B | 正しく読める | 0 / maj7 / [#11] / なし / なし / `Cmaj7(#11)` | 正しく読める | 0 / maj7 / [#11] / なし / なし / `Cmaj7#11` |
| `Cmaj7(#11)` | B | 正しく読める | 0 / maj7 / [#11] / なし / なし / `Cmaj7(#11)` | 正しく読める | 0 / maj7 / [#11] / なし / なし / `Cmaj7(#11)` |
| `Cm6` | B,table,manual | 正しく読める | 0 / min6 / [] / なし / なし / `Cm6` | 正しく読める | 0 / min6 / [] / なし / なし / `Cm6` |
| `Cmi6` | B | 読めない | — | 読めない | — |
| `Cmin6` | B | 正しく読める | 0 / min6 / [] / なし / なし / `Cm6` | 正しく読める | 0 / min6 / [] / なし / なし / `Cmin6` |
| `C-` | B | 正しく読める | 0 / min / [] / なし / なし / `Cm` | 読めない | — |
| `C-7` | B | 正しく読める | 0 / min7 / [] / なし / なし / `Cm7` | 読めない | — |
| `C-9` | B | 正しく読める | 0 / min9 / [] / なし / なし / `Cm9` | 読めない | — |
| `C-6` | B | 正しく読める | 0 / min6 / [] / なし / なし / `Cm6` | 読めない | — |
| `Cmi7` | B | 読めない | — | 読めない | — |
| `Cmin7` | B | 正しく読める | 0 / min7 / [] / なし / なし / `Cm7` | 正しく読める | 0 / min7 / [] / なし / なし / `Cmin7` |
| `Cmi` | B | 読めない | — | 読めない | — |
| `Cmin` | B | 正しく読める | 0 / min / [] / なし / なし / `Cm` | 正しく読める | 0 / min / [] / なし / なし / `Cmin` |
| `C+7` | B | 読めない | — | 読めない | — |
| `C7#5` | B | 正しく読める | 0 / dom7 / [#5] / なし / なし / `C7(#5)` | 正しく読める | 0 / dom7 / [#5] / なし / なし / `C7#5` |
| `C7(#5)` | B | 正しく読める | 0 / dom7 / [#5] / なし / なし / `C7(#5)` | 正しく読める | 0 / dom7 / [#5] / なし / なし / `C7(#5)` |
| `Caug7` | B | 読めない | — | 読めない | — |
| `CM7` | B,table | 正しく読める | 0 / maj7 / [] / なし / なし / `Cmaj7` | 正しく読める | 0 / maj7 / [] / なし / なし / `CM7` |
| `Cm7` | B,table,manual | 正しく読める | 0 / min7 / [] / なし / なし / `Cm7` | 正しく読める | 0 / min7 / [] / なし / なし / `Cm7` |
| `Cm/maj7` | C | 読めない | — | 読めない | — |
| `/` | C | 読めない | — | 読めない | — |
| `G7 alt` | C | 読めない | 7 / dom7 / [] / なし / なし / `G7` | 読めない | — |
| `alt` | C | 読めない | — | 読めない | — |
| `Cdim` | C | 正しく読める | 0 / dim / [] / なし / なし / `Cdim` | 正しく読める | 0 / dim / [] / なし / なし / `Cdim` |
| `D/C7` | C | 読めない | — | 読めない | — |
| `Cm（maj7）` | table | 読めない | — | 読めない | — |
| `G7(b9,#9,b13)` | table | 正しく読める | 7 / dom7 / [b9,#9,b13] / なし / なし / `G7(b9,#9,b13)` | 正しく読める | 7 / dom7 / [b9,#9,b13] / なし / なし / `G7(b9,#9,b13)` |
| `G7(#9,b13)` | table | 正しく読める | 7 / dom7 / [#9,b13] / なし / なし / `G7(#9,b13)` | 正しく読める | 7 / dom7 / [#9,b13] / なし / なし / `G7(#9,b13)` |
| `G7(b9,#11)` | table | 正しく読める | 7 / dom7 / [b9,#11] / なし / なし / `G7(b9,#11)` | 正しく読める | 7 / dom7 / [b9,#11] / なし / なし / `G7(b9,#11)` |
| `G7(b9,b13)` | table,manual | 正しく読める | 7 / dom7 / [b9,b13] / なし / なし / `G7(b9,b13)` | 正しく読める | 7 / dom7 / [b9,b13] / なし / なし / `G7(b9,b13)` |
| `Cm` | table,manual | 正しく読める | 0 / min / [] / なし / なし / `Cm` | 正しく読める | 0 / min / [] / なし / なし / `Cm` |
| `Dm7b5` | table,manual | 正しく読める | 2 / min7b5 / [] / なし / なし / `Dm7b5` | 正しく読める | 2 / min7b5 / [] / なし / なし / `Dm7b5` |
| `B♭7` | table,manual | 読めない | — | 正しく読める | 10 / dom7 / [] / なし / なし / `Bb7` |
| `G♭7♯9` | table | 読めない | — | 正しく読める | 6 / dom7 / [#9] / なし / なし / `Gb7#9` |
| `Fm7` | manual | 正しく読める | 5 / min7 / [] / なし / なし / `Fm7` | 正しく読める | 5 / min7 / [] / なし / なし / `Fm7` |
| `E♭maj7` | manual | 読めない | — | 正しく読める | 3 / maj7 / [] / なし / なし / `Ebmaj7` |
| `A♭maj7` | manual | 読めない | — | 正しく読める | 8 / maj7 / [] / なし / なし / `Abmaj7` |
| `Ｃｍ（ｍａｊ７）` | 追加 | 読めない | — | 読めない | — |
| `Ｂ♭７` | 追加 | 読めない | — | 正しく読める | 10 / dom7 / [] / なし / なし / `Bb7` |
| `C−7` | 追加 | 読めない | — | 読めない | — |
| `C–7` | 追加 | 読めない | — | 読めない | — |
| `Cº7` | 追加 | 読めない | — | 読めない | — |
| `CØ7` | 追加 | 読めない | — | 読めない | — |
| `C6／9` | 追加 | 読めない | — | 正しく読める | 0 / sixNine / [] / なし / なし / `C6/9` |
| `C7（b9，#9）` | 追加 | 読めない | — | 正しく読める | 0 / dom7 / [b9,#9] / なし / なし / `C7(b9,#9)` |
| `G7` | 追加 | 正しく読める | 7 / dom7 / [] / なし / なし / `G7` | 正しく読める | 7 / dom7 / [] / なし / なし / `G7` |

## §2.2 のコード根拠（解析担当分）

1. `minMaj7` は存在する（`src/domain/types.ts:31–35`）。alt quality/印は存在しない（同37–45）。
2. Tensionは `9,b9,#9,11,#11,13,b13,#5`（types.ts:35）で全ての対象テンションを表せる。`alt` は無い。`b5` も無いがhalf-dim品質 `min7b5` はある。
3. `label` は ChordSymbol の実フィールド（types.ts:44）。解析coreは構造から生成（`chords.ts:342–344`）、通常adapterのコピーも `explicitSlashLabel` で再生成（`textProgression.ts:842–845`）。拡張直読みは正規化した原綴りを保持（`extendedTextProgression.ts:286–306`）。移調は明示フィールド構築後に独自 `formatChordLabel` で再生成（`practiceTransposition/transposeChordSymbol.ts:95–107,177–186`）。保存・Zod互換は消費側監査を参照。
4. optional field の読込互換や export/importは消費側監査に記録。解析側だけで「フィールドを足すだけで安全」とは言えない。少なくとも既存の移調明示構築は未知の印をコピーしない。
5. 両方とも `parseTextChordLabel` → `parseChordLabelWithPolicy(...,true)`（chords.ts:283–287）。通常adapterは `textProgression.ts:630–648`、拡張adapterは `extendedTextProgression.ts:286–306`。legacy/MIDI `parseChordLabel` は同coreのfalse側（chords.ts:278–280）で語彙が別。
6. shared `segmentScoreBar`（`textScoreTokenizer.ts:12–88`）は空白優先/括弧深さを保つ完全分割。commaは上位token区切りではなく、`extractParenthesizedFactors` が括弧内をcomma/spaceで解釈（`chords.ts:227–244`）。`C7(b9,#9)` は1トークンで成功する。
7. slash bassは末尾 `/[A-G](?:#|b)*` のみ（`chords.ts:295–304`）。`6/9` の slash はquality内に残る。専用品質sixNineとtension foldも存在（chords.ts:70–71,94–95）。
8. 正規化は共有 `normalizeScoreChord` がroot/type空白除去のみ（`textScoreTokenizer.ts:92–94`）、拡張private `normalizeSourceLengthPreserving` はfull-widthASCII/全角space/♭/♯（`extendedTextProgression.ts:316–325`）。Δ/△は品質regexpに両方あるが単独Δは不可、øは認識するがø7は不可、°/º/Ø/Unicode minusは未対応。通常は Unicode ♭♯ も未対応。private normalizerだけ一時in-memory exportして実測した。2か所に新しい正規化を実装していない。
9. 出どころは消費側監査に記録。

## 正規化・表示・エラー位置

§6の全種類19入力を実測し、各現状normalizerは2回適用しても不変（19/19それぞれ冪等）。ただし全角やUnicodeが変換されず残ることも「冪等」なので、対応済の意味ではない。M/mは区別され、6/9は保持される。`Cm（maj7）` は拡張でASCIIにしても `maj7` が親括弧factorとして許可されないので結局不可。`C7（b9，#9）` は拡張だけ成功。

表示coreは `chords.ts:18–44,176–224`。根音綴りはkey/accidental preference、quality label辞書、重複除去したtensionsの固定順9,b9,#9,11,#11,13,b13,#5、残余を括弧comma区切り、rootと同音bassは一般formatterで省略。Textの `explicitSlashLabel`（`explicitSlashLabel.ts:5–9`）は明示/rootを復元する。拡張は元綴りを持つので `C69` の構造をformatterに渡すと `C6/9`、入力labelは `C69` となる。この違いを失敗扱いにして既存表示を無断で統一しない。

実入力 `| Cm/maj7 |`: 通常invalid-chord range[2,9)、拡張INVALID_CHORD span[1,10)、line1/column2/rawToken含む。`| D/C7 |`: 通常[2,6)、拡張[1,7)。`| G7 alt |`: 通常altにlyric-mixed-text range[5,8)、拡張はbar全体[1,9)にUNKNOWN_CHORD。位置診断はあるが、拡張の指摘単位はalt単独ではなく小節全体。全診断とUTF-16範囲はJSONに保持。

## A/B/C候補への解析側の制約（選択していない）

- A: optional印を足す設計は型上候補になり得るが、既存移調は未知の印を落とす。新印のclone/format/transpose/identity/validator/consumer判定を漏れなく変える必要がある。既存データを読めることの検証は別途必要。
- B: **不可**。既存経路がlabelを再生成する反例を実測した。dom7/[]のlabelだけをG7altにした合成symbolにlabelFromSymbolを適用するとG7、全音上への移調ではA7となりaltが消える（JSONのcandidateB）。拡張の原綴り保持だけでは保証できない。
- C: 既存Tension union外。`chordVoicing.ts:36–44,49–52` / `practice/chordRequirements.ts:68–76,97` / `voicingPractice/tonePolicy.ts:20–32,80` 等がtensionから音程を引くので、単にalt文字列を入れるのは安全でない。型・Zod・全音程処理・表示・消費側の対応が必要。Aより良いと決定したわけではない。

## 仕様と現在実装の相違

- 標準上限は **8192 UTF-16 / 32bars / 128tokens**（`textProgression.ts:9–11`）、拡張は **65536 / 256 / 4096**（`extendedTextBudgets.ts:2–6`）。仕様§9の4096/12/48は現状と異なる。上限は変更していない。Phase8.8旧最終handoffの拡張8192/32/128も現在のbudgetより古い。
- 品質名とfold後の内部構造は§10.1の表と字面が異なるが既存の意味等価な表現がある（min系/dom9/dom13/sixNine）。「正しく読めるものを維持」に照らし、これを実装時に表に合わせて変更してよいかは人間の判断事項。
- A群の一部は既に通るが、minMaj7正準表示は現在mMaj7。altは現状不可で、表現を確定していない。
- §10.1の25行にmanual12個の全unique tokenは含まれていない。今回監査では欠けた3種類を追加した。

## 実行履歴と残り

- 初回capture設定: 相対階層誤りによりconfig起動失敗(exit1、製品test未実行)。次回はWindows空白URL未decodeでsetup読込失敗(exit1、507filesのtest未実行)。修正を製品修正と数えない。
- 参照保持版capture: existing unit4285/4285PASS(exit0)、skip0/todo0。ただしreturnを後からcallerが変更するとsnapshotが不正になる設計なのでbaselineとして不採用。
- token probe初回: 解析採取後に監査用手組みKeySignatureがcanonical catalog条件を満たさず失敗(exit1)。既存catalog使用で修正。比較のJSONキー順依存も除去。最終 `npm exec vitest -- run --config p12-generated/txt-jazz-stage00/parser/probe.config.ts`: exit0、1採取testPASS、103tokens、19normalization入力、2symbols×12keys、candidateB情報消失の反例。`probe-final-b-counterexample.log` に実ログ。
- 正式既存入力baselineの完全性・実行結果・snapshot hash・cleanupは [parser-regression-audit.md](parser-regression-audit.md) に分離する。
- 実装/保存/試聴/Dojo統合の合格を主張していない。E2E/tauri build/FULL/EXE/merge/push/fetch/tag/releaseは行っていない。

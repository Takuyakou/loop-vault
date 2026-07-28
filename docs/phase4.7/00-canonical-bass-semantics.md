# Phase 4.7 Canonical Bass Semantics

## 判定

**Contract A**

```text
Dm7   = root bass (D)
Dm7/A = explicit bass A
Dm7/C = explicit bass C
```

`ChordSymbol.bass` が省略されたplain labelは、表示上の省略にすぎず、演奏・因数分解・
canonical identityではroot bassとして扱われる。したがってplainとslashは排他的な
canonical identityであり、Phase 4.7 Part Aを継続する。

## 実装根拠

| 境界 | 実装 | 判定 |
|---|---|---|
| parser | `src/domain/chords.ts` `parseChordLabel()` | plainは`bass`未設定、slashだけ明示値を保持 |
| serializer | `src/domain/chords.ts` `formatChordSymbol()` | bass未設定またはroot一致はslashを表示しない |
| canonicalizer | `src/domain/chordIdentity.ts` `normalizeChordSymbol()` | rootと異なるbassだけ`bassPitchClass`へ残す |
| factorization | `src/domain/chordFactorization.ts` `factorizeChordSymbol()` | `symbol.bass ?? symbol.root`でplainをroot bassへ確定 |
| inverse serializer | `src/domain/chordFactorization.ts` `symbolFromFactorized()` | bass=rootならplainへ戻す |
| identity/equality | `src/domain/chordIdentity.ts` `chordIdentityKey()` | plainとroot-bassは同一、non-root slashは別identity |
| Gold照合 | `src/domain/midi/evaluation/metricsV2.ts` | `bassPitchClass`を含むcanonical keyでexact照合 |
| representability | `src/domain/midi/evaluation/metricsV2.ts` | plainと全slashを別identityとして列挙 |
| UI編集 | `src/components/progression-editing/ChordStructureEditor.tsx` | bass未設定を`root`選択肢として表示 |
| 試聴 | `src/domain/chordVoicing.ts` | `symbol.bass ?? symbol.root`を実際のbass音に使用 |
| 保存schema | `src/domain/types.ts`, `src/domain/schema.ts` | `bass?: number`をそのまま保存。意味の変換なし |
| candidate dedup | `src/domain/chordIdentity.ts`, `src/domain/midi/candidates.ts` | non-root bassをidentity keyへ含める |
| Correction Log | PR #275 `src/domain/midi/labelCorrectionLog.ts` | canonical diffでbass差を独立比較 |
| Chord Drip連携用identity | `src/domain/progressionEditing/voicingIdentity.ts`ほか | `ChordSymbol`とcanonical chord keyを使用 |

## Round-trip

| 入力 | parser | factorized bass | canonical bass | serializer |
|---|---:|---:|---|---|
| `Dm7` | undefined | D | omitted (= root) | `Dm7` |
| `Dm7/D` | D | D | omitted (= root) | `Dm7` |
| `Dm7/A` | A | A | A | `Dm7/A` |
| `Dm7/C` | C | C | C | `Dm7/C` |

`Dm7`と`Dm7/D`は同一identity、`Dm7/A`と`Dm7/C`はそれぞれ別identityとなる。

## 不整合監査

parserの内部表現だけを見るとplainは`bass unspecified`にも見えるが、factorization、
試聴、UI、canonicalizer、Gold exact照合が一貫して「省略 = root bass」と解釈する。
保存schemaもこの既存解釈を壊さない。Contract Bまたは契約不整合には該当しない。

## 分岐

G1 PASS。Part Aへ進む。Part Bのbass evidence scoringと音楽的優先順位変更は行わない。


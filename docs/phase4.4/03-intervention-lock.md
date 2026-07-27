# Phase 4.4 介入方針固定

## 結論

選択: `event-local-note-filtering`

選ばない: `role-evidence`

## 根拠

- devのcontaminationはM1 1件、M2 2件、M3 17件
- validationでもM2 2件、M3 4件
- Gold per-voice roleのAでもdev 19件のcontaminationが残る
- A+はdev Exactを+11.88pt、validation Usableを+14.58pt改善
- A+はvalidation arpeggioのTop / Registerを25pt悪化させるため、一律除外は不可

M3が支配的であり、role classifierだけを直してもGold per-voice roleの理論限界を
越えられない。したがってper-note Goldを製品へ入力せず、イベント内の複数証拠で
melody noteを抑制する。

## Shadow契約

初期状態では製品出力を変更しない。Shadowだけが次の順で処理する。

```text
source notes
→ Product Voice role
→ melody Voice候補
→ monophony
→ 同時発音する非melody和声支持
→ 診断理由付きでnoteを除外
→ 現行extractVoicing
```

単一の特徴では除外しない。最低条件:

- Product roleが`melody`
- Voiceがmonophonic
- 同時発音する非melody pitchが3音以上
- その同時支持が0.1拍以上

devだけで探索する事前Grid:

- role confidence: `0.45 / 0.55 / 0.65`
- concurrent non-melody pitches: `3 / 4`
- support duration: `0.1 / 0.2 beat`

全dev Gateを満たす組だけを候補とし、contamination減少、F1、Exact、より保守的な
閾値の順で決定する。validation後は変更しない。

## 選ばない案

- role evidence: M2が少数で、M3を解消できない
- melody roleの一律除外: arpeggioのTop / Registerを壊す
- chord-tone判定: chord-tone melodyを区別できない
- 高音域判定: low-register melodyを区別できない
- scenario / file固有条件: 汎化せず禁止事項に該当

## 変更範囲

- `src/domain/voicing/melodyContaminationFilter.ts`
- 同unit test
- Shadow評価CLI

`voiceRoles.ts`、Analyzer、boundary、aggregate、fallback、label、Timeline、schema、
`fileVersion`は変更しない。

## 副作用監視

- Note Recall
- Bass / Top / Register
- plain block / rootless / arpeggio / sustain
- 既存60 MIDI F1
- sourceに存在しないnote追加
- label / Timeline完全一致

## Rollback

Shadow段階は製品経路へ未接続なので、P4.4-04をrevertすれば製品挙動は変わらない。
昇格後は昇格接続commitだけをrevertし、filterと診断を残せる構造にする。

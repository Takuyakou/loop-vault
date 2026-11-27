# Phase 3.9.2 Chord Drip Voicing監査

## 監査対象

外部参照元は同一開発環境のChord Dripコード資産。

- `Chord Drip作成/src/domain/voicing/voice.ts`
- `Chord Drip作成/src/domain/voicing/profiles.ts`
- `Chord Drip作成/src/domain/voicing/voice.test.ts`
- `Chord Drip作成/IMPLEMENTATION_NOTES.md`

Loop Vaultからruntime importは行わない。

## Low Interval Limit

`voice.ts`の`isAllowedLowInterval()`は、隣接2音の下音を基準に次の最小間隔を要求する。

| 下音MIDI | 最小間隔 |
|---:|---:|
| 35以下 | 12 semitones |
| 36-47 | 7 semitones |
| 48-52 | 5 semitones |
| 53-57 | 4 semitones |
| 58-59 | 3 semitones |
| 60以上 | 2 semitones |

一部profileは`allowM2Above`で高域の短2度を許可するが、Phase 3.9.2のStyleには
profile別例外を導入しない。上表を固定のhard constraintとして移植する。

Chord Dripは違反を検出後にoctave repairを試し、required guaranteeを満たせなければ
候補を破棄する。Loop VaultでもLIL違反候補を選択対象に残さない。

## Voice-leading cost

Chord Dripの遷移評価は次を含む。

- voice assignment後の総移動量
- top voiceの過大跳躍penalty
- top voiceの2 semitone以内移動bonus
- guide tone resolution bonus
- 3コードwindowのline motion bonus
- 同Pitch Classが別octaveへ移動した場合のpenalty
- duplicate Pitch Class penalty
- preferred top degree
- density target

Phase 3.9.2は計画書どおり、より小さい次のcostへ限定する。

```text
totalVoiceMotion
+ unmatchedVoicePenalty
+ topVoiceLeapPenalty
+ lowestVoiceLeapPenalty
+ handRegisterPenalty
+ noteCountChangePenalty
+ lowIntervalPenalty
- commonToneBonus
```

Chord Dripのprofile固有bonus、line model、guide tone resolution係数は移植しない。

## Common tone

Chord Dripは同じ実MIDI noteの維持を総移動量で自然に優遇し、同Pitch Classを
別octaveへ動かした場合はprofile値でpenaltyを加える。

Loop Vaultでは同じ実MIDI noteを明示的な`commonToneBonus`で優遇する。

## Register

Chord Dripはprofileごとに左右rangeを持つ。例:

- Basic Piano: LH 36-55 / RH 55-79
- Rootless Jazz: LH 48-64 / RH 60-83
- Dark Jazz: LH 33-50 / RH 53-74

Phase 3.9.2は計画書の共通rangeを正とする。

```text
LH 36-64, center 48
RH 52-88, center 67
```

## Rootless

Chord Dripの`rootless`はguide toneとtensionから汎用候補を列挙する。
Phase 3.9.2計画書のA/B固定テンプレートと同一実装ではない。

したがって、A/B interval templateはChord Dripからコピーせず、
`docs/phase3.9.2-style-voicing-practice-plan.md`のMajor、Minor、Dominant、
Half-diminished定義をそのまま実装する。

## Tie-breakと乱数

Chord Dripは最小cost候補が複数ある場合、seed付き`rng.pick()`を使用する。
同じseedでは決定的だが、Phase 3.9.2はseedを持たないため移植しない。

Loop Vaultでは次の固定順で解決する。

1. style variant
2. leftHandNotesの辞書順
3. rightHandNotesの辞書順
4. normalized chord key
5. event ID

## License / provenance

監査時点でChord Drip repository rootに`LICENSE*`ファイルは見つからなかった。
このためソースの直接コピーは避け、LIL tableとvoice-leadingの一般概念だけを
監査根拠としてLoop Vault向けに独立実装する。

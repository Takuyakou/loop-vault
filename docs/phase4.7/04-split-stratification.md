# Phase 4.7-04 Split Stratification

Corpus version: `loop-vault-bass-companion-identity-gold-v1`

Dev / Validation / Holdoutは固定generatorから同時生成した。精度評価前にsplit、family、bass condition、clean/stress、plain/slash、key分布を固定し、split間のfile/scenario/SHA重複を検査した。

## dev

- Files / events / notes: 12 / 96 / 644
- Clean / stress: 6 / 6
- Plain / slash Gold: 48 / 48
- Applicable: 92（minimum 24）
- Families: {"13":14,"7sus4":14,"dom7":13,"m7":14,"m9":14,"maj7":13,"maj9":14}
- Bass conditions: {"fifth":12,"non-chord":12,"passing":12,"pedal":12,"root":12,"seventh":12,"short":12,"third":12}
- Track layouts: {"same-track":48,"separate-track":48}
- Duration classes: {"long":53,"medium":31,"short":12}
- Keys: {"0":1,"1":1,"2":1,"3":1,"4":1,"5":1,"6":1,"7":1,"8":1,"9":1,"10":1,"11":1}

## validation

- Files / events / notes: 12 / 96 / 643
- Clean / stress: 6 / 6
- Plain / slash Gold: 48 / 48
- Applicable: 91（minimum 12）
- Families: {"13":14,"7sus4":14,"dom7":14,"m7":13,"m9":13,"maj7":14,"maj9":14}
- Bass conditions: {"fifth":12,"non-chord":12,"passing":12,"pedal":12,"root":12,"seventh":12,"short":12,"third":12}
- Track layouts: {"same-track":48,"separate-track":48}
- Duration classes: {"long":52,"medium":32,"short":12}
- Keys: {"0":1,"1":1,"2":1,"3":1,"4":1,"5":1,"6":1,"7":1,"8":1,"9":1,"10":1,"11":1}

## holdout

- Files / events / notes: 12 / 96 / 643
- Clean / stress: 6 / 6
- Plain / slash Gold: 48 / 48
- Applicable: 91（minimum 12）
- Families: {"13":14,"7sus4":13,"dom7":14,"m7":14,"m9":14,"maj7":14,"maj9":13}
- Bass conditions: {"fifth":12,"non-chord":12,"passing":12,"pedal":12,"root":12,"seventh":12,"short":12,"third":12}
- Track layouts: {"same-track":48,"separate-track":48}
- Duration classes: {"long":52,"medium":32,"short":12}
- Keys: {"0":1,"1":1,"2":1,"3":1,"4":1,"5":1,"6":1,"7":1,"8":1,"9":1,"10":1,"11":1}

## Gates

- Split overlap zero: PASS
- Families stratified: PASS
- Bass conditions stratified: PASS
- Clean/stress balanced: PASS
- Plain/slash balanced: PASS
- All 12 keys per split: PASS

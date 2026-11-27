# Phase 5.16.1 Generator Report

## 結論

Degree Echo generatorはP5.16.1の固定入力契約を満たした。same seed / same normalized settingsは同一exerciseを返し、全supported key、4/5 string、left/right、fret range、preset、note count、phrase length、Transfer、invalid config、bounded max-attempt failureをtestで固定した。Rhythm Echo、Bassline Echo、Vault sourceは生成しない。

## 実装境界

- pure domain: types、difficulty、vocabulary、seeded PRNG、mapping、generator、hint、review、state machine、singing reference、Transfer
- `mode`は`degree`だけ
- monophonic 1〜6 notes、1 beat〜1 bar
- answer、playback、hint、fretboard、singing referenceは同じ`targetEvents`から導出
- retryは`maxAttempts`で必ず終了し、生成不能はtyped error
- original bass answerはsinging octave変更で変化しない

## Gate evidence

| Gate | Result |
|---|---:|
| generator tests | 26/26 PASS |
| state machine tests | 18/18 PASS |
| review tests | 14/14 PASS |
| Transfer tests | 3/3 PASS |
| hint application tests | 1/1 PASS |
| same-seed deterministic benchmark | PASS |
| invalid generation bounded | PASS |

## Runtime

固定configはC major、88 BPM、4-string、right-handed、fret 0〜12。warm-up 2,000件を分離後、固定seed `p5161-fixed-0000`〜`p5161-fixed-0999`の1,000件を7回測定した。

| Metric | median | p95 | max |
|---|---:|---:|---:|
| 1 exercise（runの償却値） | 0.033849 ms | 0.034961 ms | 0.034961 ms |
| 1,000 exercises / run | 33.8490 ms | 34.9613 ms | 34.9613 ms |

P5.16.1-05のtracked benchmark scriptによるfinal release measurementは、7 runが34.5204、32.9492、34.9613、34.2473、33.5948、33.8490、32.9300 ms。計測中のtimeoutは0。最初のwarm-upと全exercise contentのdeterminism hash比較は測定値へ混ぜていない。Stage-localの一時測定より、このfinal release sessionを正とする。full precision、統計定義、toolchain、target hashは`05-runtime-memory.md`に固定した。

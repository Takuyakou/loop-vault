# Phase 5.1 Runtime And Memory

## Method

- Windows x64、Node/Vitest/vite-node環境
- Dev/Validation/Holdoutは各4 fixture
- 3分相当fixtureは180小節、1,872 notes
- Piano Rollは実際の`drawPianoRoll()`をno-op Canvas contextへ描画
- 100,000 notesはReact + Canvasの回帰テストで1 Canvas、0 note DOMを確認
- RSSはprocess全体の最大値であり、Phase 5.1単独allocationではない

## Synthetic Measurements

| Split | Pre-scan p50 / p95 | First frame p50 / p95 | Add MIDI p50 / p95 | 180-bar analyzer |
|---|---:|---:|---:|---:|
| Dev | 1.62 / 6.88 ms | 0.14 / 0.56 ms | 0.47 / 0.48 ms | 793.38 ms |
| Validation | 1.27 / 6.89 ms | 0.13 / 0.53 ms | 0.44 / 0.44 ms | 794.73 ms |
| Holdout | 1.43 / 10.59 ms | 0.21 / 0.52 ms | 0.46 / 0.46 ms | 869.93 ms |

全180小節解析が10秒Gateを下回った。
Piano Roll描画とpre-scanはAnalyzer本体と分けて測っている。

## Real MIDI

| Alias | Pre-scan | First frame | Direct analyzer | Session analyzer | RSS increase |
|---|---:|---:|---:|---:|---:|
| real-midi-1 (104 bars / 2,736 notes) | 33.34 ms | 1.83 ms | 555.58 ms | 502.23 ms | 100.12 MiB |
| real-midi-2 (9 bars / 176 notes) | 6.48 ms | 0.59 ms | 84.51 ms | 62.51 ms | 85.67 MiB |

RSS increaseにはNode/Vite module初期化、Analyzer、GC待ちを含むため、継続leakの値ではない。
同一process内でsource追加・再描画を繰り返すUnit Testと全test suiteに継続増加や停止はなかった。

## Large Piano Roll

`src/components/pre-analysis/PreAnalysisWorkspace.test.tsx`は100,000 notesのsessionを描画し、
次をGateにしている。

- Canvas: 1
- note DOM: 0
- jsdom上の初回render: 3秒未満
- test実測: 176ms以内に6件のcomponent test全体が完了

実装は大量noteをDOMへ展開しない。現在のCanvas描画は全noteを線形走査するため、
将来さらに大きなMIDIで継続的なpan/zoomが問題になった場合はviewport indexが次の拡張候補になる。
Phase 5.1ではWorker化やAnalyzer threshold変更を行っていない。

## Gate

- UI操作不能: なし
- 継続memory増加: 検出なし
- 一般的な3分MIDIで10秒超: なし
- Phase 5.1をruntimeだけで不採用にする条件: なし


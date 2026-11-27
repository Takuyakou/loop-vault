# Phase 5.12 E2E / Visual Report

実施日: 2026-07-30

## Automated Product Path

`src/views/CaptureView.preAnalysis.test.tsx`は個人MIDIを使わず、テスト内でSMFを生成する。

| Case | 結果 |
|---|---|
| SMF 0 / 1 Track / 11 ChannelをHTML DD | full analysis 0回、同じCapture、expanded、11 Voice、GM名、Canvas、Analyze 1個 |
| 同fixtureをTauri file picker | `multiple: true`で読込、同じ11 Voice surface、full analysis 0回 |
| simple Piano | compact、Analyze 1個、押下後に初めて`phase4-v1` |
| Feature flag OFF | pre-analysisなしで旧Phase 5直接解析 |
| 同一画面でMIDI追加 | DOM remountなし、zoom / manual role / Custom維持、Analyze 1個 |

Analyze押下前の`analyzeMidiBytes`呼出し回数を明示的に0、押下後を1として検証している。
confirm / next相当の追加操作はDOMに存在しない。

## Existing Domain Gates

| Test | 内容 |
|---|---|
| `src/domain/midi/preAnalysis/voiceExtraction.test.ts` | Track × Channel Voice分離、GM metadata |
| `src/domain/midi/preAnalysis/analysisSession.test.ts` | source追加/削除、duplicate、preset、決定性 |
| `src/domain/midi/preAnalysis/analyzerInput.test.ts` | 選択Voice変換、PPQ正規化、duplicate除外、Phase 5 deep equal |
| `src/components/pre-analysis/PreAnalysisWorkspace.test.tsx` | compact/expanded、11色、preset、reset、accessibility、100,000 notes |
| `src/storage/preAnalysisSettings.test.ts` | Stable/Accuracy、complexity、Feature flag OFF |
| `src/views/SettingsDialog.test.tsx` | version / commit / build date / flag状態 |

## Real Browser Visual Run

ローカルproduction相当画面をChrome headlessのDevTools Protocolで操作した。
生成SMFを実際のdrop eventへ渡し、Capture navigation、pre-analysis、Analyze押下、
結果画面まで通した。個人MIDI、絶対MIDI path、`.local-evaluation`は使用していない。

| Artifact | Bytes | SHA-256 |
|---|---:|---|
| `artifacts/phase5.12/simple-midi-pre-analysis.png` | 54,663 | `5a59d585d730bf6183eeb6882a85c3813a4cdf569e1fea7bc2850abe152a7603` |
| `artifacts/phase5.12/all-instruments-pre-analysis.png` | 109,141 | `23b39f24145a136fd57d99d9d6b1025c7067def0515fc6c0ecbe1123793a20d1` |
| `artifacts/phase5.12/multi-midi-pre-analysis.png` | 120,251 | `f984fac09983f4fdc4098d2824a339bb6fbf991de234c46a70d7bd95947bca9d` |
| `artifacts/phase5.12/analysis-result.png` | 91,920 | `008bf7235dd79e59ec14efcf8142b3d4f1e7a15fb834b4561a7096206406d431` |

## Visual Findings

- simple: compact要約と解析ボタンが同一viewportにあり、不要な編集面を出さない。
- all-instruments: 11 Voice表記、GM名、色分けPiano Roll、preset、Voice controlsを確認。
- multi-MIDI: 2 sourceのfile metadataが同じ画面に並び、Voice総数が12へ更新された。
- analysis result: Analyze押下後だけ既存候補画面へ遷移した。
- desktop 1280×900: 文字切れ、主要ボタンの重なりなし。
- mobile 390×844: 横方向overflowなし。縦scrollで操作を継続できる。

## Full Suite

`npm test -- --run`: **234 files / 1,817 tests PASS**。

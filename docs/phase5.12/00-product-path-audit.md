# Phase 5.12 Product Path Audit

監査日: 2026-07-30

## Repository / PR

| 対象 | 実態 |
|---|---|
| `master` | `7f47cd9e070fde7fd7b17dfd110d57a00437acb6`。PR #301〜#307を含む |
| Phase 5.1修正 | PR [#308](https://github.com/Takuyakou/loop-vault/pull/308)、`cb543e5190c783072492077002deef0031f3b9ec`、OPEN / CLEAN |
| Phase 5.12 | `fix/p5-12-inline-preanalysis-product-path`。PR #308のbranch上へstack |

PR #308で、SMF Format 0 / 1 Track / 複数ChannelをChannel単位のVoiceとして
解析前画面へ渡す製品経路は復旧していた。

## 修正前の実経路

1. File pickerは`analyzeMidiPath()`、HTML dropは`analyzeDroppedFile()`、Tauri dropは
   `getCurrentWebview().onDragDropEvent()`から`prepareMidiInputs()`へ入る
   (`src/views/CaptureView.tsx`)。
2. `prepareMidiInputs()`は`createAnalysisSession()`または`addMidiSources()`でpre-scanする
   (`src/domain/midi/preAnalysis/analysisSession.ts`)。
3. `shouldOpenPreAnalysis()`がfalseの場合は、その場で`analyzeMidiBytesWithToast()`を呼び、
   Voice確認UIを飛ばしていた (`src/storage/preAnalysisSettings.ts`,
   `src/views/CaptureView.tsx`)。
4. 修正前の既定条件では、Stable profileの単純MIDIはpre-analysisを飛ばした。
   したがってPhase 5.12が要求する「読み込み後、同じCapture画面で内容を確認してから
   解析ボタンを1回押す」経路になっていなかった。
5. 複雑MIDIでは`PreAnalysisWorkspace`へ到達していたが、簡易/複雑を区別せず大きな
   編集面を表示していたため、通常利用の主操作としては重かった
   (`src/components/pre-analysis/PreAnalysisWorkspace.tsx`)。

## 根本原因

- pre-scanとVoice抽出のdomain実装不足ではなく、`shouldOpenPreAnalysis()`のprofile /
  complexity分岐が製品経路を途中で分けていた。
- Phase 5.1 UIはCapture内に存在したが、simple MIDIをcompactにするpresentation層が
  なかった。
- 実製品相当E2Eが「解析ボタンを押す前にfull analysisが0回」を検証していなかった。
- Captureの結果画面だけで実行される`useEffect`がearly returnより後ろにあり、
  pre-analysisから結果へ遷移するとReact Hooks順序違反になる潜在バグがあった
  (`src/views/CaptureView.tsx`)。製品経路E2E追加時に再現し、Hookを全early returnより
  前へ移動した。

## 修正後の実経路

```text
File picker / HTML DD / Tauri DD
  -> prepareMidiInputs()
  -> createAnalysisSession() / addMidiSources()
  -> 同じCapture画面のPreAnalysisWorkspace
       simple: compact
       complex: expanded
  -> 「この構成で解析」1ボタン
  -> buildSessionAnalysisRequest()
  -> analyzeMidiBytesWithToast()
  -> 既存の解析結果画面
```

- Feature flag ONではStable / Accuracy Firstともpre-analysisへ入る。
- Feature flag OFFだけが従来のPhase 5直接解析へ戻る。
- compact / expandedは`needsPreAnalysisReview()`だけが決め、解析入力は変えない。
- modal、確認、確定、次へボタンは追加していない。
- Analyzer、候補順位、threshold、schema、`fileVersion`は変更していない。

## 実装境界

| 層 | 実装 |
|---|---|
| 取込routing | `src/views/CaptureView.tsx` |
| compact / expanded判定 | `src/storage/preAnalysisSettings.ts` |
| inline UI | `src/components/pre-analysis/PreAnalysisWorkspace.tsx` |
| Canvas | `src/components/pre-analysis/PreAnalysisPianoRoll.tsx` |
| session構築 | `src/domain/midi/preAnalysis/analysisSession.ts` |
| Analyzer入力変換 | `src/domain/midi/preAnalysis/analyzerInput.ts` |
| build識別 | `vite.config.ts`, `src/buildInfo.ts`, `src/views/SettingsDialog.tsx` |

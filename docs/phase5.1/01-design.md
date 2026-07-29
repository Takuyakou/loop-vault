# Phase 5.1 Design

## Scope

Phase 5.1はコード判定器を変更せず、`phase4-v1`へ渡すVoiceを解析前に確認・選択する入力基盤である。
実装は次の経路に分かれる。

```text
MIDI bytes
  -> preScanMidiSource()
  -> AnalysisSession (runtime only)
  -> PreAnalysisWorkspace / Canvas piano roll
  -> buildSessionAnalysisRequest()
  -> existing analyzeMidi()
  -> existing Capture draft / save flow
```

## Layering

| Layer | Responsibility | Evidence |
|---|---|---|
| Domain | Voice抽出、session、preset、重複判定、prepared input、試聴note選択、訂正ログevent生成 | `src/domain/midi/preAnalysis/*` |
| UI | 複数MIDI追加、Piano Roll、Voice/source操作、warning、解析開始 | `src/components/pre-analysis/*` |
| View orchestration | file/drop intake、設定による表示分岐、既存解析と保存経路への接続 | `src/views/CaptureView.tsx` |
| Runtime settings | Stable/Accuracy Firstでの表示、明示OFF、always show | `src/storage/preAnalysisSettings.ts` |
| Local feedback | opt-out可能なprivacy-safe JSONL | `src/storage/roleCorrectionLogStorage.ts` |

`src/domain/midi/preAnalysis/*`はReact、Zustand、Tauri API、現在時刻をimportしない。
時刻は解析成功後にViewからISO文字列として渡す。

## Runtime Model

- Voice identity: `sourceId x trackIndex x channel`
- Source bytes and display name: `AnalysisSession`だけに保持し、Vaultへ保存しない
- Roles: `harmony | bass | melody-weak | exclude`
- Presets: `auto | harmony-bass | accompaniment-only | all-pitched | custom`
- UI state: `visible`、`muted`、`solo`、`assignedRole`、`included`を分離
- Timeline: 最初のsourceをmasterとし、追加sourceのtickは各PPQからbeatへ正規化後にmaster PPQへ投影
- Exact duplicate: pitch/onset/durationが完全一致するVoiceだけを解析入力から除外
- Near duplicate: warningのみで自動除外しない

## Backward-Compatible Analyzer Boundary

単一source、Auto、手動変更なし、exact duplicateなしの場合、
`buildSessionAnalysisRequest()`は`options: {}`を返す。これにより既存Phase 5と同じbytes、file name、
設定だけが`analyzeMidi()`へ渡り、解析結果をdeep equalで維持する。

編集または複数sourceがある場合だけ、次のruntime-only入力を作る。

- `preparedData`: 選択Voiceのnote/control changeとmaster tempo/meter
- `analysisInput`: enabled Voiceと明示role override
- `analysisFingerprint`: MIDI bytesやfile nameを含まない決定論的fingerprint

これらは`AnalyzeMidiOptions`だけに存在し、`MidiProgressionAnalysis`、Vault schema、exportへ保存されない。

## UI

- 一括選択とドラッグ&ドロップで1件または複数MIDIを追加
- source単位の削除、表示、Mute
- Voice単位の表示、Mute、Solo、role、解析対象
- master timeline上に全Voiceを色分けしたCanvas Piano Roll
- zoom、横移動、playhead、再生/停止
- tempo/meter/duration/start位置不一致、exact/near duplicate warning
- Stableでは従来経路を直接使用し、Accuracy Firstまたはalways-show設定時に画面を開く
- 設定からPhase 5.1全体を明示OFFにできる

大量noteは1 note = 1 DOM要素にせず、Canvas 1枚で描画する。

## Audio And Feedback

試聴は既存Tone instrumentを再利用し、1.5秒先までのrolling scheduleを構築する。
Mute/Solo/source visibilityとviewportを反映し、停止時はtimer破棄と`releaseAll()`を行う。

Role訂正ログは解析成功時だけAppDataの`loopvault/role-corrections.jsonl`へ追記する。
既存の解析フィードバック設定でopt-outでき、設定画面からexport/deleteできる。

## Rollback

- `enablePreAnalysisSourceSelection = false`: Phase 5.1画面を使わない
- Stable profile: `alwaysShowPreAnalysis`がfalseなら既存Phase 5経路
- Analyzer mode: `phase4-v1`のまま
- `fileVersion = 1`のまま

# Phase 5.1 Repository Audit

監査日: 2026-07-29

## Baseline

- base branch: `master`
- commit: `15ca98c5dee49674fc321bbe18a98c8f39695224`
- Primary Analyzer: `phase4-v1`
- Phase 5 Accuracy First: R1 / E1 / Candidate Unionを設定経由で追加
- Vault `fileVersion`: `1`
- test: 226 files / 1762 tests PASS
- tracked MIDI: 0
- tracked `.local-evaluation`: 0

固定値の機械可読版は `docs/phase5.1/00-baseline-lock.json` を参照する。

## MIDI parse経路

1. `src/views/CaptureView.tsx`
   - Tauri path dropは`@tauri-apps/plugin-fs`の`readFile()`でbytesを読む。
   - browser dropは`File.arrayBuffer()`でbytesを得る。
   - 現状はbytes取得直後に`analyzeMidiBytes()`を呼び、解析準備画面は存在しない。
2. `src/store/vaultStore.ts`
   - `analyzeMidiBytes()`は同期的に`analyzeMidi()`を呼ぶ。
   - 同じbytesを`parseMidi()`、`normalizeNotes()`、`buildVoices()`、
     `annotateVoiceRoles()`へ渡し、試聴用source voicingを解析結果へ付加する。
   - `analysis`は一時store stateでありVaultへ永続化されない。
3. `src/domain/midi/rawSmf.ts`
   - `midi-file`でSMFをparseする。
   - format 2とSMPTE time divisionは明示エラー。
   - track/channel/program change/control change/noteを保持する。
   - program状態はchannel単位で追跡される。
4. `src/domain/midi/parser.ts`
   - raw SMFを`MidiSongData`へ変換し、total barsとtrack metadataを生成する。

## Voiceとrole

- `src/domain/midi/voices.ts`
  - 現在のVoice単位は`trackIndex × channel`。
  - `buildVoices()`はnote count、pitch range、median pitch、平均duration、
    note density、polyphony、同時発音率、最低/最高声部shareを算出する。
  - channel 9はpercussion evidenceとしてコード解析から除外する。
- `src/domain/midi/voiceRoles.ts`
  - `inferVoiceRole()`はchannel、GM program、track name、測定特徴を使う。
  - `resolveVoiceRole()`と`annotateVoiceRoles()`はoverrideを受け取れる。
- `src/domain/midi/types.ts`
  - 既存`AnalysisInput`は`enabledVoiceIds`と`roleOverrides`を持つ。
  - 既存roleは`bass / harmony / pad / melody / percussion / mixed`であり、
    Phase 5.1 UIの4択とは直接一致しない。
- `src/domain/midi/voiceAwareReranker.ts`
  - role overrideとenabled voice filterを実際の解析入力へ接続済み。

Phase 5.1では既存role推定アルゴリズムを変更せず、UI用4択から既存roleへ
明示変換する。単一MIDIの既定auto経路では既存IDと入力を維持する。

## Playback

- `src/audio/playbackController.ts`
  - 共通`PlaybackController`がplay/stop/state購読を提供する。
  - 新規大規模音源依存は不要。
- `src/views/CaptureView.tsx`
  - 現在は解析結果・candidate・draftの試聴に共通controllerを利用する。
  - raw Voice単位のSolo再生は未実装。
- `src/components/music-keyboard/PianoKeyboardVisualizer.tsx`
  - 鍵盤可視化はあるが、時間軸付きピアノロールではない。
- Canvasベースの既存ピアノロール部品は存在しない。

## Capture import

- `src/App.tsx`と`src/views/CaptureView.tsx`にファイル選択、Tauri path drop、
  browser File dropの経路がある。
- 現状は1ファイルを即解析し、追加MIDI、source削除、master timeline、
  pre-scan sessionを持たない。
- `.mid` / `.midi`以外はUI境界で拒否する。

## Correction Log

- `src/domain/midi/labelCorrectionLog.ts`
  - 保存時のコードlabel correctionを純関数で生成する。
- `src/storage/labelCorrectionLogStorage.ts`
  - AppDataの`loopvault/label-corrections.jsonl`へappendする。
  - feedback opt-out、export、delete、deduplicateがある。
  - Tauri外またはopt-out時はno-op。
- role correction専用schemaとstorageは未実装。

## Feature flag / local settings

- `src/storage/accuracyFirstSettings.ts`などにlocalStorage設定の既存パターンがある。
- Vault schema外でfeature flagを保存できる。
- `enablePreAnalysisSourceSelection`は未実装。

## Phase 5 baseline

根拠: `docs/phase5/00-accuracy-first-evaluation.json`

製品構成`phase4-v1+R1+E1+Union`の代表値:

| corpus | exact | Top-3 canonical | candidate recall | union recall | manual input |
|---|---:|---:|---:|---:|---:|
| chord-drip-100 | 0.278828 | 0.402646 | 0.448015 | 0.513233 | 0.328922 |
| chapter3-seed-100 | 0.977444 | 0.987469 | 0.989975 | 0.992481 | 0.007519 |
| phase4.5-label-dev | 0.609375 | 0.706250 | 0.900000 | 0.953125 | 0.018750 |
| phase4.7-gold | 0.038194 | 0.045139 | 0.086806 | 0.131944 | 0 |

実MIDI評価メタデータ上の`phase4-v1+R1+E1+Union` runtime:

| alias | bars | runtime ms |
|---|---:|---:|
| all-instruments | 104 | 665.453 |
| captured-chorus | 9 | 42.350 |
| suran-remix | 100 | 609.435 |
| endless | 154 | 880.064 |

## Architectural decision

Phase 5.1はVault型へ追加せず、`src/domain/midi/preAnalysis/`の純粋な一時sessionと
Capture UIのruntime stateとして実装する。確定時だけ既存`AnalyzeMidiOptions.analysisInput`
へ変換し、既存`analyzeMidi()`を一度呼ぶ。

禁止範囲であるAnalyzerのscore、threshold、candidate generation、schema、
Live MIDI、Chord Dojoは変更しない。

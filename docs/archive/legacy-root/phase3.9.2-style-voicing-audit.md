# Phase 3.9.2 Style Voicing Practice 監査

## 監査対象

- `src/domain/voicing/resolveVoicing.ts`
- `src/domain/voicing/types.ts`
- `src/domain/chordVoicing.ts`
- `src/domain/practice/*`
- `src/views/PracticeView.tsx`
- `src/components/practice/PracticeKeyboard.tsx`
- `src/components/music-keyboard/*`
- `src/audio/playbackController.ts`
- `src/domain/types.ts`

## Phase 3.8.5 Resolver

実装済みAPIは次のとおり。

```ts
export function resolveVoicingForUse(
  chord: ChordSymbol,
  memory: ChordVoicingMemory | undefined,
  generatedFallback: number[],
  options: VoicingResolveOptions = {},
): ResolvedVoicing
```

優先順位は `practiceVoicingOverride`、検証済み`sourceVoicing`、高信頼度の
`simultaneous-voicing`、既存自動生成fallback。返却originは
`practice-override | source-verified | source-auto | generated`。

Phase 3.9.2の`resolved-voicing`はこの関数をそのまま使用する。
Resolverの優先順位、閾値、`sourceVoicing`の内容は変更しない。

## 既存自動Voicing

`src/domain/chordVoicing.ts`の`voiceChordForPreview()`がChordSymbolから
低音と上声を決定的に生成する。Phase 3.9.2の`generated-close`はこの出力を
adapterで包み、MIDI note配列を変更しない。

## 現行Chord Dojo

- `PracticeView`が進行選択、L1-L3、Step/Flow、MIDI接続、時計、保存を所有する。
- 判定対象は`buildPracticeChordRequirements()`が作るピッチクラス要件。
- `reducePracticeSession()`が100ms安定判定、再アタック要求、Step/Flow遷移を所有する。
- Phase 3.8.5 Resolverの結果はL1ガイドと鍵盤rangeへ使うが、判定自体は
  Resolverの絶対MIDI noteを使っていない。
- セッション終了、画面離脱、アプリ終了準備、Flow clean roundで
  `recordPracticeRound()`を通してpractice progressを更新する。
- Dojo内に進行の事前試聴操作は未実装。

Phase 3.9.2ではsession machineの時計・遷移・attack revisionを再利用し、
Style選択時だけmatch evaluatorを差し替える。Style modeでは全保存入口を遮断する。

## Piano Keyboard Visualizer

現状はGuideを1種類だけ持つ。`held`、`foreign`、`sustained`、Guideとの複合状態を
描画できる。Phase 3.9.2では既存色数を大きく増やさず、Guideだけを
左手目安と右手目安に分ける。L2/L3のGuide非表示は維持する。

## PlaybackController

`timeline` requestは`explicitMidiNotesByEventId`を受け取れる。Style事前試聴は
この既存経路を使用でき、新しいaudio driverは不要。他画面のrequest生成は変更しない。

## 永続化境界

`VaultFile.settings`は月間目標、言語、ローマ数字表示だけを持つ。
`fileVersion`は1。Style選択、生成plan、match mode、fallback、clean dotsを
Vault schemaへ追加してはならない。

左右手spanと全体octave shift許可は端末app preferenceとして、Vaultとは別の
version付きlocalStorage recordに保存する。localStorage accessはdomain外へ置く。

## 変更予定

- 新規: `src/domain/voicingPractice/*`
- 新規: `src/voicingPractice/preferences.ts`
- 変更: `src/domain/practice/types.ts`
- 変更: `src/domain/practice/sessionMachine.ts`
- 変更: `src/views/PracticeView.tsx`
- 変更: `src/components/practice/PracticeKeyboard.tsx`
- 変更: `src/components/music-keyboard/*`
- テストとPhase 3.9.2文書

## リスクと対策

| リスク | 対策 |
|---|---|
| Style練習が段位へ混入 | Style modeでは`recordPracticeRound()`を呼ばない回帰テスト |
| L2/L3で答えが見える | Guide note、左右note名をL1に限定するUIテスト |
| 同じコード反復を押しっぱなしで通過 | 既存`requiredAttackRevision`を再利用 |
| unsupportedをStyleとして偽表示 | strict開始不可、明示fallback時だけevent単位で`generated-close` |
| 既存試聴が変化 | Dojo専用source IDとexplicit note mapだけを追加 |
| 生成が非決定的 | 乱数、時刻、Map挿入順tie-breakを使わず固定比較 |
| impossible voicing | required tone、span、crossing、LILをhard constraint化 |

## Rollback

UIのTarget Sourceを`resolved-voicing`固定へ戻せば、生成結果は非永続のため
migrationなしで既存Dojoへ戻せる。Resolver、Vault schema、practice schemaは変更しない。

## Baseline

2026-07-23の`master` (`8137b0a`) を基準に`npm test -- --run`を実行。
134 test files、733 testsがすべて通過した。

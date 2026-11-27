# Phase 5.14 MIDI Export Contract

## 責務

```text
SavedProgressionBlock
  -> progressionToMidiModel()
  -> serializeProgressionMidi()
  -> buildProgressionMidi()
     |- saveProgressionMidi()
     `- prepareProgressionDragFile()
```

- DomainはReact、Tauri、filesystem、Vault storeへ依存しない
- UIはMIDI eventを生成しない
- saveとdragは`buildProgressionMidi()`の同じbytesを使う
- native bridgeは`ChordSymbol`を知らない

## Format

- SMF Type 1
- PPQ 480
- Track 0: tempo、time signature、canonical chord marker、End of Track
- Track 1: chord note-on / note-off、End of Track
- clip先頭: 最初の保存eventをtick 0へ正規化
- clip末尾: 最終eventの終了tick
- 同tickの順序: note-off、marker、note-on

PPQ 480はChord DripのFL Studio実績とLoop Vaultの既存MIDI libraryの双方で扱える固定値である。

## Timing

- `startTick = round((absoluteStartBeat - firstStartBeat) * 480)`
- `durationTicks = round(durationBeats * 480)`
- 各eventを絶対beatから個別変換し、前eventからの差分加算で浮動小数誤差を累積させない
- `durationBeats <= 0`はerror
- gapは無音として維持
- N.C.を将来表現できるmodelではnoteを出さずdurationだけを維持する

現行`SavedProgressionBlock`の`ChordTimelineItem.chord`は必須なので、現行保存データにN.C.は存在しない。export model自体は`chord: null`を受け付ける。

## Tempo / Meter

- BPM: block、Ideaの順で使用
- 未設定fallback: 既存preview契約に合わせて96 BPM
- meter: blockの`timeSignature`
- 未設定または不正値fallback: 4/4
- fallback使用時はwarningを返す

## Voicing

イベント単位の優先順位:

1. `practiceVoicingOverride`が現在chordと互換: `edited`
2. `sourceVoicing`が互換かつ既存`resolveVoicingForUse()`の採用条件を満たす: `saved`
3. `voiceChordForPreview()`の決定論的voicing: `generated`
4. 生成不能: export error

`VoicingSnapshot.midiNotes`を保持し、slash bassが指定される場合は最低音のpitch classがbassと一致することを検証する。unsupported qualityを別qualityへ近似しない。

Summaryは全eventが同一sourceなら`edited` / `saved` / `generated`、混在時は`mixed`。

Velocityの現行保存schemaにはvelocityがないため、既存preview相当の固定値96を使用する。同一入力では常に同一値となる。

## Marker / Privacy

各発音eventの開始tickへ`ChordSymbol.label`をmarkerとして書く。

書かないもの:

- source file name / path
- Idea title
- memo
- asset id
- user save path
- personal identifier

## Failure

- 空進行
- 0以下duration
- MIDI pitchが0〜127外
- voicing生成不能
- slash bass契約違反
- serializerがevent balanceを保てない状態

一部eventを無断で省略しない。


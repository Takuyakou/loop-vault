# P4.3-02 Voicing Pipeline Audit

## 実装フロー

```text
SMF bytes
  │ parseRawSmf: note/program/channel/CC/track
  ▼
MidiSongData
  │ parseMidi: track metadata + duration
  ├─ buildVoices → buildVoiceFeatureInputs → annotateVoiceRoles
  │
  │ ChordTimelineItemのbar/beat/durationをbeat rangeへ変換
  ▼
VoicingExtractionInput
  │ channel 9/percussion除外、role weight適用、event spanへclip
  ├─ simultaneous frame候補（優先）
  └─ aggregate note set（frameが無い場合のみ）
  ▼
candidate scoring / deterministic tie-break
  │ normalize + 最大note数制限 + confidence
  ▼
VoicingSnapshot
  │ simultaneousかつcoverage/confidence gate通過 → usable
  └─ aggregate/低coverage/低confidence → review
  ▼
voicingMemory.sourceVoicing
  │ chord compatibility確認
  ├─ verified source
  ├─ auto source
  └─ generated fallback
  ▼
Capture A/B Preview / Vault Save / Chord Dojo
```

## Stage別の実態

| Stage | 入力 | 出力 | 除外・変換 |
|---|---|---|---|
| SMF parse | bytes | `ParsedTimedNote[]`, CC, track metadata | note-on/offをdurationへ組み立てる |
| MIDI parse | raw SMF | `MidiSongData` | track名からroleHint、曲長を算出 |
| sustain | note + CC64 | normalized sounding end | pedal区間へ終端を延長 |
| Voice | track/channel別notes | `Voice[]` | channel 9をpercussion evidenceとする |
| Role | Voice features | inferred role/confidence/evidence | name/program/measured特徴を統合 |
| Event span | timeline item | startBeat/endBeat | bar/beat/time signatureから変換 |
| Simultaneous | span notes | frame candidates | percussion除外、spanへclip、role重み |
| Aggregate | span notes | note-set candidate | simultaneousが0件の時だけ使用 |
| Selection | candidates + chord | winner + coverage | score、duration、onset、note列で決定的sort |
| Snapshot | winner | source voicing | note normalize、最大数制限、confidence clamp |
| Compatibility | snapshot + current chord | compatible/stale/invalid | canonical chord key不一致をstale |
| Resolve | memory + fallback | playback notes | override→source verified→source auto→generated |

## 重要な観察

1. `extractVoicing` はGold roleを知らない。任意の`Voice[]`は評価ハーネスが
   A/B条件を構成するためにも使えるが、製品は推定Voiceを渡す。
2. 同時発音候補が1件でもあればaggregate候補は競争に参加しない。
   したがって「弱い同時frameが存在してaggregateの方が適切」という失敗は起こり得る。
3. roleはnote自体を完全除去するだけでなく候補scoreへ影響する。
   melodyのroleScoreは低いが0ではないため、same-track contaminationは残り得る。
4. snapshotは抽出statusが`review`でも保存可能。利用時にはaggregateを自動採用せず
   generated fallbackへ落とす。
5. Source Voicing cache keyは範囲・chord・extractorVersionを含むので、
   chord編集後に旧cacheをそのまま使わない。

## 根拠

- Parse: `src/domain/midi/rawSmf.ts`, `src/domain/midi/parser.ts`
- Sustain: `src/domain/midi/normalize.ts`
- Voice / Role: `src/domain/midi/voices.ts`, `src/domain/midi/voiceRoles.ts`
- Extract: `src/domain/voicing/extractSimultaneousVoicing.ts`,
  `src/domain/voicing/extractAggregatedNoteSet.ts`,
  `src/domain/voicing/extractVoicing.ts`
- Snapshot attach/cache: `src/domain/voicing/sourceVoicing.ts`
- Compatibility/fallback: `src/domain/voicing/compatibility.ts`,
  `src/domain/voicing/resolveVoicing.ts`
- Preview/save: `src/domain/midi/manualDraftPlayback.ts`,
  `src/domain/midi/manualDraftSave.ts`, `src/store/vaultStore.ts`

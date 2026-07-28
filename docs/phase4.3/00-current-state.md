# Phase 4.3 開始時点の実装監査

監査基準コミット: `33e28a24ae97d0850f30993d641c8a88cc4af85e`

この文書は設計上の理想ではなく、Phase 4.3開始時点の実コードを記録する。

## Analyzer と保存契約

- 正式Analyzerは `phase4-v1`。`src/domain/midi/analysis.ts` の
  `defaultAnalyzerMode` が `phase40DefaultAnalyzerMode` を参照し、
  `src/domain/midi/phase4Analyzer.ts` が `"phase4-v1"` を公開する。
- Vaultの `fileVersion` は `1` 固定。型、Zod schema、空Vault生成の根拠は
  `src/domain/types.ts`、`src/domain/schema.ts`、`src/domain/repository.ts`。
- Stage Fのfactorized root / quality / tension診断は製品Primaryへ接続されていない。
  Phase 4.3でも接続しない。

## ラベルとalternatives

- Primaryとalternativesは `ChordTimelineItem` に格納される
  (`src/domain/types.ts`)。
- Phase 4 Analyzerはlegacy解析経路へ固定設定を渡す薄い入口である
  (`src/domain/midi/phase4Analyzer.ts`)。
- windowの候補採点後、`selectQuickChordAlternatives` がPrimary以外の候補を選ぶ
  (`src/domain/midi/legacy.ts`)。merged timelineでは
  `selectDiverseAlternatives` が候補を絞る (`src/domain/midi/merge.ts`)。
- alternativesは最大表示数を持つ候補列であり、正解保証ではない。同じrootの
  quality違いが残る可能性もある。
- parser / formatter / canonical identityは
  `src/domain/chords.ts` と `src/domain/chordIdentity.ts` に分かれている。

## Source Voicing

- 解析終了後、storeがMIDI bytes、解析結果、Voice情報を用いて
  `attachSourceVoicing(s)` を呼ぶ (`src/store/vaultStore.ts`,
  `src/domain/voicing/sourceVoicing.ts`)。
- 抽出入力は chord、event span、TimedNote、ticksPerBeat、任意のVoice列
  (`src/domain/voicing/types.ts`)。
- 同時発音frameを先に探索し、見つからない場合だけaggregate note setを使う
  (`src/domain/voicing/extractVoicing.ts`,
  `src/domain/voicing/extractSimultaneousVoicing.ts`,
  `src/domain/voicing/extractAggregatedNoteSet.ts`)。
- channel 9 / percussionは抽出証拠から除外する。role重みは harmony、pad、
  mixed、bass、melodyの順で異なる (`extractSimultaneousVoicing.ts`)。
- aggregateは `aggregated-note-set` として明示し、simultaneousとして保存しない。
- snapshotは `voicingMemory.sourceVoicing` に入り、Previewと保存対象の
  ChordTimelineItemへ運ばれる (`src/domain/types.ts`,
  `src/domain/midi/manualDraft.ts`, `src/domain/midi/manualDraftSave.ts`)。

## Sustain、Bass、互換性、fallback

- MIDI parserはCCを保持し、正規化段階がsustain終端を扱う
  (`src/domain/midi/rawSmf.ts`, `src/domain/midi/normalize.ts`)。
- bassは候補内の最低音とrole evidenceから扱われ、Gold policy別の正誤は
  Phase 4.3で初めて測定する。現行コードに正解保証はない。
- chord編集後はnormalized chord keyが一致しないsnapshotを`stale`と判定する
  (`src/domain/voicing/compatibility.ts`)。
- 使用時の優先順はpractice override、verified source、十分なconfidenceを持つ
  simultaneous source、generated fallback
  (`src/domain/voicing/resolveVoicing.ts`)。
- aggregate sourceは自動採用されず、review扱いとなる。

## Capture Preview、Vault、Chord Dojo

- CaptureのA/B PreviewはDraftのsourceとeditedを分離する
  (`src/components/CaptureDraftSessionBar.tsx`,
  `src/domain/midi/manualDraftPlayback.ts`)。
- 保存はDraftの現在eventsを既存store経路へ渡し、sourceVoicingも複製して保持する
  (`src/domain/midi/manualDraftSave.ts`, `src/store/vaultStore.ts`)。
- Chord Dojo / practice側は保存済みvoicing memoryを
  `resolveVoicingForUse` 経由で解決し、利用不可ならgeneratedへ落とす
  (`src/domain/voicing/resolveVoicing.ts`, `src/domain/voicingPractice/*`,
  `src/components/practice/*`)。
- Dojo用生成配置はSource Voicingを上書きする保存経路ではない。

## 既知の未測定点

Phase 4.3開始時点では、60 MIDI / 496 eventに対するnote precision、recall、
register、representation、contamination、fallback率の定量baselineは存在しない。
この欠落をPhase 4.3の主対象とする。

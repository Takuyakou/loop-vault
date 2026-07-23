# Loop Vault Phase 3.8.5 実装報告

## 実装概要

Phase 3.8.5 Voicing Memory Foundation を実装した。保存済みコードイベントごとに、元MIDIから抽出した具体的なMIDI note配置と、ユーザーが鍵盤で記録した練習用配置を分離して保持できる。

## Event Identity

- `ChordTimelineItem.eventId?` を追加した (`src/domain/types.ts`)。
- 旧データは読込時に書き換えず、編集時だけ `legacy:{blockId}:{bar}:{beat}:{ordinal}` を導出する。
- 明示保存時にstoreへ注入された `idFactory` で永続IDへ置換する (`src/store/vaultStore.ts`)。
- replaceは維持、insertは新規、splitは前半維持/後半新規、mergeは存続側維持、duplicateは全event IDを再生成する。
- Voicingを含むUndo/Redoは編集snapshotで復元する (`src/domain/progressionEditing/*`)。

## データモデル

- `VoicingSnapshot`
- `ChordVoicingMemory`
- `sourceVoicing`
- `practiceVoicingOverride`
- `simultaneous-voicing`
- `aggregated-note-set`

すべてコードイベントのoptional fieldとして追加した。Zodはnote範囲、昇順、重複禁止、2〜10音、bass包含、confidence範囲を検証する。`fileVersion` は1のまま (`src/domain/schema.ts`)。

## 抽出エンジン

純粋domainとして `src/domain/voicing/` を追加した。

- note on/off境界をsweepして同時発音集合を抽出する。
- 同時候補がない場合だけ区間内noteを集約する。
- channel 9とpercussion Voiceをhard excludeする。
- bassを分離し、harmony/pad/melody/mixedのRoleをsoft weightとして使う。
- chord toneへ先にfilterせず、required coverageとforeign toneを評価する。
- deterministicなscore、tie-break、confidenceを使用する。

## Capture統合

`analyzeMidiBytes()` が解析中だけ `MidiSongData` と `Voice[]` を `AnalysisState` に保持する。これは `VaultFile` へ保存されない。Candidate保存時、対象コードごとに元noteからSnapshotを抽出し、成功したイベントだけ `sourceVoicing` を付与する。抽出失敗は進行保存を妨げない (`src/store/vaultStore.ts`)。

## Progression Detail

- 選択コードにVoicingセクションを追加した。
- 使用中の出自、note名、Bass、鍵盤表示、stale警告を日本語/英語で表示する。
- 元MIDI asset pathが解決できる場合、現在の進行だけ再抽出できる。
- 再抽出はpractice overrideを保持し、1回のUndoで戻せる。
- 元MIDI欠損時は鍵盤記録へ誘導する。
- Live MIDIは既存 `defaultLiveMidiStore` を共有し、held noteだけを100ms安定後に候補化する。
- 自動保存せず「この押さえ方を使う」の明示確認でpractice overrideへ反映する。

## StaleとResolver

`capturedForChordKey` と現在Chordの正規化キーを比較し、`compatible / stale / invalid` を動的に判定する。stale flagは保存しない。

解決順:

1. compatibleなpractice override
2. verified source
3. high-confidence simultaneous source
4. generated fallback

aggregatedまたは低confidence sourceは、user verifiedでない限り自動試聴へ使わない。

## Playback

既存 `PlaybackController` と `chordPreview` にoptionalなexplicit MIDI notesを追加した。Progression Detail、Idea Detail、Home、Vaultの保存進行試聴はResolverを通る。Quick Editorの別コード候補は従来どおりgenerated Voicingを使う。

## 互換性

- 旧data.jsonはVoicingなしで読める。
- parseだけではID生成・autosaveを行わない。
- repository直書きは追加していない。
- MIDI bytes、全note列、絶対pathはSnapshotへ保存しない。
- default MIDI analyzer mode、解析重み、LLM、PXF、Chord Drip、`fileVersion` は変更していない。

## テスト

追加した主な回帰:

- chord key normalization / stale
- Resolver優先順位
- simultaneous / aggregated / percussion除外 / deterministic
- split / merge / UndoでのID・Voicing整合
- Capture dirty判定が一時event IDを無視すること
- store保存時のevent ID付与
- block duplicate時のevent ID再生成とSnapshot deep clone
- optional schemaと旧データ互換

## 未解決・対象外

- Capture保存前のVoicing previewは未実装。
- 低confidence Snapshotを個別にverifiedへ変更する専用UIは未実装。
- 元MIDIの再リンクUIは未実装。既存asset pathが解決できる場合のみ再抽出する。
- velocity、CC、音色、アルペジオ順序は保存しない。
- Chord Dojo、Voicing Library、複数variant、Chord Drip/PXF連携は対象外。
- 実MIDIを用いた手動聴感QAは利用者確認が必要。自動fixtureでは同時和音、アルペジオ、percussion除外、staleを確認した。

## 最終検証

- `npm run lint`: PASS
- `npm test -- --run`: 128 files / 688 tests PASS
- `npx tsc --noEmit`: PASS
- `npm run build`: PASS
- `cargo test`: 24 tests PASS
- `npm run tauri build`: PASS
- `git diff --check`: PASS
- `defaultAnalyzerMode`: `legacy` を維持
- `fileVersion`: `1` を維持

生成物:

- `src-tauri/target/release/loop-vault.exe`
- `src-tauri/target/release/bundle/msi/Loop Vault_0.1.0_x64_en-US.msi`
- `src-tauri/target/release/bundle/nsis/Loop Vault_0.1.0_x64-setup.exe`

既知のbuild warningは、既存のJavaScript chunkが500 kBを超える旨のみ。

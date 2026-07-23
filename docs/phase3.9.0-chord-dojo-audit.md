# Phase 3.9.0 Chord Dojo 実装前監査

## 監査日

2026-07-23

## 現行境界

- 保存済み進行は `SavedProgressionBlock` として `SongIdea.progressionBlocks` に保持される。コードイベントには安定した `eventId` と任意の `voicingMemory` がある。根拠: `src/domain/types.ts`
- Voicing の利用順は、互換な `practiceVoicingOverride`、検証済みまたは高信頼の simultaneous `sourceVoicing`、generated fallback。根拠: `src/domain/voicing/resolveVoicing.ts`
- Live MIDI は単一の `defaultLiveMidiStore` / `liveMidiService` を共有し、held note と CC64 sustained note を分離する。根拠: `src/liveMidi/liveMidiStore.ts`, `src/domain/liveMidi/noteState.ts`
- Vault 更新は `VaultStoreState.updateProgressionBlock()` から内部 `applyVaultChange()` を通り、500ms debounce autosaveへ流れる。repository直書きは不要。根拠: `src/store/vaultStore.ts`
- 再生は単一 `playbackController` が source 単位で排他制御する。現行 source kind は `home | capture | vault | detail`。根拠: `src/audio/playbackController.ts`
- ルーティングはReactローカルstateの `AppView` で管理し、ヘッダーは `AppShell`、進行詳細は `ProgressionDetailView`。根拠: `src/App.tsx`, `src/components/AppShell.tsx`
- 日英表示は `src/i18n.ts` の `appCopy` と画面別copyで管理される。

## Phase 3.9.0で維持する境界

- `src/domain/practice/*` はReact、Zustand、Tauri、Tone、現在時刻へ依存しない。
- 演奏中のnote、miss、時間、scoreは永続化しない。
- 練習進捗は節目だけ `updateProgressionBlock()` で保存する。
- `fileVersion` は1を維持し、`practice` はoptionalにする。
- Live MIDI用Rust transport、MIDI解析、Voicing抽出、LLM Providerは変更しない。

## 実装上の注意

- `LiveNoteState` 自体にはattack counterがないため、held noteの `lastEventMs` をUI境界で単調なattack revisionへ変換する。
- Flow用のaudio clockは既存chord preview内部のTone singletonと衝突させない必要がある。PracticeClockはWeb Audio clockを注入できる小さな境界として実装する。
- `SavedProgressionBlock.timeSignature` は文字列で、Flow MVPは `4/4` または未設定だけを対象とする。
- progression fingerprintはVoicing、title、memo、tags、favoriteを含めない。

## ベースライン

- branch開始commit: `ad23e0963f348e47c678c439b7bd363daacd95e4`
- 直前Phaseの検証: 128 test files / 688 tests PASS
- `defaultAnalyzerMode`: legacy
- `fileVersion`: 1


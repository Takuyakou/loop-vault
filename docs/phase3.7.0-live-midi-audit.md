# Phase 3.7.0 Live MIDI Mini Mode 監査

## 監査対象

- UI shell: `src/components/AppShell.tsx`
- app composition: `src/App.tsx`
- close flow: `src/store/closeGuard.ts`, `src-tauri/src/lib.rs`
- Vault state/persistence: `src/store/vaultStore.ts`, `src/domain/schema.ts`
- audio output: `src/audio/playbackController.ts`
- chord model: `src/domain/types.ts`, `src/domain/chords.ts`
- MIDI chord templates: `src/domain/midi/candidates.ts`
- Tauri configuration: `src-tauri/tauri.conf.json`, `src-tauri/capabilities/default.json`

## 現状

### Window / close

- Tauri windowは`main`の1つだけで、初期サイズ1120 x 760、最小サイズ768 x 640。
- React rootとZustand Vault storeは単一window内で維持される。
- Tauriのclose requestは常にpreventし、未保存なら`flush()`完了後にRust command `exit_app`を呼ぶ。
- ミニモードでもこのclose guardを維持すれば、閉じるボタンは「戻る」ではなくアプリ終了になる。

### Preferences

- Vault設定は`data.json`の`settings`に保存される。
- 解析修正ログの有効/無効だけは`localStorage`を使う既存のPC固有設定例がある。
- Tauri Store pluginは未導入。Live MIDIのdevice/boundsは専用Zod schema付きlocal preferencesに保存し、Vault storeへ追加しない。

### MIDI

- ファイルMIDI解析は`@tonejs/midi`等を使うが、live device transportは未実装。
- Rust dependencyにMIDI backendはない。Windows対応の`midir`を追加する。
- Rustはdevice列挙、接続、生event、timestamp、connectionId、batch emitだけを担当する。

### Chord / audio

- 構造化コードは`ChordSymbol`、表示は`labelFromSymbol()` / `makeChordSymbol()`が正。
- quality templateは`src/domain/midi/candidates.ts`にあるが、長尺解析のsegmentation/rerankerはLiveへ流用しない。
- `PlaybackController`はアプリから音を出すsingleton。Live MIDIは入力専用serviceとし、統合しない。

## 実装境界

1. `src-tauri/src/live_midi/*`: transportのみ。音楽判断を置かない。
2. `src/liveMidi/*`: Tauri bridge、service、store、window runtime、preferences。
3. `src/domain/liveMidi/*`: React/Zustand/Tauri/現在時刻に依存しない純関数。
4. `src/components/LiveMidiMiniMode.tsx`: 表示とユーザー操作。
5. Vaultへの任意取り込みは既存`createIdeaFromDraft()` / `appendBlockToIdea()`を通す。

## Stageとstack

| Stage | PR責務 | 依存 |
|---|---|---|
| L0 | 仕様・監査 | `master` |
| L1 | Rust transport + TS bridge | L0 |
| L2 | note state / detector / stabilizer / history | L1 |
| L3 | single-window transform / preferences | L2 |
| L4 | header + mini UI + i18n | L3 |
| L5 | 履歴の任意Vault取り込み | L4 |
| L6 | QA記録・installer検証 | L5 |

## リスクと扱い

- MIDI deviceの同時open可否はdriver依存。UI文言は占有を断定せず、実機QA結果を別記する。
- midirのportに安定IDがないbackendでは、名前だけで自動選択しない。indexを含む候補照合後に曖昧ならユーザー選択へ戻す。
- monitor復元は利用可能work areaへclampする。Tauri API失敗時は通常画面表示を優先し、always-on-top解除を試行する。
- event callbackと画面終了が競合しうるため、接続ごとのconnectionIdで古いbatchを捨て、stop時にnote stateをclearする。
- 実機遅延とSynthesia併用はCIでは検証できない。自動テスト対象と実機対象を混同せず報告する。

## 非対象

- 別window / 別WebView
- MIDI Thru
- MIDI録音・event永続化
- system audio解析
- 長尺MIDI解析器のLive転用
- Analysis Mixer


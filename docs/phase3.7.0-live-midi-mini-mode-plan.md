# Loop Vault Phase 3.7.0 Codex作業指示書
## Live MIDI Mini Mode — MIDIキーボードで今弾いているコードを安定表示し、Loop Vaultへ採集する

---

## 0. 結論

Phase 3.7.0では、MIDIキーボードで現在弾いているコードをリアルタイム表示する「Live MIDI Mini Mode」を実装する。

本機能は単なるコード表示ツールではなく、Loop Vaultにおける第3の採集経路として位置づける。

```text
1. MIDIファイルを読み込む
2. Chord Dripから取り込む
3. 今弾いているコードを採集する
```

MVPでは次を完成させる。

```text
ヘッダーの鍵盤アイコン
↓
同じTauriウィンドウをミニモードへ変形
↓
MIDI入力デバイスを選択
↓
現在コード・構成音・ベース音・接続状態を表示
↓
直近コード履歴を表示
↓
戻る操作で元の画面・位置・サイズ・最大化状態を復元
```

テーマは、**「いま弾いた響きを、その場で読み取り、後から採集できる状態へ」**。

---

## 1. 前提と境界

技術構成:

- React
- TypeScript
- Vite
- Tauri 2
- Zustand
- Zod
- Windowsデスクトップ向け

既存資産:

- `ChordSymbol`
- コードテンプレート
- コード名表示
- 度数計算
- Vault保存経路
- `PlaybackController`
- 共通Modal / Undo
- 日本語 / English
- Lucideアイコン

本Phaseでは、Phase 3.6.xの長尺MIDI解析器をLive MIDIへ流用しない。Live MIDIは未来のノートを見られないため、専用の軽量状態機械と安定化処理を作る。

対象外:

- PC再生音・マイク・システム音声の解析
- 長尺MIDIファイル解析
- 演奏採点、練習管理
- 自動キー推定
- MIDI録音
- MIDI Thru
- 別ウィンドウ同時表示
- クラウド同期

---

## 2. MVPアーキテクチャ決定

### 2.1 単一ウィンドウ変形

MVPは別Tauriウィンドウではなく、**既存ウィンドウをミニモードへ変形**する。

理由:

- React木とZustand状態を維持できる
- Vaultのsingle-writer構造を壊さない
- 自動保存の二重書き込みを避ける
- 実装範囲が小さい

将来、通常画面との同時表示要求が確認された場合のみ、表示専用の別ウィンドウへ拡張する。その場合もミニ側はVaultを直接読み書きしない。

### 2.2 MIDI処理の責務分離

```text
Rust / midir
├─ デバイス列挙
├─ open / close
├─ MIDI生イベント受信
├─ timestamp・connectionId付与
├─ 切断検知
└─ frontendへ中継

TypeScript domain
├─ Note状態管理
├─ CC64管理
├─ コード照合
├─ Bass判定
├─ デバウンス / ヒステリシス
└─ 履歴確定
```

Rust側は音楽的解釈をしない。TypeScript domainはReact、Zustand、Tauri APIへ依存しない純関数とする。

### 2.3 PlaybackControllerとの分離

```text
PlaybackController
→ Loop Vaultが音を鳴らす

LiveMidiService
→ 外部MIDI入力を受け取る
```

同じsingletonへ統合しない。MVPのLive MIDIは音を出さない。

---

## 3. MVPスコープ

実装するもの:

- ヘッダーの鍵盤アイコン
- ミニモードへの切替・復帰
- 通常画面の状態保持
- 通常ウィンドウの位置・サイズ・最大化・fullscreen復元
- ミニモードの位置・サイズ保存
- always-on-top
- MIDI入力デバイス列挙・選択・再接続
- Note On / Note Off / velocity 0
- CC64 sustain
- channel別note / pedal状態
- 同音重複カウント
- 現在コード、構成音、held優先Bass、分数コード
- 接続状態
- 直近履歴
- デバウンス、ヒステリシス、離鍵猶予
- 切断時安全クリア
- 日本語 / English
- 実機QA

任意Stage:

- 履歴を進行としてVaultへ取り込む

実装しないもの:

- MIDI Thru
- ライブキー推定・度数表示
- MIDIイベント永続化
- 複数デバイス同時入力
- `confidence = 1.0`での自動保存
- system audio chord detection

---

## 4. ウィンドウ変形仕様

### 4.1 起動

ヘッダーの設定アイコン左に鍵盤アイコンを配置する。

```text
[Home] [コード採集] [Vault]      [+ Idea] [鍵盤] [設定]
```

クリック時:

1. 現在の通常ウィンドウ状態を取得
2. `MainWindowSnapshot`として保持
3. ミニモード表示へ切替
4. always-on-topを有効化
5. 保存済みmini boundsを復元
6. mini boundsがなければ初期値を使用

```ts
export interface MainWindowSnapshot {
  position: { x: number; y: number };
  size: { width: number; height: number };
  maximized: boolean;
  fullscreen: boolean;
  monitorId?: string;
}
```

初期mini bounds:

```text
340 × 200px
最小 280 × 160px
resizable: true
alwaysOnTop: true
```

### 4.2 復帰

左上の「戻る」またはEscで復帰する。

1. Live MIDI connectionを停止しnote状態を安全クリア
2. mini boundsを保存
3. always-on-top解除
4. 通常ビューへ戻す
5. 通常boundsを現在monitor内へ補正
6. position / sizeを復元
7. 元がmaximizedならmaximize
8. 元がfullscreenならfullscreen復元
9. focusを戻す

### 4.3 モニター変更

保存座標が画面外の場合、現在利用可能なmonitorのwork area内へclampする。

### 4.4 ×ボタン

ミニモード中でも×はアプリ終了とする。「× = 戻る」にはしない。既存のflush → save completion → exitを維持する。

---

## 5. 設定永続化

MIDIデバイス名、mini bounds、always-on-top、履歴表示設定はPC固有設定であり、Vaultの`data.json`へ保存しない。

Tauri Storeまたは既存app preferences専用ストアを使う。

```ts
export interface LiveMidiPreferences {
  preferredInput?: PreferredMidiInput;
  miniBounds?: WindowBounds;
  showHistory?: boolean;
}

export interface PreferredMidiInput {
  backendId?: string;
  name: string;
  previousIndex?: number;
}
```

再接続順:

```text
1. 安定ID一致
2. 名前完全一致が1件のみ
3. 名前 + previousIndex
4. ユーザー選択
```

デバイス名だけで自動選択しない。

---

## 6. Rust MIDIトランスポート

候補構成:

```text
src-tauri/src/live_midi/
  mod.rs
  commands.rs
  device_service.rs
  connection.rs
  event_batch.rs
  types.rs
```

採用候補: `midir`

Rust側責務:

- MIDI input port列挙
- open / close
- 生MIDI message受信
- timestamp付与
- connectionId付与
- 10ms程度のevent batch
- frontendへemit
- 切断検知・再列挙
- Drop / app終了時close

```ts
export interface RawLiveMidiEventBatch {
  connectionId: string;
  events: RawLiveMidiEvent[];
}

export interface RawLiveMidiEvent {
  timestampMs: number;
  status: number;
  channel: number;
  data1: number;
  data2: number;
}
```

接続ごとに新しい`connectionId`を発行し、古い接続から遅れて届いたeventは破棄する。

hot-plug eventを安定利用できない場合、ミニモード中だけ2秒間隔で再列挙する。

---

## 7. TypeScriptイベントブリッジ

候補:

```text
src/liveMidi/
  bridge.ts
  liveMidiService.ts
  types.ts
  deviceSelection.ts
```

責務:

- Tauri command呼び出し
- event listener
- connectionId検証
- Rust eventの正規化
- domain reducerへの投入
- start / stop / reconnect
- UI connection state提供

```ts
export type LiveMidiConnectionStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "disconnected"
  | "error";
```

---

## 8. MIDIノート状態機械

配置:

```text
src/domain/liveMidi/
  types.ts
  noteState.ts
  noteStateReducer.ts
  liveBass.ts
  liveChordDetector.ts
  chordStabilizer.ts
  chordHistory.ts
  constants.ts
```

### 8.1 channel単位管理

同じnote番号でもchannelが違えば別状態として管理する。

```ts
export interface HeldNoteState {
  count: number;
  velocity: number;
  sinceMs: number;
  lastEventMs: number;
}

export interface LiveNoteState {
  held: Map<string, HeldNoteState>;
  sustained: Set<string>;
  pedalByChannel: Map<number, boolean>;
}
```

内部key:

```ts
const toNoteKey = (channel: number, note: number) => `${channel}:${note}`;
```

### 8.2 Note On / Off

- Note On velocity > 0: `count++`
- Note OffまたはNote On velocity 0: `count--`
- countが0でpedal on: sustainedへ移動
- pedal off: 完全削除

### 8.3 CC64

- value >= 64: 該当channelのpedal on
- value < 64: 該当channelのpedal off + そのchannelのsustainedだけ全削除

### 8.4 コード構成音とBass

コード構成音:

```text
held ∪ sustained
```

Bass優先順位:

```text
1. heldの最低音
2. heldが0件ならsustainedの最低音
3. 短いbass grace中なら直前Bass
4. それ以外undefined
```

サステイン中の前コード低音を新コードのBassへ誤採用しない。

### 8.5 安全クリア

以下で全状態を初期化する。

- デバイス切断
- デバイス切替
- connectionId変更
- ミニモード終了
- アプリ終了
- Rust connection error

---

## 9. Liveコード認識

共通化するもの:

- pitch class変換
- `ChordSymbol`
- quality template
- chord label
- slash chord label
- note name

共通化しないもの:

- timeline segmentation
- legacy boundary
- Voice Role
- candidate block
- long MIDI reranker
- candidate region selection
- DP

認識手順:

```text
sounding notes
↓
pitch-class set
↓
held優先Bass
↓
root仮説
↓
quality template照合
↓
slash bass判定
↓
Top-1 + alternatives
```

2音以下は無理にコード名を出さず、音名列挙へフォールバックする。判定不能な集合も同様に、嘘のコード名を出さない。

MVPの主表示はTop-1。alternativesは内部保持または設定内表示でよい。

---

## 10. 表示安定化

原則:

```text
音が増える方向は速く
音が減る方向は遅く
```

初期定数:

```ts
export const LIVE_CHORD_TIMING = {
  gatherMs: 80,
  stableMs: 120,
  releaseGraceMs: 250,
  historyCommitMs: 400,
  bassGraceMs: 120,
} as const;
```

- Gather: 音が増えている間は最大80ms収集
- Stable: 新候補が120ms維持されたら表示更新
- Release grace: 現コードの部分集合へ減る変化は250ms保留
- Hysteresis: root / bass /音集合が明確に変わった場合のみ切替
- 全離鍵 + pedal off: 300ms以内に`—`

体感受け入れ指標:

- Block chord表示中央値: 180ms以内目標
- 速いアルペジオ: 最終構成音から250ms以内
- 1回の和音入力中の不要な表示切替: 最大1回
- 全離鍵 + pedal off後: 300ms以内に`—`

時刻はevent timestampまたは注入Clockを使い、domain内で`Date.now()`を直接使わない。

---

## 11. コード履歴

同一表示コードが400ms以上安定した場合のみ履歴へ追加する。直前と同一なら追加しない。

```ts
export interface LiveChordHistoryEntry {
  id: string;
  chord: ChordSymbol;
  label: string;
  bass?: string;
  notes: number[];
  startedAtMs: number;
  committedAtMs: number;
}
```

- リングバッファ64件
- UI表示は直近5件程度
- セッション一時状態
- app preferencesにもVaultにも自動保存しない

---

## 12. ミニモードUI

```text
┌──────────────────────────────────────────┐
│ [← 戻る]          [● Roland A-49 ▾] [⚙] │
│                                          │
│                Fmaj9/A                   │
│                                          │
│          F · A · C · E · G              │
│          Bass: A                         │
│──────────────────────────────────────────│
│ Dm7   G13   Cmaj9   Am7                  │
└──────────────────────────────────────────┘
```

必須表示:

- 戻る
- 接続状態
- デバイス名・切替
- 現在コード
- 構成音
- Bass
- 履歴

接続状態は色だけに依存せず、`接続済み / 接続中 / 切断 / エラー`を表示する。

コード名:

- 36〜44px
- 幅に応じて縮小
- `aria-live="polite"`
- 80ms程度の短いfadeのみ

デバイスopen失敗時:

```text
MIDIデバイスを開けませんでした。
他のアプリが使用中か、接続が失われた可能性があります。
```

占有を断定しない。

---

## 13. Synthesia併用

同じMIDIデバイスをSynthesiaとLoop Vaultが同時利用できるかは、Windows環境、driver、MIDI API、アプリ実装に依存する。

MVP前に次を実機検証する。

```text
A. Synthesiaのみ
B. Loop Vaultのみ
C. Synthesia + Loop Vault同時
```

記録:

- 両方open成功 / 失敗
- 入力遅延
- 切断・再接続
- 使用デバイス
- Windows version

MIDI ThruはMVPへ入れない。仮想MIDIルーターの具体手順は実機検証後に確定する。

---

## 14. 任意Stage: 履歴取り込み

通常画面へ戻った後、履歴がある場合のみ提案する。

```text
このセッションのコード履歴を進行として取り込みますか？
```

自動保存しない。

保存メタデータ:

```ts
{
  origin: "live-midi",
  analyzerVersion: "live-chord-v1",
  userVerified: false,
  confidence: undefined,
}
```

`confidence = 1.0`を付けない。ユーザーが明示確認した場合のみ`userVerified = true`。

保存は既存store actionと`applyVaultChange()`を通し、repositoryへ直接書かない。

---

## 15. 実装Stage

### L0 — Audit & Feasibility

- Tauri window API
- window state handling
- app preferences
- current close flow
- current header
- chord domain共通化候補
- MIDI dependency
- Synthesia同時接続検証準備

成果物: `docs/phase3.7.0-live-midi-audit.md`

### L1 — Rust MIDI Transport

- midir導入
- device list / open / close
- event batch
- timestamp / connectionId
- disconnect / reconnect
- command / event bridge

### L2 — Live MIDI Domain

- channel-aware note state
- duplicate count
- CC64
- held-priority bass
- chord matching
- stabilizer
- history
- deterministic tests

### L3 — Mini Mode Window Transform

- header keyboard icon
- main snapshot
- mini bounds
- always-on-top
- restore
- monitor clamp
- Esc
- × behavior維持
- app preferences

### L4 — UI Integration

- device selector
- connection status
- current chord
- notes / bass / history
- error UI
- Japanese / English
- accessibility

### L5 — Optional History Import

- return prompt
- range selection
- origin metadata
- `userVerified: false`
- existing save path

### L6 — Real-device QA

- physical keyboard
- sustain pedal
- fast chord / arpeggio / glissando
- disconnect / reconnect
- Synthesia only / Loop Vault only / simultaneous
- mini ↔ normal 10回
- maximize / fullscreen restore
- monitor disconnect
- installer

---

## 16. Codexマスタープロンプト

```text
あなたはLoop Vault
（React + TypeScript + Vite + Tauri v2 + Zustand + Zod）
のPhase 3.7.0を実装します。

仕様の正は
`docs/phase3.7.0-live-midi-mini-mode-plan.md`
です。

目的:
MIDIキーボードで現在弾いているコードをリアルタイム表示し、
Synthesia等と併用できる小型ミニモードを提供する。

絶対に守ること:

1. MVPは単一Tauriウィンドウのモード変形とする。
2. 別WebView / 別windowを追加しない。
3. 通常画面のReact / Zustand状態を失わない。
4. position / size / maximized / fullscreenを復元する。
5. monitor変更後に画面外へ復元しない。
6. ×ボタンは従来どおりアプリ終了とする。
7. MIDI入力はRust側で受ける。
8. Rust側はコード解釈をしない。
9. コード認識・安定化はTypeScript純関数domainへ置く。
10. note状態はchannel × noteで管理する。
11. pedal状態はchannelごとに管理する。
12. Note On velocity 0をNote Offとして扱う。
13. 同音重複はcountで管理する。
14. chord notesはheld ∪ sustained。
15. Bassはheld最低音をsustained最低音より優先する。
16. 切断・切替・終了時に全note状態をクリアする。
17. connectionIdで古い接続eventを破棄する。
18. MIDIデバイスは名前だけで自動選択しない。
19. device / boundsをVault data.jsonへ保存しない。
20. app preferencesへ保存する。
21. 履歴・note状態は永続化しない。
22. Live MIDIをPlaybackControllerへ統合しない。
23. 長尺MIDI解析器をLive判定へ流用しない。
24. ChordSymbol / template / label資産のみ適切に再利用する。
25. gather / stable / release / commitを定数化する。
26. domainでDate.now / Math.randomを直接使わない。
27. Synthesiaとの同時利用可否を断定しない。
28. MIDI ThruをMVPへ入れない。
29. Live履歴保存時にconfidence=1.0を付けない。
30. userVerifiedはユーザー明示時のみtrue。
31. Vault保存は既存store actionとapplyVaultChangeを通す。
32. fileVersionを上げない。
33. UI文言を日本語 / Englishで実装する。
34. 各Stageでlint / test / typecheck / buildを実行する。

作業開始前:
- 現行window構造
- close flow
- preference保存場所
- MIDI dependency候補
- chord domain共通化候補
- PlaybackControllerとの境界
- 変更計画
- リスク
を報告する。

作業終了時:
- 変更ファイル
- 実装内容
- MIDI device挙動
- window restore
- domain test
- 実機QA
- Synthesia同時利用結果
- 遅延測定
- 未解決事項
- 次Stageへの申し送り
を報告する。

コミット:
P3.7.0-LX: 要約
```

---

## 17. テスト

### Note state

- Note On / Off / velocity 0
- duplicate count
- channel separation
- pedal per channel
- sustain release
- reconnect / device switch clear

### Bass

- held優先
- sustainedのみ
- held + old sustained bass
- bass grace
- channel mixed

### Chord detector

- major / minor / 7 / maj7 / m7
- sus / add9 / 9 / 11 / 13
- inversion / slash
- unknown
- 2 notes

### Stabilizer

- block chord
- 80ms arpeggio
- passing tone
- release order
- subset hold
- full release
- pedal
- hysteresis
- deterministic clock

### History

- 400ms commit
- duplicate suppression
- ring buffer
- no persistence

### Device

- enumerate / open / open failure
- reconnect
- duplicate names
- connectionId
- stale batch discard
- disconnect

### Window

- normal → mini → normal
- maximized / fullscreen restore
- monitor clamp
- mini bounds
- always-on-top
- Esc
- × = exit
- 10往復

### Preferences

- old preferences parse
- preferred device / mini bounds
- Vault data.jsonへ混入しない

### Regression

- Capture / Vault / Home / Detail
- PlaybackController
- save status / exit flush
- MIDI file analysis
- candidate selection
- correction logs

---

## 18. 受け入れ条件

### Window

- ヘッダーから起動
- 同じwindowでmini化
- 元画面状態維持
- bounds / maximized / fullscreen復元
- 画面外復元なし
- Escで戻る
- ×で終了
- always-on-top

### MIDI

- device選択
- Note On / Off / velocity 0 / CC64
- channel別state
- duplicate count
- disconnect clear / reconnect
- stale event discard

### Detection

- root / quality / bass / slash
- unknown fallback
- 2音以下の誠実な表示
- flicker抑制
- block chord中央値180ms目標
- arpeggio最終音から250ms以内
- full release後300ms以内に`—`

### History

- 400ms安定後追加
- 重複抑制
- 最大64件
- セッションのみ
- Vaultへ自動保存しない

### Persistence

- preferences専用保存
- Vault data.jsonへdevice / boundsを入れない
- fileVersion不変
- 旧データ読込維持

### Integration

- PlaybackControllerと分離
- MIDI file analyzerを壊さない
- Synthesia同時利用結果を記録
- MIDI Thru未実装
- lint / test / typecheck / web build / Tauri build / installer成功

---

## 19. バックログ

- 別ウィンドウ同時表示
- MIDI Thru
- virtual MIDI setup wizard
- live key / degree
- velocity display
- multi-device merge
- event recording
- audio chord detection
- automatic Gold label

---

## 20. 最終メッセージ

Phase 3.7.0はコード表示を付けるだけのPhaseではない。

```text
MIDIキーボードを弾く
↓
コードを安定して確認する
↓
気になった響きを履歴に残す
↓
必要なものだけLoop Vaultへ採集する
```

**MIDIファイルを読み込む前の「いま弾いている瞬間」も、Loop Vaultの入口にする。**

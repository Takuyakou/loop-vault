# Loop Vault Phase 3.8.5 Codex作業指示書
## Voicing Memory Foundation
### 元MIDIで気に入った「音高・オクターブ配置」を保存し、試聴とChord Dojoへ安全に渡す

---

## 0. 結論

Phase 3.8.5では、保存済みコード進行の各コードへ、元MIDIや鍵盤演奏から取得した具体的なボイシングを任意で永続化する。

ただし、元MIDI全体や全ノートイベントは保存しない。

保存するのは、各コードにつき数音程度の小さな`VoicingSnapshot`だけとする。

```text
Cmaj9
+
C3・E3・G3・B3・D4
+
元MIDIから抽出したのか
鍵盤で記録したのか
同時発音だったのか
区間内の音を集約した推定なのか
```

今回の中心設計は次の4点である。

1. **コード配列indexではなく、安定したevent IDへ紐付ける**
2. **元資料のボイシングと、練習用に選んだボイシングを分ける**
3. **同時発音Voicingとアルペジオ由来の集約音集合を区別する**
4. **コード編集後も元情報は削除せず、staleとして利用停止する**

Phase 3.8.5のテーマ:

**「コード名だけでなく、気に入った音高配置もVaultへ残す」**

---

# 1. 背景

現状のLoop Vaultでは、MIDI解析中は具体的なノート情報を利用している。

```text
MIDI note number
開始位置
終了位置
velocity
track
channel
Voice role
```

しかし、Vaultへ保存される進行は主にコードシンボル、小節、拍、長さへ抽象化される。

そのため、元MIDIで気に入った配置が次のように失われる。

```text
元MIDI:
C2・G2・B3・D4・E4

Vault保存:
Cmaj9

現在の試聴:
ChordSymbolから自動生成した別Voicing
```

この状態では、Phase 3.9 Chord DojoのL1で表示する鍵盤ガイドも、元MIDIの押さえ方とは限らない。

Phase 3.8.5は、次の用途に共通する基盤を作る。

- 元MIDIに近い進行試聴
- Chord DojoのL1ガイド
- ユーザーが弾きやすい練習用Voicing
- Smooth候補の実配置評価
- 将来のChord Drip Voicing連携
- 将来のVoicing検索・作者傾向分析

---

# 2. 前提と実装順

## 2.1 前提

現行Loop Vaultには以下が存在する。

- `SavedProgressionBlock`
- コードイベント列
- Progression Detail
- Capture
- Quick Chord Editor
- 任意位置へのコード追加
- 分割・結合・削除
- Undo / Redo
- `selectedSlotId`
- Live MIDI transport / note state
- PlaybackController
- `chordVoicing.ts`
- Voice-aware用のVoice Role情報
- source MIDI再解決経路
- `applyVaultChange()`
- autosave / backup

## 2.2 Phase 3.8.0との分離

Phase 3.8.5ではLLM Provider、Ollama、OpenAI、Progression Advisorを変更しない。

可能ならPhase 3.8.0の結合確認とマージ完了後に着手する。

並行作業する場合も、Phase 3.8.5は独立ブランチ・独立PR stackとし、LLM接続修正を同じcommitへ混ぜない。

## 2.3 Chord Dojoとの境界

Phase 3.8.5:

```text
ボイシングを取得
保存
確認
手動上書き
試聴で利用
Dojo向け解決APIを用意
```

Phase 3.9:

```text
鍵盤ガイド表示
required / optional tone判定
L1〜L5
練習進捗
```

Chord Dojo本体はPhase 3.8.5へ含めない。

---

# 3. 設計原則

## 3.1 `chordIndex`を永続キーにしない

現行アプリは以下を持つ。

- コード挿入
- 削除
- 分割
- 結合
- Undo / Redo
- 複製

そのため、配列indexへVoicingを紐付けると、編集後に別コードへ誤対応する。

禁止:

```ts
{
  chordIndex: 2,
  pitches: [...]
}
```

必ず安定event IDへ紐付ける。

## 3.2 元Voicingと練習用Voicingを分ける

```text
sourceVoicing
→ 元MIDI、Chord Dripなど原資料から得た配置

practiceVoicingOverride
→ ユーザーが鍵盤で弾き、練習・再生用に採用した配置
```

鍵盤で記録しても、元MIDIの配置を消さない。

## 3.3 自動生成Voicingを保存しない

コードシンボルから再計算できるVoicingは派生データ。

```text
generated / canonical / simple
```

は保存しない。

ユーザーが鍵盤で明示的に確定した場合だけ`practiceVoicingOverride`として保存する。

## 3.4 取得方法を区別する

```text
simultaneous-voicing
→ 実際に近い時間範囲で同時発音していた配置

aggregated-note-set
→ 区間内のアルペジオ等から集約した代表音集合
```

`aggregated-note-set`を「元MIDIと同じ押さえ方」と表示しない。

## 3.5 抽出ノートをコード名へ無理に合わせない

元MIDIのノートを、現在のChordSymbolに合うよう強制的に削って「正しいVoicing」を作らない。

```text
元ノート集合
↓
現在コードとのcoverageを評価
↓
一致度が十分なら利用
不足なら確認待ち
```

誤検出コードから、元MIDIに存在しないボイシングを捏造しない。

## 3.6 コード編集後も元データを破棄しない

コードが変更され、Snapshotの取得時コードと不一致になった場合:

```text
Snapshotは保持
↓
stale / incompatible
↓
試聴・Dojoでは使用しない
↓
generated fallback
```

コードを元へ戻した場合、互換になれば再利用可能。

---

# 4. スコープ

## 4.1 実装するもの

- 保存コードイベントの安定ID
- `VoicingSnapshot`
- `sourceVoicing`
- `practiceVoicingOverride`
- simultaneous / aggregated区別
- chord compatibility判定
- stale判定
- MIDIからのVoicing抽出
- Voice Roleのsoft evidence利用
- Bass分離
- confidence
- Capture保存への統合
- 既存進行への後付け抽出
- Progression DetailのVoicing表示
- 鍵盤で記録
- 明示確認
- generated fallback
- 保存Voicingを使った進行試聴
- 出自チップ
- 旧データ互換
- Undo / Redo整合
- Chord Dojoが利用できる解決API
- 日本語 / English
- lint / test / typecheck / build / Tauri build

## 4.2 条件付き

- Capture候補の保存前Voicing preview
- 低confidence Snapshotの手動採用
- source Voicing再取得
- 進行全体のVoicing coverage表示
- Live MIDI接続の一時lease管理

## 4.3 対象外

- Chord Dojo本体
- L1〜L5
- 演奏判定
- 元MIDI全体の保存
- リズム・アルペジオパターン保存
- velocity・CC・音色の再現
- ピアノロール編集
- 五線譜
- 複数Voicing variant管理
- Voicing Library
- Voicing検索
- AI Voicing生成
- Chord Drip runtime依存
- PXF変更
- PXF往復
- 保存Voicingの自動移調
- Dojo L4 / L5向け移調
- fileVersion変更
- MIDI Analyzer mode変更
- LLM変更

---

# 5. Event Identity

## 5.1 監査

実装前に、永続化されるコードイベントが安定IDを持つか確認する。

候補対象:

- SavedProgressionBlock内のコードイベント型
- Progression Editingのslot型
- Capture candidateから保存イベントへの変換
- Live MIDI履歴から保存イベントへの変換
- LLM Advisor案から保存イベントへの変換

成果物:

```text
docs/phase3.8.5-event-identity-audit.md
```

## 5.2 推奨方式

保存イベントへoptionalな`eventId`を追加する。

概念例:

```ts
export interface SavedChordEvent {
  eventId?: string;

  bar: number;
  startBeat: number;
  durationBeats: number;
  chord: string;

  voicingMemory?: ChordVoicingMemory;
}
```

実際の既存型名を使用し、重複した新イベント型を作らない。

## 5.3 旧データ

旧イベントに`eventId`がない場合:

1. 読み込み時に決定的な一時IDを導出
2. blockを次に明示保存するときに永続IDを付与
3. 毎回ランダムなIDを生成しない
4. parseだけで無意味にdata.jsonを書き換えない

決定的一時IDの候補:

```text
legacy:{blockId}:{bar}:{startBeat}:{ordinal}
```

永続化時の新ID生成は、domainへ注入した`IdFactory`を使用する。

domain内で`Math.random()`や現在時刻へ直接依存しない。

## 5.4 ID規則

### コード置換

```text
eventIdを維持
Voicingはstale判定
```

### 挿入

```text
新しいeventId
Voicingなし
```

### 削除

```text
eventとVoicingを同時に削除
Undoで両方復元
```

### 分割

```text
前半は元eventIdを維持
後半は新eventId
後半Voicingは原則なし
```

単純コピーで元Voicingを2コードへ複製しない。

### 結合

```text
存続側eventIdを維持
他方のVoicingは削除
Undoで復元
```

両Voicingが同一である場合の最適化はMVPでは不要。

### 進行複製

- 新block IDを使用
- event IDも再生成
- Voicing Snapshotは複製してよい
- 参照は新event IDへ付け替える

---

# 6. データモデル

## 6.1 Source

```ts
export type VoicingSource =
  | "midi-extracted"
  | "live-played"
  | "chord-drip"
  | "manual";
```

Phase 3.8.5 MVPで主に使うもの:

```text
midi-extracted
live-played
```

`chord-drip`と`manual`は将来互換用。

## 6.2 Representation

```ts
export type VoicingRepresentation =
  | "simultaneous-voicing"
  | "aggregated-note-set";
```

## 6.3 Snapshot

```ts
export interface VoicingSnapshot {
  schemaVersion: 1;

  source: VoicingSource;
  representation: VoicingRepresentation;

  // 絶対MIDI note。昇順・同一note重複なし
  midiNotes: number[];

  // 存在する場合はmidiNotesにも含まれる
  bassNote?: number;

  // 取得時のChordSymbolを正規化した安定キー
  capturedForChordKey: string;

  // 元表示用。判定キーには使わない
  capturedForChordLabel?: string;

  confidence?: number;
  userVerified?: boolean;

  extractorVersion?: string;
}
```

## 6.4 Memory

```ts
export interface ChordVoicingMemory {
  sourceVoicing?: VoicingSnapshot;
  practiceVoicingOverride?: VoicingSnapshot;
}
```

保存イベントへ直接埋め込むことを第一候補とする。

```ts
event.voicingMemory?: ChordVoicingMemory;
```

イベントへ埋め込めない明確な理由が監査で判明した場合のみ、block内の`eventId → memory`構造を採用する。

`chordIndex`は禁止。

## 6.5 Schema invariant

- `midiNotes`は昇順
- 0〜127
- 同一MIDI note重複なし
- 2〜10音
- `bassNote`がある場合は`midiNotes`に含まれる
- `confidence`は0〜1
- `capturedForChordKey`は空文字禁止
- unknown fieldは既存方針に合わせて検証
- optional + Zod default
- `fileVersion = 1`

## 6.6 Normalized Chord Key

既存ChordSymbol正規化を再利用する。

含めるもの:

- root pitch class
- quality
- extensions
- alterations
- suspensions
- slash bass pitch class

異名同音だけの違いは同一キーへ正規化してよい。

次は別キーとして扱う。

```text
C6
Am7/C
```

構成音が同じでもコードの意味が異なるため。

---

# 7. Compatibility / Stale

## 7.1 判定

```ts
export function voicingCompatibility(
  snapshot: VoicingSnapshot,
  currentChord: ChordSymbol,
): VoicingCompatibility
```

```ts
export type VoicingCompatibility =
  | "compatible"
  | "stale"
  | "invalid";
```

### compatible

`capturedForChordKey`と現在Chordのnormalized keyが一致。

### stale

Snapshot自体は有効だが、取得時Chordと現在Chordが不一致。

### invalid

note範囲・schema・parse等が不正。

## 7.2 保存方法

`stale`を永続フィールドとして保存しない。

現在ChordとSnapshotから動的に計算する。

## 7.3 UI

```text
このボイシングは編集前のコード用です。
現在の試聴には使用していません。
```

操作:

- 元コードへ戻す
- 元MIDIから再取得
- 鍵盤で練習用Voicingを記録
- stale Snapshotを削除

MVPでは自動削除しない。

---

# 8. Voicing解決規則

## 8.1 Pure Resolver

```ts
export function resolveVoicingForUse(
  chord: ChordSymbol,
  memory: ChordVoicingMemory | undefined,
  generatedFallback: number[],
  options: VoicingResolveOptions,
): ResolvedVoicing
```

## 8.2 優先順位

```text
1. compatibleなpracticeVoicingOverride
2. compatibleで利用可能なsourceVoicing
3. generated fallback
```

## 8.3 Source Voicingの自動利用条件

初期方針:

### 自動利用可能

- `userVerified === true`
- または
- simultaneous-voicing
- confidenceが閾値以上
- compatible

### 確認待ち

- aggregated-note-set
- confidenceが閾値未満
- Role推定が不安定
- 音数や音域が極端

確認待ちSnapshotは保存・表示可能だが、既定試聴には自動使用しない。

ユーザーが明示選択・確認した場合は使用可能。

閾値は1か所へ集約する。

```ts
VOICING_AUTO_USE_CONFIDENCE
```

初期値は保守的に設定し、fixtureと実MIDI QAで調整する。

## 8.4 Resolved結果

```ts
export interface ResolvedVoicing {
  midiNotes: number[];

  origin:
    | "practice-override"
    | "source-verified"
    | "source-auto"
    | "generated";

  representation?: VoicingRepresentation;
}
```

Dojoは将来このResolverを再利用する。

---

# 9. MIDI抽出エンジン

## 9.1 Domain配置

```text
src/domain/voicing/
  types.ts
  normalizeVoicing.ts
  compatibility.ts
  resolveVoicing.ts
  extractSimultaneousVoicing.ts
  extractAggregatedNoteSet.ts
  scoreVoicingCandidate.ts
  extractionConfig.ts
  index.ts
```

React、Zustand、Tauriへ依存しない。

## 9.2 入力

```ts
export interface VoicingExtractionInput {
  chord: ChordSymbol;

  segment: {
    startBeat: number;
    endBeat: number;
  };

  notes: readonly TimedNote[];

  voices?: readonly Voice[];

  key?: KeySignature;
}
```

実際の既存型を再利用する。

## 9.3 前処理

### Hard exclude

- percussion
- 無効note
- segment外
- duration 0

### Soft evidence

```text
harmony / piano / guitar
→ 強い候補

pad
→ 補助候補

melody / lead
→ 大幅減点

bass
→ bassNote候補として分離

mixed
→ 低い信頼度で使用
```

Voice-aware Analyzerを既定化しない。

Roleは補助証拠であり、絶対判定ではない。

## 9.4 Simultaneous抽出

区間内のnote on/off境界をsweepし、実際に同時発音していた候補集合を作る。

候補scoreの例:

```text
+ chord core coverage
+ optional tone coverage
+ 同時発音継続時間
+ 強拍付近
+ harmony role evidence
+ bass compatibility

- foreign tone
- melody role
- low-register collision
- 過剰な音数
- 極端な音域
```

最上位候補を`simultaneous-voicing`として返す。

## 9.5 Aggregated抽出

十分な同時候補がない場合だけ実行する。

- 区間内の重み付きnoteを集約
- pitch classごとに代表音高を選ぶ
- オクターブ重複は強い場合のみ最大2音
- bass Voiceを分離
- 最大10音
- `aggregated-note-set`
- simultaneousよりconfidenceを下げる

これはアルペジオ等から作る代表音集合であり、「実際の同時押鍵」とは扱わない。

## 9.6 Chord coverage

コードトーン以外を先に削除しない。

まず元候補を作り、その後に評価する。

```ts
export interface ChordCoverageResult {
  requiredCoverage: number;
  optionalCoverage: number;
  foreignToneWeight: number;
  bassMatches: boolean;
}
```

コード要件は、将来Dojoでも使える共通domainへ置くことを検討する。

## 9.7 Confidence

入力例:

- required coverage
- optional coverage
- foreign tone比率
- simultaneous duration
- Voice Role確信度
- note count
- playable range
- bass一致

confidenceは0〜1。

ただしconfidenceを正解保証として表示しない。

UIでは原則:

```text
高
中
要確認
```

開発者詳細だけ数値表示可能。

## 9.8 抽出結果

```ts
export interface VoicingExtractionResult {
  snapshot?: VoicingSnapshot;

  status:
    | "usable"
    | "review"
    | "not-found";

  reasons: string[];
}
```

同じ入力から同じ結果を返す。

---

# 10. Capture保存への統合

## 10.1 実行タイミング

新規Candidate BlockをVaultへ保存するとき、保存対象コードごとに抽出する。

```text
Candidate Block
+
解析時TimedNote
+
source beat range
↓
Voicing Extraction
↓
保存イベント.voicingMemory.sourceVoicing
```

## 10.2 編集済みコード

Captureで検出コードを編集してから保存する場合、**現在の保存コード**と元ノートのcoverageを評価する。

coverage不足なら:

- 無理にChordへ合わせない
- review Snapshotとして保存するか、付与しない
- UIへ「元MIDIと現在コードの一致が低い」と表示可能

## 10.3 部分被覆

一部イベントだけSnapshotを持つ状態を正常扱いする。

```text
Voicingあり
Voicingなし
Voicingあり
Voicingなし
```

保存自体を失敗させない。

## 10.4 失敗

抽出失敗はブロック保存を妨げない。

```text
コード進行は保存
Voicingだけfallback
```

---

# 11. 既存進行への後付け抽出

## 11.1 入口

Progression Detail:

```text
[元MIDIからボイシングを取得]
```

## 11.2 条件

必要:

- source fingerprint / asset参照
- source start / end beat
- 元MIDIファイルが存在
- eventとsource区間を対応付け可能

## 11.3 挙動

- 現在開いている進行だけ処理
- Vault全体を自動再解析しない
- 抽出前に対象コード数を表示
- 既存sourceVoicingがある場合は確認
- practiceVoicingOverrideは上書きしない
- 変更はUndo可能
- 明示保存で永続化

## 11.4 元MIDI欠損

```text
元MIDIファイルを見つけられませんでした。
鍵盤で練習用ボイシングを記録できます。
```

再リンク機能が既存にない場合、このPhaseで大規模なsource管理UIを作らない。

---

# 12. 鍵盤で記録

## 12.1 目的

Progression Detailで、ユーザーが実際に弾ける配置を`practiceVoicingOverride`へ保存する。

## 12.2 Live MIDI再利用

既存`LiveMidiService`とnote stateを利用する。

新しい`midir`接続経路を作らない。

必要なら、接続所有権を安全に扱う一時session / leaseを追加する。

```text
既にLive MIDI接続済み
→ その接続を共有

未接続
→ preferred deviceへ接続

記録終了
→ この画面が開始した接続だけ解放
```

## 12.3 UI

```text
[鍵盤で記録]

MIDIキーボードで押さえてください
C3 E3 G3 B3 D4

構成音一致: OK
Bass: C3
安定: 100ms

[この押さえ方を使う]
[やり直す]
[キャンセル]
```

## 12.4 判定対象

- held noteだけ
- sustained noteは表示しても記録へ含めない
- 100ms安定
- MIDI note count 2〜10
- 現在Chordとの互換性を検証
- Bassを最低held noteとして記録

100ms安定しただけで自動保存しない。

ユーザーが`この押さえ方を使う`を押したときだけ編集sessionへ反映する。

## 12.5 保存値

```text
source: live-played
representation: simultaneous-voicing
userVerified: true
capturedForChordKey: 現在Chord
```

`sourceVoicing`を上書きせず、`practiceVoicingOverride`へ保存する。

---

# 13. Progression Detail UI

## 13.1 Selected Chord内のVoicingセクション

```text
ボイシング

使用中:
鍵盤で記録

C3  E3  G3  B3  D4
Bass: C3

[元MIDI]
[自動生成]
[鍵盤で記録]

元MIDIから再取得
練習用を解除
```

## 13.2 出自表示

```text
元MIDIのボイシング
元MIDIから推定した音構成
鍵盤で記録
Chord Drip
自動生成
```

## 13.3 Tooltip

```text
保存するのは音高とオクターブ配置です。
元の音色、ベロシティ、発音タイミング、アルペジオ順序は再現しません。
```

## 13.4 Keyboard visualizer

可能なら、Phase 3.9で使う鍵盤ビジュアライザを先行して共用componentとして実装する。

表示対象:

- 保存Voicing
- generated fallback
- Live held notes
- Bass
- stale warning

ただしDojo判定や進捗は実装しない。

## 13.5 Stale表示

```text
元MIDIのボイシングは編集前のコード用です。
現在は自動生成ボイシングを使用しています。
```

ボイシングを無言で削除しない。

---

# 14. 試聴統合

## 14.1 対象

- Vault進行行
- Progression Detail
- 保存済み進行の全体再生
- 必要ならCapture保存前preview

## 14.2 PlaybackController

既存の単一再生原則を維持する。

新しい独立音声経路を作らない。

## 14.3 API

既存試聴関数を監査し、明示Voicingを渡せるようにする。

概念例:

```ts
playChord({
  chord,
  explicitMidiNotes,
  sourceId,
});
```

```ts
playProgression({
  events,
  resolveVoicing,
});
```

## 14.4 解決

```text
practice override
→ verified / high-confidence source
→ generated fallback
```

## 14.5 UIチップ

```text
鍵盤で記録
元MIDI
推定
自動
```

現在鳴っている由来を隠さない。

## 14.6 Quick Editor

Quick Editor内の別Chord候補試聴は、現在どおり候補用generated Voicingでよい。

旧コード用Snapshotを別候補へ流用しない。

---

# 15. Smoothとの連携

Phase 3.8.5 MVPでは、Smoothロジックの順位を全面変更しない。

準備するもの:

```ts
resolveActualOrCanonicalVoicing(
  event,
): number[]
```

後続でSmoothが次を利用できるようにする。

```text
実Voicingが互換・利用可能
→ 実Voicingで評価

ない
→ canonical Voicing
```

Phase 3.8.5でSmoothの既存候補順を変える場合は、別PR・回帰評価を必須とする。

MVPでは解決API提供まででよい。

---

# 16. 永続化と互換性

## 16.1 Schema

追加フィールドはoptional。

- `eventId?`
- `voicingMemory?`
- Snapshot内optional fields

Zod defaultを適切に設定する。

`fileVersion = 1`を維持する。

## 16.2 旧data.json

- Voicingなしで正常読込
- generated fallback
- Dojo将来利用可能
- 読込時に勝手な全件書換をしない

## 16.3 保存経路

```text
Progression Detail / Capture
↓
既存store action
↓
applyVaultChange()
↓
autosave
↓
backup
```

repositoryへ直接書かない。

## 16.4 データ量

1 eventにつき最大10音と小さなmetadata。

1ブロック数百バイト程度を目安にする。

元MIDI全体・ノート列全体を複製しない。

---

# 17. 性能

## 17.1 抽出

- 新規保存時に対象ブロックだけ
- 後付け時に現在の進行だけ
- 全Vaultを自動再解析しない
- 同じsource / range / extractor versionはセッション内cache可能

## 17.2 試聴

配列参照とResolverのみ。

## 17.3 UI

- Keyboard visualizerは必要なnoteだけ描画
- Live MIDIイベントでProgression Detail全体を再renderしない
- 記録session中だけ購読する

## 17.4 目標

- 8小節ブロック抽出: 体感待ちなし
- 100イベント程度でもUI停止なし
- data.jsonの顕著な肥大なし

---

# 18. Privacy / Security

- 新しい外部通信なし
- 新しいOS権限なし
- MIDI bytesを保存しない
- 絶対パスをSnapshotへ保存しない
- 鍵盤演奏は明示操作時だけ保存
- 押鍵履歴や練習履歴を保存しない
- LLMへVoicingを送信しない
- Phase 3.8.0 Providerへ影響を与えない

---

# 19. 実装Stage

## Stage V0 — Audit

- 保存イベント型
- stable ID
- insert / split / merge / duplicate規則
- Capture保存時のTimedNote寿命
- source再解決
- Voice Role利用可否
- current playback API
- LiveMidiService共有
- Chord Drip / PXF strictness
- old data

成果物:

```text
docs/phase3.8.5-voicing-audit.md
```

## Stage V1 — Event Identity / Schema

- eventId
- legacy ID導出
- injected IdFactory
- `VoicingSnapshot`
- `ChordVoicingMemory`
- source / practice分離
- normalization
- compatibility / stale
- optional Zod
- old data tests

## Stage V2 — Extraction Engine

- simultaneous sweep
- aggregated fallback
- role soft weighting
- bass separation
- chord coverage
- confidence
- max notes
- deterministic fixture
- source result

## Stage V3 — Capture / Re-extraction

- new Capture save
- partial coverage
- extraction failure fallback
- source metadata
- existing block re-extract
- Undo
- missing source message

## Stage V4 — Progression Detail / Live Played Override

- Voicing section
- source labels
- keyboard visualizer
- stale UI
- Live MIDI lease
- held-only capture
- 100ms stable
- explicit confirm
- practice override
- clear / reset

## Stage V5 — Playback Integration

- Resolver
- explicit MIDI notes
- progression playback
- Vault / Detail chips
- single playback
- generated fallback
- Quick Editor regression

## Stage V6 — QA / Handoff to Dojo

- old data
- single piano
- bass + piano
- multi-instrument Type 0
- pad + melody
- arpeggio
- slash chord
- stale
- source missing
- live played
- restart
- installer
- Dojo resolver contract
- final report

---

# 20. MVP

Phase 3.8.5の製品MVPはV0〜V5。

```text
新規MIDIを採集
↓
具体的Voicingを保存
↓
再起動
↓
Progression Detailで確認
↓
元MIDIまたは鍵盤で記録した配置で試聴
↓
コード編集後はstaleになり自動fallback
```

V1＋V2だけは内部マイルストーンであり、ユーザーへ出荷する単位にはしない。

ユーザーが抽出結果を確認できない状態で、抽出Voicingを無条件に試聴へ使わない。

---

# 21. Phase 3.8.5対象外・後続

## Phase 3.8.5.1候補

- PXF Voicing
- Chord Drip往復
- PXF双方schema audit
- 複数Voicing variant
- sourceVoicing履歴

## Phase 3.9以降

- Chord Dojo L1ガイド
- 「この押さえ方で」厳格判定
- required / optional tone判定
- L4 / L5移調
- 進行全体で一貫したoctave offset
- Voicing練習

## 将来

- Voicing Library
- 類似Voicing検索
- 作者Voicing傾向
- 左右手hint
- リズム付き演奏断片
- AI Voicing提案

---

# 22. Migration / Rollback

## Migration

- schema追加はoptional
- 旧データmigration不要
- eventIdは必要時に段階付与
- 全Vault一括変換なし

## Rollback

問題があれば:

- Voicing UIをfeature flagで非表示
- Resolverをgenerated fallback固定
- optional fieldは放置
- 旧版は未知optional fieldを許容することを確認
- source MIDI解析・コードデータは影響なし

コード編集でSnapshotを即削除しないため、rollback時にも元情報が残る。

---

# 23. Codexマスタープロンプト

```text
あなたはLoop Vault
（React + TypeScript + Vite + Tauri v2 + Zustand + Zod）
のPhase 3.8.5を実装します。

仕様の正は
docs/phase3.8.5-voicing-memory-foundation-plan.md
です。

目的:
元MIDIまたはユーザーの鍵盤演奏から、
各コードの具体的なMIDI note配置を小さなSnapshotとして保存し、
Progression Detailと試聴、将来のChord Dojoで利用できる
Voicing Memory基盤を作る。

絶対に守ること:

1. chordIndexを永続キーに使わない。
2. 保存コードイベントへ安定eventIdを持たせる。
3. 既存のevent型を再利用し、重複モデルを作らない。
4. sourceVoicingとpracticeVoicingOverrideを分ける。
5. 鍵盤で記録してもsourceVoicingを消さない。
6. simultaneous-voicingとaggregated-note-setを区別する。
7. aggregatedを「元MIDIと同じ押さえ方」と表示しない。
8. midiNotesは絶対MIDI noteとして保存する。
9. bassNoteは存在時にmidiNotesへ含める。
10. 自動生成Voicingを保存しない。
11. 元MIDI全体・全ノートイベントを保存しない。
12. コードトーンだけへ先にfilterして元Voicingを捏造しない。
13. 元ノート集合とChordのcoverageを評価する。
14. percussionは除外する。
15. melody / leadはsoft evidenceで減点する。
16. Voice Roleを絶対判定として使わない。
17. simultaneous候補を優先し、なければaggregatedへfallbackする。
18. 低confidenceをVerified扱いしない。
19. 低confidence / aggregatedを既定試聴へ無条件使用しない。
20. コード編集時にSnapshotを自動削除しない。
21. capturedForChordKey不一致はstaleとして利用停止する。
22. staleは動的判定し、保存フラグにしない。
23. practice override → source → generatedの順で解決する。
24. 右クリック候補など別Chordへ旧Voicingを流用しない。
25. 鍵盤で記録は既存LiveMidiServiceを再利用する。
26. 新しいmidir接続経路を作らない。
27. held noteだけを記録し、sustainedを含めない。
28. 100ms安定後も自動保存せず、ユーザー確認を要求する。
29. PlaybackControllerの単一再生を維持する。
30. 保存は既存store actionとapplyVaultChangeを通す。
31. repositoryへ直接書かない。
32. fileVersionを上げない。
33. 旧data.jsonを読めること。
34. PXFをMVPで変更しない。
35. 保存Voicingの自動移調をMVPで実装しない。
36. Chord Dojo本体を実装しない。
37. LLM / OpenAI / Ollamaを変更しない。
38. MIDI Analyzer mode・重みを変更しない。
39. 日本語 / Englishを実装する。
40. domainをReact / Zustand / Tauri非依存にする。
41. 同じ入力から同じ抽出結果を返す。
42. 各Stageでlint / test / typecheck / buildを通す。

Event ID規則:
- replace: 維持
- insert: 新規
- delete: event+memory削除、Undo復元
- split: 前半維持、後半新規・memoryなし
- merge: 存続event維持
- duplicate block: eventId再生成、Snapshot複製

作業開始前:
- 現行Saved event型
- edit sessionのID
- insert / split / merge
- TimedNoteの寿命
- source再解決
- Voice Role
- playback API
- Live MIDI connection ownership
- schema影響
- risks
を報告する。

作業終了時:
- event identity
- data model
- extraction algorithm
- confidence rules
- Capture integration
- re-extraction
- Live played override
- stale behavior
- playback fallback
- old data compatibility
- fixture結果
- manual QA
- 未解決事項
を報告する。

コミット:
P3.8.5-VX: 要約
```

---

# 24. テスト

## 24.1 Event Identity

- old event without ID
- deterministic temporary ID
- save ID
- replace preserves ID
- insert gets new ID
- delete / Undo
- split
- merge
- duplicate
- reorder
- selectedSlotId integration

## 24.2 Schema

- valid snapshot
- note < 0
- note > 127
- duplicate note
- unsorted input normalization
- over 10 notes
- bass not in notes
- invalid confidence
- missing chord key
- old data
- unknown source / representation

## 24.3 Compatibility

- exact
- enharmonic
- root changed
- quality changed
- tension changed
- slash bass changed
- C6 vs Am7/C
- stale returns after revert
- invalid snapshot

## 24.4 Extraction

- block chord
- inversion
- bass + piano
- guitar + bass
- pad
- melody mixed
- percussion
- Type 0
- octave doubling
- over 10 notes
- arpeggio
- no simultaneous candidate
- foreign tone
- wrong detected chord
- low confidence
- deterministic

## 24.5 Capture

- all events extracted
- partial extraction
- no extraction
- edited chord coverage mismatch
- save success
- save failure
- autosave
- backup

## 24.6 Re-extraction

- source found
- source missing
- existing source snapshot
- practice override preserved
- Undo
- explicit save
- range mapping

## 24.7 Live Played

- preferred device
- already connected
- temporary connection
- held notes
- sustain ignored
- 100ms stable
- explicit confirm
- cancel
- incompatible notes
- source preserved
- practice saved
- disconnect

## 24.8 Playback

- practice override
- verified source
- high-confidence simultaneous
- low-confidence source fallback
- aggregated fallback
- stale fallback
- generated
- whole progression
- single playback
- Quick Editor unchanged

## 24.9 Regression

- MIDI analysis
- Candidate selection
- Quick Editor
- Smooth / Style
- Library
- Live MIDI Mini Mode
- Progression Advisor
- Import / Export
- Backup
- close flush
- Japanese / English

---

# 25. 人間側QA

## 新規採集

1. ピアノMIDIを解析
2. 4〜8小節を保存
3. 再起動
4. 各コードのVoicing noteを確認
5. 元MIDIチップで試聴
6. generatedへ切り替えて差を確認

## 多楽器MIDI

- Bass
- Piano
- Guitar
- Pad
- Melody
- Drums

確認:

- Drumsを含まない
- Melody高音を無制限に含まない
- Bassが識別される
- 10音以下
- 要確認表示が妥当

## アルペジオ

- `aggregated-note-set`
- 元MIDIと同じ同時押鍵と表示しない
- 既定自動利用ルールを確認

## 鍵盤で記録

1. 2番目以降のコードを選択
2. 鍵盤で記録
3. 100ms安定
4. 明示確定
5. sourceVoicingが残る
6. practice overrideが試聴へ反映
7. Undo
8. 再保存・再起動

## Stale

1. Voicingありコードを編集
2. Snapshotが消えない
3. stale警告
4. generatedで試聴
5. 元コードへ戻す
6. sourceが再利用される

## 元MIDI欠損

- 再取得が安全に失敗
- 既存Snapshotは残る
- 鍵盤記録案内

---

# 26. 受け入れ条件

## Identity / Data

- chordIndexを使わない
- eventIdが編集後も正しく維持される
- source / practiceを別保存
- simultaneous / aggregatedを区別
- capturedForChordKeyを保持
- staleを動的判定
- old dataを読める
- fileVersion 1

## Extraction

- ピアノMIDIから絶対音高を抽出
- Bassを識別
- percussion除外
- melody soft除外
- chord coverage評価
- 誤検出コードへ無理に合わせない
- 低confidenceを強い正解扱いしない
- 同じ入力で決定的

## UI

- Progression DetailでVoicingを確認
- 出自が分かる
- 元MIDI / 推定 / 鍵盤 / 自動を区別
- 鍵盤で記録
- stale警告
- source再取得
- generated fallback

## Playback

- practice → source → generated
- 旧Snapshotを別Chordへ使わない
- whole progressionで利用
- PlaybackControllerを維持
- Quick Editorへ退行なし

## Persistence

- 既存store action
- applyVaultChange
- autosave
- backup
- Undo / Redo
- 元MIDI全体を保存しない
- data増加が小さい

## Boundary

- Chord Dojo本体なし
- PXF変更なし
- 自動移調なし
- LLM変更なし
- Analyzer mode変更なし
- Live MIDI Mini Mode回帰なし

## Quality

- lint
- tests
- typecheck
- Web build
- Tauri build
- installer
- final report

---

# 27. 最終メッセージ

Phase 3.8.5で保存するのは、単なる解析中間データではない。

```text
元MIDIで気に入った音高配置
または
ユーザー自身が弾いて採用した押さえ方
```

という、後から再計算できない制作資産である。

```text
コード名を採集
+
気に入った音高配置も採集
↓
同じ響きで聴き直す
↓
Phase 3.9で鍵盤ガイドとして使う
```

**Loop Vaultを「コード進行の記録庫」から「響きの形まで残せるVault」へ進化させる。**

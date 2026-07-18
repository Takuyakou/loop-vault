# Loop Vault Phase 3.7.1 Codex作業指示書
## Progression Detail・Quick Chord Editor・Smart Library・自動分類

---

## 0. 結論

Phase 3.7.1では、Loop Vaultの中心資産である「保存済みコード進行」を第一級の編集対象にする。

今回の完成形は次の循環である。

```text
進行を探す
↓
進行そのものを大きく見る
↓
聴く
↓
コードを素早く直す
↓
客観的な特徴で自動分類する
↓
Libraryから再発見する
```

本Phaseの主役は以下の4つ。

1. **Progression Detail**
2. **Quick Chord Editor**
3. **Progression Index + 派生タグ**
4. **一覧 / ライブラリ切替**

Mood推定は補助機能として最後に実装し、品質が不十分なら切り離して延期できる構成にする。

Phase 3.7.1のテーマ:

**「保存した進行に、見る・聴く・直す・探し直すための家を与える」**

---

# 1. 前提

現行Loop Vaultには以下が存在する。

- React
- TypeScript
- Vite
- Tauri 2
- Zustand
- Zod
- Windowsデスクトップ向け
- Vault高密度進行リスト
- Idea一覧
- Vaultキーボード操作
- MIDIファイル解析
- Candidate Blocks
- Progression Editing Workspace
- `original / current`編集モデル
- Chord Inspector
- Undo / Redo
- コード試聴
- Quick候補
- Vault保存
- Live MIDI Mini Mode
- 共通PlaybackController
- 共通Modal
- 汎用Undo
- 自動保存
- Backup / Import / Export
- 日本語 / English
- Lucideアイコン
- `SavedProgressionBlock`
- Chord Drip連携用データ境界

本Phaseでは、既存の高密度Vault一覧、保存経路、Live MIDI、MIDI解析、Undo、Backupを壊さない。

---

# 2. 現状の問題

## 2.1 詳細画面が進行を主役にしていない

現在の詳細画面は以下が中心になっている。

- ステータス
- 次の一手
- 参考曲
- 関連ファイル
- 履歴
- メタ情報

これは実質的にIdea Detailである。

保存済みコード進行を開いても、以下がファーストビューにない。

- コードグリッド
- 試聴
- コード編集
- Key / BPM
- 度数
- タグ
- 出自

## 2.2 保存後の進行を直しにくい

採集画面には編集ワークスペースがあるが、保存後の進行には編集の主戦場がない。

## 2.3 大量登録時に探索しにくい

現在のフラットリストは検索には強いが、目的語のない探索に弱い。

```text
何かDreamyな進行
分数コードがある進行
最近保存したLive MIDI由来の進行
```

をカテゴリから探しにくい。

## 2.4 Quick編集が不足

コードカードから直接、

- 候補を聴く
- Rootを変える
- Qualityを変える
- Bassを変える
- 適用する

という短い修正経路が不足している。

## 2.5 Header右側が混雑

以下が近接している。

- + Idea
- Live MIDI
- 保存状態
- Settings

操作・状態・ツールの主従を整理する必要がある。

---

# 3. 設計原則

## 3.1 IdeaとProgressionを分離する

```text
Idea Detail
→ 制作を進める画面

Progression Detail
→ コード進行を聴く・直す・分類する画面
```

## 3.2 既存編集ワークスペースを再利用する

Progression Detail用に別のコード編集UXを作らない。

CaptureとProgression Detailで以下を共通化する。

- Progression Grid
- Chord Card
- Inspector
- Quick Editor
- Undo / Redo
- Preview
- Root / Quality / Bass
- alternatives

## 3.3 Libraryは保存構造ではなく表示構造

Libraryのために`SavedProgressionBlock`を独立トップレベルentityへ移行しない。

派生インデックスで実現する。

## 3.4 物理フォルダを作らない

1つの進行は複数カテゴリへ所属できるため、スマート分類を使う。

## 3.5 自動分類は客観情報を主役にする

```text
主役:
Source
Harmonic Feature
Use

補助:
Mood
```

コード進行だけではMoodを確定できないため、Moodは最大2件・信頼度ゲート付きとする。

## 3.6 自動タグと手動タグを混ぜない

- 手動タグは自動処理が変更しない
- 自動タグは動的計算
- ユーザーが消した自動タグは抑制情報として保持
- 抑制後は再解析でも復活しない

## 3.7 Quick Editorは右クリック専用にしない

入口:

- Enter
- hover編集アイコン
- 右クリック
- Shift + F10
- Inspector内編集

すべて同じ編集セッションを操作する。

---

# 4. Phaseスコープ

## 4.1 必須

- Progression Detail新設
- Idea Detailとの役割分離
- Vault進行行からProgression Detailへ遷移
- 保存済み進行の編集
- Quick Chord Editor
- CaptureとProgression Detailで共用
- 右クリック
- hover編集アイコン
- キーボード操作
- 派生タグエンジン
- Source分類
- Harmonic Feature分類
- Use分類
- 手動タグ
- 自動タグ抑制
- taxonomy version
- Progression Index
- Vault内の「一覧 / ライブラリ」切替
- Libraryカテゴリレール
- 大量データ対応
- Header整理
- 日本語 / English
- 旧data.json互換
- lint / test / typecheck / build / Tauri build

## 4.2 条件付き

- Mood推定v1
- My Collections
- PXF taxonomy連携
- Chord Dripで開く導線

## 4.3 対象外

- SavedProgressionBlockの独立entity化
- 物理フォルダ
- Verse / Chorusの自動判定
- AI / LLMによるMood分類
- 別repositoryへのruntime依存
- タグ一括編集
- Libraryドラッグ並べ替え
- クラウド同期
- fileVersion変更
- MIDI解析アルゴリズム変更
- Live MIDI変更
- PlaybackController変更

---

# 5. 情報設計

## 5.1 Vault

```text
Vault
├─ 進行
│   ├─ 一覧
│   └─ ライブラリ
└─ Idea
```

グローバルタブは増やしすぎない。

ユーザーが希望する「ライブラリ」という明示的な表示は、進行内の表示切替として提供する。

## 5.2 一覧

現行の高密度リストを維持。

用途:

- 検索
- フィルタ
- 並び替え
- キーボード高速操作

## 5.3 ライブラリ

左カテゴリレール + 右進行リスト。

用途:

- 目的語のない探索
- カテゴリから探す
- スマート分類
- 最近・お気に入り・出自から探す

## 5.4 詳細

```text
Idea Detail
Progression Detail
```

両者を別画面として扱う。

---

# 6. Progression Detail

## 6.1 遷移

Vault進行行の以下からProgression Detailを開く。

- Enter
- 行末Open
- double-click
- context menu

IdeaへはProgression Detail内の「親Ideaを開く」から移動する。

## 6.2 ファーストビュー

開いた直後に必ず見えるもの。

- コード進行タイトル
- コードグリッド
- 再生 / 停止
- Key
- BPM
- 小節数
- 度数表示
- 編集導線
- 保存状態

## 6.3 ワイヤーフレーム

```text
┌─────────────────────────────────────────────────────────────┐
│ ← Vault   コード進行 main - turnaround      [親Idea] […]    │
│                                                             │
│ [▶ 再生] [音色: ピアノ] [Key F# major] [76 BPM] [4小節]     │
├────────────────────────────────────┬────────────────────────┤
│                                    │ 選択中のコード          │
│ [ A6 ] [ Gmaj7 ]                   │                        │
│ [ F#m11 ] [ B7 ]                   │ 保存済み: F#m11        │
│                                    │ 編集中:   F#m9         │
│                                    │                        │
│                                    │ 候補                   │
│                                    │ [F#m9] [Amaj7/F#]      │
│                                    │                        │
│                                    │ Root    F#             │
│                                    │ Quality m9             │
│                                    │ Bass    —              │
│                                    │                        │
│                                    │ [試聴] [適用]          │
│                                    │ [保存済みに戻す]       │
├────────────────────────────────────┴────────────────────────┤
│ 手動タグ: [neo-soul ×] [+追加]                             │
│ 自動分類: [Maj7/9 自動] [Slash Bass 自動]                  │
│ 用途: [Turnaround]                                         │
├─────────────────────────────────────────────────────────────┤
│ 出自: MIDI Capture · my_song.mid · 17–24小節               │
│ 親Idea: コード進行 main                                    │
└─────────────────────────────────────────────────────────────┘
```

## 6.4 Captureとのラベル差

Capture:

```text
元の検出
現在
```

Progression Detail:

```text
保存済み
編集中
```

元解析情報が存在する場合のみ補助表示する。

```text
最初の検出
保存済み
編集中
```

## 6.5 レスポンシブ

- xl以上: 右Inspector
- xl未満: 下部sticky Inspector
- Captureと同じ規約
- 中幅で操作方法を変えない

## 6.6 保存

Progression Detailの編集は保存済みブロックを更新する。

必須:

- 既存store action
- `applyVaultChange()`
- autosave
- backup
- Undo
- 変更差分
- correction logとの整合

repositoryへ直接書かない。

---

# 7. Quick Chord Editor

## 7.1 目的

1コードの修正を、Inspectorを開き直さず短時間で完了する。

## 7.2 共用範囲

- Capture Candidate
- Progression Detail
- 将来のChord Drip連携面

## 7.3 入口

| 操作 | 挙動 |
|---|---|
| 左クリック | カード選択、Inspector更新 |
| Enter | Quick Editorを開く |
| hoverの編集アイコン | Quick Editorを開く |
| 右クリック | Quick Editorを開く |
| Shift + F10 | Quick Editorを開く |
| double-click | 使用しない |

右クリックだけに依存しない。

## 7.4 UI

```text
┌──────────────────────────────┐
│ G7                           │
│                              │
│ 候補                         │
│ [1 G13] [2 G7sus4] [3 Db7/G] │
│                              │
│ Root      [◀ G ▶]            │
│ Quality   [7 ▼]              │
│ Bass      [— ▼]              │
│                              │
│ [Space 試聴]                 │
│ [Enter 適用] [Esc 閉じる]    │
│ [保存済みに戻す]             │
│ [詳細編集]                   │
└──────────────────────────────┘
```

## 7.5 キーボード

```text
1〜5
→ 候補をプレビュー選択

Space
→ 試聴

← / →
→ Rootを半音移動

Enter
→ 確定

Esc
→ 破棄して閉じる

U
→ 保存済み / 元検出へ戻す

E
→ 詳細Inspectorへ
```

数字キーで即確定しない。

## 7.6 編集状態

Quick EditorとInspectorで別のdraftを持たない。

```ts
interface ProgressionEditSession {
  selectedSlotId?: string;
  previewChord?: ChordSymbol;
  appliedChord?: ChordSymbol;
  history: ProgressionEditOperation[];
}
```

入口が違っても同じcommandを使う。

## 7.7 ポップオーバー位置

- カードへ吸着
- 画面端では反対方向へflip
- viewport外へ出さない
- Inspector / Undo toastと重ならない
- Escで閉じる
- focus trap
- focus restore

---

# 8. Taxonomy v1

新設:

```text
docs/taxonomy-v1.md
src/domain/progressionClassification/taxonomy.ts
```

## 8.1 安定ID

表示名ではなく、安定したIDを使う。

例:

```text
source.midi-capture
source.live-midi
source.chord-drip
feature.maj7-9
feature.minor9-11
feature.slash-bass
feature.chromatic
feature.secondary-dominant
feature.altered
feature.diatonic
use.intro
use.main
use.turnaround
mood.dreamy
mood.warm
```

日本語 / English表示名が変わってもIDを変えない。

## 8.2 カテゴリ

```ts
export type ProgressionTagCategory =
  | "source"
  | "feature"
  | "use"
  | "mood"
  | "collection";
```

## 8.3 Source

決定的に判定。

```text
MIDI Capture
Live MIDI
Chord Drip
Manual
```

## 8.4 Harmonic Feature

客観的に判定可能なもの。

- Maj7 / 9
- Minor 9 / 11
- Slash Bass
- Diminished
- Augmented
- Altered
- Dominant-heavy
- Secondary Dominant
- Diatonic
- Chromatic
- Modal Mixture

Keyが必要なfeatureは、Keyがない場合は付与しない。

## 8.5 Use

自動判定は限定する。

取得元:

- Candidate Block label
- 保存時の用途
- ユーザー手動指定
- Chord Drip metadata

自動候補:

- Intro
- Main
- Turnaround
- Variation
- Loop
- Vamp

Verse / Chorus / Bridge / Endingは原則手動。

## 8.6 Mood

Phase後半の条件付き機能。

例:

- Bright
- Dark
- Dreamy
- Warm
- Tense
- Mysterious
- Floating
- Dramatic

制約:

- 最大2件
- 閾値未満なら付与しない
- 自動と明示
- 完全正解を装わない
- MoodだけでLibraryを成立させない

---

# 9. 自動分類データモデル

## 9.1 派生タグ

自動タグは保存しない。

```ts
export interface DerivedProgressionTag {
  tagId: string;
  category: ProgressionTagCategory;
  source: "derived";
  confidence?: number;
  taxonomyVersion: number;
  reasons: string[];
}
```

## 9.2 手動タグ

既存`tags`を維持するか、名前空間付きタグへ拡張する。

推奨内部表現:

```text
use:turnaround
mood:dreamy
collection:album-a
```

UIにはprefixを表示しない。

## 9.3 Useは複数対応

単数の`useTag?: string`は採用しない。

```ts
manualUseTags?: string[];
```

または既存tagsのnamespaceで表現する。

## 9.4 自動タグ抑制

```ts
export interface SuppressedAutoTag {
  tagId: string;
  taxonomyVersion: number;
}
```

```ts
SavedProgressionBlock {
  suppressedAutoTags?: SuppressedAutoTag[];
}
```

optional + Zod default。

fileVersionは変更しない。

## 9.5 挙動

```text
自動タグを×
→ suppressionへ追加
→ 現在表示から消える
→ 再解析しても復活しない

手動タグ追加
→ 常に保持
→ 自動処理は変更しない

手動タグ削除
→ 手動タグだけ削除
```

## 9.6 taxonomy変更

taxonomy versionが変わっても、旧suppressionを勝手に破棄しない。

移行ルールを明示する。

初期仕様:

```text
同一tagIdが新versionにも存在
→ suppressionを維持

tagId廃止
→ 非表示のまま保持またはmigration mapで変換
```

---

# 10. 派生タグエンジン

配置:

```text
src/domain/progressionClassification/
  taxonomy.ts
  deriveSourceTags.ts
  deriveFeatureTags.ts
  deriveUseTags.ts
  deriveMoodTags.ts
  suppression.ts
  types.ts
  index.ts
```

React / Zustand / Tauriをimportしない。

## 10.1 入力

```ts
export interface ProgressionClassificationInput {
  block: SavedProgressionBlock;
  key?: KeySignature;
  sourceMetadata?: ProgressionSourceMetadata;
}
```

## 10.2 出力

```ts
export interface ProgressionClassificationResult {
  sourceTags: DerivedProgressionTag[];
  featureTags: DerivedProgressionTag[];
  useTags: DerivedProgressionTag[];
  moodTags: DerivedProgressionTag[];
}
```

## 10.3 決定性

- Math.random禁止
- 現在時刻依存禁止
- 同じ入力は同じ結果
- analyzerVersion / taxonomyVersionを保持

---

# 11. Progression Index

## 11.1 目的

保存構造を変更せず、全Ideaの進行を高速検索・分類する。

## 11.2 型

```ts
export interface ProgressionIndexEntry {
  id: string;
  ideaId: string;
  blockId: string;

  block: SavedProgressionBlock;

  normalizedChordText: string;
  romanNumeralText: string;
  normalizedSearchText: string;

  manualTags: string[];
  derivedTags: DerivedProgressionTag[];
  effectiveTags: string[];

  key?: string;
  bpm?: number;
  bars?: number;
  origin?: string;
  favorite: boolean;
  createdAt?: string;
  updatedAt?: string;
}
```

## 11.3 ID

```text
`${ideaId}:${blockId}`
```

## 11.4 構築

- 起動時に全Ideaから構築
- 保存時に増分更新
- 削除時に除去
- Idea更新時に関連entryだけ更新
- taxonomy更新時に再構築

## 11.5 非永続

Indexはdata.jsonへ保存しない。

## 11.6 性能目標

1,000進行:

- 初期index構築: 100ms以内目標
- 検索 / filter: 100ms以内
- レール件数更新: 100ms以内
- スクロール: 60fps目標
- 200行超でvirtualization

---

# 12. Vault「一覧 / ライブラリ」切替

## 12.1 UI

```text
進行

[一覧] [ライブラリ]
```

## 12.2 一覧モード

現在の画面を維持。

- フル幅
- 高密度
- 検索
- filters
- keyboard
- sorting

## 12.3 ライブラリモード

```text
┌ Library ─────────┬ 進行一覧 ─────────────────────┐
│ すべて            │                              │
│ お気に入り        │                              │
│ 最近追加          │                              │
│                   │                              │
│ ▸ 和声特徴        │                              │
│ ▸ 用途            │                              │
│ ▸ Mood            │                              │
│ ▸ 出自            │                              │
│ ▸ コレクション    │                              │
└──────────────────┴──────────────────────────────┘
```

## 12.4 カテゴリレール

- 件数
- 折りたたみ
- 複数選択
- AND / OR方針
- 選択内容をfilter chipへ反映
- 検索語と併用
- 既存ソートと併用

初期仕様:

```text
同カテゴリ内: OR
異カテゴリ間: AND
```

例:

```text
Mood: Dreamy OR Warm
AND
Feature: Slash Bass
AND
Source: Live MIDI
```

## 12.5 狭幅

- レールをdrawerへ格納
- 一覧モードへ自動切替しない
- filter chipを維持
- 選択状態を保持

## 12.6 検索状態

一覧 / ライブラリ切替で以下を維持する。

- search text
- sort
- duration filter
- favorite
- selected row
- playback state

---

# 13. Header整理

## 13.1 推奨配置

```text
[＋ Idea]    │    [Live MIDI] [設定]    │    [✓ 保存済み]
```

または現行幅に合わせて、

```text
[＋ Idea]    [Live MIDI]    │    [✓ 保存済み] [設定]
```

原則:

- primaryは`+ Idea`だけ
- Live MIDI / Settingsはghost
- 保存状態は操作群と距離を空ける
- group間16〜20px
- button間8px
- 全iconにtooltip
- 狭幅では保存状態をicon化可能
- 通常幅ではテキストを維持

## 13.2 Progression固有操作

Headerへ置かない。

Progression Detail内へ置く。

- 再生
- Chord Dripで開く
- 複製
- 削除
- PXF出力

通常表示:

```text
Chord Dripで開く
```

詳細menu:

```text
PXFとして書き出す
```

---

# 14. Chord Dripとの共通化

## 14.1 共通仕様

- taxonomy ID
- taxonomy category
- 日本語 / English表示
- PXFのtag表現
- Root / Quality / Bass操作思想
- Quick候補の表現

## 14.2 実装共有

Phase 3.7.1ではruntime package化しない。

`taxonomy-v1.md`を両repositoryへ複製し、仕様を合わせる。

## 14.3 PXF

候補:

```ts
taxonomyVersion?: "1";
tags?: string[];
```

既存互換を壊さないoptional field。

Phase 3.7.1で必須ではない。

---

# 15. データ変更

## 15.1 永続化追加候補

```ts
suppressedAutoTags?: SuppressedAutoTag[];
manualUseTags?: string[];
```

ただし`manualUseTags`は既存tagsのnamespaceで代替可能なら追加しない。

## 15.2 Zod

- optional
- default []
- max count
- stable tag ID validation
- taxonomyVersion integer

## 15.3 fileVersion

変更しない。

## 15.4 旧data.json

そのままparseできること。

## 15.5 自動タグ

保存しない。

---

# 16. 実装Stage

## Stage S0 — Audit

監査:

- VaultView
- DetailView
- CaptureView
- Progression Editing Workspace
- SavedProgressionBlock
- Idea ownership
- store actions
- autosave
- Undo
- correction log
- Chord Drip taxonomy
- PXF
- i18n
- 1,000件性能
- Header

成果物:

```text
docs/phase3.7.1-audit.md
```

## Stage S1 — Progression Detail

- route / view state
- Vault行遷移
- 親Idea導線
- Grid / Inspector再利用
- 保存済み → 編集中ラベル
- playback
- autosave
- Undo
- responsive
- i18n

## Stage S2 — Quick Chord Editor

- 共用component
- Enter
- hover icon
- right-click
- Shift+F10
- candidate preview
- Root / Quality / Bass
- Space preview
- Enter apply
- Esc cancel
- same edit session
- focus / placement
- tests

## Stage S3 — Taxonomy / Derived Tags / Index

- taxonomy-v1
- stable IDs
- source
- feature
- use
- suppression
- optional schema
- ProgressionIndex
- incremental update
- tag UI
- tests

## Stage S4 — Library

必須Stage。

- 一覧 / ライブラリ切替
- category rail
- counts
- filter chips
- combined search
- virtualization
- narrow drawer
- keyboard
- performance tests

## Stage S5 — Mood / Header Polish

条件付き。

- mood rules
- max 2
- threshold
- reasons
- auto display
- suppression
- header grouping
- tooltip
- spacing

Mood品質が低い場合:

```text
Moodだけ延期
Header polishは実施可能
```

## Stage S6 — QA

- old data
- 1,000件
- Capture
- Progression Detail
- Quick Editor
- Library
- Live MIDI
- Import / Export
- Backup
- Japanese / English
- keyboard
- Tauri
- installer
- final report

---

# 17. Codexマスタープロンプト

```text
あなたはLoop Vault
（React + TypeScript + Vite + Tauri v2 + Zustand + Zod）
のPhase 3.7.1を実装します。

仕様の正は
docs/phase3.7.1-progression-detail-smart-library-plan.md
です。

目的:
保存済みコード進行を第一級の編集対象にし、
見る・聴く・直す・分類する・再発見する循環を完成させる。

絶対に守ること:

1. Idea DetailとProgression Detailを分離する。
2. Progression DetailはCaptureの編集ワークスペースを再利用する。
3. Progression Detailでは「保存済み → 編集中」と表示する。
4. 元解析値がある場合だけ「最初の検出」を補助表示する。
5. SavedProgressionBlockを独立トップレベルentityへ移行しない。
6. Libraryは派生ProgressionIndexで構築する。
7. ProgressionIndexをdata.jsonへ保存しない。
8. 自動タグを保存しない。
9. 保存するのは手動タグと自動タグ抑制情報。
10. 自動タグ抑制はstable tagId + taxonomyVersionを使う。
11. use tagは複数対応とする。
12. Moodは補助。客観的feature分類を主役にする。
13. Keyが必要なfeatureはKey不明時に付けない。
14. Verse / Chorusをコードだけから自動判定しない。
15. Quick Editorを右クリック専用にしない。
16. 数字キーはpreview、Enterで確定。
17. Quick EditorとInspectorで別draftを持たない。
18. CaptureとProgression Detailで同じQuick Editorを共用する。
19. 既存Vault高密度リストとkeyboard操作を壊さない。
20. Vaultは「進行 / Idea」を維持し、進行内に「一覧 / ライブラリ」を追加する。
21. Libraryカテゴリはスマート分類とする。物理フォルダを作らない。
22. 同カテゴリ内OR、異カテゴリ間ANDを初期filter規則とする。
23. 1,000進行で100ms以内の検索・filterを目標とする。
24. 200行超でvirtualizationする。
25. Chord Drip repositoryへruntime依存しない。
26. taxonomy仕様のみ合わせる。
27. 既存store actionとapplyVaultChangeを通す。
28. repositoryへ直接書かない。
29. 自動保存、Undo、Backup、Import / Exportを壊さない。
30. Live MIDIを壊さない。
31. MIDI解析アルゴリズムを変更しない。
32. PlaybackControllerを壊さない。
33. UI文言を日本語 / Englishで実装する。
34. 新フィールドはoptional / Zod default。
35. fileVersionを上げない。
36. 各Stageでlint / test / typecheck / buildを通す。
37. 影響範囲の大きい変更を同一commitへ混ぜない。

作業開始前:
- 変更対象ファイル
- Detail ownership
- Progression保存経路
- Capture editor再利用候補
- taxonomy候補
- index構築方針
- performance方針
- risks
を報告する。

作業終了時:
- 変更ファイル
- 実装内容
- data model変更
- old data互換
- taxonomy
- index性能
- Quick Editor操作
- keyboard
- tests
- manual QA
- 未解決事項
- 次Stageへの申し送り
を報告する。

コミット:
P3.7.1-SX: 要約
```

---

# 18. テスト

## 18.1 Progression Detail

- Vault行Enter
- Open button
- parent Idea
- playback
- selected chord
- Inspector
- saved → editing
- autosave
- reload
- Undo
- delete
- responsive

## 18.2 Quick Editor

- Enter
- hover
- right-click
- Shift+F10
- candidate 1〜5
- preview only
- Space preview
- Root semitone
- Quality
- Bass
- Enter apply
- Esc cancel
- U reset
- E detail
- focus restore
- viewport flip
- shared session

## 18.3 Classification

- source
- maj7-9
- minor9-11
- slash bass
- diminished
- augmented
- altered
- secondary dominant
- diatonic
- chromatic
- key missing
- deterministic
- mood threshold
- max mood 2

## 18.4 Suppression

- auto tag ×
- reanalysis
- no reappearance
- manual same tag
- taxonomy version
- old data default
- deleted tag migration

## 18.5 Index

- build
- incremental add
- edit
- delete
- Idea rename
- tag update
- taxonomy rebuild
- 1,000 entries
- deterministic order

## 18.6 Library

- list / library toggle
- category count
- OR same category
- AND cross category
- search combination
- sort
- favorites
- recent
- selected row
- keyboard
- virtualization
- drawer
- state retention

## 18.7 Header

- grouping
- narrow width
- save state
- Live MIDI
- Settings
- tooltip

## 18.8 Regression

- Capture
- MIDI analysis
- candidate selection
- Live MIDI
- Vault keyboard
- Idea Detail
- Import / Export
- Backup
- Undo
- PlaybackController
- close flush

---

# 19. 人間側確認

## S1

- 進行を開いて3秒以内に試聴可能
- コードがファーストビュー
- Idea Detailと混同しない
- 親Ideaへ戻れる
- 保存済み進行を編集できる

## S2

- 右クリック
- Enter
- hover icon
- 数字preview
- Space
- Enter確定
- Esc破棄
- Inspectorとの一貫性
- Chord Drip並みの速度感

## S3

- 自動feature
- Source
- Use
- suppress
- manual tags
- old data
- 1,000件index

## S4

- 一覧 / ライブラリ
- カテゴリから探索
- AND / OR
- 検索併用
- 1000件
- 狭幅
- keyboard

## S5

- Mood納得感
- Moodなしが許容される
- Header余白
- 右上が詰まって見えない

## S6

- Japanese
- English
- installer
- restart
- import/export
- backup restore
- Live MIDI
- 30分使用

---

# 20. 受け入れ条件

## Progression Detail

- Vault進行行から開く
- コード・試聴・Key・BPMがファーストビュー
- Captureと同じ編集方法
- 保存後再起動しても変更が残る
- parent Ideaを1クリックで開ける

## Quick Editor

- Enter / hover / right-click / Shift+F10
- 数字はpreview
- Spaceで試聴
- Enterで確定
- Escで破棄
- Inspectorと同じsession
- 右クリックだけに依存しない

## Classification

- Source / Feature / Use
- Moodは条件付き
- 自動タグは保存しない
- 手動タグは維持
- suppress後に再付与されない
- taxonomy stable ID
- use複数対応

## Library

- 進行内に一覧 / ライブラリ切替
- Libraryカテゴリレール
- 物理フォルダなし
- OR / AND filter
- 件数
- 検索併用
- 1,000件で100ms以内目標
- 200行超でvirtualization

## Persistence

- SavedProgressionBlock独立化なし
- optional schema
- fileVersion不変
- old data parse
- index非永続
- derived tags非永続

## Integration

- Vault高密度一覧維持
- keyboard維持
- autosave
- Undo
- Backup
- Import / Export
- Live MIDI
- MIDI analysis
- PlaybackController
- lint
- test
- typecheck
- web build
- Tauri build
- installer

---

# 21. バックログ

Phase 3.7.1では実装しない。

- 進行の独立entity化
- タグ一括編集
- physical folder
- AI Mood classifier
- Library drag reorder
- cloud sync
- automatic Verse / Chorus
- cross-repository runtime package
- advanced collection rules
- user-authored smart query language
- batch reclassification UI

---

# 22. 最終メッセージ

Phase 3.7.1は、画面を増やすためのPhaseではない。

```text
保存した進行を開く
↓
すぐ聴ける
↓
カードを直接直せる
↓
自動分類される
↓
Libraryから再び見つけられる
```

**保存したコード進行を、Loop Vaultの中心資産として扱える状態にする。**

これをPhase 3.7.1の完成形とする。

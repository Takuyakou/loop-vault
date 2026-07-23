# Loop Vault Phase 3.9.3 Codex作業指示書
## Chord Dojo L4 / L5 Transposition Practice + Mix Session
### 近いキーから12キーへ移調し、複数の保存進行を交互に取り出して弾く

---

## 0. 結論

Phase 3.9.3では、Chord Dojoへ残っているL4／L5とMix Sessionを実装する。

```text
L4 近くのキーでも
→ 元キー周辺の6キーで同じ進行を弾く

L5 どのキーでも
→ 12キーすべてで同じ進行を弾く

Mix Session
→ 複数の保存進行を重複なしで交互に出題する
```

L4／L5では、コード名や鍵盤ガイドを答えとして表示しない。

表示する主情報は次だけとする。

```text
現在のターゲットキー
現在の度数
次の度数
押鍵状態
キーごとの到達状況
```

移調は元進行を累積的に書き換えず、**常に保存済みの元進行からターゲットキーへ直接変換**する。

Phase 3.9.2のスタイルボイシングとも併用可能にする。ただし、スタイル練習は従来どおり段位対象外であり、L4／L5の正式なクリア状態へ影響させない。

Mix Sessionも段位対象外とする。複数進行を混ぜた結果から、個別進行のL1〜L5、仮クリア、確定、Key coverage、`lastPracticedAt`を更新しない。

Mix Session v1はL1〜L3を対象とする。L4／L5と複数進行のランダム出題を同時に組み合わせる機能は、何を間違えたのか判別しにくくなるためPhase 3.9.3の対象外とする。

Phase 3.9.3では次を実装する。

- L4／L5の表示とセッション
- 進行・コード・分数Bassの決定的移調
- 度数表示
- 近接6キーと12キーのシャッフルバッグ
- キーごとのクリーン到達状態
- L4／L5の仮クリアと別日確定
- 通常VoicingとStyle Voicingのターゲットキー対応
- キー進捗の最小永続化
- 練習キューから2〜5進行を選ぶMix Session
- 進行単位の重複なしシャッフルバッグ
- MixのStep／Flow
- Mixのセッション内クリーン結果と再挑戦
- 実装後のユーザー実機確認書

Phase 3.9.3のテーマ:

**「1つの進行をどのキーでも使える語彙へ変え、複数の語彙をその場で切り替えて取り出せるようにする」**

---

# 1. 前提

Phase 3.9.3は、以下が実装・確認済みであることを前提とする。

## 1.1 Phase 3.8.5

- 安定event ID
- `sourceVoicing`
- `practiceVoicingOverride`
- Voicing Resolver
- `practice → source → generated`
- stale判定
- explicit MIDI note試聴
- 元MIDI／鍵盤記録／自動生成の出自

## 1.2 Phase 3.9.0

- Chord Dojo常設タブ
- 練習キュー
- L1／L2／L3
- Step／Flow
- easy／normal／strict
- held-only判定
- PracticeClock
- 仮クリア／別日確定
- `confirmedLevel`
- `provisional`
- `progressionFingerprint`
- practice optional永続化

## 1.3 Phase 3.9.0.1

- 実際の白鍵／黒鍵Visualiser
- C音ラベル
- held／foreign／sustain
- L1のみGuide
- L2／L3の答え漏洩防止

## 1.4 Phase 3.9.2

- Target Source
- 保存ボイシング
- 自動クローズ
- シェル1-7
- オープン1-7
- ルートレスA/B
- exact-pitch／pitch-class
- Style練習は段位対象外
- Style生成結果は非永続
- 進行単位の決定的Voicing Plan

---

# 2. Phase 3.9.3の責務

## 2.1 行うこと

- L4／L5をDojoのLevel selectorへ追加
- Key／modeの適格性を検証
- 元進行を任意のターゲットキーへ移調
- Roman numeralを維持
- 分数コードBassを同じ半音量で移調
- target keyを明示
- L4用6キーpool
- L5用12キーpool
- 重複なしシャッフルバッグ
- 手動Key選択
- Step／Flow
- キーごとのクリーン到達
- 仮クリア
- 別日確認チャレンジ
- L4／L5確定
- キー進捗のoptional永続化
- resolved／close／Style Voicingの移調
- 事前試聴をターゲットキーへ追従
- 日本語／English
- 練習キューの複数選択
- 2〜5進行のMix Session
- Mix用Progression shuffle bag
- Mixの共通Level／Mode／判定／Target Source
- MixのStep／Flow
- Mixのセッション内サマリー
- Dirty進行だけの再挑戦
- ユーザー実機確認書

## 2.2 行わないこと

- Mix SessionとL4／L5の同時組み合わせ
- Mix Session内で進行ごとに別Level／別判定設定を持つこと
- Mix Sessionの段位・正答率・履歴の永続化
- Mix Sessionの選択進行・順序・seedの永続化
- 新しいボイシングStyle
- Styleごとの移調達成保存
- 自動伴奏
- 内蔵音源
- MIDI Thru
- 転調進行の解析
- mode変換
- majorをminorへ変換
- relative key練習
- 自動運指
- 五線譜
- アルペジオ判定
- LLMによる移調
- PXF変更
- MIDI Analyzer変更
- `fileVersion`変更

---

# 3. L4／L5の正確な定義

## 3.1 L4 — 近くのキーでも

表示:

```text
Level 4
近くのキーでも
```

ガイド:

- 度数のみ
- コード名なし
- 鍵盤Guideなし
- target keyは表示
- held／foreign／sustainは表示

Mode:

- 元進行と同じmodeを維持する

Key pool:

```text
元キーから5度圏距離
-3, -2, -1, +1, +2, +3
```

同一modeの6キー。

例: C major

```text
Eb major
Bb major
F major
G major
D major
A major
```

元キーはpoolへ含めない。

セッション開始時に元キーのウォームアップを任意で1周できるが、L4のキー到達数には数えない。

## 3.2 「±2の6キー」という曖昧さの解消

過去提案にあった「5度圏±2の6キー」は、数学的には4つの非元キーしか得られず曖昧だった。

本仕様では、**元キーに最も近い6つの同modeキー**として、

```text
5度圏±1／±2／±3
```

を正式定義とする。

## 3.3 L5 — どのキーでも

表示:

```text
Level 5
どのキーでも
```

ガイド:

- 度数のみ
- コード名なし
- 鍵盤Guideなし
- target keyは表示
- held／foreign／sustainは表示

Key pool:

```text
12 pitch classes
```

元キーを含む12キーすべて。

Modeは元進行と同じものを維持する。

## 3.4 Ladder prerequisite

L4／L5はいつでも自由練習できる。

ただし正式な段位進捗は次の場合だけ更新する。

```text
L4:
confirmedLevel >= 3

L5:
confirmedLevel >= 4
```

前提段位が未確定の場合:

```text
自由練習
段位対象外
```

と表示する。

Level選択自体はロックしない。

---

# 4. 対応するKey／Mode

## 4.1 MVP必須

```text
major
minor
```

## 4.2 Modal

Dorian等のmodeを現行Key／degree domainが完全に扱える場合のみ対応してよい。

監査で保証できない場合は、L4／L5を無効化する。

```text
このmodeの移調練習は現在未対応です。
L1〜L3は利用できます。
```

未検証modeをmajor／minorとして黙って処理しない。

## 4.3 Keyなし

Key／modeが未設定の場合:

```text
L4／L5を使うには進行のKeyを設定してください。
[Progression Detailで設定]
```

L1／L2は使用可能。

L3も既存仕様どおりKey必須。

---

# 5. Transposition Domain

## 5.1 新設候補

```text
src/domain/practiceTransposition/
  types.ts
  keyCatalog.ts
  circleOfFifths.ts
  transposeChordSymbol.ts
  transposeProgression.ts
  transposeRomanNumerals.ts
  keyBag.ts
  keyCoverage.ts
  confirmationChallenge.ts
  transposeResolvedVoicing.ts
  targetPlan.ts
  index.ts
```

React、Zustand、Tauri、Tone.jsへ依存しない。

既存のKey／ChordSymbol／度数domainを優先して再利用する。

## 5.2 Input

```ts
export interface TranspositionPracticeInput {
  sourceKey: KeySignature;
  sourceMode: SupportedPracticeMode;

  events: readonly SavedChordEvent[];

  targetTonicPitchClass: number;
}
```

実際の既存型を使用し、重複したKey型を作らない。

## 5.3 Tonic shift

```ts
semitoneShift =
  mod12(targetTonicPitchClass - sourceTonicPitchClass);
```

## 5.4 各Chord

元イベントから毎回直接移調する。

```text
元イベント
↓
rootを同じsemitoneShift
slash bassを同じsemitoneShift
quality維持
extensions維持
alterations維持
sus維持
duration維持
bar／beat維持
```

禁止:

```text
前のターゲットキー版を
次のターゲットキーへ再移調
```

累積移調による表記・データのdriftを防ぐ。

## 5.5 Borrowed／Chromatic chord

コード機能を再解釈しない。

Rootとslash bassを同じ半音量だけ移動する。

例:

```text
Key C:
Abmaj7

Target Key D:
Bbmaj7
```

## 5.6 Slash chord

```text
C/E
```

をDへ全音移調:

```text
D/F#
```

RootとBassを同じ量だけ移動する。

## 5.7 Roman numeral

Roman numeralは元進行の相対構造を維持する。

表示用degreeをターゲットChord名から毎回別解釈し直してもよいが、既存degree domainと一致すること。

異名同音の違いでdegreeが変わらないこと。

## 5.8 Event identity

セッション内の移調イベントは元event IDを参照する。

保存イベントを変更しない。

概念:

```ts
export interface TransposedPracticeEvent {
  sourceEventId: string;
  chord: ChordSymbol;
  bar: number;
  startBeat: number;
  durationBeats: number;
  romanNumeral: string;
}
```

新event IDをVaultへ保存しない。

---

# 6. Key Spelling

## 6.1 目的

次のような不自然表記を避ける。

```text
G# majorなのにCb
Db majorなのにF#
```

## 6.2 Canonical key catalog

major／minorそれぞれに、12 pitch classのuser-facing key名を定義する。

例:

```text
Major:
C, Db, D, Eb, E, F, F#, G, Ab, A, Bb, B

Minor:
C, C#, D, Eb, E, F, F#, G, G#, A, Bb, B
```

既存Key catalogがある場合はそれを使用する。

## 6.3 Chord spelling

target keyのaccidental preferenceを使う。

- flat keyではflat優先
- sharp keyではsharp優先
- altered tension表記は既存parser／formatterの規則に従う

内部Pitch Classは変えない。

## 6.4 表示と判定

表記が違っても、Pitch Class判定は同一。

---

# 7. L4 Key Pool

## 7.1 生成

```ts
export const L4_FIFTH_OFFSETS =
  [-3, -2, -1, 1, 2, 3] as const;
```

```ts
targetPc =
  mod12(sourcePc + 7 * fifthOffset);
```

## 7.2 順序

表示上の固定順:

```text
-1, +1, -2, +2, -3, +3
```

または近距離順。

Session bagはshuffleする。

## 7.3 重複

Pitch Classを正規化し、重複なし。

## 7.4 元キー

L4 coverageへ含めない。

L3確定が元キーの習得を表す。

---

# 8. L5 Key Pool

## 8.1 生成

同modeの12 tonic Pitch Class。

表示順は5度圏。

```text
source
+1 fifth
+2 fifths
...
```

Pitch Class重複が発生しない12件。

## 8.2 Source key

L5 coverageへ含む。

L3確定済みでも、自動でL5 clearへ加算しない。

L5としてFlowで1周する。

## 8.3 L4 coverage継承

L4で正式にclearedされたPitch Classは、L5 coverageへ利用できる。

同じ進行fingerprint、同じmode、通常Dojo対象の記録に限る。

---

# 9. Shuffle Bag

## 9.1 目的

同じKeyが連続しすぎることを防ぎ、poolを一巡するまで重複しない。

## 9.2 Domain API

```ts
export interface KeyBagState {
  remaining: number[];
  completed: number[];
  seed: number;
}

export function createKeyBag(
  pool: readonly number[],
  seed: number,
): KeyBagState;

export function drawNextKey(
  state: KeyBagState,
): {
  keyPitchClass?: number;
  nextState: KeyBagState;
};
```

## 9.3 Random boundary

domainで`Math.random()`を使わない。

UI／adapter境界で、

```text
crypto.getRandomValues
```

等によりsession seedを1回生成し、domainへ渡す。

テストは固定seed。

## 9.4 永続化

Session bagとseedは保存しない。

アプリ再起動時は新しいbag。

## 9.5 手動Key選択

idle／ready／paused時、Key dotをクリックして特定Keyを練習できる。

running中は直接変更しない。

```text
一時停止してキーを変更しますか？
```

手動選択したKeyも、正式条件を満たすclean Flowならcoverageへ加算できる。

---

# 10. Transposed Voicing Target

## 10.1 目的

L4／L5でも、現在のTarget Sourceに応じて正しい試聴・Style targetを作る。

## 10.2 `resolved-voicing`

元イベントのVoicing Memoryを直接stale扱いしない。

移調練習専用の派生処理を使う。

```text
compatibleな元practice/source Voicing
↓
全noteを同じsemitoneShift
↓
進行全体へ同じglobal octave offset
↓
session-only target
```

保存Snapshotを変更しない。

## 10.3 Global octave offset

候補:

```text
-24
-12
0
+12
+24
```

進行全体へ同じoffsetを適用する。

目的:

- 鍵盤表示範囲へ収める
- sourceの重心へ近づける
- 進行全体のVoice Leadingを維持する

禁止:

- コードごとの別offset
- 各音の別offset
- 左右手別offset

## 10.4 Source Voicingがないevent

target keyのChordSymbolからexisting generated fallbackを作る。

ただし、resolved plan全体で極端な音域jumpが出る場合は診断warningを返す。

MVPでは複雑な再最適化を新設せず、既存Voicing生成を再利用する。

## 10.5 `generated-close`

元進行をtarget keyへ移調した後、Phase 3.9.2のexisting close adapterで新規planを生成する。

元キーplanを単純shiftしない。

## 10.6 Style target

元進行をtarget keyへ移調した後、Phase 3.9.2のStyle generatorへ渡す。

```text
transposed chord events
↓
shell / open / rootless generation
↓
progression-level DP
```

Rootless A/Bもtarget key planとして再計算する。

## 10.7 Style progress

Style targetとL4／L5を併用できる。

ただし:

```text
スタイル移調練習
段位対象外
```

- Key coverage更新なし
- provisionalなし
- confirmedなし
- lastPracticedAt更新なし

---

# 11. L4／L5表示

## 11.1 Level selector

```text
L1
L2
L3
L4 近くのキー
L5 12キー
```

## 11.2 Current Key

画面中央上部へ大きく表示する。

```text
G major
```

日本語:

```text
Gメジャー
```

minor:

```text
Eマイナー
```

## 11.3 Current / Next

```text
いま
IVmaj7

つぎ
ii7
```

L4／L5でactual chord nameを通常表示しない。

開発者詳細や明示Hint以外に答えを漏らさない。

## 11.4 Key progress rail

L4:

```text
近くのキー 3 / 6
[F] [G] [Bb] [D] [Eb] [A]
```

L5:

```text
12キー 7 / 12
[C] [G] [D] [A] ...
```

State:

- 未着手
- cleared
- current
- confirmation challenge

色だけでなく、check、outline、labelを使う。

## 11.5 Next Key

Flowのround終了前に小さく表示可能。

```text
次のキー: D major
```

演奏中の現在／次Chordを邪魔しない位置に置く。

## 11.6 Hint

MVPでは任意。

Step modeのみ:

```text
[答えを見る]
```

押している間だけactual chord nameまたはguideを表示する。

使用した周はdirtyとなり、coverageへ加算しない。

FlowではHintなし。

実装コストが高い場合はPhase外にしてよい。

---

# 12. Step Mode

## 12.1 Key選択

- random bag
- 手動Key
- current Keyをセッション中固定

## 12.2 挙動

L3と同じ度数提示。

targetはtarget keyへ移調済み。

## 12.3 Round complete

1 clean Step round:

```text
このキーをフローで弾いてみますか？
```

Stepのcleanはcoverageへ加算しない。

## 12.4 Dirty

stable wrongまたはHint使用でdirty。

セッションは止めない。

---

# 13. Flow Mode

## 13.1 PracticeClock

既存Phase 3.9.0のPracticeClockを再利用する。

Keyが変わってもClock実装を分岐させない。

## 13.2 Clean Key Round

次をすべて満たす。

- target tempo以上
- 全eventがwindow内match
- missなし
- stable wrongなし
- Hintなし
- 通常Dojo target
- 段位前提を満たす

## 13.3 Dirty round

coverageへ加算しない。

既定挙動:

```text
同じKeyでもう一度
```

ユーザーは明示的に`次のキーへ`を選べる。

SkipしたKeyはclearedにならない。

## 13.4 Clean後

- current keyをsession cleared
- eligibleなら永続coverageへ加算
- 次のbag keyへ進む
- round dotsをreset
- BPMは維持
- optional tempo rampは既存仕様に従う

---

# 14. Official Progress Eligibility

## 14.1 対象

正式なL4／L5 coverageを更新するのは、次だけ。

```text
Target Source:
resolved-voicing

Style mode:
OFF

Practice progression:
not stale

L4 prerequisite:
L3 confirmed

L5 prerequisite:
L4 confirmed
```

既存normal Dojoの寛容さ／Flow clear条件を使用する。

新しい隠れたleniency条件を追加しない。

## 14.2 `generated-close`

Phase 3.9.2の追加targetなのでStyle practice扱い。

正式coverageへ加算しない。

## 14.3 UI

対象外状態:

```text
自由練習
このセッションは段位対象外です。
```

理由tooltip:

- Style Voicing
- 前段位未確定
- progression stale
- unsupported mode
- target tempo未満

---

# 15. L4 Provisional / Confirmation

## 15.1 Coverage

L4 poolの6 pitch classをすべてclean Flowでclearする。

複数sessionにまたがってよい。

## 15.2 Provisional

条件:

- L3 confirmed
- L4 pool 6 / 6
- progression not stale

保存:

```text
provisional.level = 4
```

加えて、別日確認用の2キーを保存する。

```text
confirmationPitchClasses
```

## 15.3 Confirmation key選択

L4 poolから2件。

条件:

- 1件はsourceから負方向の5度圏側
- 1件は正方向側
- distinct
- provisional生成時に固定
- domainへseed注入
- 保存後に変わらない

## 15.4 別日確定

provisional日と異なるlocal date。

保存済み2キーについて:

```text
target tempo以上
clean Flow
2キー連続
```

達成:

```text
confirmedLevel = 4
provisional = undefined
```

片方でdirtyになった場合は、確認チャレンジの先頭からやり直す。

アプリ終了後も同じ2キーを使う。

---

# 16. L5 Provisional / Confirmation

## 16.1 Coverage

12 pitch classすべてをclean Flowでclearする。

L4で正式clear済みのkey coverageは引き継ぐ。

元キーもL5として1回clean Flowが必要。

## 16.2 Provisional

条件:

- L4 confirmed
- 12 / 12
- progression not stale

保存:

```text
provisional.level = 5
```

別日確認用の4キーを保存する。

## 16.3 Confirmation key選択

5度圏順の12キーを4区間へ分ける。

```text
0〜2
3〜5
6〜8
9〜11
```

各区間から1キー。

- distinct
- provisional生成時に固定
- seed注入
- 保存後に変わらない

## 16.4 別日確定

provisional日と異なるlocal date。

保存済み4キーについて:

```text
target tempo以上
clean Flow
4キー連続
```

達成:

```text
confirmedLevel = 5
provisional = undefined
```

dirtyで確認チャレンジ先頭へ戻る。

---

# 17. Practice Data Model

## 17.1 既存モデル拡張

既存`ProgressionPracticeProgress`へoptional fieldを追加する。

```ts
export interface TranspositionPracticeProgress {
  schemaVersion: 1;

  // 通常Dojoで正式clearしたtonic pitch class
  clearedKeyPitchClasses: number[];

  updatedAt?: string;
}

export interface PracticeProvisionalClear {
  level: 1 | 2 | 3 | 4 | 5;

  clearedAt: string;
  clearedOnLocalDate: string;
  targetTempo: number;

  // L4 / L5のみ
  confirmationPitchClasses?: number[];
}

export interface ProgressionPracticeProgress {
  schemaVersion: 1;
  progressionFingerprint: string;

  confirmedLevel?: 1 | 2 | 3 | 4 | 5;
  provisional?: PracticeProvisionalClear;

  transposition?: TranspositionPracticeProgress;

  lastPracticedAt?: string;
}
```

実際の既存型へ最小差分で適応する。

## 17.2 Invariant

- Pitch Class 0〜11
- unique
- sorted
- 最大12件
- Style sessionで変更しない
- stale practiceでは利用しない
- explicit resetでclear

## 17.3 L4 pool変更

元Key／modeが変わればprogression fingerprintが変わる。

既存practice stale規則に従う。

## 17.4 既存データ

`transposition`なし:

```text
L4 / L5未着手
```

旧data.jsonをそのまま読める。

`fileVersion = 1`維持。

---

# 18. Persistence

## 18.1 書込みタイミング

- eligibleなKey clean
- L4 provisional
- L4 confirmed
- L5 provisional
- L5 confirmed
- practice stale明示reset
- session終了時の未flush進捗
- app close flush

## 18.2 書込まないタイミング

- Note On
- Note Off
- partial
- wrong
- Step advance
- Style session
- Key bag draw
- manual key selection
- dirty Flow
- target tempo未満

## 18.3 経路

```text
Practice UI
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

---

# 19. Key Session State

```ts
export interface TranspositionSessionState {
  level: 4 | 5;

  sourceKeyPitchClass: number;
  sourceMode: SupportedPracticeMode;

  currentTargetKeyPitchClass: number;

  keyPool: number[];
  keyBag: KeyBagState;

  sessionClearedPitchClasses: number[];

  officialProgressEligible: boolean;
  inConfirmationChallenge: boolean;

  confirmationPitchClasses?: number[];
  confirmationIndex?: number;

  sessionSeed: number;
}
```

Style sessionでは`officialProgressEligible = false`。

## 19.1 Target change

Key変更時:

- currentEventIndex = 0
- current round reset
- held stateはclear要求
- BPMは維持
- target progression再生成
- target Voicing plan再生成
- keyboard rangeを再計算してよいが、1Key round内では固定

## 19.2 Running中

Key変更はround boundaryだけ。

手動変更はPause後。

---

# 20. Keyboard Visualizer

## 20.1 C labels

Phase 3.9.0.1の規則を維持。

```text
MIDI 60 = C5
```

## 20.2 Range

target key／target Voicing planごとにround開始時に計算。

round中は固定。

Key変更時は再計算可能。

## 20.3 L4／L5

Guideは非表示。

- held
- foreign
- sustain
- C labels
- outside-range

だけ表示。

Style modeを明示選択し、L4／L5でStyle練習する場合もGuideは非表示。

答えのnote名を表示しない。

---

# 21. 事前試聴

## 21.1 Target key

Dojo内の事前試聴は現在target keyへ追従する。

## 21.2 Target Source

```text
resolved
→ transposed resolved plan

generated-close
→ target keyでclose生成

style
→ target keyでStyle生成
```

## 21.3 他画面

Vault／Detail／Home／Captureの試聴は変更しない。

## 21.4 PlaybackController

単一再生を維持。

PracticeClock開始時に事前試聴を停止する。

---

# 22. UX

## 22.1 Level選択時

L4:

```text
近くの6キーで練習します。
コード名は表示されず、度数だけが表示されます。
```

L5:

```text
12キーすべてで練習します。
コード名は表示されず、度数だけが表示されます。
```

## 22.2 Progress

```text
L4 近くのキー
4 / 6

L5 12キー
9 / 12
```

## 22.3 Confirmation

```text
L4 確認チャレンジ
1 / 2
```

```text
L5 確認チャレンジ
2 / 4
```

## 22.4 Prerequisite

```text
L4の段位を進めるにはL3の確定が必要です。
自由練習はできます。
```

```text
L5の段位を進めるにはL4の確定が必要です。
自由練習はできます。
```

## 22.5 Key naming

日本語:

```text
Dbメジャー
F#マイナー
```

English:

```text
Db major
F# minor
```

## 22.6 No score

- 正答率なし
- Key別点数なし
- 時間なし
- ランキングなし

Key coverageだけを静かに表示する。

---


# 23. Mix Session

## 23.1 目的

複数の保存進行を交互に提示し、直前の進行の流れへ依存せず、その場で必要な進行を思い出して弾く。

```text
進行Aを何周も反復
→ 進行Bへ移る
```

ではなく、

```text
進行B
↓
進行A
↓
進行C
↓
進行D
```

のように切り替える。

Mix Sessionは単独練習で習得した進行を取り出す確認モードであり、新しい段位判定器ではない。

## 23.2 MVP範囲

Mix Session v1が対応するLevel:

```text
L1
L2
L3
```

対応しない組み合わせ:

```text
L4 / L5 + Mix Session
```

理由:

- 進行とKeyの2軸が同時にランダム化される
- 誤りの原因が「進行記憶」か「移調」か判別しにくい
- Key coverageと個別進行の達成状態が複雑化する

L4／L5はPhase 3.9.3内で単独進行用として実装する。

将来、実機利用で必要性が確認された場合だけ「Keyも混ぜる」を別Phaseで検討する。

## 23.3 選択数

```text
最小2進行
最大5進行
```

1件だけではMix Sessionを開始できない。

6件以上を選択しようとした場合:

```text
ミックス練習では最大5進行まで選べます。
```

## 23.4 練習キューUI

通常時:

```text
[ミックス選択]
```

押すと選択モードへ入る。

```text
☑ main-turnaround
☑ neo-soul-01
☐ summer-loop

3件選択

[ミックス練習を開始]
[選択を解除]
[キャンセル]
```

原則:

- 既存練習キューを再利用
- 第2のVaultを作らない
- 深い検索や全taxonomyを追加しない
- 現在の軽い絞り込みとおすすめ順を利用可能
- 選択状態はセッション／画面内のみ
- app restart後に選択を復元しない

## 23.5 共通セッション設定

Mix Session内では全進行へ同じ設定を使う。

```ts
export interface MixSessionConfig {
  blockIds: string[];

  level: 1 | 2 | 3;
  mode: "step" | "flow";
  leniency: "easy" | "normal" | "strict";

  targetSource: PracticeTargetSource;
  styleMatchMode?: StyleVoicingMatchMode;

  cycles: 1 | 2 | 3;
  bpm: number;
}
```

各進行へ別Level／別Mode／別判定を持たせない。

既定:

```text
Level: 現在のDojo選択、ただしL4／L5ならL2へ戻す
Mode: Step
Target Source: 保存ボイシング
Cycles: 1巡
BPM: 60
```

## 23.6 Preflight

開始前に全選択進行を検証する。

共通:

- blockが存在する
- eventが1件以上
- ChordSymbolが有効
- target planを生成可能
- progression fingerprintを取得可能

L3:

- 全進行にKey／modeがある
- Roman numeralを生成できる

Flow:

- 全進行が4/4
- event timingがPracticeClockで扱える

Style:

- 選択したStyleが全進行で利用可能
- またはPhase 3.9.2の明示fallbackがON

開始不可の場合、対象を一覧表示する。

```text
ミックス練習を開始できません。

summer-loop:
Keyが設定されていないためL3を利用できません。

sus-study:
ルートレスA/Bの未対応コードがあります。
```

黙って進行を除外しない。

## 23.7 Session Snapshot

Mix開始時に対象進行の読み取り専用Snapshotを作る。

```ts
export interface MixProgressionSnapshot {
  blockId: string;
  progressionFingerprint: string;
  title: string;

  sourceKey?: KeySignature;
  events: readonly SavedChordEvent[];

  targetPlan: PracticeTargetPlan;
}
```

Mix Session中にVaultデータを変更しない。

対象進行が外部要因で変更／削除された場合:

- current sessionをpause
- 対象名を表示
- 再読込して最初からやり直すか、Session終了を選ぶ
- 古いSnapshotを保存進捗へ使わない

## 23.8 Progression Shuffle Bag

Key bagとは別domainとして作る。

```ts
export interface ProgressionBagState {
  remainingBlockIds: string[];
  completedBlockIds: string[];

  lastDrawnBlockId?: string;
  seed: number;
}
```

要件:

- 1巡するまで同じ進行を重複出題しない
- 固定seedで決定的
- domainで`Math.random()`を使わない
- UI境界からsession seedを注入
- 新しい巡の先頭が、直前巡の最後と同一にならない
- 選択進行が2件の場合も交互性を維持
- bag／seedは永続化しない

## 23.9 巡数

```text
1巡
2巡
3巡
```

既定:

```text
1巡
```

1巡は、選択した全進行を1回ずつ完了すること。

巡が変わるたび、Progression bagを再生成する。

直前巡の最後と次巡の最初が同じにならないようにする。

## 23.10 Mix Step

各進行を通常Stepと同じ規則で最後まで弾く。

- partialは中立
- stable wrongでその進行結果をdirty
- matchまで現在eventで待つ
- 最終event完了で次の進行へ

Stepの進行結果:

```text
clean
dirty
```

Mix Stepのcleanは段位／practiceへ反映しない。

次の進行へ移る前に:

```text
次の進行
neo-soul-01

[開始]
```

を表示する。

次の進行名を現在進行の演奏中に先出ししない。

## 23.11 Mix Flow

全進行で共通のSession BPMを使う。

各進行の元BPMへ自動切替しない。

既定:

```text
60 BPM
```

理由:

- 進行ごとのBPM切替で難易度が変わる
- Mixの目的は想起の切替
- 段位判定ではない

MVPでは自動Tempo RampをOFFにする。

Flowの進行結果:

- 全eventがwindow内match → clean
- miss／stable wrongあり → dirty

dirtyでも演奏を止めず、その進行の末尾まで進む。

進行間:

```text
1小節count-in
```

を入れる。

新しい進行のタイトルはcount-in開始時に表示する。

## 23.12 Dirty時の順序

Mixでは、dirty進行を直後に繰り返さない。

交互練習を維持するため、次のbag itemへ進む。

Session終了時に選べる。

```text
[クリーンでなかった進行だけ、もう一巡]
[同じ選択でもう一度]
[終了]
```

Dirty subset retryも重複なしshuffle bagを使う。

1件だけdirtyの場合は単独再挑戦になることを許容する。

## 23.13 Target Source

MixでもPhase 3.9.2のTarget Sourceを利用できる。

```text
保存ボイシング
自動（クローズ）
シェル1-7
オープン1-7
ルートレスA/B
```

ただし:

- 全進行へ同じTarget Source
- Style対象外コードはpreflightで停止
- 明示fallbackはPhase 3.9.2の規則を再利用
- Style Mixは段位対象外
- Target planはMix開始時に全件生成しcache
- Note Onごとに再生成しない

## 23.14 Level表示

### L1

- 各進行のGuide表示
- 保存／Style targetに追従
- 進行切替時にKeyboard rangeを再計算可能
- 1進行内では固定

### L2

- コード名
- Guideなし

### L3

- 度数のみ
- Guideなし
- 全選択進行にKey必須

## 23.15 Mix UI

Session中:

```text
ミックスセッション
2 / 5進行
1 / 2巡

現在
neo-soul-01

クリーン 1
要再挑戦 0
```

表示するもの:

- Mixであること
- 現在の進行名
- 進行番号
- 巡番号
- Level
- Mode
- BPM
- Target Source
- session-only clean status

表示しないもの:

- 次の進行名（現在演奏中）
- 個別段位
- 正答率
- 点数
- 長期履歴
- practice badge更新

## 23.16 Session Summary

```text
ミックス練習 完了

5進行を1巡しました
クリーン 3
要再挑戦 2
```

各進行:

```text
✓ main-turnaround
○ neo-soul-01
✓ summer-loop
```

`○`は失敗点数ではなく「もう一度」の中立表示。

パーセントやランキングを表示しない。

## 23.17 永続化

Mix Sessionは完全にセッション内。

更新しないもの:

- confirmedLevel
- provisional
- transposition coverage
- `lastPracticedAt`
- practice fingerprint
- Vault badge
- Queueおすすめ順
- Style progress

保存しないもの:

- 選択block IDs
- 出題順
- seed
- clean／dirty結果
- BPM
- cycles
- Session summary
- 演奏note

Mix終了後、Vaultへの書込み差分は0であること。

## 23.18 Accessibility

- Mix選択checkboxへ進行名
- 選択数をaria-live
- 現在進行変更をaria-live
- Session summaryをheadingで構造化
- `次の進行`へfocus移動
- EscでPause／終了確認
- IME中にshortcutを奪わない

## 23.19 Mix Session State

```ts
export interface MixSessionState {
  status:
    | "selecting"
    | "ready"
    | "running"
    | "between-progressions"
    | "paused"
    | "summary"
    | "completed";

  config: MixSessionConfig;

  snapshots: MixProgressionSnapshot[];
  bag: ProgressionBagState;

  currentBlockId?: string;
  currentProgressionIndex: number;

  currentCycle: number;

  cleanBlockIds: string[];
  dirtyBlockIds: string[];

  currentPracticeSession?: PracticeSessionState;

  sessionSeed: number;
}
```

Mix固有stateと単独`PracticeSessionState`を分ける。

現在進行の演奏判定は既存Practice Session reducerへ委譲する。

Mix側でMatcherやFlow判定を複製しない。

## 23.20 Domain構成

新設候補:

```text
src/domain/practiceMix/
  types.ts
  progressionBag.ts
  preflight.ts
  sessionMachine.ts
  summary.ts
  index.ts
```

再利用:

- Practice Matcher
- Step／Flow session
- PracticeClock
- Target plan
- Voicing Resolver
- Style generator
- Progression Index


# 24. Accessibility / Keyboard

- Key dotはbutton
- aria-labelにKey名と状態
- current keyへ`aria-current`
- clearedに「完了」
- confirmationに「確認対象」
- 色だけに依存しない
- arrow keyでKey dot移動可能
- Enterでmanual key選択
- IME中shortcutを奪わない
- screen readerへ現在Keyを通知
- chord nameをL4／L5でaria-labelへ漏らさない

---

# 25. Performance

## 24.1 Transposition

16 event:

```text
p50 <= 2ms
p90 <= 10ms
```

32 event:

```text
<= 30ms
```

## 24.2 Style Plan

Phase 3.9.2の既存目標を維持。

Target key変更時だけ再生成。

Note Onごとに再生成しない。

## 24.3 Cache

session cache key:

```text
progressionFingerprint
targetKeyPitchClass
targetSource
styleId
generatorVersion
span settings
fallback policy
```

Vaultへ保存しない。

## 24.4 UI

Key railと鍵盤以外をNote Onごとに再renderしない。

---

# 26. Privacy / Security

- 新しい外部通信なし
- MIDI演奏note保存なし
- Key bag保存なし
- Style target保存なし
- 新規権限なし
- LLM無関係
- absolute path無関係

---

# 27. 実装Stage

## Stage T0 — Audit / Baseline

監査:

- current L1〜L3 Level model
- practice schema
- degree domain
- key／mode domain
- ChordSymbol transposition
- slash bass
- spelling
- Voicing Resolver
- Style generator
- PracticeClock
- Progression fingerprint
- current UI
- current test baseline

成果物:

```text
docs/phase3.9.3-l4-l5-audit.md
```

## Stage T1 — Transposition / Key Bag Domain

- Supported mode guard
- canonical key catalog
- L4 pool
- L5 pool
- ChordSymbol transposition
- slash bass
- degree preservation
- event transposition
- key spelling
- injected-seed shuffle bag
- manual key selection
- pure tests

## Stage T2 — Target Plans / Session Integration

- transposed resolved plan
- global octave offset
- close plan in target key
- Style plan in target key
- L4／L5 session state
- target change
- Step
- Flow
- current key
- key rail
- guide hidden
- pre-audition
- Japanese／English

## Stage T3 — Coverage / Provisional / Confirmation

- clearedKeyPitchClasses
- eligible normal mode
- L4 6-key coverage
- L5 12-key coverage
- prerequisite
- provisional
- confirmation keys
- different-day confirmation
- confirmedLevel 4／5
- stale/reset
- applyVaultChange
- Queue／Detail／Vault badge

## Stage T4 — Mix Session

- 練習キュー複数選択
- 2〜5進行
- L1〜L3
- common settings
- Progression preflight
- snapshot
- progression shuffle bag
- 1〜3巡
- Mix Step
- Mix Flow
- 1小節count-in
- dirty subset retry
- session summary
- non-persistence
- accessibility
- pure tests

## Stage T5 — Regression / User Handoff

- full tests
- 12-key fixtures
- Mix fixtures
- real MIDI keyboard
- major／minor
- slash／altered
- Style combination
- Mix resolved／Style
- persistence
- no Mix persistence
- build
- Tauri
- user verification checklist
- stop before new Style／Key Mix

---

# 28. Codexマスタープロンプト

```text
あなたはLoop Vault
（React + TypeScript + Vite + Tauri v2 + Zustand + Zod）
のPhase 3.9.3 Chord Dojo L4 / L5 + Mix Sessionを実装します。

仕様の正は
docs/phase3.9.3-l4-l5-mix-session-plan.md
です。

目的:
L4「近くのキーでも」とL5「どのキーでも」を追加し、
保存進行を度数だけ見ながら同じmodeの別Keyで弾けるようにする。
さらに、練習キューから2〜5進行を選び、
L1〜L3で重複なしシャッフル出題するMix Sessionを追加する。

絶対に守ること:

1. L4 / L5でコード名を通常表示しない。
2. L4 / L5で鍵盤Guideを表示しない。
3. target key、度数、held / foreign / sustainだけを表示する。
4. L4 poolは5度圏±1 / ±2 / ±3の同mode 6キー。
5. 元キーをL4 coverageへ含めない。
6. L5 poolは同modeの12キー。
7. L5では元キーもclean Flowを必要とする。
8. major / minorをMVP必須とする。
9. 未検証modeをmajor / minorとして黙って処理しない。
10. Key / modeなしではL4 / L5を無効化する。
11. 元保存進行からtarget keyへ毎回直接移調する。
12. 直前target key版から累積移調しない。
13. Rootとslash bassを同じsemitone量移調する。
14. quality / extension / alteration / sus / durationを維持する。
15. Borrowed chordを勝手にreharmonizeしない。
16. target keyに適したenharmonic spellingを使う。
17. Roman numeralの相対構造を維持する。
18. 保存イベントを書き換えない。
19. session-onlyのtransposed eventを作る。
20. Key bagはpool一巡まで重複なし。
21. domainでMath.randomを使わない。
22. session seedを境界から注入する。
23. Key bag / seedを永続化しない。
24. idle / pausedでmanual key選択を許可する。
25. running中のKey変更はround boundaryまたはPause後。
26. Stepのcleanはofficial coverageへ加算しない。
27. FlowのcleanだけをKey coverageへ加算する。
28. dirty roundをcoverageへ加算しない。
29. dirty後は同じKey再挑戦を既定にする。
30. SkipしたKeyをclear扱いしない。
31. L4公式進捗はL3 confirmedが必要。
32. L5公式進捗はL4 confirmedが必要。
33. 前段位未確定でも自由練習は許可する。
34. Style／generated-close targetは段位対象外。
35. Style移調練習ではKey coverageを更新しない。
36. resolved-voicingだけを公式進捗対象にする。
37. Phase 3.8.5 Snapshotを変更しない。
38. resolved source Voicingはsession-onlyで平行移動する。
39. 全noteへ同じsemitone shiftを適用する。
40. 音域調整は進行全体へ同じoctave offsetだけ。
41. コードごと・各音・左右手別octave shiftをしない。
42. source Voicingがないeventはexisting generated fallbackを使う。
43. generated-closeはtarget keyで既存adapterを再実行する。
44. Styleはtransposed progressionからtarget key planを再生成する。
45. Style modeの段位非永続を維持する。
46. L4 coverageは6 / 6でprovisional。
47. L4 confirmationは別日に固定2キーを連続clean。
48. L5 coverageは12 / 12でprovisional。
49. L5 confirmationは別日に5度圏4区間から1キーずつ、計4キーを連続clean。
50. confirmation keyをprovisionalへ保存する。
51. confirmation keyを再起動後に変えない。
52. confirmedLevelは最高Levelを保持する。
53. transposition coverageはoptional field。
54. cleared keyは0〜11のunique sorted array。
55. progression stale時はcoverageを現在進行へ適用しない。
56. explicit resetでcoverageをclearする。
57. per-note、Step advance、dirty roundでVaultを書かない。
58. eligible clean、provisional、confirmed、resetだけ保存する。
59. 保存はapplyVaultChange経由。
60. repositoryへ直接書かない。
61. fileVersionを上げない。
62. 旧data.jsonを読めること。
63. PracticeClockを再利用する。
64. PlaybackControllerの単一再生を維持する。
65. Vault / Detail / Home / Capture試聴を変更しない。
66. LLM / MIDI Analyzer / Voicing抽出を変更しない。
67. Mix Sessionを実装する。
68. Mix Session v1はL1〜L3のみ対応する。
69. L4 / L5とMix Sessionを同時に組み合わせない。
70. Mixは2〜5進行を対象とする。
71. 練習キューへ複数選択modeを追加する。
72. Mix選択をVaultやpractice progressへ保存しない。
73. Mix全進行へ同じLevel / Mode / leniency / Target Sourceを使う。
74. L3 Mixでは全進行にKey / modeを要求する。
75. Mix Flowでは全進行を4/4に限定する。
76. Mix開始前に全進行をpreflightし、黙って除外しない。
77. Mix開始時に読み取り専用Snapshotを作る。
78. Mix中にVaultデータを書き換えない。
79. Progression bagは一巡まで重複なし。
80. 新しい巡の先頭と前巡の末尾を同一にしない。
81. Progression bagでもdomain内Math.randomを使わない。
82. session seedを境界から注入する。
83. Mix Stepは既存Step sessionを再利用する。
84. Mix Flowは既存Flow / PracticeClockを再利用する。
85. Mix固有のMatcherを作らない。
86. Mix Flowは全進行で共通BPMを使う。
87. Mix MVPでは自動Tempo RampをOFFにする。
88. 進行間に1小節count-inを入れる。
89. 現在進行の演奏中に次の進行名を先出ししない。
90. dirty進行を直後に再出題しない。
91. Session終了時にdirty subsetだけ再挑戦できるようにする。
92. Mix Sessionでconfirmed / provisional / key coverageを更新しない。
93. Mix SessionでlastPracticedAtを更新しない。
94. Mix SessionでVault書込み差分を発生させない。
95. Mix Sessionのscore / percentage / rankingを表示しない。
96. Mix Target SourceはPhase 3.9.2を再利用する。
97. Style未対応はpreflightで表示し、明示fallback規則を再利用する。
98. 新しいStyleを実装しない。
99. 日本語 / Englishを実装する。
100. domainでDate.now / Math.randomへ直接依存しない。
101. 同じ入力とseedから同じ結果を返す。
102. 各Stageでlint / test / typecheck / cargo test / buildを実行する。

作業開始前に報告すること:

- current Practice schema
- L1〜L3 Level model
- Key / mode型
- ChordSymbol transposition既存資産
- Roman numeral domain
- slash chord処理
- spelling方針
- Phase 3.8.5 Resolver
- Phase 3.9.2 Style generator
- PracticeClock
- 保存経路
- 変更予定ファイル
- risks
- rollback

作業終了時に必ず行うこと:

1. 実装報告書を作成する
2. docs/phase3.9.3-user-verification-checklist.md を作成する
3. 最終回答の冒頭を「ユーザー実機確認待ち」とする
4. L4の6キーを実際に確認する手順を書く
5. L5の12キーを実際に確認する手順を書く
6. major / minorを分けて確認させる
7. slash chord / altered chordの移調確認を含める
8. random bagの重複なしを確認させる
9. manual key選択を確認させる
10. Style移調練習で段位が変わらないことを確認させる
11. resolved Voicingのglobal octave shiftを確認させる
12. provisionalと翌日confirmationを分けて確認させる
13. 実機未確認の音楽的自然さを完了済みと書かない
14. Mix Sessionで2〜5進行、1〜3巡、Step／Flowを確認させる
15. Mix Sessionで段位・lastPracticedAt・Key coverageが変化しないことを確認させる
16. dirty進行だけの再挑戦を確認させる
17. L4／L5とMixを同時に選べないことを確認させる
18. ユーザー確認前にKey Mixや新Styleへ進まない
19. PR / merge状態、生成EXE、テスト結果を報告する

コミット:
P3.9.3-TX: 要約
```

---

# 29. 自動テスト

## 28.1 Key Catalog

- 12 major
- 12 minor
- pitch class
- flat preference
- sharp preference
- Japanese label
- English label
- unsupported mode

## 28.2 L4 Pool

- C major
- F# major
- Bb minor
- 6 unique
- source excluded
- fifth distance
- stable display order

## 28.3 L5 Pool

- 12 unique
- source included
- fifth-circle order
- same mode

## 28.4 Chord Transposition

- major
- minor
- maj7
- m7
- 9 / 11 / 13
- altered
- dim
- aug
- sus
- add
- 6/9
- slash chord
- borrowed chord
- enharmonic
- invalid chord

## 28.5 Progression

- bar / beat / duration unchanged
- event order
- source event ID
- degree
- repeated chord
- 1 bar 2 chords
- deterministic

## 28.6 Shuffle Bag

- no duplicate until exhausted
- fixed seed
- different seed
- one-element
- manual selection
- session restart
- no persistence

## 28.7 Resolved Voicing

- +1 semitone
- -1 equivalent mod12
- +12 handling
- single global octave offset
- no per-event offset
- missing source fallback
- mixed source / generated
- whole plan range

## 28.8 Style Plan

- close target key
- shell target key
- open target key
- rootless target key
- A/B recompute
- unsupported
- no persistence
- no official coverage

## 28.9 Step

- L4
- L5
- degrees only
- clean Step
- dirty Step
- no coverage
- Flow offer
- manual key

## 28.10 Flow

- clean key
- dirty key
- retry same
- skip
- next bag key
- target tempo
- acceptance window
- repeated chord
- PracticeClock

## 28.11 Eligibility

- L4 without L3
- L4 with L3
- L5 without L4
- L5 with L4
- stale
- style
- generated-close
- resolved
- unsupported mode

## 28.12 Coverage

- add unique key
- duplicate clean
- sorted
- L4 6/6
- L5 inherit L4
- L5 source key required
- L5 12/12
- no dirty add
- no Step add

## 28.13 Confirmation

- L4 fixed 2
- opposite fifth sides
- L5 stratified 4
- same-day blocked
- different-day allowed
- dirty resets challenge
- restart same keys
- L4 confirmed
- L5 confirmed
- highest level

## 28.14 Persistence

- old data
- optional transposition
- schema invariants
- applyVaultChange
- no per-note writes
- stale reset
- close flush
- fileVersion 1

## 28.15 UI

- L4 / L5 selector
- current key
- degrees only
- no chord name
- key rail
- current / cleared / confirmation
- prerequisite message
- free practice
- Style non-ranked
- Japanese / English
- screen reader labels
- narrow width


## 29.16 Mix Selection / Preflight

- 1 progression rejected
- 2 progressions
- 5 progressions
- 6th selection rejected
- L1
- L2
- L3 all keys present
- L3 missing key
- Flow all 4/4
- Flow unsupported signature
- Style all supported
- Style unsupported
- explicit fallback
- no silent exclusion

## 29.17 Progression Bag

- no duplicate until exhausted
- fixed seed
- different seed
- 2 progression alternation
- 5 progression
- second cycle
- cycle boundary no repeat
- no persistence
- manual snapshot order independence

## 29.18 Mix Step

- first progression
- clean progression
- dirty progression
- next progression
- between screen
- cycle complete
- multiple cycles
- current title only
- existing Step matcher reused

## 29.19 Mix Flow

- common BPM
- 1 bar count-in
- clean progression
- dirty progression
- does not stop on miss
- next progression
- no tempo ramp
- existing PracticeClock
- repeated chord
- pause / resume

## 29.20 Mix Summary / Retry

- clean list
- dirty list
- dirty subset retry
- all clean
- one dirty
- same selection retry
- no percentage
- no score
- no practice persistence

## 29.21 Mix Non-persistence

- confirmed unchanged
- provisional unchanged
- transposition coverage unchanged
- lastPracticedAt unchanged
- fingerprint unchanged
- selected IDs not saved
- seed not saved
- result not saved
- Vault diff zero


## 29.22 Regression

- L1 / L2 / L3
- easy / normal / strict
- Step / Flow
- provisional / confirmed L1〜L3
- Voicing Memory
- Piano Keyboard Visualizer
- Style Voicing Practice
- Live MIDI Mini Mode
- PlaybackController
- Vault
- Progression Detail
- Quick Editor
- Progression Advisor
- Import / Export
- Backup

---

# 30. ユーザー実機確認書に含める項目

## 29.1 準備

推奨進行:

```text
Cmaj7 | Am7 | Dm7 | G7
Key C major
```

次:

```text
C/E | Fmaj7 | G/B | Cmaj9
```

minor:

```text
Am9 | Dm9 | E7#5 | Am9
Key A minor
```

## 29.2 L4

- C majorから6キー
- poolがF / G / Bb / D / Eb / A相当
- 元Cがcoverageにない
- random bagで重複しない
- manual key
- degreeだけ
- Step
- Flow
- 6 / 6
- provisional

## 29.3 L5

- 12キー
- 元キー含む
- L4 coverage継承
- 残りキー
- 12 / 12
- provisional

## 29.4 Chord Transposition

- C/E → D/F#
- A7#5を複数Key
- dim
- sus
- 1小節2コード
- 表記と音

## 29.5 Minor

- A minor
- target key naming
- degree維持
- 12キー

## 29.6 Voicing

- resolved
- target key
- 全体octave offset
- コードごとにoctaveが跳ねない
- source欠損eventのfallback

## 29.7 Style

- shell × L4
- rootless × L5
- 段位対象外
- coverage不変
- target keyで再生成
- exact pitch

## 29.8 Confirmation

当日:

- L4／L5 provisional
- same-day confirmedにならない
- 固定challenge keys

翌日:

- 同じchallenge keys
- L4 2キー
- L5 4キー
- confirmed badge


## 30.9 Mix Session

準備:

- 2〜5件の保存進行
- L1〜L3で練習可能
- うち1件は意図的に難しい進行

確認:

- ミックス選択mode
- 2件未満では開始不可
- 5件まで選択可能
- 6件目を拒否
- 1巡
- 2巡
- 3巡
- 一巡まで同じ進行が重複しない
- 巡境界で同じ進行が連続しない
- 現在進行の演奏中に次進行名が見えない
- Stepで進行を順番に完了
- Flowで共通BPM
- 進行間1小節count-in
- dirtyでも次の進行へ進む
- 終了時にdirty進行だけ再挑戦
- Session summary
- score／percentageなし

## 30.10 Mix Target Source

- 保存ボイシング
- 自動クローズ
- シェル
- オープン
- ルートレス
- 未対応コードのpreflight
- 明示fallback

## 30.11 Mix非永続

Mix前後で確認:

- confirmedLevel不変
- provisional不変
- L4／L5 Key coverage不変
- lastPracticedAt不変
- Queue badge不変
- app restart後に選択進行が復元されない

## 30.12 Mix制約

- L4を選択中はMix開始不可
- L5を選択中はMix開始不可
- L3でKeyなし進行を含めると開始不可
- Flowで4/4以外を含めると開始不可
- エラー対象を一覧表示


## 30.13 Regression

- L1〜L3
- normal provisional
- Style practice
- Vault試聴
- Progression Detail
- Live MIDI
- app restart

## 30.14 不具合報告テンプレート

```text
確認番号:
進行:
Source Key / Mode:
Level:
Target Key:
Target Source:
Style:
Mode:
BPM:
表示された度数:
期待コード:
実際の移調コード:
押したMIDI note:
期待:
実際:
再現率:
スクリーンショット:
console / log:
```

---

# 31. 受け入れ条件

## Level

- L4／L5選択可能
- L4は近接6キー
- L5は12キー
- major／minor
- unsupported mode guard
- Keyなしguard
- prerequisite
- free practice

## Transposition

- 元進行から直接移調
- root／slash bass同量
- quality／extension維持
- degree維持
- event timing維持
- user-facing spelling
- deterministic

## Key Session

- shuffle bag
- no repeat
- manual key
- round boundary change
- Step no coverage
- Flow clean coverage
- dirty retry
- skip no clear

## Voicing

- resolved transposition
- whole-plan global octave
- generated fallback
- close target key
- Style target key
- A/B recompute
- no persistence

## Progress

- L4 6/6
- L4 2-key next-day confirmation
- L5 12/12
- L5 4-key next-day confirmation
- fixed confirmation keys
- confirmedLevel 4／5
- stale reset
- optional schema
- fileVersion 1

## Mix Session

- 2〜5進行
- L1〜L3
- common settings
- preflight
- progression shuffle bag
- no duplicate per cycle
- cycle boundary no repeat
- Step
- Flow
- common BPM
- count-in
- dirty subset retry
- session summary
- no official progress
- no Vault diff
- L4／L5との同時利用なし

## Boundary

- Style segment non-ranked
- Key Mixなし
- new Styleなし
- LLM変更なし
- Analyzer変更なし
- Voicing extraction変更なし
- Vault試聴変更なし
- applyVaultChange

## Quality

- lint
- tests
- typecheck
- cargo test
- Web build
- Tauri build
- installer
- implementation report
- user verification checklist

---

# 32. Rollback

問題がある場合:

1. L4／L5をfeature flagで非表示
2. Mix Sessionを別feature flagで非表示
3. L1〜L3の単独練習は維持
4. optional transposition progressは放置
5. Mixは非永続のためmigration不要
6. target eventは非永続
7. schema migration不要
8. Vault／Voicing／Styleへの影響なし

---

# 33. Phase 3.9.4以降

ユーザー実機確認後に判断する。

候補:

- L4 pool customization
- random mode変更
- modal transposition
- latency calibration
- key-specific弱点の非永続ナッジ
- L4／L5とMix Sessionを組み合わせるKey Mix
- Mix Sessionのキーも混ぜる任意モード
- 12キーStyle Challenge
- Guide Tone／Drop 2追加
- key wheel visualization

ユーザー確認前には着手しない。

---

# 34. 最終メッセージ

L4／L5は、コードを12回コピーする機能ではない。

```text
同じ度数構造を理解する
↓
ターゲットキーを認識する
↓
コード名を見ずに鍵盤へ変換する
↓
進行として止まらず弾く
↓
別の日にも再現する
```

ための移調練習である。

```text
L4
近い6キーで転用する

L5
12キーすべてで転用する

Mix Session
複数の進行をその場で切り替えて取り出す
```

**元キーで覚えた進行をどのキーでも使える語彙へ変え、複数の語彙を作曲中に即座に切り替えられる状態へ進める。**

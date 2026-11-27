# Loop Vault Phase 3.9.2 Codex作業指示書
## Style Voicing Practice
### 元／保存ボイシングを既定に保ち、シェル・オープン・ルートレスを同じ進行で練習する

---

## 0. 結論

Phase 3.9.2では、Chord Dojoの練習ターゲットへ「スタイルボイシング」を追加する。

現在のChord Dojoは、Phase 3.8.5のVoicing Resolverが返すボイシングをお手本として使用する。

Phase 3.9.2では、この既定動作を維持したまま、セッション中だけ次のスタイルを選べるようにする。

```text
既定:
保存ボイシング
→ practiceVoicingOverride
→ sourceVoicing
→ 自動生成fallback

追加:
自動（クローズ）
シェル 1-7
オープン 1-7
ルートレス A/B
```

目的は、個別の進行に保存された押さえ方を覚えるだけでなく、同じ進行を使って汎用的なボイシングの型を身体化することである。

```text
好きな進行を選ぶ
↓
スタイルを選ぶ
↓
進行全体を一貫した積み方へ変換
↓
L1では鍵盤ガイドを見て弾く
↓
L2 / L3では形を思い出して弾く
```

スタイル生成結果は保存しない。

スタイル練習は通常のL1〜L3段位、仮クリア、別日確定へ影響させない。

新しい練習セッションを開くたび、ターゲット源は必ず`保存ボイシング`へ戻す。

Phase 3.9.2のテーマ:

**「元の響きを既定に保ちながら、同じ進行でボイシングの型を増やす」**

---

# 1. 前提

Phase 3.9.2は、次が実装済みであることを前提とする。

## 1.1 Phase 3.8.5

- 安定event ID
- `sourceVoicing`
- `practiceVoicingOverride`
- `simultaneous-voicing`
- `aggregated-note-set`
- `capturedForChordKey`
- compatibility / stale判定
- `practice → source → generated` Resolver
- explicit MIDI noteを使うPlayback
- Progression DetailのVoicing表示
- 鍵盤で記録

## 1.2 Phase 3.9.0

- Chord Dojo常設タブ
- 練習キュー
- L1 / L2 / L3
- Step / Flow
- easy / normal / strict
- held-only判定
- PracticeClock
- 仮クリア / 別日確定
- practice fingerprint
- practice optional永続化

## 1.3 Phase 3.9.0.1

- 実際の白鍵・黒鍵配置
- Piano Keyboard Visualizer
- held / foreign / sustainedの表示
- C音オクターブラベル
- L1のみGuide表示
- L2 / L3の答え漏洩防止

## 1.4 既存境界

- `SavedProgressionBlock`
- `ProgressionPracticeProgress`
- `PlaybackController`
- `LiveMidiService`
- `Practice Matcher`
- `Voicing Resolver`
- `chordVoicing.ts`
- `applyVaultChange()`
- autosave / backup
- 日本語 / English

---

# 2. Phase 3.9.2の責務

## 2.1 行うこと

- Chord Dojoへターゲット源セレクタを追加
- 保存ボイシングを既定にする
- 自動クローズを明示的に選べるようにする
- シェル1-7を生成する
- オープン1-7を生成する
- ルートレスA/Bを生成する
- 進行単位で声部連結を最適化する
- 左手／右手の推奨ノートを分ける
- 手の最大スパンを守る
- スタイル対応外コードを明示する
- 指定音高判定を追加する
- 全体オクターブ移動だけを許容する
- ピッチクラスだけの緩い判定へ切替可能にする
- Style選択中の事前試聴をStyle Voicingへ追従させる
- Style練習を段位対象外にする
- 実装後のユーザー実機確認書を作る

## 2.2 行わないこと

- Style生成結果のVault保存
- Styleごとの段位・進捗保存
- L4 / L5
- 12キーランダム移調
- Mix Session
- 1-5-10
- Drop 2
- Guide Tone 3-7
- Quartal
- ユーザー定義Style Editor
- 運指判定
- 左右の手を実際に判別する処理
- Chord Drip repositoryのruntime import
- 既存自動Voicingの挙動変更
- Phase 3.8.5 Resolverの優先順位変更
- Practice Progress schema変更
- `fileVersion`変更
- LLM / MIDI Analyzer変更

---

# 3. 中心設計

## 3.1 ターゲット源

```ts
export type PracticeTargetSource =
  | {
      type: "resolved-voicing";
    }
  | {
      type: "generated-close";
    }
  | {
      type: "style";
      styleId:
        | "shell-17"
        | "open-17"
        | "rootless-ab";
      rootlessVariantPolicy?: "auto";
    };
```

MVPではルートレスA固定／B固定の選択を追加しない。

A/Bは進行全体の声部連結コストから決定する。

## 3.2 既定

新規セッション、別進行選択、アプリ再起動時:

```text
resolved-voicing
```

へ戻す。

前回選んだStyleをVault、practice progress、localStorageへ保存しない。

## 3.3 UI表示名

```text
保存ボイシング（既定）
自動（クローズ）
シェル 1-7
オープン 1-7
ルートレス A/B
```

`保存ボイシング`はPhase 3.8.5 Resolverを使う。

実際の出自は別chipで表示する。

```text
鍵盤で記録
元MIDI
元MIDIから推定
自動フォールバック
```

## 3.4 Style練習中

画面へ常時表示する。

```text
スタイル練習
段位対象外
```

Style練習では次を更新しない。

- provisional
- confirmedLevel
- lastPracticedAt
- practice fingerprint
- Queueの確認待ち
- Vault / Detailの段位バッジ

Style練習のクリーンドット、現在位置、BPMはセッション内だけ。

---

# 4. データモデル

## 4.1 Style ID

```ts
export type VoicingStyleId =
  | "shell-17"
  | "open-17"
  | "rootless-ab";
```

`generated-close`は既存generator adapterであり、Style catalogの新規アルゴリズムとは分けてよい。

## 4.2 生成結果

```ts
export interface GeneratedStyleVoicing {
  eventId: string;
  chordKey: string;

  styleId:
    | "generated-close"
    | VoicingStyleId;

  generatorVersion: number;

  leftHandNotes: number[];
  rightHandNotes: number[];
  allNotes: number[];

  variant?: string;

  requiredIntervals: string[];
  addedColorIntervals: string[];
  omittedIntervals: string[];

  warnings: StyleVoicingWarning[];
}
```

## 4.3 Warning

```ts
export type StyleVoicingWarning =
  | "unsupported-chord"
  | "fallback-close"
  | "span-reduced"
  | "optional-tone-omitted"
  | "added-neutral-color"
  | "low-interval-adjusted";
```

## 4.4 Plan

```ts
export interface GeneratedStyleVoicingPlan {
  progressionFingerprint: string;

  styleId:
    | "generated-close"
    | VoicingStyleId;

  generatorVersion: number;

  events: GeneratedStyleVoicing[];

  unsupportedEvents: {
    eventId: string;
    chordLabel: string;
    reason: string;
  }[];
}
```

## 4.5 非永続

以下を保存しない。

- `GeneratedStyleVoicing`
- `GeneratedStyleVoicingPlan`
- Style選択
- Style clean dots
- exact / pitch-class選択
- rootless A/B選択結果

端末設定へ保存可能なのは手の最大スパン等だけ。

---

# 5. 端末設定

```ts
export interface VoicingPracticePreferences {
  maxLeftHandSpanSemitones: 12 | 14 | 16;
  maxRightHandSpanSemitones: 12 | 14 | 16;

  allowGlobalOctaveShift: boolean;
}
```

既定:

```text
左手最大スパン: 12 semitones（オクターブ）
右手最大スパン: 12 semitones（オクターブ）
全体オクターブ移動: 許可
```

表示:

```text
オクターブ
9度
10度
```

内部値:

```text
オクターブ = 12
9度 = 14
10度 = 16
```

この設定はVault `data.json`へ保存しない。

Style選択と判定modeはセッションごとに既定へ戻す。

---

# 6. Style Compatibility

## 6.1 API

```ts
export interface StyleCompatibility {
  supported: boolean;

  reason?: string;

  fallbackStyleId?: "generated-close";
}
```

```ts
export function getStyleCompatibility(
  chord: ChordSymbol,
  styleId: VoicingStyleId,
): StyleCompatibility;
```

## 6.2 `generated-close`

既存`chordVoicing.ts`が対応するコードを対象とする。

既存generatorを変更せずadapterで包む。

## 6.3 `shell-17`

対象:

- major / minor triad
- maj7 / m7 / dominant7
- 6 / 6/9
- add9
- 9 / 11 / 13
- sus2 / sus4
- half-diminished
- diminished
- augmented
- altered dominant
- slash chord

ただし、ChordSymbol parserで必要intervalを取得できないものは対象外。

### 7thがあるコード

左手:

```text
Root + 7th
```

右手:

```text
3rdまたはsus
+
特徴的extension 1〜2音
```

### 7thがないコード

左手fallback:

```text
Root + 3rd
```

sus:

```text
Root + sus tone
```

右手:

```text
5thまたは明示add / 6 / 9
```

slash chord:

- 指定Bassを左手最低音へ含める
- RootとBassが異なる場合、span内でRootを省略可能
- 省略内容をmetadataへ残す

## 6.4 `open-17`

対応コード族はshell-17と同じ。

特徴:

- 左手のRoot／Bassと7thまたは3rdを開離
- 右手の3rd／susとextensionを中高域へ配置
- 各手の隣接音間隔をcloseより広くする
- 同じPitch Classの無意味な重複を避ける

必須:

- 和声機能を定義する3rdまたはsus
- 7thが明示されていれば7th
- altered 5thがqualityを定義する場合はaltered 5th
- 明示された特徴的extension

## 6.5 `rootless-ab`

MVP対応:

- maj7 / maj9 / maj13
- m7 / m9 / m11
- dominant7 / 9 / 13
- altered dominant
- m7b5 / m9b5相当

MVP対象外:

- major / minor triad
- sus2 / sus4
- 6 / 6/9
- augmented triad
- diminished7
- slash chord
- No Chord / unknown

対象外コードを含む場合、黙って生成しない。

---

# 7. Rootless A/B Template

## 7.1 Major family

A:

```text
3 - 5 - 7 - 9
```

B:

```text
7 - 9 - 3 - 5
```

## 7.2 Minor family

A:

```text
b3 - 5 - b7 - 9
```

B:

```text
b7 - 9 - b3 - 5
```

## 7.3 Dominant family

A:

```text
3 - 13 - b7 - 9
```

B:

```text
b7 - 9 - 3 - 13
```

## 7.4 Half-diminished family

A:

```text
b3 - b5 - b7 - 9
```

B:

```text
b7 - 9 - b3 - b5
```

## 7.5 Altered dominant

必須:

```text
3
b7
```

残りはコード名に明示されたaltered tensionを優先する。

例:

```text
b9
#9
#11
b13
#5
```

標準9 / 13と明示alterationが衝突する場合、明示alterationを使用する。

## 7.6 Neutral color policy

ルートレスの型を成立させるため、次のneutral colorを追加できる。

- major / minor: 9
- dominant: 9 / 13
- m7b5: 9

追加した音は必ず、

```ts
addedColorIntervals
```

へ記録する。

UI tooltip:

```text
このスタイルの標準形として9thを追加しています。
```

ユーザーへ無言でコード名そのものが変わったように見せない。

---

# 8. Tone Policy

## 8.1 型

```ts
export interface StyleTonePolicy {
  requiredIntervals: string[];
  preferredIntervals: string[];
  droppableIntervals: string[];
  forbiddenIntervals: string[];
}
```

## 8.2 Shell / Open

必須:

- Rootまたは指定Bass
- 3rdまたはsus
- 明示7th
- qualityを定義するaltered 5th
- 明示された特徴的extension

優先:

- 9
- 13
- 11
- 6
- 5th

削除優先:

1. 無意味なオクターブ重複
2. 通常の5th
3. 暗黙のcolor tone
4. 第2のoptional tension

必須音を削除しない。

## 8.3 Rootless

必須:

- 3rd
- 7th
- qualityを定義するaltered tone

優先:

- 9
- 13
- 5th
- 明示altered tension

Root:

```text
原則禁止
```

指定Bass／slash chordはMVP対象外。

## 8.4 Span failure

必須音を維持したまま最大スパンへ収まらない場合:

```text
unsupported
```

壊れたボイシングを生成しない。

UI:

```text
現在の最大スパンでは、このスタイルを生成できません。
```

---

# 9. Register / Hand Range

## 9.1 既定range

内部MIDI note基準。

```ts
export const STYLE_VOICING_REGISTER = {
  leftHandMin: 36,
  leftHandMax: 64,

  rightHandMin: 52,
  rightHandMax: 88,

  leftHandCenter: 48,
  rightHandCenter: 67,
} as const;
```

実機QAで調整可能な定数へ集約する。

## 9.2 Hard constraints

- MIDI 0〜127
- 左右手crossingなし
- 左手最高音 <= 右手最低音
- 各手のspan設定以内
- Low Interval Limit違反なし
- 同一MIDI note重複なし
- 2〜8音程度
- 演奏不能な過剰音数を避ける

## 9.3 Hand detectionに関する注意

Loop Vaultは、ユーザーが実際にどちらの手で弾いたか判定できない。

`leftHandNotes` / `rightHandNotes`は**推奨する分担**である。

UI文言:

```text
左手の目安
右手の目安
```

次を表示しない。

```text
正しい手で弾けました
```

実際の判定は`allNotes`だけを使う。

---

# 10. Candidate Generation

## 10.1 進行単位

コード単体で最上位候補を選ばない。

```text
各コードのStyle候補を生成
↓
進行全体の声部連結コストを計算
↓
DPで一連の形を決定
```

## 10.2 API

```ts
export interface GenerateStyleVoicingOptions {
  maxLeftHandSpanSemitones: number;
  maxRightHandSpanSemitones: number;

  allowUnsupportedFallback: boolean;
}

export function generateStyleVoicingPlan(
  progression: readonly SavedChordEvent[],
  styleId:
    | "generated-close"
    | VoicingStyleId,
  options: GenerateStyleVoicingOptions,
): GeneratedStyleVoicingPlan;
```

実際の既存イベント型を利用する。

## 10.3 Candidate数

各event / variantで候補を作る。

目安:

```text
8〜48候補
```

無制限な総当たりをしない。

## 10.4 Cost

```ts
transitionCost =
  totalVoiceMotion
  + unmatchedVoicePenalty
  + topVoiceLeapPenalty
  + lowestVoiceLeapPenalty
  + handRegisterPenalty
  + noteCountChangePenalty
  + lowIntervalPenalty
  - commonToneBonus;
```

Hard invalid:

- hand crossing
- span超過
- required tone欠落
- Low Interval Limit違反
- register外
- duplicate note

## 10.5 Voice assignment

左手と右手を別々に比較する。

- noteを昇順
- 同じvoice indexを基本対応
- 音数差にはunmatched penalty
- 独立したオクターブ移動を勝手に許さない
- common MIDI noteを優先保持

## 10.6 Start cost

最初のコード:

- hand centerへの距離
- span
- low interval
- top noteの極端な高さ
- bassの極端な低さ

で決める。

## 10.7 Tie-break

同score:

1. style variant固定順
2. leftHandNotesのlexicographic order
3. rightHandNotesのlexicographic order
4. normalized chord key
5. eventId

乱数・時刻・Map iteration orderへ依存しない。

---

# 11. Existing Close Adapter

## 11.1 方針

既存`chordVoicing.ts`を変更しない。

```text
自動（クローズ）
↓
既存generator adapter
```

## 11.2 Hand split

既存generatorが左右手情報を返さない場合、表示用の決定的heuristicを作る。

例:

- 4音以下: 最低1音を左手
- 5音以上: 最低2音を左手
- 残りを右手
- crossingを避ける

これは表示上の目安だけ。

既存Vault / Detail試聴のVoicingを変更しない。

## 11.3 Regression

同じChordSymbol入力に対し、Phase前後で既存自動Voicingの`allNotes`が一致すること。

---

# 12. Unsupported Chord Policy

## 12.1 strict default

Styleを選んだ進行に対象外コードがある場合、セッション開始前に表示する。

```text
この進行にはルートレスA/Bへ未対応のコードが2件あります。

3小節目: Csus4
6小節目: F/A
```

既定:

```text
開始不可
```

## 12.2 明示fallback

ユーザーが次をONにした場合だけ開始可能。

```text
未対応コードだけ自動（クローズ）を使用
```

fallback eventにはchipを表示する。

```text
自動
```

Styleとして偽表示しない。

## 12.3 Fallback state

`allowUnsupportedFallback`はセッション状態。

Vaultへ保存しない。

新規セッションではOFFへ戻す。

---

# 13. Dojo UI

## 13.1 セレクタ

Session開始前に追加する。

```text
練習するボイシング

[保存ボイシング（既定） ▾]
```

選択肢:

```text
保存ボイシング（既定）
自動（クローズ）
シェル 1-7
オープン 1-7
ルートレス A/B
```

## 13.2 Style説明

選択時に1〜2行表示する。

### シェル1-7

```text
左手の目安: Root + 7th
右手の目安: 3rd + Tension
少ない音で和声機能を捉える練習です。
```

### オープン1-7

```text
Root / 7thと上声を広く配置します。
開いた音場と左右の分担を練習します。
```

### ルートレスA/B

```text
Rootを省き、3rd・7th・9th・13thを中心にします。
進行全体の接続からA/Bを自動選択します。
```

## 13.3 Origin / Variant

現在eventへ表示する。

```text
シェル 1-7
```

```text
ルートレス A
```

```text
ルートレス B
```

fallback:

```text
自動
```

## 13.4 Left / Right Guide

L1の鍵盤Visualizerでは、Guideを左右の推奨分担へ区別できるようにする。

色を増やしすぎない。

推奨:

- 左手Guide: deep teal outline
- 右手Guide: mint outline
- held: 既存の強いmint
- foreign: amber
- sustain: muted blue

凡例:

```text
左手の目安
右手の目安
押鍵中
構成外
ペダル保持
```

L2 / L3では左右Guideを非表示。

## 13.5 文字情報

L1:

```text
左手の目安: Bb3・A4
右手の目安: D5・F5・G5
```

L2 / L3:

- target note名を表示しない
- `5音の形`程度だけ
- 答えを漏らさない

## 13.6 Target change

Style変更は次でのみ許可する。

```text
idle
ready
paused
```

running中に変更しようとした場合:

```text
一時停止してボイシングを変更しますか？
```

変更時:

- current roundを破棄
- clean dotsをreset
- currentEventIndexを0
- planを再生成
- practice progressは変更しない

---

# 14. 判定モード

## 14.1 Style練習の既定

```text
指定音高
```

## 14.2 Mode

```ts
export type StyleVoicingMatchMode =
  | "exact-pitch"
  | "pitch-class";
```

## 14.3 Exact Pitch

```ts
export interface ExactPitchMatchOptions {
  allowGlobalOctaveShift: boolean;
  octaveShiftCandidates: readonly number[];
}
```

既定:

```text
allowGlobalOctaveShift = true
octaveShiftCandidates = [-24, -12, 0, 12, 24]
```

判定:

```text
sorted held MIDI notes
===
sorted target MIDI notes + 同一offset
```

必要条件:

- note count一致
- 全MIDI note一致
- 余分なheld noteなし
- sustainedは無視
- 全音へ同じoffset

禁止:

- 各音別のオクターブ移動
- 左右手別のオクターブ移動
- Pitch Classだけの独立配置
- 手の判定

## 14.4 Pitch Class

```text
ゆるく（ピッチクラス）
```

判定:

- targetのunique Pitch Class集合
- heldのunique Pitch Class集合
- 完全集合一致
- octave duplicateは無視
- 余分なPitch Classは不通過

Style形の練習効果は弱くなるため、既定にしない。

## 14.5 Resolved Voicing選択時

通常のChord Dojo Matcherを使う。

Style専用exact-pitch matcherへ切り替えない。

```text
resolved-voicing
→ 既存easy / normal / strict
```

`generated-close`またはStyle選択時だけ、Style Voicing Match Modeを使う。

## 14.6 UI

```text
判定

● 指定音高
○ ゆるく（ピッチクラス）
```

「完全一致」という文言は使わない。

手指まで判定する印象を避ける。

---

# 15. L1 / L2 / L3との関係

## 15.1 L1

表示:

- Style Guide
- 左右手の目安
- 現在held
- foreign
- sustain
- Style名 / variant

判定:

- Style Match Mode

## 15.2 L2

表示:

- コード名
- Style名
- Guide note非表示
- held / foreign / sustain

判定:

- Style Match Mode

## 15.3 L3

表示:

- 度数
- Style名
- Guide note非表示
- held / foreign / sustain

判定:

- Style Match Mode

## 15.4 段位

Style modeでは、L1〜L3は表示難度としてのみ使用する。

- provisionalを作らない
- confirmedを作らない
- target tempo達成を保存しない
- Queue badgeを変更しない

UI:

```text
このセッションは段位対象外です。
```

---

# 16. Step / Flow

## 16.1 Step

- Style targetを提示
- exact / pitch-class match
- 100ms stable
- 次へ進む
- clean dotsはセッション内

## 16.2 Flow

- Style targetへ追従
- PracticeClockは既存
- acceptance windowは既存
- missでも継続
- clean roundはセッション内
- provisional / confirmed更新なし

## 16.3 repeated chord

Style targetの絶対noteが同じ場合も、既存attack revisionを要求する。

heldしたまま次eventへ通過させない。

## 16.4 Tempo ramp

使用可能。

セッション内のみ。

Style練習のBPMをpractice progressへ保存しない。

---

# 17. 事前試聴

## 17.1 Dojo内

Session開始前またはpause中の進行試聴は、現在Target Sourceへ追従する。

```text
resolved-voicing
→ Phase 3.8.5 Resolver

generated-close
→ existing close adapter

style
→ GeneratedStyleVoicingPlan
```

## 17.2 PlaybackController

既存の単一再生を維持する。

新しいaudio pathを作らない。

## 17.3 他画面

次は変更しない。

- Vault試聴
- Progression Detail試聴
- Home試聴
- Capture試聴
- Quick Editor試聴

Style選択はChord Dojoセッション内だけ。

---

# 18. Low Interval Limit

## 18.1 方針

Chord Dripの考え方を監査するが、runtime importしない。

Loop Vault側の純関数として実装する。

## 18.2 Hard invalid例

低域で次のような過密配置を避ける。

- 半音
- 全音
- 短3度

ただし、具体的閾値は既存Chord Drip仕様を監査し、根拠なく新規係数を作らない。

成果物:

```text
docs/phase3.9.2-chord-drip-voicing-audit.md
```

監査項目:

- Low Interval Limit table
- voice-leading cost
- common tone
- register
- rootless templates
- tie-break
- random seed依存
- license / provenance

## 18.3 Seed

Chord Dripの乱数tie-breakを移植しない。

固定順序へ変更する。

---

# 19. Domain構成

新設候補:

```text
src/domain/voicingPractice/
  types.ts
  catalog.ts
  compatibility.ts
  tonePolicy.ts
  register.ts
  generateCandidates.ts
  generateShell17.ts
  generateOpen17.ts
  generateRootless.ts
  closeAdapter.ts
  lowIntervalLimit.ts
  transitionCost.ts
  optimizeProgression.ts
  exactPitchMatch.ts
  pitchClassMatch.ts
  preferences.ts
  index.ts
```

React、Zustand、Tauri、Tone.jsへ依存しない。

既存`src/domain/voicing/`へ無理に混在させず、Voicing MemoryとStyle生成の責務を分ける。

ただし共通するChord normalization等は再利用する。

---

# 20. 性能

## 20.1 計算タイミング

- 進行選択時
- Target Source変更時
- Span設定変更時
- unsupported fallback変更時

Note Onごとに再生成しない。

## 20.2 Cache

セッション内cache key:

```text
progressionFingerprint
styleId
generatorVersion
leftSpan
rightSpan
fallbackPolicy
```

Vaultへ保存しない。

## 20.3 目標

8〜16 event:

```text
p50 <= 10ms
p90 <= 30ms
```

32 event:

```text
<= 100ms
```

実測値を報告する。

「1ms級」と事前断定しない。

---

# 21. UI Preferences

## 21.1 保存するもの

app preferences:

- left hand span
- right hand span
- global octave shift許可

## 21.2 保存しないもの

- Target Source
- Style ID
- Match Mode
- unsupported fallback
- rootless A/B結果
- clean dots
- Style session BPM

新セッションでは:

```text
保存ボイシング
```

へ戻る。

---

# 22. Feedback / Logging

## 22.1 MVP

製品分析イベントは必須ではない。

保存進捗へ一切影響しない。

## 22.2 開発者診断

保存してよい最小情報:

- styleId
- generatorVersion
- unsupported event count
- generation latency
- warning counts

保存しない:

- generated MIDI note arrays
- held note history
- user performance
- score
- mistakes
- practice result

---

# 23. 実装Stage

## Stage S0 — Audit / Baseline

- Phase 3.8.5 Resolver
- Chord Dojo session
- current Level / Step / Flow
- Practice Matcher
- Piano Keyboard Visualizer
- PlaybackController
- existing close generator
- Chord Drip voicing logic
- app preferences
- current test baseline

成果物:

```text
docs/phase3.9.2-style-voicing-audit.md
docs/phase3.9.2-chord-drip-voicing-audit.md
```

## Stage S1 — Catalog / Compatibility / Match

- Target Source型
- Style catalog
- compatibility table
- unsupported policy
- tone policy
- span preferences
- exact pitch matcher
- global octave shift
- pitch-class matcher
- tests

## Stage S2 — Deterministic Style Generator

- close adapter
- shell-17
- open-17
- rootless A/B
- left / right output
- neutral color metadata
- candidate generation
- LIL
- progression DP
- deterministic tie-break
- performance benchmark
- fixtures

## Stage S3 — Chord Dojo Integration

- target source selector
- default resolved
- style descriptions
- span settings
- match mode
- unsupported dialog
- explicit fallback
- plan generation
- L1 left / right guide
- L2 / L3 answer hiding
- Step / Flow
- pre-audition
- target change reset
- Japanese / English

## Stage S4 — Regression / User Handoff

- automated tests
- real keyboard QA
- 4 styles
- exact pitch
- octave shift
- pitch-class
- unsupported
- span
- playback
- no practice persistence
- build
- Tauri
- user verification checklist
- stop before Phase 3.9.3

---

# 24. Codexマスタープロンプト

```text
あなたはLoop Vault
（React + TypeScript + Vite + Tauri v2 + Zustand + Zod）
のPhase 3.9.2 Style Voicing Practiceを実装します。

仕様の正は
docs/phase3.9.2-style-voicing-practice-plan.md
です。

目的:
Chord Dojoの既定ターゲットをPhase 3.8.5 Resolverの
保存ボイシングに保ちながら、
自動クローズ、シェル1-7、オープン1-7、
ルートレスA/Bの一貫したボイシングを進行単位で生成し、
その形をMIDIキーボードで練習できるようにする。

絶対に守ること:

1. 新しいセッションの既定はresolved-voicing。
2. resolved-voicingはPhase 3.8.5 Resolverを使う。
3. sourceVoicing固定の別Resolverを作らない。
4. Style選択をVaultへ保存しない。
5. Style生成結果をSavedProgressionBlockへ保存しない。
6. Style練習をpractice progressへ反映しない。
7. provisional / confirmed / lastPracticedAtを更新しない。
8. Style clean dotsはセッション内だけ。
9. generated-closeは既存generatorをadapterで使う。
10. 既存chordVoicing.tsの出力を変更しない。
11. shell-17 / open-17 / rootless-abだけを新規実装する。
12. 1-5-10 / Drop2 / Guide Tone / Quartalを実装しない。
13. L4 / L5 / 12キー移調を実装しない。
14. Mix Sessionを実装しない。
15. 生成は進行単位で行う。
16. 乱数・時刻・環境依存を使わない。
17. 同点は固定順序で解決する。
18. Chord Drip repositoryへruntime依存しない。
19. Chord Dripのseed tie-breakを移植しない。
20. Style出力にleftHandNotes / rightHandNotes / allNotesを持たせる。
21. 実際にどちらの手で弾いたかは判定しない。
22. 左右手は推奨分担と表示する。
23. Styleごとの対応コード表を実装する。
24. 未対応コードへ黙って別Styleを生成しない。
25. 既定では未対応コードがあるStyle sessionを開始不可にする。
26. ユーザーが明示した場合だけ未対応コードをcloseへfallbackする。
27. fallback eventをStyleとして偽表示しない。
28. span設定は半音数で管理する。
29. 既定spanは左右とも12 semitones。
30. required toneをspan都合で削除しない。
31. required toneを保てない場合はunsupportedとする。
32. rootlessはRootを原則含めない。
33. rootlessの3rd / 7thを必須にする。
34. neutral color追加をmetadataとUI tooltipへ出す。
35. slash chordをrootless MVP対象外にする。
36. Style既定判定はexact-pitch。
37. exact-pitchは全体の同一octave offsetだけ許容する。
38. 各note別、左右手別のoctave移動を許可しない。
39.余分なheld noteがあればexact-pitch不通過。
40. sustained noteを判定へ含めない。
41. pitch-class modeを任意切替として残す。
42. resolved-voicing選択時は既存easy / normal / strictを使う。
43. L1ではStyle guideを表示する。
44. L2 / L3ではStyle guideとtarget note名を表示しない。
45. L2 / L3で答えを漏らさない。
46. Target Source変更はidle / ready / pausedだけ。
47. 変更時にround / clean dots / current eventをresetする。
48. Step / Flowの既存Clockとattack revisionを再利用する。
49. Style練習でも同一コードの押しっぱなし通過を防ぐ。
50. Dojo事前試聴だけをStyle planへ追従させる。
51. Vault / Detail / Home / Captureの試聴を変更しない。
52. PlaybackControllerの単一再生を維持する。
53. app preferencesへspanとglobal octave設定だけ保存する。
54. Target Source / Match Modeを永続化しない。
55. fileVersionを変更しない。
56. Vault schemaを変更しない。
57. LLM / MIDI Analyzer / Voicing Memory抽出を変更しない。
58. 日本語 / Englishを実装する。
59. domainをReact / Zustand / Tauri非依存にする。
60. 各Stageでlint / test / typecheck / cargo test / buildを実行する。

作業開始前に報告すること:

- Phase 3.8.5 Resolverの実API
- current Dojo target生成
- existing close generator
- chord family / interval語彙
- Chord Dripから監査する仕様
- Low Interval Limit
- Style compatibility
- UI統合点
- 変更予定ファイル
- risks
- rollback

作業終了時に必ず行うこと:

1. 実装報告書を作成する
2. docs/phase3.9.2-user-verification-checklist.md を作成する
3. 最終回答の冒頭を「ユーザー実機確認待ち」とする
4. 保存ボイシングが新セッションの既定である確認手順を書く
5. 4つの追加ターゲットを実際に弾く確認手順を書く
6. exact-pitch / global octave / pitch-classを分けて確認させる
7. unsupported chordと明示fallbackを確認させる
8. span 12 / 14 / 16を確認させる
9. Style練習で段位が変化しないことを確認させる
10. Vault / Detail試聴が変わっていないことを確認させる
11. 実機未確認の音楽的滑らかさを完了済みと書かない
12. ユーザー確認前にPhase 3.9.3へ進まない
13. ユーザー確認前に第2弾Styleを実装しない
14. PR / merge状態、生成EXE、テスト結果を報告する

コミット:
P3.9.2-SX: 要約
```

---

# 25. 自動テスト

## 25.1 Catalog / Compatibility

- shell major triad
- shell maj7
- shell sus
- shell altered
- open triad
- open extension
- rootless major
- rootless minor
- rootless dominant
- rootless altered
- rootless m7b5
- rootless triad unsupported
- rootless sus unsupported
- rootless slash unsupported
- unknown chord

## 25.2 Tone Policy

- required 3rd
- required 7th
- altered 5th
- added 9
- added 13
- duplicate drop
- fifth drop
- optional tension drop
- required tone not dropped
- unsupported on span failure

## 25.3 Span

- 12 semitones
- 14 semitones
- 16 semitones
- left only overflow
- right only overflow
- both
- hand crossing
- LIL
- register boundary

## 25.4 Determinism

- same input deep equal
- repeated 100 runs
- object insertion order
- candidate tie
- rootless A/B tie
- progression re-entry
- cache miss / hit

## 25.5 Voice Leading

- common tone
- stepwise top voice
- large leap penalty
- lowest voice
- A/B alternation
- note count change
- progression first chord
- loop end not included in MVP unless existing Dojo loop semantics require it

## 25.6 Close Adapter

- output before / after exact match
- 3-note
- 4-note
- extension
- slash
- no change to Vault playback

## 25.7 Exact Pitch

- exact notes
- one wrong note
- extra note
- missing note
- octave +12 all notes
- octave -12 all notes
- one note independently shifted
- left hand only shifted
- duplicate pitch class
- sustain ignored
- note count

## 25.8 Pitch Class

- octave free
- inversion
- duplicates
- extra pitch class
- missing pitch class
- rootless no root
- sustain ignored

## 25.9 Session

- default resolved
- select close
- select shell
- select open
- select rootless
- target change reset
- running change asks pause
- unsupported blocks start
- explicit fallback starts
- fallback chip
- Step
- Flow
- repeated chord
- no provisional
- no confirmed
- no lastPracticedAt write

## 25.10 UI

- selector
- descriptions
- span settings
- match mode
- left / right guide
- L2 hidden
- L3 hidden
- variant A / B
- neutral color tooltip
- unsupported list
- Japanese / English
- narrow width

## 25.11 Regression

- resolved Dojo
- easy / normal / strict
- Step
- Flow
- provisional / confirmed in normal mode
- Voicing Memory
- Piano Keyboard Visualizer
- Live MIDI
- PlaybackController
- Vault playback
- Progression Detail playback
- Quick Editor
- Smooth / Style candidate system
- Progression Advisor

---

# 26. ユーザー実機確認書に含める項目

## 26.1 既定

- 新しいDojoセッションを開く
- `保存ボイシング（既定）`が選ばれている
- 進行を変えても既定へ戻る
- アプリ再起動後も既定へ戻る
- 実際の出自chipが正しい

## 26.2 自動（クローズ）

- 既存自動試聴と同じ形
- L1 guide
- L2 / L3 hidden
- Vault / Detail試聴に変化なし

## 26.3 シェル1-7

- 左手の目安
- 右手の目安
- maj7
- m7
- dominant
- 7thなし
- sus
- tension
- 実際に手が届くか

## 26.4 オープン1-7

- closeより広い
- hand crossingなし
- 進行全体で滑らか
- 12 semitone span
- 14 / 16へ変更

## 26.5 ルートレスA/B

- A / B表示
- Rootを要求しない
- 3rd / 7thがある
- 9 / 13の追加tooltip
- ii-V-Iの接続
- altered dominant
- unsupported triad
- unsupported slash

## 26.6 Exact Pitch

- 表示どおり
- 全体+12
- 全体-12
- 1音だけoctave変更
- 余分な音
- pedal

## 26.7 Pitch Class

- 転回
- 別octave
- extra pitch class
- rootless

## 26.8 Step / Flow

- Stepで前進
- Flowで判定
- repeated chord
- tempo
- clean dots
- 段位が変化しない

## 26.9 Unsupported

- 開始不可
- 対象コード一覧
- fallbackを明示ON
- fallback eventに`自動`chip
- 次のセッションではOFFへ戻る

## 26.10 Persistence

- Style選択が保存されない
- generated notesがdata.jsonへ入らない
- span preferencesは保持
- practice progress不変

## 26.11 音楽的評価

各Styleについて:

```text
進行:
コード:
Style:
A/B:
手が届くか:
前後が滑らかか:
不自然な低音:
不要な重複:
欲しい修正:
```

---

# 27. 受け入れ条件

## Default / Boundary

- 新規セッションはresolved
- Phase 3.8.5 Resolverを使用
- Style結果非永続
- Style進捗非永続
- practice段位不変
- fileVersion不変
- schema変更なし

## Styles

- generated close
- shell-17
- open-17
- rootless A/B
- progression-level optimization
- deterministic
- left / right guidance
- compatibility table
- unsupported handling

## Playability

- 12 / 14 / 16 span
- required tone維持
- hand crossingなし
- LIL
- explicit unsupported
- no impossible silent output

## Match

- exact pitch既定
- all-notes global octave shift
- no independent shift
- extra note不通過
- sustain無視
- pitch-class optional
- resolved mode keeps normal matcher

## UI

- target selector
- default label
- style description
- origin / variant
- L1 guide
- L2 / L3 hidden
- no answer leak
- unsupported dialog
- fallback chip
- Japanese / English

## Playback

- Dojo pre-audition follows target
- Vault / Detail unchanged
- PlaybackController single source

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

# 28. Rollback

問題がある場合:

1. Style selectorをfeature flagで非表示
2. `resolved-voicing`固定
3. 生成結果は非永続なのでmigration不要
4. practice progress影響なし
5. Vault / Voicing Memory影響なし
6. domainとfixtureは後続改善用に残せる

---

# 29. Phase 3.9.3以降の候補

ユーザー実機確認後に判断する。

- Rootless A固定 / B固定
- 1-5-10
- Drop 2
- Guide Tone 3-7
- Quartal
- L4 / L5との併用
- 12キーStyle practice
- ユーザー定義Style
- 保存Voicingとの差分表示
- 自分専用Voicing Style

ユーザー確認前には着手しない。

---

# 30. 最終メッセージ

Phase 3.9.2は、元MIDIの押さえ方を置き換える機能ではない。

```text
保存ボイシング
→ 採集した響きを覚える

自動クローズ
→ 基本形を確認する

シェル1-7
→ 少ない音で機能を捉える

オープン1-7
→ 開いた配置と手の分担を覚える

ルートレスA/B
→ Rootなしで3rd・7th・Tensionを接続する
```

同じ進行を複数の型で回しながら、Styleの選択結果や段位管理をVaultへ増殖させない。

**元の響きを既定に保ち、必要なときだけ別のボイシング語彙を練習できるChord Dojoへ拡張する。**

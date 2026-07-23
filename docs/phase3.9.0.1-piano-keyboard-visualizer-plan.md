# Loop Vault Phase 3.9.0.1 Codex作業指示書
## Chord Dojo Piano Keyboard Visualizer UX
### 実際のピアノ鍵盤・リアルタイム押鍵表示・C音オクターブラベル

---

## 0. 結論

Phase 3.9.0.1では、Chord Dojoの鍵盤表示を「音の縦棒」から、直感的に読める実際のピアノ鍵盤UIへ刷新する。

主な完成形は次のとおり。

```text
実際の白鍵・黒鍵配置
+
L1のお手本Voicing
+
今押している鍵盤の即時ハイライト
+
構成外音・ペダル保持音の区別
+
C音だけにC3 / C4 / C5…のラベル
```

今回の修正は表示だけではない。

現在押しているMIDI noteを、既存のLive MIDI状態からリアルタイムで受け取り、鍵盤上の該当キーへ即時反映する。

ただし、Chord Dojoの正解判定は既存の100ms安定判定を維持する。

```text
鍵盤の視覚表示
→ Note On / Off後すぐ更新

練習の正解判定
→ 既存どおり100ms安定後
```

この2つを混ぜない。

Phase 3.9.0.1のテーマ:

**「どの鍵を押し、どの鍵を押すべきかを、一目で理解できる鍵盤へ」**

---

# 1. 現状の問題

現在のChord Dojo画面では、鍵盤部分が白黒の縦長ストライプに見え、次が分かりにくい。

- 白鍵と黒鍵の奥行きの違い
- 黒鍵の2本・3本の並び
- どこがCか
- どのオクターブを表示しているか
- 現在押している鍵
- お手本と押鍵の重なり
- 構成外音とペダル保持音の違い

また、「お手本」に次のようなMIDI番号がそのまま表示されている。

```text
46・60・62・65・67
```

これは開発者には正確だが、演奏者には直感的でない。

改善後は次のようにする。

```text
Bb3・C5・D5・F5・G5
```

MIDI番号は通常UIから外し、必要ならtooltipまたは開発者詳細で確認できるようにする。

---

# 2. 現行アーキテクチャとの境界

## 2.1 再利用するもの

- 既存Live MIDI transport
- `LiveMidiService`
- held notes
- sustained notes
- channel × note状態
- Chord DojoのPractice Matcher
- Phase 3.8.5のVoicing Resolver
- guide Voicing
- current chord requirements
- L1 / L2 / L3
- 日本語 / English

## 2.2 作らないもの

- 新しいRust MIDI接続
- 新しい`midir` connection
- 別のnote state
- 新しい演奏判定器
- 音源
- MIDI Thru
- クリック可能な仮想鍵盤入力
- 88鍵を常に全幅へ押し込むUI

## 2.3 変更しないもの

- 100ms安定判定
- easy / normal / strict
- held-only判定
- sustainedを正解判定へ含めない規則
- clean round
- provisional / confirmed
- PracticeClock
- PlaybackController
- Voicing Resolverの優先順位
- `fileVersion`
- Vault schema
- MIDI Analyzer
- Live MIDI Mini Mode

---

# 3. 新しい鍵盤UIの方針

## 3.1 本物の鍵盤形状

白鍵は全高。

黒鍵は次の形にする。

- 白鍵より短い
- 白鍵より細い
- 白鍵の境界へ重なる
- 2本・3本の規則に従う
- 前面に表示する

黒鍵Pitch Class:

```text
C# / Db
D# / Eb
F# / Gb
G# / Ab
A# / Bb
```

Pitch Class番号:

```text
1, 3, 6, 8, 10
```

推奨比率:

```text
白鍵幅: 1.0
黒鍵幅: 0.60〜0.64
黒鍵高さ: 全高の60〜64%
```

## 3.2 実装方式

第一候補はSVG。

理由:

- 白鍵・黒鍵の重ね合わせが安定
- リサイズしやすい
- ラベル位置を固定しやすい
- state overlayを描き分けやすい
- 49〜61鍵でもDOM量が小さい
- スクリーンショット差分テストを作りやすい

既存VisualizerがDOMで実装されている場合でも、props境界は維持し、描画層だけSVGへ置き換える。

## 3.3 再利用可能component

新設候補:

```text
src/components/music-keyboard/
  PianoKeyboardVisualizer.tsx
  PianoKey.tsx
  keyboardGeometry.ts
  keyboardRange.ts
  noteDisplay.ts
  keyVisualState.ts
  types.ts
```

Chord Dojo専用ディレクトリへ閉じ込めず、Progression DetailやVoicing Memoryでも将来再利用できる位置に置く。

---

# 4. Component API

概念例:

```ts
export interface PianoKeyboardVisualizerProps {
  minMidiNote: number;
  maxMidiNote: number;

  guideNotes: readonly number[];
  heldNotes: readonly number[];
  sustainedNotes: readonly number[];

  allowedPitchClasses: readonly number[];
  requiredPitchClasses: readonly number[];

  guideBassNote?: number;
  heldBassNote?: number;

  showGuide: boolean;
  showCLabels: boolean;

  octaveConvention: "fl-studio";

  matchState?: "idle" | "partial" | "match" | "wrong";
}
```

実際の既存型名を監査し、重複モデルを作らない。

## 4.1 L1

```text
showGuide = true
```

- お手本Voicing
- held
- foreign
- sustain

を表示する。

## 4.2 L2 / L3

```text
showGuide = false
```

お手本のハイライトは隠す。

ただし次は表示する。

- held
- foreign
- sustain
- Cラベル

L2／L3でguide noteをDOM上に見えないだけでなく、視覚的な答えとして残さない。

---

# 5. 鍵盤表示範囲

## 5.1 88鍵を縮小表示しない

画面幅へ88鍵をすべて詰めると、一鍵が細くなり、演奏フィードバックとして役立たない。

練習対象の進行に適した固定範囲をセッション開始時に計算する。

## 5.2 範囲計算

入力:

- 対象進行の全guide Voicing
- generated fallback
- source / practice Voicing
- Bass note

処理:

```text
全進行の最低音 / 最高音を取得
↓
上下へ6〜12 semitoneの余白
↓
C境界へsnap
↓
最低4octave
↓
最大5octave程度
```

概念:

```ts
export function computePracticeKeyboardRange(
  guideVoicings: readonly number[][],
): KeyboardRange;
```

## 5.3 固定範囲

選択中コードが変わるたびに、鍵盤範囲を動かさない。

```text
進行を選択
↓
範囲を計算
↓
セッション中は固定
```

鍵盤が左右へ跳ねると、位置記憶を妨げるため禁止。

## 5.4 範囲外の押鍵

held noteが範囲外の場合、鍵盤全体を即時拡張しない。

左右端へ表示する。

```text
← C2
C8 →
```

または:

```text
範囲外の入力: C2
```

次のセッション開始時に範囲を再計算してよい。

## 5.5 Voicingがない場合

guide Voicingが全くない場合は、既存generated fallbackから範囲を作る。

それも取得できない場合の既定範囲:

```text
MIDI 36〜84
```

表示ラベル規則では:

```text
C3〜C7
```

相当になる。

---

# 6. C音だけを表示する

## 6.1 表示対象

白鍵のPitch ClassがCの場合だけ、鍵盤下部へラベルを付ける。

```text
C3
C4
C5
C6
```

他の鍵盤へ音名は常時表示しない。

黒鍵へラベルを付けない。

## 6.2 オクターブ規則

ユーザーのFL Studio環境に合わせる。

```text
MIDI note 60 = C5
```

例:

```text
MIDI 48 = C4
MIDI 60 = C5
MIDI 72 = C6
```

内部MIDI note番号は変更しない。

表示だけを変換する。

## 6.3 一元化

オクターブ計算をcomponent内へハードコードしない。

```ts
export function formatMidiNoteForDisplay(
  midiNote: number,
  convention: "fl-studio",
): string;
```

将来別規則へ対応できるよう、表示規則を一か所へ集約する。

## 6.4 Cラベルの見た目

- 白鍵下部中央
- 10〜11px
- muted text
- 演奏色へ埋もれない
- 押鍵時もラベルを残す
- C5は他のCと同じ強さ
- 中央Cだけを特別に巨大表示しない

---

# 7. リアルタイム押鍵表示

## 7.1 即時表示

Note On / Note Off後、鍵盤表示は既存100ms安定判定を待たない。

```text
Live MIDI event
↓
held state更新
↓
次の描画でキー色更新
```

Practice Matcher:

```text
held state
↓
100ms stable
↓
partial / match / wrong確定
```

視覚フィードバックと判定の遅延を分離する。

## 7.2 Subscribe範囲

鍵盤componentは、Live MIDI storeの必要なsliceだけを購読する。

- held notes
- sustained notes
- connection ID
- pedal state

Chord Dojo画面全体をNote Onごとに再renderしない。

必要ならselector / memoizationを追加する。

## 7.3 Held

現在物理的に押している鍵。

- 正しい／許容されたPitch Class
- 構成外Pitch Class

を分ける。

## 7.4 Sustained

指を離したがCC64で残っている音。

- 別色
- matcherには渡さない
- heldより弱い視覚
- 正解色と混同しない

## 7.5 Note Off

pedal off:

```text
heldでないsustained note
→ 即時消去
```

## 7.6 接続切断

- held / sustained表示をclear
- 鍵盤自体は表示
- 上部へ接続切断状態
- Practice Sessionは既存仕様どおりpause

---

# 8. 色と状態の優先順位

現在のミント／アンバー／ブルー系は維持する。

色体系を増やしすぎない。

## 8.1 状態

```ts
export type PianoKeyVisualState =
  | "idle"
  | "guide"
  | "held-correct"
  | "held-foreign"
  | "sustained"
  | "guide-and-held"
  | "guide-and-sustained";
```

## 8.2 優先順位

上ほど強い。

```text
1. held-foreign
2. guide-and-held
3. held-correct
4. guide
5. sustained
6. idle
```

## 8.3 推奨表示

### idle

白鍵:

```text
off-white
dark border
```

黒鍵:

```text
charcoal
subtle border
```

### guide

- 深いティールの半透明fill
- またはティールoutline＋下部帯
- heldほど明るくしない

### held-correct

- 明るいミント
- 1〜2pxの高輝度outline
- 短いpress transition
- layout変化なし

### guide-and-held

- 明るいミントfill
- guide用の濃いティールoutline
- 「お手本と一致」を色以外でも分かるよう下部小点を表示可能

### held-foreign

- アンバーfill
- アンバーoutline
- 点滅させない
- 赤い失敗表示にしない

### sustained

- muted blue
- fill全体ではなく下部25%帯または斜線
- heldと明確に区別

## 8.4 Bass

guide Bass:

- 鍵盤下部に小さな`BASS`
- または下線

held Bass:

- 現在heldの最低音を別枠表示
- 鍵盤色をさらに増やさない

---

# 9. 色だけに依存しない

凡例を日本語化する。

現在の英語:

```text
Guide
Held
Foreign
Sustain
```

変更:

```text
お手本
押鍵中
構成外
ペダル保持
```

English表示:

```text
Guide
Held
Foreign
Sustain
```

## 9.1 凡例

- 色スウォッチ
- 日本語／英語
- 必要ならoutline / stripeの形も再現
- 1行
- 狭幅では2行wrap可

## 9.2 Screen reader

鍵盤全体:

```text
role="img"
```

概念aria-label:

```text
49鍵のピアノ鍵盤。
お手本5音、押鍵中3音、構成外1音、ペダル保持2音。
```

各鍵をTab停止させない。

仮想鍵盤入力ではなく可視化なので、88個のfocusable elementを作らない。

---

# 10. お手本カードの改善

## 10.1 MIDI番号を通常表示しない

変更前:

```text
46・60・62・65・67
```

変更後:

```text
Bb3・C5・D5・F5・G5
```

FL Studio octave規則を使う。

## 10.2 出自

右上の`自動生成`をchip化する。

例:

```text
お手本
Bb3・C5・D5・F5・G5      [自動生成]
```

出自候補:

- 鍵盤で記録
- 元MIDI
- 元MIDIから推定
- 自動生成

Phase 3.8.5 Resolverの結果をそのまま使用し、Dojo側で出自を推測しない。

## 10.3 L2 / L3

L2以降で「お手本」カードを表示し続けない。

```text
L1
→ お手本カードあり

L2 / L3
→ お手本カードを非表示
```

空白の大きなカードを残さない。

レイアウトを上へ詰める。

## 10.4 Developer detail

MIDI番号が必要な場合:

```text
詳細
Bb3 (46)
C5 (60)
...
```

通常は閉じる。

production UIへ常時数字列を出さない。

---

# 11. 入力状態の補助表示

鍵盤の下または上へ、1行だけ追加する。

## 11.1 L1

例:

```text
入力: Bb3・D5・F5
あと: C5・G5
```

または:

```text
構成外: C#5
```

L1ではお手本を見ているため、未入力音名を表示してよい。

## 11.2 L2 / L3

答えを明示しない。

```text
入力: 3音
あと1音
```

または:

```text
構成外音があります
```

L2／L3で不足Pitch Classの音名を表示すると、答えを漏らすため禁止。

## 11.3 Match

```text
一致
```

短く表示。

大きな成功演出や点数を出さない。

## 11.4 Partial

```text
あと2音
```

ニュートラル表示。

## 11.5 Wrong

```text
構成外音があります
```

アンバー。

「不正解」「失敗」の強い文言を使わない。

---

# 12. 周辺UIの整理

## 12.1 現在／次

現状の情報を維持しつつ、視覚階層を明確にする。

```text
いま
Bb6/9

つぎ
Fmaj9/A
```

- 現在コードを最大
- 次は小さく
- 進行ラベルを分離
- 余計な線を減らす

## 12.2 周回表示

右上:

```text
1周目
クリーン 0 / 2
```

小さなstatus groupにまとめる。

`クリーン周: 0/2`より、短く視認しやすくする。

## 12.3 お手本と鍵盤の間隔

- お手本カードをコンパクト化
- 鍵盤をファーストビューの主役にする
- お手本の下から鍵盤まで16px程度
- 大きな空白を作らない

## 12.4 鍵盤の高さ

推奨:

```text
desktop: 180〜220px
compact: 140〜170px
```

現在の表示幅で白鍵の縦横比が鍵盤らしく見えることを優先する。

## 12.5 狭幅

- 鍵盤は横スクロール可能
- Cラベル維持
- 黒鍵が白鍵からずれない
- 凡例はwrap
- 自動縮小で一鍵が極端に細くならない

---

# 13. Geometry実装

## 13.1 White Key Index

Pitch Classが次の場合は白鍵。

```text
0, 2, 4, 5, 7, 9, 11
```

## 13.2 Black Key X位置

各黒鍵の前後白鍵境界に配置する。

概念:

```ts
export function midiNoteToKeyboardGeometry(
  note: number,
  range: KeyboardRange,
): PianoKeyGeometry;
```

## 13.3 SVG viewBox

概念:

```text
whiteKeyCount × WHITE_KEY_UNIT
```

白鍵:

```text
x = whiteIndex * WHITE_KEY_UNIT
width = WHITE_KEY_UNIT
```

黒鍵:

```text
x = boundaryX - BLACK_KEY_WIDTH / 2
width = BLACK_KEY_WIDTH
```

## 13.4 Drawing order

```text
1. white keys
2. white key state overlays
3. white labels
4. black keys
5. black key state overlays
6. bass markers
```

ただしblack keyが白key overlayの後ろへ隠れないよう、最終的なz-orderを視覚確認する。

## 13.5 Transition

```css
fill 40ms linear
stroke 40ms linear
```

程度。

100msを超えるfadeは、入力遅延に見えるため禁止。

---

# 14. MIDI状態との接続

## 14.1 監査

実装前に次を確認する。

- Chord Dojoが現在どのstoreからheldを読んでいるか
- `heldNotes`の型
- channelごとの重複note count
- sustained set
- connection ID
- match requirements
- guide voicing
- current Level

成果物:

```text
docs/phase3.9.0.1-keyboard-visualizer-audit.md
```

## 14.2 Adapter

Visualizerへ渡す直前に、表示用の一意なMIDI note配列へ変換する。

```ts
export interface KeyboardDisplayState {
  heldNotes: number[];
  sustainedNotes: number[];
  guideNotes: number[];
  foreignHeldNotes: number[];
}
```

同じPitch Classでも別オクターブは別キーとして表示する。

## 14.3 Foreign

既存Practice Requirementsの`allowedPitchClasses`を使う。

```ts
foreignHeldNotes =
  heldNotes.filter(
    (note) => !allowedPitchClasses.includes(note % 12),
  );
```

Dojo UI用に別の音楽判定ロジックを作らない。

## 14.4 Guide

Phase 3.8.5 Resolverの絶対MIDI noteを使う。

Pitch Class要件から適当にオクターブを割り当てない。

generated fallbackの場合もResolverを通す。

---

# 15. Performance

## 15.1 目標

Note Onから押鍵色が変わるまで:

```text
p50 <= 20ms
p90 <= 40ms
```

アプリ内計測が難しい場合も、固定100ms debounceを視覚表示経路へ追加しない。

## 15.2 Re-render

- Noteイベントで練習キューを再renderしない
- Headerを再renderしない
- Current/Next全体を毎回再生成しない
- 鍵盤と小さな入力状態だけ更新
- `React.memo`
- stable selector
- Set生成のmemoization

## 15.3 Key数

最大61鍵程度なら全キー描画で問題ない。

88鍵もSVGでは可能だが、MVPでは表示範囲最適化を優先する。

---

# 16. Accessibility / i18n

## 16.1 日本語

```text
お手本
押鍵中
構成外
ペダル保持
入力
あと
一致
構成外音があります
範囲外の入力
```

## 16.2 English

```text
Guide
Held
Foreign
Sustain
Input
Missing
Matched
Foreign note detected
Input outside visible range
```

## 16.3 Contrast

- 白鍵上のmint / amberは文字なしでも見えるcontrast
- 黒鍵上は明度を上げる
- 色覚差へoutline / stripeを併用
- WCAG相当の視認性を人間QA

---

# 17. 実装Stage

## Stage K0 — Audit / Baseline

- current keyboard component
- Live MIDI state
- Practice matcher
- guide resolver
- note naming
- current octave convention
- current screenshot baseline
- render profiling

## Stage K1 — Note Display / Geometry Domain

- FL Studio octave formatter
- MIDI 60 = C5
- C-only labels
- white / black geometry
- session keyboard range
- outside-range detection
- visual state priority
- pure function tests

## Stage K2 — Piano Keyboard SVG

- reusable component
- real white / black keys
- state overlay
- C labels
- bass marker
- legend
- responsive / scroll
- Story / component tests

## Stage K3 — Live Input Wiring

- held immediate update
- sustained update
- foreign calculation
- guide + held overlap
- L1 guide on
- L2 / L3 guide off
- disconnect clear
- performance optimization

## Stage K4 — Surrounding Dojo UI Polish

- note numbers → note names
- origin chip
- current / next hierarchy
- clean status group
- input / missing / foreign message
- L2 / L3 answer leak guard
- Japanese / English

## Stage K5 — QA / User Verification

- automated tests
- real MIDI keyboard
- black key input
- C labels
- sustain
- foreign
- L1 / L2 / L3
- narrow window
- build
- Tauri
- user verification checklist
- stop before unrelated Dojo features

---

# 18. Codexマスタープロンプト

```text
あなたはLoop Vault Phase 3.9.0.1
Chord Dojo Piano Keyboard Visualizer UXを実装します。

仕様の正は
docs/phase3.9.0.1-piano-keyboard-visualizer-plan.md
です。

目的:
Chord Dojoの現在の縦ストライプ状Visualizerを、
実際の白鍵・黒鍵配置を持つピアノ鍵盤へ変更し、
MIDIキーボードで現在押している鍵を即時色変更し、
各C鍵だけにC3 / C4 / C5等を表示する。

絶対に守ること:

1. 新しいMIDI transportを作らない。
2. 既存LiveMidiService / held / sustainedを使う。
3. 正解判定ロジックを作り直さない。
4. foreign判定は既存allowedPitchClassesを使う。
5. guideはPhase 3.8.5のVoicing Resolverを使う。
6. L1だけguideを表示する。
7. L2 / L3でguideを表示しない。
8. held feedbackはL1〜L3で表示する。
9. sustainedは表示するが判定へ含めない。
10. 視覚更新は100ms stable判定を待たない。
11. Note On / Off後すぐ鍵盤色を更新する。
12. matcherの100ms判定は変更しない。
13. 白鍵と黒鍵を実際のピアノ配置で描画する。
14. 黒鍵を白鍵より短く細くし、前面へ重ねる。
15. C鍵だけにオクターブ名を表示する。
16. 表示規則はMIDI 60 = C5とする。
17. 内部MIDI note番号を変更しない。
18. note namingを一か所へ集約する。
19. C以外へ常時ラベルを付けない。
20. セッション中に鍵盤範囲をコードごとに動かさない。
21. 全進行のVoicingから固定範囲を計算する。
22. 範囲外入力は端の案内で表示する。
23. 88鍵を極端に縮小して表示しない。
24. 現行のmint / amber / blue系を維持する。
25. held-foreignを最優先表示する。
26. guideとheldの重なりを見分けられるようにする。
27. sustainは下部帯またはstripeで区別する。
28. 色だけに依存せず、凡例とoutlineを使う。
29. 凡例を日本語 / English対応する。
30. 通常UIのMIDI番号列をnote名へ置き換える。
31. raw MIDI番号は通常表示しない。
32. L1では不足音名を表示してよい。
33. L2 / L3では不足音名を表示せず、数だけ表示する。
34. 「不正解」ではなく静かな状態文言を使う。
35. Note OnごとにDojo画面全体を再renderしない。
36. 鍵盤componentだけが必要stateを購読する。
37. 鍵盤キーを88個のTab stopにしない。
38. 仮想鍵盤入力を実装しない。
39. PlaybackControllerを変更しない。
40. practice progressを変更しない。
41. clean round / provisional / confirmedを変更しない。
42. fileVersion / Vault schemaを変更しない。
43. MIDI Analyzer / LLM / Quick Editorを変更しない。
44. 日本語 / Englishを実装する。
45. 各Stageでlint / test / typecheck / cargo test / buildを実行する。

実装前に報告すること:

- 現行Visualizerのファイル
- held / sustainedの取得元
- guideの取得元
- octave namingの現状
- FL Studio規則との違い
- 画面render経路
- 変更予定ファイル
- リスク

実装後に必ず作成するもの:

docs/phase3.9.0.1-keyboard-user-verification.md

その文書には次を入れる。

- 実行EXE
- MIDIデバイス準備
- MIDI 60を押してC5表示確認
- 白鍵／黒鍵配置確認
- Guide
- Held
- Foreign
- Sustain
- L1 / L2 / L3
- Cラベル
- 範囲外入力
- 狭幅
- 問題報告テンプレート

実機未確認の項目を完了済みと書かない。
このPhase完了後、ユーザー確認前に別のDojo機能へ進まない。

コミット:
P3.9.0.1-KX: 要約
```

---

# 19. 自動テスト

## 19.1 Note name

- MIDI 48 = C4
- MIDI 60 = C5
- MIDI 72 = C6
- Bb表示
- sharp / flat context
- C以外labelなし

## 19.2 Geometry

- 1octave
- 4octave
- white key count
- black key count
- C# position
- D# position
- F# / G# / A# positions
- first / last partial octave
- no overlap error
- stable SVG viewBox

## 19.3 Range

- guide within one octave
- wide guide
- no guide
- lower edge
- upper edge
- snap to C
- min span
- max span
- fixed during session
- outside held note

## 19.4 Visual state

- idle
- guide
- held correct
- held foreign
- sustain
- guide + held
- guide + sustain
- foreign precedence
- bass marker

## 19.5 Level

- L1 guide visible
- L2 guide hidden
- L3 guide hidden
- held visible all levels
- sustain visible all levels
- L2 / L3 missing note names hidden

## 19.6 Live input

- Note On
- Note Off
- duplicate Note On count
- CC64
- pedal off
- disconnect
- reconnect
- immediate display path
- matcher still 100ms

## 19.7 UI

- note names instead of numbers
- origin chip
- Japanese legend
- English legend
- current / next
- clean status
- narrow width
- horizontal scroll
- no layout shift

## 19.8 Regression

- Practice Matcher
- Step
- Flow
- clean round
- provisional
- confirmed
- Voicing Memory
- Live MIDI Mini Mode
- Progression Detail keyboard
- PlaybackController
- Vault
- Quick Editor
- Progression Advisor

---

# 20. 人間側QA

## 20.1 ピアノ形状

- 白鍵が全高
- 黒鍵が短く細い
- 黒鍵が2本／3本で並ぶ
- C-E間、E-F間等の位置が自然
- 黒鍵が白鍵の後ろに隠れない

## 20.2 Cラベル

MIDIキーボードで中央C相当を押す。

期待:

```text
C5
```

他のC:

```text
C4
C6
```

C以外には常時ラベルがない。

## 20.3 Held

- 白鍵を押す
- 黒鍵を押す
- 複数音を押す
- 離す

押した鍵だけ即時色が変わる。

## 20.4 Guide

L1:

- お手本が深いティール
- heldすると明るいミント
- guideとheldが重なったことが分かる

L2 / L3:

- guideが完全に消える
- heldは表示される

## 20.5 Foreign

構成外音を押す。

期待:

- 該当鍵だけアンバー
- 強い赤点滅なし
- `構成外音があります`
- 現行Practice Matcherの結果と一致

## 20.6 Sustain

- 鍵を押す
- pedal down
- 鍵を離す
- pedal up

期待:

- held色からsustain色へ変化
- pedal upで消える
- sustain音だけで正解にならない

## 20.7 Note summary

L1:

```text
入力: C5・E5
あと: G5
```

L2 / L3:

```text
入力: 2音
あと1音
```

答えの音名が漏れない。

## 20.8 範囲

- 低音を押す
- 高音を押す
- 範囲外を押す

鍵盤がセッション中に動かず、端に範囲外案内が出る。

## 20.9 狭幅

- ウィンドウを狭くする
- 横スクロール
- Cラベル
- 黒鍵位置
- 凡例wrap

が壊れない。

---

# 21. 受け入れ条件

## Keyboard

- 実際の白鍵・黒鍵形状
- 2本／3本の黒鍵配置
- responsive
- 4〜5octave固定範囲
- セッション中にrangeが動かない
- outside-range案内

## Labels

- C鍵だけ表示
- MIDI 60 = C5
- C4 / C5 / C6
- C以外に常時labelなし
- internal note番号不変

## Live State

- heldを即時表示
- Note Off反映
- foreign表示
- sustain表示
- disconnect clear
- matcherの100msを維持

## Levels

- L1 guideあり
- L2 / L3 guideなし
- held feedback全Level
- L2 / L3で答えを漏らさない

## UI

- お手本のMIDI番号をnote名へ変更
- origin chip
- 日本語凡例
- current / next階層
- clean status
- 色だけに依存しない

## Performance

- Note On表示p50 20ms以内目標
- p90 40ms以内目標
- 全画面再renderなし
- キー入力でlayout shiftなし

## Boundary

- 新MIDI transportなし
- Practice Matcher変更なし
- Voicing Resolver変更なし
- Practice progress変更なし
- PlaybackController変更なし
- fileVersion変更なし
- Analyzer / LLM変更なし

## Quality

- lint
- test
- typecheck
- cargo test
- Web build
- Tauri build
- installer
- implementation report
- user verification checklist

---

# 22. Rollback

問題がある場合:

1. 新Visualizerをfeature flagで無効化
2. 旧Visualizerへ戻す
3. MIDI state / Practice Matcherは影響なし
4. 永続化変更はない
5. Vaultデータmigration不要

新旧Visualizerが同じprops境界を使うようにし、rollbackを軽くする。

---

# 23. 最終メッセージ

Chord Dojoの鍵盤は、装飾ではない。

```text
お手本を見る
↓
自分が押した鍵を確認する
↓
構成外音を理解する
↓
鍵盤上の位置を身体で覚える
```

ための中心UIである。

**実際のピアノ鍵盤として読め、押した瞬間に反応し、C5などの位置基準が分かるVisualiserへ刷新する。**

<!-- phase-id: 5.27 -->
# Loop Vault Phase 5.27 機能設計提案書 v0.1
# Progression Voicing Practice — 作曲家のためのコード進行ループ練習

> **本書はレビュー用の設計提案であり、作業指示書ではない。**
> 実装前に既存 Chord Dojo / Voicing engine / Practice data / Text Progression Entry を監査し、
> レビュー結果を反映したうえで Phase 5.27 の正式作業指示へ分割する。

---

# 1. 結論

Phase 5.27 では、保存したコード進行を一定テンポで自動送りし、
何周も止まらず弾くための新しい Practice mode を追加する。

仮称:

**Progression Voicing Practice**

目的はピアノ演奏の採点ではない。

> **好きなコード進行と、作曲で使いたいボイシングを反復し、
> 作曲時に即座に取り出せる「和声語彙」として頭・耳・手にストックする。**

中心フロー:

```text
Text Progression / MIDI Capture
        ↓
Voicingを設定
        ↓
Vaultへ保存
        ↓
[ボイシング練習]
        ↓
Count-in
        ↓
コードが自動で進む
        ↓
最後まで行く
        ↓
先頭へ戻る
        ↓
何周も弾く
```

採点、正誤判定、演奏待ちによる停止は行わない。

---

# 2. 背景

## 2.1 ユーザー目的

Loop Vault を、

```text
コード進行を保存する倉庫
```

だけでなく、

```text
好きな進行を見つける
→ 保存する
→ 実際に鍵盤で反復する
→ 自分の作曲語彙として覚える
→ FL Studio等の作曲時に取り出す
```

ためのツールへ発展させたい。

練習の目的は「ピアノ演奏力そのもの」ではなく、
**作曲に使える鍵盤力・和声語彙の定着**である。

---

## 2.2 レッスン資料との接続

ユーザーが過去に受講したピアノレッスン資料では、少なくとも以下の方向性が確認できる。

- Root / 7th を骨格としてコードを捉える
- 3rd を加えてコードの性格を捉える
- 9th 等のテンションへ発展する
- レフトハンドボイシングを扱う
- コードを固定フォームとして丸暗記するだけでなく、
  ベース・中身・メロディの層として扱う
- 実曲を題材にコード、テンション、分数コード、裏コード等へ展開する

樽栄嘉哉先生の公開教材にも、

```text
1 → 7 → 3 → メロディ
```

を基本形とし、その発展としてレフトハンドボイシング、
さらにポリコード等へ進む考え方が示されている。

Phase 5.27 はこの教育的な流れを、
**ユーザー自身が保存した好きなコード進行で反復できる機能**
へ変換する。

---

# 3. 既存 Chord Dojo との関係

## 3.1 重要な既存機能

現行仕様の Chord Dojo にはすでに:

- Step
- Flow
- MIDI入力との照合
- L1〜L5
- Source/Auto/Shell/Open/Rootless 系Voicing

が存在する。

したがって Phase 5.27 で
**別のコード練習エンジンをゼロから複製してはならない。**

---

## 3.2 なぜ新モードなのか

Chord Dojo の中心思想:

```text
目標Voicing
↓
ユーザー演奏
↓
照合
↓
段階的Skill Practice
```

Progression Voicing Practice の中心思想:

```text
時間が進む
↓
CURRENT chordが変わる
↓
ユーザーは自由に弾く
↓
採点しない
↓
止まらない
↓
何周も反復
```

最も重要な違い:

| Chord Dojo | Progression Voicing Practice |
|---|---|
| 正解Voicingとの照合 | **照合しない** |
| skill / level中心 | **作曲語彙の定着中心** |
| 演奏結果が重要 | **反復回数・流れが重要** |
| 正解を弾く練習 | **進行と響きを身体化する練習** |
| 転調Skillまで扱う | 初版では不要 |
| 採点/成功状態あり | **採点なし** |

### 設計判断

UI上は新しい Practice mode として見せる。

内部では可能な限り、

- progression snapshot
- voicing resolution
- playback
- metronome
- Live MIDI monitor
- piano keyboard visualization

を Chord Dojo と共有する。

**新モード = 新しいUX/セッションモデル**
であり、
**既存Voicing engineのコピー**
ではない。

---

# 4. ユーザーストーリー

## Story A — テキストから保存してすぐ練習

```text
| Cmaj9 | Am9 | Dm9 | G13 |
```

をText Progressionへ貼る。

Key/BPM/Voicingを確認して保存。

保存完了後:

```text
[ボイシング練習]
```

を押す。

すぐ Progression Voicing Practice が開始できる。

---

## Story B — Vaultにあるお気に入り進行を反復

Vaultで好きな進行を開く。

```text
[ボイシング練習]
```

を押す。

Voicing StyleとBPMを選択。

Count-in後、自動でコードが進み、
停止するまで無限ループする。

---

## Story C — コードの骨格を覚える

Voicing:

```text
Basic 1-7-3
```

を選択。

最初は構成音・度数を見ながら弾く。

数周後、

```text
コード名のみ
```

へ切り替え、
度数・音名を記憶から再現する。

---

## Story D — 作曲で使える響きを覚える

同じ進行を:

```text
Basic
↓
Left-hand
↓
Open
```

と切り替えて弾く。

「同じコード進行でもVoicingで響きが変わる」ことを
頭と手にストックする。

---

# 5. 新モードの基本UI

概念UI:

```text
Progression Voicing Practice

C major                 BPM 80
Voicing: Basic 1-7-3

LOOP  6

Progression
Cmaj9  →  Am9  →  Dm9  →  G13
████████████░░░░░░░░░░░░░░░░

                 CURRENT

                  Dm9

               D3   C4   F4
Degree          1   ♭7   ♭3

                 ● ● ○ ○
                 1 2 3 4

NEXT
G13

[Voicingを隠す]     [お手本]
[Pause]             [Restart]
```

---

# 6. 必須インジケータ

単一のprogress barだけでは
「いつ次コードへ進むか」が分かりにくいため、
インジケータを複数の階層へ分ける。

## 6.1 Current Chord

最も大きく表示。

```text
CURRENT
Dm9
```

---

## 6.2 Next Chord

Currentより小さく表示。

```text
NEXT
G13
```

次のコードを先読みできる。

---

## 6.3 Beat Indicator

4/4例:

```text
● ● ○ ○
1 2 3 4
```

コードが2拍の場合:

```text
● ○
1 2
```

コードが1拍の場合:

```text
●
1
```

進行に保存されている実際のdurationを使う。

**「1 chord = 1 bar」と固定しない。**

---

## 6.4 Progression Position

進行全体の現在位置を表示。

例:

```text
Cmaj9 → Am9 → [Dm9] → G13
```

またはtimeline bar。

---

## 6.5 Loop Count

```text
Loop 7
```

正解数ではなく、
単純に何周反復したかを表示する。

これはこのモードの目的と一致する。

---

# 7. 再生モデル

## 7.1 Count-in

Default:

```text
1 bar
```

設定:

```text
Off / 1 bar / 2 bars
```

初版では1 bar固定でもよい。

---

## 7.2 Auto Advance

進行の保存済みtimingに従って自動で進む。

Text Progressionで:

- 1 chord/bar → 4 beats
- 2 chords/bar → 2 beats each
- 4 chords/bar → 1 beat each

として保存されている場合、
そのdurationをそのまま使用する。

---

## 7.3 Endless Loop

進行終端:

```text
Last chord
↓
First chord
```

へ自動で戻る。

Default:

```text
Infinite
```

停止はユーザーのみ。

---

## 7.4 Pause

Pause中は現在位置を保持。

Resume:

```text
current chord / current beat
```

から再開するか、
次の拍頭から再開するかは実装前にUX監査で決定する。

---

## 7.5 Restart

```text
Loop count = 0
Progression position = first chord
Count-in
```

へ戻る。

---

# 8. 採点を行わない

これはHard Requirement。

以下をP5.27初版では行わない。

- MIDI note correctness
- inversion correctness
- timing accuracy
- velocity accuracy
- missing-note detection
- extra-note detection
- success streak
- score
- PASS/FAIL

Live MIDIは使ってよいが、

```text
入力音をモニターする
鍵盤UIへ表示する
```

まで。

ユーザーの演奏によってtimelineを止めたり進めたりしない。

---

# 9. Practice Voicing

Phase 5.27の中心。

## 9.1 基本思想

ボイシングを単に、

```text
Cmaj9 = この音を丸暗記
```

として教えるのではなく、

```text
1
7
3
9
```

のような**機能・度数として理解して弾く**。

画面には可能な限り:

```text
Pitch + Degree
```

を両方表示する。

例:

```text
Cmaj9

C3  B3  E4
1   7   3
```

---

# 10. Voicing Family A — Basic 1-7-3

## 10.1 目的

コードを見た瞬間に:

```text
Root
↓
7th
↓
3rd
```

を組み立てる能力を身につける。

作曲時の最低限のコード骨格。

---

## 10.2 Progressive Layers

Basic内を2段階に分けられる。

### Shell

```text
1 + 7
```

例:

```text
Cmaj7
C + B
1   7

Dm7
D + C
1   ♭7

G7
G + F
1   ♭7
```

### Basic Full

```text
1 + 7 + 3
```

例:

```text
Cmaj7
C + B + E
1   7   3
```

UI案:

```text
Basic

[Shell 1-7]
[1-7-3]
```

---

## 10.3 6th family

7thを含まないコードへ勝手に7thを追加しない。

例:

```text
C6
Shell: 1 + 6

Cm6
Shell: 1 + 6
Basic Full: 1 + 6 + ♭3
```

正確なfamily tableはStage00で既存Chord Dojo実装と
アップロード済みレッスン資料を照合して固定する。

---

# 11. Voicing Family B — Left-hand Voicing

## 11.1 目的

Rootlessを含む、より色彩のある実践的Jazz Voicingを
進行の流れの中で覚える。

先生の公開教材では、
バンドではBassがRootを担当し、
ピアノのLeft-hand VoicingがRootとMelodyの間を埋める
という説明がある。

したがってこのモードでは
単なる「左手だけで弾く」という意味には限定しない。

---

## 11.2 重要な設計ルール

**一般的なJazz理論から勝手にアルゴリズムを発明しない。**

ユーザーのレッスン資料には
Left-hand Voicingの具体的な作り方が含まれるが、
画像・手書き資料もあり、
すべてのChord Familyについて機械的に確定できているわけではない。

実装前に:

```text
lesson voicing rule table
```

を人間が確認できる形で明文化する。

例として資料から確認できる範囲では、
maj7 / m7 等でRootを9th側へ置換するRootless的な形が扱われている。

しかし:

```text
maj7
m7
7
m7b5
6
dim
altered dominant
```

すべてについて
同一生成規則を推測してはいけない。

---

## 11.3 Voice Leading

Left-hand Voicingではコード単体だけでなく、

```text
Previous
Current
Next
```

も考慮して、
極端なregister jumpを避ける。

ただし初版で高度な最適化を入れすぎない。

優先:

1. lesson rule correctness
2. playable register
3. deterministic result
4. reasonable voice leading

---

# 12. Voicing Family C — Open / Melody Voicing

## 12.1 目的

「コードを押さえる」から、

```text
Bass / harmonic support
+
Chord quality
+
Top note / Melody
```

を組み合わせて
**実際の作曲・伴奏へ変換する**。

---

## 12.2 問題: Text ProgressionにはMelodyがない

```text
| Cmaj9 | Am9 | Dm9 | G13 |
```

だけでは、

```text
Top note
```

は決まらない。

そのためOpen Voicingにおいて
アプリが勝手なMelodyを「正解」として生成してはいけない。

---

## 12.3 Top Note Source

設計候補:

### A. Saved Voicing Top

Custom/Source Voicingが保存されている場合:

```text
highest note
```

をtop-note referenceとして使用。

### B. User Selected Top

ユーザーがコードごとにTop Noteを指定。

将来的に:

```text
Top: D
```

など。

### C. Auto

自動Top Note生成は便利だが、
実質的に小さな作曲支援エンジンになる。

初版で採用するなら、
「正解」ではなく:

```text
Practice suggestion
```

として明示する。

---

## 12.4 v1 recommendation

レビュー前の推奨:

**Open Voicingは設計には含めるが、
Top Note契約が固まるまでproduction必須機能にしない。**

Phase 5.27初版を:

```text
Basic
Left-hand
```

で成立させ、

OpenはStage後半または次の小Phaseへ分離してもよい。

---

# 13. Saved Voicing Sources

Lesson-generated Voicingとは別に、
Loop Vaultには保存済みVoicingが存在する。

将来的なSelector:

```text
LESSON
- Basic 1-7-3
- Left-hand
- Open

SAVED
- Custom Voicing
- Source MIDI Voicing
- Auto Voicing
```

---

## 13.1 Custom Voicing

Text ProgressionでLive MIDIから登録した
Custom Voicingをそのまま反復できる。

これは:

```text
自分で作った好きな押さえ方
```

を覚える用途。

---

## 13.2 Source MIDI Voicing

MIDI Capture由来では、
元演奏から保存されたSource Voicingを練習できる。

目的:

```text
好きな曲で実際に鳴っていた響き
→ 自分の作曲語彙へ
```

---

## 13.3 Auto Voicing

Source/Customが無い場合のfallbackとして利用できる。

ただしLesson Voicingとは区別する。

---

# 14. Learn / Recall

採点を行わずに暗記負荷を上げる。

## Learn

表示:

```text
Chord name
Pitch names
Degrees
Keyboard
```

---

## Recall

表示:

```text
Chord name only
```

または:

```text
Chord name + degrees hidden
```

必要時:

```text
[Voicingを見る]
```

で一時表示。

Timelineは止めない。

---

## 14.1 初版候補

最初は2つだけ。

```text
[Voicing表示]
[コード名のみ]
```

これだけでも十分。

---

# 15. Reference Playback

ユーザーが弾く前に響きを確認できる。

操作候補:

```text
[お手本]
```

現在Chordのvoicingを1回鳴らす。

または:

```text
[1周聴く]
```

進行全体のお手本を1周だけ再生。

---

## 15.1 Practice中のAuto Sound

初版ではDefault OFFを推奨。

理由:

ユーザー自身が鍵盤で弾く練習なので、
毎Chord自動でReferenceを鳴らすと
自分の演奏と重なる。

Metronomeは独立toggle。

---

# 16. MIDI Input

MIDI keyboardは:

- input monitor
- piano keyboard highlight

のみに使う。

必要条件ではない。

MIDI未接続でもモードを開始可能。

理由:

- acoustic pianoで練習できる
- 別のhardware synthでも練習できる
- 採点しないためinput connectionを必須にする意味がない

---

# 17. Text → Save → Practice 導線

P5.27では新モードそのものだけでなく、
この導線を重要視する。

Text Progression:

```text
Parse
↓
Voicing確認
↓
Save
```

保存完了後:

```text
[ボイシング練習]
[Vaultを見る]
```

を表示する案。

Vault / Progression Detailにも:

```text
[ボイシング練習]
```

をPrimary/Secondary Actionとして配置する。

---

# 18. Practice Snapshot

開始済みsessionは元のVault recordへlive-bindingしない。

概念:

```text
ProgressionPracticeSnapshot
```

に:

- progression id/ref
- chord labels
- timings
- key
- bpm
- meter
- saved compatible voicing references
- selected practice voicing strategy

を切り出す。

セッション開始後にVault進行が変更されても、
現在のLoop Practiceは途中で変化しない。

既存Bass Practice / Chord Contextのsnapshot思想を再利用できるなら
再利用する。

---

# 19. Persistence

## v1で保存したいもの

Practice preference:

- last selected voicing family
- last BPM override
- metronome on/off
- display mode
- count-in preference

必要に応じて既存Practice dataへ保存。

---

## v1で保存しなくてよいもの

- 正誤
- score
- success streak
- MIDI note-by-note log
- raw performance
- accuracy

---

## Loop Count

Session-localで十分。

将来的に:

```text
practice count
last practiced
```

をVaultへ持たせる価値はあるが、
P5.27初版必須ではない。

---

# 20. Timing / Supported Progressions

初版は既存 Text Progression / Chord Dojo が
安全に扱える範囲を再利用する。

少なくとも:

- 4/4
- valid continuous timing
- supported BPM
- supported chord tokens

を前提。

### Important

進行中の各Chordのdurationを尊重する。

```text
1 chord/bar
2 chords/bar
4 chords/bar
```

を正しく自動送りする。

全Chordを4拍に伸ばしてはいけない。

---

# 21. Chord Vocabulary / Unsupported Voicing

コード自体は保存できても、
選択したLesson Voicing generatorが
対応できない場合がある。

例:

- unusual altered chords
- polychord
- non-standard slash semantics
- future chord vocabularies

この場合:

```text
Unsupported
```

を隠して適当な音を生成しない。

候補:

```text
このコードはLeft-hand Voicing自動生成の対象外です
[Saved Voicingを使う]
[AutoへFallback]
```

ユーザーに明示する。

---

# 22. P5.26との境界

Phase 5.27はAnalyzer精度改善Phaseではない。

以下を行わない:

- harmonic rhythm detection変更
- altered tension ranking変更
- chord naming変更
- source MIDI analysis変更
- spelling analysis変更

保存済みChord Identityを練習へ利用する。

---

# 23. P5.26.1との接続

Source MIDI Voicingを使う場合は、
P5.26.1で統一したvoicing resolver / playback planを
可能な限り再利用する。

Card / Full / Practiceで
Source Voicingの解釈が別々にならないようにする。

---

# 24. 初版の推奨Scope

## Must

### New mode
- Progression Voicing Practice

### Playback
- Count-in
- BPM
- auto advance
- endless loop
- pause
- restart
- metronome
- loop count

### Indicators
- Current
- Next
- Beat
- progression position

### Voicing
- Basic 1-7-3
  - Shell 1-7/6
  - 1-7/6-3
- Left-hand Voicing

### Display
- pitch
- degree
- keyboard
- Voicing visible / chord-only

### Sources
- saved progression
- Text Progression saved to Vault

### Philosophy
- no scoring

---

## Should

- Custom Voicing
- Source MIDI Voicing
- reference playback
- Progression Detail → Practice shortcut
- Text save → Practice shortcut

---

## Could

- Open / Melody Voicing
- custom Top Note
- one-loop reference playback
- last-practiced counter

---

## Not in v1

- performance grading
- timing grading
- AI coaching
- automatic success/failure
- complex SRS
- mandatory transposition drills
- polychord practice generator
- automatic melody composition
- broad new voicing AI
- new Analyzer

---

# 25. Why Open Voicing is not Must yet

Open Voicing自体の価値は高い。

しかし:

```text
Chord Symbol
```

だけではMelody/Top Noteが決まらない。

ここを曖昧なAutoで埋めると、
「先生のレッスン体系を反復する機能」から
「Loop Vaultが勝手に作ったVoicingを覚える機能」
へ変質する。

したがって:

> **OpenはTop Note contractをレビューしてから昇格させる**

ことを推奨する。

---

# 26. Product Philosophy

このモードが教えるのは:

```text
唯一の正しいVoicing
```

ではない。

目標:

```text
コードを見た
↓
骨格が分かる
↓
使える押さえ方が出る
↓
響きを自分で変えられる
↓
作曲で使える
```

樽栄先生の公開教材でも、
コードを感覚と結びつけ、
気に入ったコードを少しずつ増やす方向が示されている。

また、好きな音楽をそのまま暗記するだけでなく、
自分が使いやすい/好きな形へ変えることで
記憶から取り出しやすくする考え方も公開されている。

Loop Vaultはこの考え方と相性が良い。

---

# 27. UX Non-goals

新モードを:

- 音ゲー
- タイピングゲーム
- 反射神経テスト
- 正解数競争

にしない。

画面上で最も目立つものは:

```text
Score
```

ではなく:

```text
Current chord
Next chord
Voicing
Beat
```

であるべき。

---

# 28. Accessibility / 操作

練習中にマウス操作を要求しすぎない。

最低限:

```text
Space   Play / Pause
R       Restart
V       Voicing show/hide
M       Metronome
Escape  Exit
```

等を検討。

実際のshortcutは既存Practice規約との競合を監査して確定する。

画面幅・ズーム・reduced motionについても
既存Loop Vault UI contractを維持する。

Beat indicatorは色だけに依存しない。

---

# 29. 自動テスト方針

Human practice featureだが、
可能な限り自動化する。

## Timing

- 1 chord/bar
- 2 chords/bar
- 4 chords/bar
- mixed timing
- final→first loop
- pause/resume
- restart
- BPM change
- count-in

## Indicators

- Current
- Next
- Beat
- progression position
- loop count

が同じclock/stateから算出されること。

UIごとに別timerを持たない。

## Voicing

- Basic family
- 6th family exception
- Left-hand rule table
- unsupported family
- deterministic output
- stable register
- source/custom fallback where supported

## No-scoring invariant

- MIDI inputによりtimelineが停止しない
- wrong noteでもstate changeしない
- score stateを生成しない
- success/failureを生成しない

## Lifecycle

- Start
- Pause
- Resume
- Restart
- Exit
- Vault source switch
- rapid start/stop
- no stale timer
- no stuck audio

---

# 30. Clock Architecture

重要。

Current/Next/Beat/progress/audioを
複数の`setInterval`で独立駆動しない。

単一のpractice clock / transportから:

```text
elapsed musical beats
```

を導出し、

```text
current chord
current beat
next chord
progress
loop count
```

を同じsource of truthから計算する。

これにより長時間Loopしても
UIと音がズレる問題を抑える。

---

# 31. Performance

このモードは長時間Loopする可能性がある。

必須:

- timer leakなし
- audio node leakなし
- event listener leakなし
- loop count増加でmemory増加なし
- pause/resumeで二重transportなし
- hidden/inactive handlingは既存Practice lifecycleへ合わせる

例:

```text
30 min loop soak test
```

を自動または短縮simulationで検討する。

---

# 32. Review Points

レビュー担当者には特に以下を見てもらいたい。

## R1
**Chord Dojo Flowとは十分に目的が違うか。**

別モードが妥当か、
Chord Dojo内の新タブ/モードの方が良いか。

## R2
**Basic 1-7-3の定義は教育目的と一致しているか。**

Shell 1-7/6をBasicの一段階として含める設計でよいか。

## R3
**Left-hand Voicingの生成規則をどこまで資料から正式化できるか。**

一般論で穴埋めせず、
lesson rule tableを作る方法が妥当か。

## R4
**Open VoicingをP5.27初版へ入れるべきか。**

Top NoteがないText Progressionで
何を正解とするか。

## R5
**Saved Custom / Source MIDIをv1必須へ上げるべきか。**

「自分の好きなVoicingを覚える」という目的には非常に強い。

## R6
**Practice historyをどこまで保存するか。**

初版はscoreなし・session loop countのみで十分か。

## R7
**新しいPractice modeとして作るか、Chord Dojoの非採点Loopとして作るか。**

UI product taxonomyとcode reuseを分離して判断する。

---

# 33. 推奨するレビュー前の暫定結論

現時点では:

```text
P5.27 core

Text / Vault Progression
        ↓
Progression Voicing Practice
        ↓
Basic 1-7-3
or
Left-hand Voicing
        ↓
Auto Advance
        ↓
Infinite Loop
        ↓
Learn / Recall
```

を最小で成立させる。

その上で:

```text
Saved Custom / Source MIDI
```

を高優先で統合。

Open / Melody Voicingは
Top Note contractを決めてから追加する。

---

# 34. 最終的に目指す体験

ユーザーが好きな進行を見つける。

```text
| Emaj9 | G#7(b13) | C#m9 | Amaj9 |
```

Loop Vaultへ保存。

まずBasicで:

```text
1-7-3
```

を弾く。

次にLeft-handで
より色のある響きを弾く。

次に自分のCustom Voicingで弾く。

表示を消して、
コード名だけで何周も弾く。

その数日後、
FL Studioで曲を作るときに:

```text
あの進行 / あの響き
```

が頭と手から自然に出てくる。

**これをP5.27の成功体験とする。**

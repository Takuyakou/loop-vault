# Loop Vault：Fable最終壁打ち用プロンプト

あなたは、音楽制作ワークフロー、MIDI解析、作曲支援アプリ、UX/UI設計、Tauri/React/TypeScript設計、アプリアイコン/ブランド設計に詳しいプロダクトアーキテクト兼デザイナーです。

私は「Loop Vault」という、8小節ループや曲ネタを保存し、曲として完成させるためのデスクトップアプリを開発しています。

今回は、Fableに投げられる最後の壁打ちになりそうなので、**機能設計・MIDI解析・UX/UI・ブランド/アイコン設計**をまとめてレビューしてほしいです。

---

## 1. Loop Vaultの目的

Loop Vaultの目的は、単なるファイル管理ではありません。

**作ったループ、MIDI、FL Studioプロジェクト、コード進行、曲ネタ、参考曲、Next Actionを保存し、「曲として完成させる」ための制作ハブ**にしたいです。

特に重視しているのは以下です。

- 8小節ループを消さずに残す
- 良いコード進行をあとから再利用できるようにする
- FL Studioの作りかけを迷子にしない
- 「次に何をすればいいか」を明確にする
- 作曲ネタを曲として完成させる
- Chord Dripなど他の自作音楽アプリと将来的に連携する

---

## 2. 現在実装済みの機能

現在、Loop Vaultには以下の機能があります。

- SongIdeaの作成
- Library表示
- Detail編集
- BPM / Key / Genre / Moods / Chord Memoの保存
- Next Action管理
- `idea / loop / arrange / mix / done / hold / abandoned` のステータス管理
- MIDI / Audio / FLPなどのAssetパス保存
- import/export
- backup restore
- JSON永続化
- Zustand store
- Tauri対応
- domain/store/repository/storageの分離
- テストとbuildは通っている

一方で、まだ未実装のものは以下です。

- MIDI解析
- 音声解析
- BPM/key自動検出
- 構造化されたコード進行データ
- Chord Drip連携用の正式スキーマ
- MIDIからのコード進行ブロック抽出
- 本格的なUX/UI設計
- アプリアイコン/ブランド設計

---

## 3. 今回特に相談したいこと

大きく分けて、以下の2つを相談したいです。

1. **MIDI Progression Timeline & Capture機能の設計**
2. **Loop Vault全体のUX/UI・アプリらしさ・アイコン設計**

---

# Part A：MIDI Progression Timeline & Capture設計相談

## 4. やりたいこと

目的は、MIDIを完全に譜面化することではありません。

やりたいことは、

> MIDIの中から、良いコード進行を発見して、再利用可能な形でLoop Vaultに蓄積すること

です。

たとえば3分くらいのMIDIファイルがあるとして、その中には以下が混ざっている可能性があります。

- コード伴奏
- ベース
- ピアノ/ギターのアルペジオ
- ウワモノのメロディ
- フレーズ
- リード
- ストリングス
- Pad
- 装飾音
- 経過音

このようにメロディやフレーズが残っていても、そこからコード進行の候補を検出したいです。

ただし、3分のMIDI全体を4小節や8小節に要約・圧縮したいわけではありません。

望ましい設計は以下です。

1. 3分MIDI全体を解析する
2. 全体のコードタイムラインを作る
3. その中から、4小節 / 8小節 / 16小節などの良さそうな進行ブロック候補を複数出す
4. ユーザーが「この進行いいな」と思った候補を選ぶ
5. Loop VaultのSongIdeaとして登録、または既存SongIdeaに保存する
6. 将来的にはChord Drip形式に変換して、再生成・転調・リハモ・MIDI書き出しに使えるようにする

つまり、これは「MIDI全体の圧縮」ではなく、**MIDI全体を保持したまま、良い進行ブロックを切り出す機能**です。

---

## 5. 機能名の候補

以下のような名前を考えています。

- MIDI Progression Timeline & Capture
- Progression Capture
- Chord Block Finder
- Harmonic Block Capture
- MIDI Chord Timeline

今のところ、Phase名としては以下がよさそうだと考えています。

> Loop Vault Phase 2: MIDI Progression Timeline & Capture

---

## 6. 重要な設計思想

普通のコード検出は、

> この小節のコードは何か？

を当てに行く機能だと思います。

しかし今回欲しいのは、

> このMIDIの中に、曲ネタとして保存したくなるコード進行ブロックはあるか？

を見つける機能です。

そのため、完全な正解を1つ出すよりも、

- 候補を複数出す
- 信頼度を出す
- alternativesを出す
- warningsを出す
- ユーザーが編集・修正できる

という設計にしたいです。

---

## 7. メロディやフレーズが残っている場合の方針

MIDIには、音の高さ、開始位置、長さ、ベロシティ、トラック、チャンネルなどが残っています。

そのため、すべての音を同じ重みでコード判定に使うのではなく、音ごとに重みを変えたいです。

### 重く見る音

- 長く鳴っている音
- 小節頭・拍頭にある音
- 低音域の音
- ベース音
- 同時に複数鳴っている音
- PadやPianoなどの持続音
- セクション内で安定して出ている音

### 軽く見る音

- 16分音符など短い音
- 高音域で動き回る音
- 装飾音
- 経過音
- 弱拍に出てすぐ消える音
- Lead / Melody / Vocal / Toplineっぽいトラックの音

ただし、メロディを完全に除外したいわけではありません。

メロディにはテンション情報が含まれることもあります。

たとえば伴奏が `C E G B` で、メロディに `D` が安定して出る場合は、`Cmaj7` だけでなく `Cmaj9` 候補もありえます。

そのため、メロディは「弱い証拠」として扱い、完全除外ではなく重みを下げる方向がよさそうです。

---

## 8. 楽器/トラックごとの扱い

トラック名やチャンネル情報がある場合は、ざっくり役割推定したいです。

例：

- Bass → ルート候補として強く見る
- Pad → コード構成音として強く見る
- Piano → コード＋フレーズ混在として見る
- Guitar → コード＋アルペジオとして見る
- Strings → 長い音なら強く見る
- Lead → メロディとして弱く見る
- Vocal / Topline → 基本は弱く見る
- Drums → 除外

ただし、トラック名は信用しすぎず、実際の音域・音価・密度・同時発音数からも判断したいです。

---

## 9. 解析の考え方

必要なのは、MIDIをそのままコードにする処理ではなく、和声的に要約する処理です。

いわゆる **Harmonic Reduction** に近いものだと考えています。

処理の流れは以下のイメージです。

1. MIDI読み込み
2. ノートイベント抽出
3. メタ情報抽出
   - tempo
   - time signature
   - ticks per beat
   - total bars
   - track names
4. トラックごとの役割推定
5. ドラム除外
6. ノートごとの重み付け
   - duration
   - onset position
   - velocity
   - register
   - track role
   - simultaneous note density
7. 1拍 / 2拍 / 1小節などの時間窓でピッチクラス集計
8. コードテンプレートと照合
9. 候補コードと信頼度を出す
10. 前後関係を見て滑らかに補正
11. MIDI全体のコードタイムラインを作る
12. 4小節 / 8小節 / 16小節の進行ブロック候補を抽出
13. ユーザーが選択・編集・保存する

---

## 10. 重要：3分MIDIを4/8小節に圧縮しない

ここが特に重要です。

### 悪い設計

```text
3分MIDI
↓
代表的な8小節進行に要約
↓
保存
```

### 良い設計

```text
3分MIDI
↓
全体のコードタイムラインを作る
↓
Aメロっぽい8小節
Bメロっぽい8小節
サビっぽい8小節
イントロ4小節
ターンアラウンド4小節
転調前後の4小節
反復されている良い進行
などを複数候補として出す
↓
ユーザーが気に入ったものだけ保存する
```

つまり、4小節/8小節は「圧縮単位」ではなく、「保存・再利用しやすい切り出し単位」です。

---

## 11. MIDI解析UIイメージ

MIDI Assetを追加したあと、`Analyze Progression` を押す。

解析後に以下のような画面を出す。

```text
Full Timeline:

Bars 1-8
| Fmaj9 | Em7 A7 | Dm9 G13 | Cmaj9 |

Bars 9-16
| Fmaj9 | Em7 A7 | Dm9 G13 | Cmaj9 |

Bars 17-24
| Am9 | D13 | Gm9 C13 | Fmaj9 |

Bars 25-32
| Bbmaj9 | Bdim7 | Am7 D7 | Gm7 C7 |
```

```text
Detected Blocks:

Candidate 1
Bars 1-8
| Fmaj9 | Em7 A7 | Dm9 G13 | Cmaj9 |
Label: Main progression
Repeated: 2 times
Confidence: 82%
Warnings: melody-heavy, slash-chord possible
Actions:
- Save as new Idea
- Save to existing Idea
- Copy to Chord Memo
- Edit Chords
- Send to Chord Drip later

Candidate 2
Bars 17-24
| Am9 | D13 | Gm9 C13 | Fmaj9 |
Label: Variation
Confidence: 76%

Candidate 3
Bars 25-32
| Bbmaj9 | Bdim7 | Am7 D7 | Gm7 C7 |
Label: Turnaround
Confidence: 71%
```

---

## 12. 保存データ構造案

`fullTimeline` と `blockCandidates` を分けたいです。

`fullTimeline` はMIDI全体のコード解析結果です。  
`blockCandidates` は、その中から保存候補として切り出されたブロックです。

```ts
type ChordTimelineItem = {
  bar: number;
  beat: number;
  durationBeats: number;
  chord: string;
  confidence: number;
  alternatives: {
    chord: string;
    confidence: number;
  }[];
  warnings: string[];
};

type ProgressionBlockCandidate = {
  id: string;
  startBar: number;
  endBar: number;
  lengthBars: 4 | 8 | 16;
  chords: ChordTimelineItem[];
  summaryText: string;
  confidence: number;
  repeatCount?: number;
  similarBlockIds?: string[];
  labels: string[]; // main, variation, turnaround, intro-like, chorus-like など
  warnings: string[];
};

type MidiProgressionAnalysis = {
  id: string;
  sourceAssetId: string;
  fileName?: string;
  totalBars: number;
  bpm?: number;
  timeSignature?: string;
  detectedKey?: string;
  fullTimeline: ChordTimelineItem[];
  blockCandidates: ProgressionBlockCandidate[];
  analyzedAt: string;
  analyzerVersion: string;
};
```

`SongIdea` 側には、たとえば以下のように持たせるイメージです。

```ts
type SongIdea = {
  // existing fields...
  midiAnalyses?: MidiProgressionAnalysis[];
  progressionBlocks?: SavedProgressionBlock[];
};

type SavedProgressionBlock = {
  id: string;
  sourceAnalysisId?: string;
  sourceAssetId?: string;
  startBar?: number;
  endBar?: number;
  lengthBars?: number;
  summaryText: string;
  chords: ChordTimelineItem[];
  memo?: string;
  tags: string[];
  capturedAt: string;
};
```

ただし、既存 `data.json` との互換性を壊したくないので、新フィールドは optional または default `[]` で扱う方針にしたいです。

---

## 13. Chord Dripとの関係

Chord Dripは、おしゃれなコード進行を生成してMIDI化するアプリです。

Loop Vaultは、作ったループや良い進行、MIDI由来のネタを保存するアプリです。

今回のProgression Captureは、MIDIから良い進行ブロックを拾ってLoop Vaultに登録する機能です。

将来的には以下の流れを作りたいです。

```text
MIDIからProgressionBlockを抽出
↓
Loop Vaultに保存
↓
Chord Drip形式に変換
↓
Chord Dripで転調・リハモ・再生成・MIDI書き出し
```

そのため、最初からChord Drip完全連携を作る必要はないですが、将来変換しやすい構造にはしておきたいです。

---

## 14. MIDI解析MVP案

いきなり完璧な解析や音声解析まではやりません。

まずはMIDI解析に絞りたいです。

MVP案：

1. MIDI Assetを選択
2. MIDIノートイベントを読み込む
3. tempo / timeSignature / totalBarsを推定または取得
4. 2拍または1小節単位でコード候補を出す
5. 全体のfullTimelineを表示する
6. 4小節 / 8小節 / 16小節のblockCandidatesを出す
7. 候補カードを表示する
8. 候補のコード文字列を手動編集できる
9. 選んだ候補をSongIdeaとして保存、または既存SongIdeaに追加できる
10. chordMemoにもsummaryTextを反映できる

---

## 15. 今回やらないこと

- 音声解析
- FLP直接解析
- AIによる曲評価
- 完全な採譜
- 完璧なコード正解判定
- Chord Dripとの完全自動連携
- 複雑すぎるジャズコードの完全判定
- リアルタイム解析

---

# Part B：UX/UI・ブランド・アプリアイコン設計相談

## 16. 現在のUI

現在のUIは添付スクリーンショットのような状態です。

スクリーンショットには以下が写っています。

- ダークテーマ
- 左上に `LOOP VAULT`
- キャッチコピー `Focus your next loop.`
- 上部ナビゲーション
  - Home
  - Library
  - Settings
  - New
  - Saved
- Home画面
  - Monthly finish
  - Today
  - Pipeline
  - Needs Next Action
  - Stale

現在は暫定UIです。

悪くはないのですが、まだ「音楽制作アプリ」「作曲の相棒」「ネタを保管するVault」「Loopを曲に育てる感じ」が弱い気がしています。

## 17. UIで目指したい方向性

Loop Vaultは、普通のタスク管理アプリやNotion風管理画面ではなく、**音楽制作のワクワク感があるデスクトップアプリ**にしたいです。

目指したい印象：

- 暗めで集中できる
- 少し未来感がある
- 音楽制作アプリっぽい
- でもDAWほど複雑ではない
- コード進行やループが「カード」として溜まっていく
- Vault感、ライブラリ感がある
- 制作に戻りたくなる
- かわいい/おしゃれ/少しネオン
- Chord DripやLife Launcherと並べても自作アプリ群として統一感がある

キーワード：

- dark
- neon
- vault
- loop
- cassette / tape / waveform / grid
- MIDI blocks
- chord cards
- glassy but readable
- lo-fi
- neo-soul
- future bass
- private studio
- creative cockpit

---

## 18. 私からのUIアイデア

以下は私の仮説です。採用する必要はないので、良い案があれば改善してください。

### 18.1 Homeは「ダッシュボード」より「今日の制作入口」にする

現在のHomeは月間進捗やPipelineが中心です。

ただ、Loop Vaultの価値を考えると、Homeの主役は以下にしたいです。

1. 今日触るべき1曲
2. その曲のNext Action
3. すぐ開けるFLP/MIDI/Audio
4. 最近保存した良いコード進行
5. 停滞している曲

つまり、Homeの上部に大きく、

```text
Today's Loop
曲名
Next Action
[Open FLP] [Open MIDI] [Edit] [Done]
```

のようなカードを置くと良さそうです。

### 18.2 Pipelineは横型ステージ表示にする

現在は右側に縦リストで `Idea / Loop / Arrange / Mix / Done` が並んでいます。

これを、曲制作の流れが見える横型ステージにしても良さそうです。

```text
Idea → Loop → Arrange → Mix → Done
  3      5       2       1     0
```

またはカードをドラッグできるKanban風も候補です。

ただし最初からドラッグ&ドロップは重いので、まずは横型ステージ表示だけでもよいです。

### 18.3 Libraryは「曲ネタカード」の見た目を強くする

Libraryのカードには以下が見えると良さそうです。

- Title
- Status
- BPM
- Key
- Genre
- Moods
- Chord summary
- Next Action
- Asset icons
  - FLP
  - MIDI
  - Audio
- Last updated
- Progression block badge

カードの見た目は、音楽制作の「ループパック」「サンプルパック」「MIDIカード」っぽくしたいです。

### 18.4 Detailは「制作ノート」と「音楽データ」を分ける

Detail画面は情報が増えやすいので、タブやセクションを分けた方が良さそうです。

例：

- Overview
  - Title / Status / BPM / Key / Genre / Mood
  - Next Action
- Music
  - Chord Memo
  - Progression Blocks
  - MIDI Analysis Timeline
- Assets
  - FLP / MIDI / Audio
- References
  - 参考曲URL
- History
  - statusHistory
  - Next Action履歴

### 18.5 Progression Capture画面は新しい主役にする

MIDI解析機能は、Loop Vaultの目玉になりそうです。

そのため、HomeやDetailの奥に隠すより、将来的には専用画面があってもよさそうです。

候補ナビ：

- Home
- Library
- Capture
- Settings

Capture画面で、

```text
Drop MIDI here
Analyze Progression
Full Timeline
Detected Blocks
Save as Idea
```

ができるとわかりやすいです。

### 18.6 Next Actionをもっと目立たせる

Loop Vaultの思想として、Next Actionはかなり重要です。

今のUIでもありますが、もっとアプリ全体で主役級にしたいです。

例：

- Homeの一番目立つ場所にToday’s Next Action
- LibraryカードにもNext Action表示
- Detailの上部にもNext Action固定
- Next Actionなしの曲は視覚的に薄くする
- Next Action履歴を表示する

### 18.7 色・トーン

現在は黒背景＋ミント系アクセントです。

これは悪くないです。

ただ、もう少し「音楽制作アプリ」「Vault感」を出すなら、以下も候補です。

- 背景：真っ黒ではなく、青黒/紫黒/チャコール
- アクセント：cyan / mint / violet / pink を控えめに
- カード：薄いグラデーション、微妙なborder glow
- 重要ボタン：mint/cyan
- 注意/停滞：amber
- done：green
- abandoned/hold：gray/purple

ただし、可読性を最優先にしたいです。

### 18.8 音楽っぽい視覚要素

派手すぎない範囲で、以下のような要素があるとLoop Vaultらしくなりそうです。

- 小さな波形風ライン
- MIDIピアノロール風の横バー
- コードブロックの矩形
- 4/8/16小節のグリッド
- ループを表す円形/リピート記号
- Vaultを表すロック/箱/保管庫
- カセット/テープ/サンプルパック風のカード

## 19. アプリアイコンも相談したい

現在のアプリアイコンは暫定です。

Loop Vaultらしい、おしゃれなアプリアイコンが欲しいです。

方向性としては以下を考えています。

### アイコン案A：LVモノグラム + ループリング

- `L` と `V` を組み合わせる
- それを円形のループ矢印やリングで囲む
- ダーク背景にミント/シアンのアクセント
- 小さいサイズでも認識しやすい

### アイコン案B：Vault + MIDI blocks

- 小さな保管庫/金庫のようなシルエット
- 中にMIDIノートの矩形ブロックが入っている
- 「曲ネタを保管する」意味が伝わる

### アイコン案C：Loop waveform in a box

- 角丸四角の中に波形またはMIDIグリッド
- 中央にループ矢印
- 音楽アプリらしく、現代的

### アイコン案D：Neon cassette vault

- カセットテープやサンプルパック風
- ただしレトロに寄せすぎない
- Lo-fi / Future Bass / Neo-soulに合う雰囲気

欲しい印象：

- 小さくてもわかる
- Windowsアプリのタイトルバーでも映える
- ダークテーマに合う
- Chord Drip / Life Launcherと並べても統一感がある
- 安っぽい素材集アイコンに見えない
- かわいいけど、子供っぽすぎない
- 音楽制作アプリ感がある

Fableには、アイコンの方向性、色、形、避けるべきデザイン、生成AIに投げる場合のプロンプト案まで出してほしいです。

---

## 20. UX/UIで特に意見がほしい点

以下について意見が欲しいです。

1. 現在のUIを見て、Loop Vaultの目的に対して何が足りないか
2. Home / Library / Detail / Settings / Capture の情報設計
3. Homeはダッシュボード型か、今日の制作入口型か
4. Pipeline表示は今の縦型でよいか、横型ステージ/軽いKanban風にするべきか
5. Libraryカードに表示すべき情報
6. Detail画面の分割方針
7. Progression Capture画面を独立させるべきか
8. ダークテーマの色設計
9. 音楽アプリらしさを出すUI要素
10. Chord Drip / Life Launcher と並んだときの自作アプリ群としての統一感
11. アプリアイコンのコンセプト
12. 生成AIに投げるなら、どんなアイコンプロンプトにすべきか

---

# Part C：実装順の相談

## 21. 迷っていること

次に追加する機能として、以下の候補があります。

### 候補1：安定化

- import失敗時の成功toast問題修正
- close guard文字化け修正
- HomeViewの日付更新問題修正
- App.tsxの分割
- UIテスト追加

### 候補2：Rich Create / Quick Capture

作成時に以下もまとめて登録できるようにする。

- BPM
- Key
- Genre
- Moods
- Chord Memo
- Next Action
- Asset
- Reference

### 候補3：Next Action履歴

Next Actionを完了したら、空文字にするだけではなく、履歴として保存する。

### 候補4：曲化チェックリスト

各曲に以下のようなチェックリストを持たせる。

- 8小節ループ作成
- コード確定
- ベース追加
- ドラム追加
- メロディ追加
- A/B展開作成
- イントロ作成
- アウトロ作成
- 仮ミックス
- 書き出し

### 候補5：MIDI Progression Timeline & Capture

今回相談している、MIDIから全体コードタイムラインと進行ブロック候補を抽出する機能。

### 候補6：UI/UX刷新

現在の暫定UIを、Loop Vaultらしい音楽制作アプリUIへ寄せる。

## 22. 私の仮説

本当はMIDI Progression Timeline & Captureを早く作りたいです。

ただし、いきなり重い解析機能を作る前に、

- Rich Create
- ProgressionBlockの保存構造
- Capture画面のUI土台
- DetailのMusicセクション
- 安定化

を先に入れた方がよい可能性もあると思っています。

そのあたりの順序を相談したいです。

---

# Part D：回答してほしい形式

以下の形式で、設計レビューと提案をください。

## 1. 全体評価

Loop Vaultの方向性が良いか、目的と機能が合っているかを評価してください。

## 2. MIDI Progression Timeline & Captureの評価

この機能を入れる価値、重さ、リスク、MVP範囲を評価してください。

## 3. 3分MIDI全体をfullTimelineとして保持し、blockCandidatesを切り出す設計の評価

この設計が妥当か、別案があるか教えてください。

## 4. メロディ/フレーズ混在MIDIへの現実的な初期アルゴリズム

最初の実装として、どの程度の解析で十分か教えてください。

## 5. データ型・schema・migration方針

既存data.jsonを壊さずに新フィールドを追加する設計を提案してください。

## 6. UX/UIレビュー

添付スクリーンショットを見て、現在のUIの良い点・弱い点・改善案を出してください。

## 7. 理想の画面構成

Home / Library / Detail / Capture / Settings のおすすめ情報設計を出してください。

## 8. ビジュアルデザイン方針

色、余白、カード、タイポグラフィ、音楽らしい視覚要素、ダークテーマの方向性を提案してください。

## 9. アプリアイコン案

Loop Vaultらしいアイコンの方向性を3〜5案ください。
それぞれ、意味・見た目・色・避けるべき点も教えてください。

## 10. 生成AI用アイコンプロンプト

画像生成AIに投げられる英語プロンプトを複数ください。
できれば、アプリアイコン用に「シンプル・小さくても見える・ベクター風・ダーク背景・ミント/シアンアクセント」などを含めてください。

## 11. 実装ロードマップ

Claude Code / Codexに渡す前提で、段階的な実装順を提案してください。

例：

- Phase 2-A
- Phase 2-B
- Phase 2-C
- Phase 2-D

のように、各フェーズの目的・実装内容・やらないこと・完了条件まで出してください。

## 12. 最後の結論

私が次に何を作るべきか、優先順位を明確にしてください。

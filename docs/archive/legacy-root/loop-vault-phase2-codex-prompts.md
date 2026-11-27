# Loop Vault Phase 2 — Codex用実装指示(コピペ用)

運用: 計画書を `docs/phase2-plan.md` としてコミット後、サブフェーズ単位でセッションを切り、
「①マスタープロンプト+②該当サブフェーズ指示」を連結して貼る。
推奨順序: 2-A → 2-B → 2-C → 2-D(依存順)。2-Bはロジックの本丸なので単独セッション推奨。

---

## ① マスタープロンプト(毎回冒頭に貼る)

```
あなたは Loop Vault(React + Vite + TypeScript + Tauri v2 + Zustand の作曲ネタ管理
デスクトップアプリ)の Phase 2 を実装します。仕様の正は docs/phase2-plan.md、
現行実装の正確な状態は docs/current-app-technical-handoff.md です。両方を読んでください。

## Phase 2 の目的
MIDIファイルから「良いコード進行ブロック」を検出して再利用可能な形でLoop Vaultに
蓄積する機能(MIDI Progression Timeline & Capture)の追加と、UI刷新。
3分MIDIを圧縮せず、全体のコードタイムラインを作り、4/8/16小節のブロック候補を
複数出し、ユーザーが選んで編集して保存する。正解を1つ当てるのではなく
候補+信頼度+代替案+警告を出す設計。

## 既存アーキテクチャ(壊さない)
- src/domain/* は React/Tauri/時計に依存しない純粋層。zodと自前型のみ。この規律を厳守
- 永続化は applyVaultChange()→autosave(500msデバウンス)経由。repository直書き禁止
- data.jsonはtmp→renameのアトミック書込、20世代バックアップ、破損時data.corrupt退避。
  この仕組みに一切触れない
- 既存テスト49件を1つも落とさない

## Phase 2 のアーキテクチャ決定(必守。docs/phase2-plan.md §1)
1. 解析結果(MidiProgressionAnalysis / ブロック候補)は data.json に永続化しない。
   ストアの一時状態(analysisスライス)にのみ持つ。永続化するのはユーザーが保存を
   選んだ SavedProgressionBlock だけ
2. コードは構造化型 ChordSymbol {root, quality, tensions, bass?, label} で保持。
   labelは表示用に併記。文字列だけで持たない(Chord Drip連携の通貨になるため)
3. chordDrip?: unknown フィールドには今回一切触れない
4. 新フィールドはすべて optional + zod .default([])。fileVersionは1のまま。
   旧data.jsonがそのまま読めることをテストで保証する(後方互換が最優先)
5. 解析エンジンは src/domain/midi/ に純関数群として置く。SMFパースは @tonejs/midi を
   使ってよいが、直後に自前の TimedNote[] へ変換し、解析ロジックはライブラリ非依存にする
6. 解析は同期・高速。ジョブ管理は単一 analysis スライスで足りる。並行/キャンセルは作らない
7. 生成idea保存は新ストアアクション createIdeaFromDraft(draft) / appendBlockToIdea() を
   追加し applyVaultChange() を通す

## 決定性(テストの生命線)
解析エンジンは Math.random() 禁止・現在時刻非依存。同じMIDI bytes は必ず同じ解析結果
(deep equal)を返す。結果に analyzerVersion 定数を刻む。

## 型の正
docs/phase2-plan.md §4 の型定義に1:1で従う。変更が要ると感じたら勝手に変えず
IMPLEMENTATION_NOTES.md に提案を記録し既存定義で進める。

## 進め方
指示されたサブフェーズのタスクのみ実装。コミットはタスク単位で「P2-07: chord matching」形式。
完了時に test / lint / typecheck / build の結果と、計画書の対応セクションを報告。
```

---

## ② Phase 2-A 指示(安定化+スキーマ基盤)

```
Phase 2-A(P2-01〜P2-03)を実装してください。

### P2-01: 既知バグ修正
- SettingsのimportData()が importVault() 解決後に常に"Import complete."を出す問題を修正。
  store.error / 戻り値を見て成功/失敗を出し分ける
- src/store/closeGuard.ts のTauri確認テキストの文字化け(mojibake)を正しい文言に修正
- HomeViewが useMemo(() => new Date(), []) で now を固定している問題を修正。
  60秒間隔で now を更新し、stale日数と月間進捗がマウント中も更新されるようにする
  (setIntervalはeffectでクリーンアップ)
- 各修正に回帰テストを追加

### P2-02: lintスクリプト整備
- package.json に "lint"(eslint)を追加。既存コードがlintを通る状態にする

### P2-03: 新型定義+スキーマ
docs/phase2-plan.md §4 の型を src/domain/types.ts に追加:
ChordQuality / Tension / ChordSymbol / ChordTimelineItem / SavedProgressionBlock /
ProgressionBlockCandidate / MidiProgressionAnalysis。
- SongIdea に progressionBlocks?: SavedProgressionBlock[] を追加
- src/domain/schema.ts に対応するzodスキーマ。progressionBlocks は .default([])
- labelFromSymbol(sym: ChordSymbol): string と、その逆 parseChordLabel(label): ChordSymbol | null
  を実装(UIのインライン編集で使う)
- **後方互換テスト必須**: Phase1形式(progressionBlocksを持たない)のdata.json文字列を
  フィクスチャとして用意し、パースが成功して progressionBlocks が [] で補完されること
```

---

## ③ Phase 2-B 指示(MIDI解析エンジン・本丸)

```
Phase 2-B(P2-04〜P2-10)を実装してください。すべて src/domain/midi/ 配下の純関数。
React/Tauri/現在時刻に依存しないこと。Math.random禁止。

### P2-04: パース層
- parseMidi(bytes: Uint8Array): MidiSongData を実装(@tonejs/midi使用)
- MidiSongData = { notes: TimedNote[], tempo, timeSignature, ticksPerBeat, totalBars, tracks }
- TimedNote = { pitch, startTick, durationTick, velocity, trackIndex, channel }
- ドラム(channel 10 / トラック名に drum/perc)は notes から除外し tracks には残す

### P2-05: トラック役割推定
- inferTrackRoles(data): Map<trackIndex, TrackRole>
- TrackRole = "bass" | "harmony" | "mixed" | "melody" | "percussion"
- 名前ヒント(bass/pad/strings/piano/guitar/lead/vocal/topline)を初期値にしつつ、
  実測(平均音域・平均音価・同時発音数・ノート密度)で上書き補正する。
  名前が実態と矛盾する場合は実測を優先
- テスト: 名前"Lead"だが実際は低音の持続和音 → harmony寄りに補正されること

### P2-06: 重み付け+窓集計
- ノート重み = duration係数 × 拍位置係数(小節頭1.5/拍頭1.2/裏0.8) × 音域係数
  (ベース帯1.4/中域1.0/高域0.6) × velocity係数(0.7-1.2) × 役割係数
  (bass1.5/harmony1.3/mixed1.0/melody0.5) × 同時発音ボーナス(3声以上+0.2)
- melodyは除外せず弱く残す
- 時間窓(既定2拍、設定で1拍/1小節)ごとに pitch class 別の重みヒストグラムを作る
- テスト: 16分の速い経過音の寄与が、同時間の持続和音より小さいこと

### P2-07: コード照合(最重要)
- テンプレート: maj/min/dim/aug/maj7/min7/dom7/min7b5/dim7/6/min6/sixNine/
  sus2/sus4/dom7sus4/add9/maj9/min9/dom9/min11/dom13
- 窓ヒストIn vs テンプレートのマッチ度→confidence(0-1正規化)
- **ベース別追跡**: ベース帯の最頻pitch classを独立に求め、rootと異なれば分数/転回を判定
- **曖昧性解消**: Am7/C6, Em7b5/Gm6 等の同一構成音は
  ①ベース音 ②前後コードの機能的文脈 ③キー推定(Krumhansl-Schmucklerプロファイル)の順で決定
- confidence上位2件を alternatives に。閾値未満は前コード継続+warning "sparse-evidence"
- warnings: "melody-heavy"(melody役割の寄与過多) / "ambiguous-bass" / "sparse-evidence"
- テスト: 同構成音ペアがベースで割れる / 伴奏C-E-G-B + 安定したメロディD で Cmaj9 が候補に立つ

### P2-08: タイムライン平滑化
- 隣接窓の同一コードをマージ。遷移ペナルティ付きの動的計画(Viterbi-lite)で
  1窓だけの揺れを吸収し fullTimeline: ChordTimelineItem[] を生成
- テスト: 1音由来の単発の揺れがコード分割を起こさない

### P2-09: ブロック候補抽出
- 小節境界で 4/8/16 小節窓を走査
- コード列の類似度(編集距離)で反復クラスタ化し repeatCount を付与
- labels 付与: "main"(最高スコア/最多反復) / "variation" / "turnaround"(末尾のII-V的動き) /
  "intro-like"(冒頭) / "chorus-like"(高密度・高登録価値)
- スコア = 平均confidence + 反復ボーナス − 単調さ(1コード連打)減点
- 同一クラスタから重複候補を出さない。上位6件を confidence 降順で返す
- テスト: 2回反復する8小節ブロックが Candidate 1 かつ repeatCount=2

### P2-10: 統合と決定性
- analyzeMidi(bytes, options): MidiProgressionAnalysis を上記を束ねて実装
- analyzerVersion 定数(例 "1.0.0")を結果に刻む
- テスト: 同一bytes → 解析結果が deep equal(T1決定性)
```

---

## ④ Phase 2-C 指示(Capture UI+保存経路)

```
Phase 2-C(P2-11〜P2-14)を実装してください。

### P2-11: analysisストアスライス
- state: analysis: { status: "idle"|"analyzing"|"done"|"error", result?: MidiProgressionAnalysis, error?: string }
- action: analyzeMidiFile()(Tauriダイアログでmid選択→bytes読込→analyzeMidi) /
  analyzeMidiAsset(assetPath)(既存アセットから)
- 解析結果はここにのみ保持し、data.jsonには書かない(A1厳守)
- createIdeaFromDraft(draft: IdeaDraft): string — title/bpm/key/genre/moods/chordMemo/
  nextAction/assets/references/progressionBlocks をまとめて受けて1件作成→applyVaultChange
- appendBlockToIdea(ideaId, block: SavedProgressionBlock): void
- テスト: analyzeでstatus遷移 / createIdeaFromDraftで全フィールドが入る / autosaveされる

### P2-12: Captureビュー(ナビ4つ目)
- 上部ナビに Capture を追加(Home / Library / Capture / Settings)
- MIDIのドロップ領域 or [Select MIDI] → [Analyze Progression]
- Full Timeline表示: 小節グループごとに | コード | コード | を並べる
- Detected Blocks: 候補をカード表示(コード列 / Label / Repeated Nx / Confidence% / Warnings)

### P2-13: 候補の編集と保存
各候補カードのアクション:
- コード列のインライン編集(labelを直すと parseChordLabel で ChordSymbol も更新。
  解釈不能なら赤表示で保存不可)
- [Save as new Idea] → createIdeaFromDraft(候補→draft変換。summaryTextをchordMemoにも反映、
  bpm/detectedKey/sourceAssetIdを引き継ぎ、SavedProgressionBlock化)
- [Save to existing Idea] → idea選択 → appendBlockToIdea
- [Copy to Chord Memo] → 既存ideaのchordMemoにsummaryText追記
- 保存後、対象ideaがLibrary/Detailに反映される
- テスト: 保存→再ロードでprogressionBlocksが残る(T8)

### P2-14: Detail「Music」導線
- DetailにMusicセクションを設け progressionBlocks を一覧(summaryText/メモ編集/削除)
- そのideaにMIDIアセットがあれば [Analyze this MIDI] でCaptureフローへ渡す
- 既存のDetail編集(BPM/Key/chordMemo/references/assets)は一切壊さない
```

---

## ⑤ Phase 2-D 指示(UI/UX刷新)

```
Phase 2-D(P2-15〜P2-20)を実装してください。挙動は変えず見た目と情報設計を刷新。
各ステップ後に必ず build/test を通し、既存機能の回帰がないこと。

### P2-15: デザイントークン
- CSS変数化: 背景=青黒系(--bg:#0B0E14 近辺の階調)、アクセント=mint/cyan(--accent:#4FD1C5系)、
  停滞=amber、done=green、hold/abandoned=紫gray、境界=微かなglow
- 可読性最優先(本文コントラスト比 AA以上)。派手さより集中できる暗さ

### P2-16: Home刷新
- 最上部に Today's Loop カード: pickFocusの焦点曲名 / Next Action /
  [Open FLP][Open MIDI][Edit][✓ Done]。focusが無ければ従来の空状態メッセージ
- Pipelineを横型ステージへ: Idea → Loop → Arrange → Mix → Done を横に並べ各件数を表示
- 月間進捗バーはコンパクト化して併置
- 受け入れ: 起動→今日のネタとNext Actionまで0クリックを維持

### P2-17: Libraryカード刷新
- カード情報: Title / Statusバッジ / BPM / Key / Genre / Moods / Next Action /
  アセットアイコン(FLP/MIDI/Audioの有無) / progression blockバッジ(件数) / 更新日
- Next Action未設定のカードは視覚的に薄く(dim)
- 「サンプルパック/MIDIカード」風の質感(微グラデ+subtle border glow)

### P2-18: Detailタブ化
- タブ: Overview / Music / Assets / References / History
- Next Actionは上部固定(タブ切替でも常に見える)
- 既存の各編集機能をタブに再配置するだけで、ロジックは変えない

### P2-19: App.tsx分割
- 各ビューを src/views/(HomeView/LibraryView/DetailView/CaptureView/SettingsDialog)へ抽出
- 純粋な機械的分割。挙動・state・イベントは変えない。test/build通過を確認

### P2-20: アプリアイコン
- ユーザーが用意する 1024px PNG(案A: LVモノグラム+ループリング, 青黒+mint)を受け取り、
  `tauri icon <path>` で全プラットフォームサイズを生成し tauri.conf.json に反映
- Windowsタイトルバー/タスクバーでの視認を確認
- ※アイコン画像の生成自体はCodex対象外。パスを渡されたら組み込みだけ行う
```

---

## 人間側チェックリスト(貼らない・自分用)

| SF | 必ず確認 |
|---|---|
| 2-A | 後方互換テストが「実際の旧data.json文字列」で書かれているか。closeGuardの文言が日本語として正しいか |
| 2-B | **実MIDI(自分の曲の書き出し)を数本食わせて試聴的に検証**。テストが緑でも、テンションの取りこぼしやAm7/C6の誤りは実データでしか気づけない。melody-heavy警告が妥当な曲で出るか |
| 2-C | 解析結果がdata.jsonに漏れ書きされていないか(保存後のjsonを開いてprogressionBlocksだけか確認)。createIdeaFromDrafがautosaveを通るか |
| 2-D | 各刷新後に既存操作(作成/遷移/Next Action/import/export)が壊れてないか手動一巡。コントラスト |

## 実装順の結論(あなたへ)
2-A(安く地盤固め)→ 2-B(UIなしでテスト完結する本丸を先に)→ 2-C(目玉を繋ぐ)→ 2-D(最後に一括で世界観を当てる)。
Next Action履歴・曲化チェックリストはPhase 3へ。まずはこの一本道で「MIDIを放り込むと良い進行が貯まる」体験を完成させるのが最優先。
```

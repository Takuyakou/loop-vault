# Loop Vault 作業計画書 Phase 2 — MIDI Progression Timeline & Capture + UI刷新

本書がPhase 2の仕様の正。前提: current-app-technical-handoff.md の実装状態(テスト49件通過)。

## 0. コンセプト

**「MIDIの中から良いコード進行ブロックを発見し、再利用可能な形で蓄積する」**
- 正解を1つ当てるのではなく、候補+信頼度+代替案+警告を出し、ユーザーが選んで編集して保存する
- 3分MIDIを圧縮しない。fullTimelineを作り、4/8/16小節のブロック候補を切り出す
- 併せてUIを「音楽制作アプリ」らしく刷新し、Captureを主役画面に据える

## 1. アーキテクチャ決定事項(重要)

| # | 決定 | 理由 |
|---|---|---|
| A1 | **解析結果(MidiProgressionAnalysis)はdata.jsonに永続化しない**。ストアの一時状態のみ。永続化するのはユーザーが保存を選んだ `SavedProgressionBlock` だけ | vault肥大化防止。エンジンは決定的なので再導出可能。バックアップ・起動速度を守る |
| A2 | コードは構造化型 `{root, quality, tensions, bass?, label}` で保存。表示用labelを併記 | Chord Drip連携の通貨。文字列だと再パースが必要になる |
| A3 | `chordDrip?: unknown` は今回触らない。連携の実体はSavedProgressionBlock | 名前先行のフィールドに実装を紐づけない |
| A4 | 新フィールドはすべてoptional+zod `.default([])`。**fileVersionは1のまま**(追加のみで破壊なし)。旧data.jsonがそのまま読めることをテストで保証 | 互換性維持 |
| A5 | エンジンは `src/domain/midi/` に純関数群(React/Tauri/時計非依存)。SMFパースは `@tonejs/midi` を使うが、直後に自前の `TimedNote[]` へ変換し、解析層はライブラリ非依存 | 既存のdomain分離パターン踏襲。将来オーディオ→ノート列でも同エンジンに合流 |
| A6 | 解析は同期的で高速(MIDIは軽い)。ジョブ管理は `analysis: {status, result?, error?}` の単一スライスで足りる。並行・キャンセルはPhase 3 | handoff §9の警告への回答。今回は不要 |
| A7 | 保存経路は新ストアアクション `createIdeaFromDraft(draft)` / `appendBlockToIdea(id, block)` → `applyVaultChange()`。repository直書き禁止 | handoff §9の推奨に一致。Rich Createもこのdraftで実現 |

## 2. サブフェーズと完了条件

### Phase 2-A: 安定化+スキーマ基盤(小)
| タスク | 内容 | 完了条件 |
|---|---|---|
| P2-01 | 既知バグ修正: import失敗時の"Import complete."誤表示 / closeGuard文字化け / HomeViewの時刻が更新されない(60s間隔で `now` を更新) | 各修正のテスト追加。既存49件維持 |
| P2-02 | `npm run lint` 追加(eslint)。CI相当のスクリプト整備 | lint通過 |
| P2-03 | 新型定義+zodスキーマ: ChordSymbol / ChordTimelineItem / SavedProgressionBlock / MidiProgressionAnalysis(§4)。SongIdeaに `progressionBlocks?: SavedProgressionBlock[]`(default []) | **旧data.jsonフィクスチャがそのまま読める後方互換テスト**必須 |

### Phase 2-B: MIDI解析エンジン(中・本丸)
| タスク | 内容 | 完了条件 |
|---|---|---|
| P2-04 | パース層: bytes → `MidiSongData {notes: TimedNote[], tempo, timeSignature, ticksPerBeat, totalBars, tracks}`。@tonejs/midi使用、ドラム(ch10/名前)除外 | フィクスチャMIDIで正確に抽出 |
| P2-05 | トラック役割推定: 名前ヒント(bass/pad/lead等)+実測(音域・平均音価・同時発音数・密度)から `bass/harmony/mixed/melody/percussion` を推定 | 名前が嘘でも実測で補正されるテスト |
| P2-06 | ノート重み付け+窓集計: §5の重み表 → 2拍窓(設定で1拍/1小節)でピッチクラス重みヒストグラム | 経過音が弱く、持続音が強いことのテスト |
| P2-07 | コード照合: テンプレート(maj/min/7/maj7/m7/m7b5/dim7/sus2/sus4/6/m6/9系/add9/13系)+**ベース別追跡で転回・分数判定**+Am7/C6等の曖昧性解消(ベース→文脈→キー推定の3段)。候補+信頼度+alternatives+warnings | 曖昧ペアの判定テスト、テンション検出テスト |
| P2-08 | タイムライン平滑化: 隣接窓の同一コードをマージ、遷移ペナルティ付きの動的計画(Viterbi-lite)でチラつき除去 → fullTimeline | 1音の揺れでコードが割れないテスト |
| P2-09 | ブロック候補抽出: 4/8/16小節窓を小節境界でスキャン、進行の反復検出(類似度)、repeatCount/labels(main/variation/turnaround/intro-like)付与、信頼度順に上位提示 | 反復進行がCandidate 1になるフィクスチャテスト |
| P2-10 | 決定性: 全エンジンにMath.random禁止・now非依存。`analyzerVersion` 定数を結果に刻印 | 同一入力→deep equalテスト |

### Phase 2-C: Capture UI+保存経路(中)
| タスク | 内容 | 完了条件 |
|---|---|---|
| P2-11 | ストア: `analysis` スライス(idle/analyzing/done/error)+ `analyzeMidiAsset(path)` / `analyzeMidiFile()`(ダイアログ) | 状態遷移テスト |
| P2-12 | Captureビュー(ナビ4つ目): MIDIドロップ/選択 → Analyze → Full Timeline表示+Detected Blocksカード(コード列/Label/Repeated/Confidence/Warnings) | 解析→表示が1操作 |
| P2-13 | 候補の編集と保存: コード列のインライン編集(labelを直すと構造も更新するパーサ)/ [Save as new Idea](=createIdeaFromDraft: title/BPM/Key/ブロック/元アセット/summaryTextをchordMemoに反映可) / [Save to existing Idea] / [Copy to Chord Memo] | 保存後のideaがLibraryに現れ、autosaveされる |
| P2-14 | Detail「Music」セクション: progressionBlocksの一覧・メモ・削除。DetailからそのideaのMIDIアセットを直接Analyzeする導線 | 既存Detail機能を壊さない |

### Phase 2-D: UI/UX刷新+アイコン(中)
| タスク | 内容 | 完了条件 |
|---|---|---|
| P2-15 | デザイントークン導入: 背景=青黒(#0B0E14系)、アクセント=mint/cyan、停滞=amber、done=green、hold/abandoned=紫gray。CSS変数化 | 全画面で可読性維持(コントラスト確認) |
| P2-16 | Home刷新: 最上部に **Today's Loop カード**(曲名/Next Action/[Open FLP][Open MIDI][Edit][✓])、Pipelineを横型ステージ(Idea→Loop→Arrange→Mix→Done+件数)へ、月間バーはコンパクト化 | 起動→今日のネタとNext Actionまで0クリック維持 |
| P2-17 | Libraryカード刷新: Title/Status/BPM/Key/Genre/Moods/Next Action/アセットアイコン(FLP/MIDI/Audio)/Progression blockバッジ/更新日。「サンプルパック」風の質感 | Next Action未設定カードは視覚的に薄く |
| P2-18 | Detailタブ化: Overview / Music / Assets / References / History。Next Actionは上部固定 | 既存編集機能の回帰テストなし崩れなし(手動確認) |
| P2-19 | App.tsx分割: 各ビューを `src/views/` へ抽出(挙動変更なしの機械的分割) | テスト・build通過 |
| P2-20 | アプリアイコン差し替え: 案A(LVモノグラム+ループリング)のPNGをユーザーが用意 → `tauri icon` で全サイズ生成・設定 | Windowsタイトルバー/タスクバーで視認 |

**Phase 3送り(やらない)**: 音声解析、FLP直接解析、Kanban D&D、Next Action履歴、曲化チェックリスト、Chord Drip自動連携、リアルタイム解析、完璧なジャズコード判定

## 3. 受け入れ基準(Phase 2全体)

1. 3分級のマルチトラックMIDIを解析し、fullTimelineと3個以上のブロック候補が数秒以内に出る
2. 候補を編集してSongIdeaとして保存でき、Library/Detailに構造化ブロックとして残る
3. 旧data.jsonがそのまま開ける(後方互換)
4. 解析結果はvaultに保存されない(SavedProgressionBlockのみ永続化)
5. 同一MIDI→同一解析結果(決定性)
6. test / lint / typecheck / build / tauri build 全通過、既存機能の回帰なし

## 4. データ構造(正)

```ts
export type ChordQuality =
  | "maj" | "min" | "dim" | "aug" | "maj7" | "min7" | "dom7" | "min7b5" | "dim7"
  | "maj9" | "min9" | "dom9" | "min11" | "dom13" | "sus2" | "sus4" | "dom7sus4"
  | "add9" | "six" | "min6" | "sixNine";
export type Tension = "9" | "b9" | "#9" | "11" | "#11" | "13" | "b13";

export interface ChordSymbol {
  root: number;            // pitch class 0-11 (C=0)
  quality: ChordQuality;
  tensions: Tension[];
  bass?: number;           // 分数コード時のみ
  label: string;           // "Fmaj9", "C/E" 表示用(labelFromSymbolで生成)
}

export interface ChordTimelineItem {
  bar: number; beat: number; durationBeats: number;
  chord: ChordSymbol;
  confidence: number;      // 0-1
  alternatives: { chord: ChordSymbol; confidence: number }[]; // 上位2件まで
  warnings: string[];      // "melody-heavy" | "sparse-evidence" | "ambiguous-bass" 等
}

export interface SavedProgressionBlock {   // ← これだけ永続化
  id: string;
  sourceAssetId?: string; sourceFileName?: string;
  startBar?: number; endBar?: number; lengthBars?: number;
  summaryText: string;     // "| Fmaj9 | Em7 A7 | Dm9 G13 | Cmaj9 |"
  chords: ChordTimelineItem[];
  detectedKey?: string; bpm?: number;
  memo?: string; tags: string[];
  capturedAt: string; analyzerVersion: string;
}

export interface ProgressionBlockCandidate {  // 一時(非永続)
  id: string; startBar: number; endBar: number; lengthBars: 4 | 8 | 16;
  chords: ChordTimelineItem[]; summaryText: string; confidence: number;
  repeatCount?: number; labels: string[]; warnings: string[];
}

export interface MidiProgressionAnalysis {    // 一時(非永続)
  sourceAssetId?: string; fileName?: string;
  totalBars: number; bpm?: number; timeSignature?: string; detectedKey?: string;
  fullTimeline: ChordTimelineItem[];
  blockCandidates: ProgressionBlockCandidate[];
  analyzedAt: string; analyzerVersion: string;
}

// SongIdea 追加(optional, default [])
progressionBlocks?: SavedProgressionBlock[];
```

## 5. 解析エンジン仕様(要点)

**ノート重み** = duration係数(長いほど大) × 拍位置係数(小節頭1.5/拍頭1.2/裏0.8) × 音域係数(E1-C3のベース帯1.4/C3-C5中域1.0/C5以上0.6) × velocity係数(0.7-1.2) × トラック役割係数(bass 1.5/harmony 1.3/mixed 1.0/melody 0.5) × 同時発音ボーナス(3声以上+0.2)。melodyは除外せず弱い証拠として残す(伴奏C-E-G-B+メロディに安定したD → Cmaj9候補が立つ)。

**照合**: 窓ごとの重みヒストグラム vs テンプレートのマッチ度。信頼度=正規化スコア。ベース帯の最頻音を独立追跡し、rootと不一致なら分数/転回を判定。同一構成音ペア(Am7/C6等)は ①ベース ②前後の機能的文脈 ③キー推定(Krumhansl系プロファイル)で解消。閾値未満の窓は前コード継続+warning "sparse-evidence"。

**ブロック抽出**: 小節境界で4/8/16小節窓を走査。進行文字列の類似度(コード列の編集距離)で反復クラスタを作り、repeatCountを付与。スコア=平均confidence + 反復ボーナス + 進行の多様性(1コード連打を減点)。同一クラスタから重複候補を出さない。上位6件まで提示。

## 6. テスト方針

- フィクスチャMIDIはテストコード内でプログラム生成(@tonejs/midiでbytes生成→自前パーサに食わせる往復)
- T1 決定性: 同一bytes→解析結果deep equal / T2 重み: 16分の経過音がコードを変えない / T3 曖昧性: ベースA→Am7、ベースC→C6 / T4 テンション: 伴奏+安定メロディDでCmaj9が候補に / T5 平滑化: 1窓だけの揺れが消える / T6 ブロック: 2回反復する8小節がCandidate 1・repeatCount=2 / T7 後方互換: Phase1のdata.jsonがそのまま読め、progressionBlocksが[]で補完 / T8 保存経路: createIdeaFromDraft→autosave→再ロードでブロック残存 / T9 既存49件の全維持

## 7. アイコン方向(参考・Codex対象外)

案A採用: 円形ループ矢印リング+LVモノグラム、青黒背景にミント。生成AIプロンプト例:
`minimal flat vector app icon, letters "LV" monogram inside a circular loop arrow ring, dark navy background #0B0E14, mint cyan accent #4FD1C5, subtle neon glow, rounded square, high contrast, recognizable at 16px, no text besides monogram, music production app`
(バリエーション: "loop arrow ring" → "circular arrow like a repeat sign" / アクセント violet 追加版)。生成後ユーザーが1024pxPNGを用意し、P2-20で組み込み。

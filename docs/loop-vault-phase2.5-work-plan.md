# Loop Vault Phase 2.5 作業計画書  
## Capture Quality & Editing UX

作成日: 2026-07-09  
対象アプリ: Loop Vault  
想定作業者: Codex  
目的: Phase 2で実装されたMIDI Progression Captureを、日常的に使える「コード進行採集」体験へ磨く。

---

## 0. 結論

Phase 2.5では、MIDI解析アルゴリズムを大きく増やすのではなく、**MIDI選択後の解析結果画面を「候補を見る → 聴く → 必要なら直す → 保存する」画面へ作り直す**。

現状の問題は、MIDI選択後に以下の情報が同じ強さで縦に並び、何をすればよいか分かりにくいこと。

- ファイル情報
- コードタイムライン
- 保存先
- 候補ブロック
- summary編集
- コード入力欄
- warning
- confidence
- 試聴ボタン
- 新規Idea/既存Idea/メモコピー

コードカード表示自体は良いので残す。  
ただし、画面全体の主役はFull Timelineではなく、**保存したくなる候補ブロック**にする。

---

## 1. Phase 2の現状前提

Phase 2で実装済みの主な内容:

- MIDIファイル選択
- MIDI全体のコードタイムライン表示
- 4/8/16小節の候補ブロック表示
- 候補ブロック内コードの選択
- 単体コード試聴
- 候補ブロック全体試聴
- summary編集
- コードラベル編集
- 候補ブロックを新規Ideaとして保存
- 候補ブロックを既存Ideaへ追加
- 候補ブロックsummaryをChord Memoへコピー
- 保存済み進行ブロックをDetailで確認/試聴/削除
- Chord Drip風のコードカード/進行グリッド/再生進捗表示
- 日本語/英語UI切替
- Tauriデスクトップ版の×ボタン終了修正

主な関係ファイル:

- `src/App.tsx`
- `src/domain/types.ts`
- `src/domain/schema.ts`
- `src/domain/midi/parser.ts`
- `src/domain/midi/analysis.ts`
- `src/domain/midi/types.ts`
- `src/domain/chords.ts`
- `src/domain/chordVoicing.ts`
- `src/audio/chordPreview.ts`
- `src/ui/ProgressionGrid.tsx`
- `src/ui/playbackProgress.ts`
- `src/store/vaultStore.ts`
- `src/i18n.ts`

設計上の重要前提:

- `MidiProgressionAnalysis` 全体は `data.json` に保存しない。
- 永続化するのは、ユーザーが保存した `SavedProgressionBlock` のみ。
- 保存系は `createIdeaFromDraft(draft)` / `appendBlockToIdea(ideaId, block, analysis)` などを使い、`applyVaultChange()` 経由でautosaveに乗せる。
- repositoryへUIから直書きしない。
- `src/domain/*` はReact/Zustand/Tauriに依存させない。
- 旧 `data.json` 互換を壊さない。
- `fileVersion` は原則上げない。
- `chordDrip?: unknown` はPhase 2時点では未使用。Phase 2.5では完全連携しない。

---

## 2. 現状UIの問題整理

ユーザー視点での課題:

1. MIDI選択後、何を見ればいいか分かりにくい。
2. 「コードタイムライン」と「候補ブロック」の違いが直感的に分かりにくい。
3. Full Timelineが上に出ているため、そこが主役のように見える。
4. しかし本来ユーザーが見たいのは「保存したくなる候補ブロック」。
5. 保存先セレクトが候補を見る前に出ており、タイミングが早い。
6. 候補ブロック内に編集欄・選択コードinput・summary textarea・警告・操作ボタンが常時表示され、ごちゃついている。
7. `100%` のconfidenceが大量に表示され、むしろ信用しづらい。
8. `ambiguous-bass` のような内部warningがそのまま出ていて、ユーザー向けではない。
9. コードカードの表示自体は良いので、そこは活かすべき。
10. 「試聴」「編集」「保存」「コピー」の主要導線が視覚的に整理されていない。

---

## 3. Phase 2.5の目的

Phase 2.5の目的は、MIDI解析結果画面を内部データ表示ではなく、**コード進行採集ワークフロー**に作り直すこと。

理想の流れ:

```text
MIDIを選ぶ
↓
解析する
↓
使えそうな進行候補が出る
↓
候補を試聴する
↓
気になった候補だけ編集する
↓
新しいIdea/既存Idea/Chord Memoへ保存する
↓
LibraryやDetailで再利用する
```

重要な考え方:

```text
解析データを全部見せる
ではなく
保存候補を提案する
```

---

## 4. 今回やること / やらないこと

### やること

- MIDI選択後のCapture画面の情報設計を整理する。
- 候補ブロックを主役にする。
- Full Timelineを折りたたみ/詳細扱いにする。
- 保存先選択を常時表示から保存モーダルへ移す。
- 候補ブロックカードを通常表示/編集モードに分ける。
- warning/confidenceをユーザー向け表示へ変換する。
- Empty Stateを改善する。
- 可能なら `App.tsx` からCapture関連コンポーネントを分離する。
- 可能ならLibraryにProgression Blockのミニプレビューを出す。
- Chord Drip形式コピーを追加する。

### 今回やらないこと

- MIDI解析アルゴリズムの大幅刷新
- 音声解析
- FLP直接解析
- AIによる曲評価
- Chord Dripとの完全双方向連携
- 解析結果全体の永続化
- `fileVersion` を上げる破壊的migration
- 大規模なデザインシステム刷新
- 完璧なコード正解判定

---

## 5. 最優先方針

### MIDI選択後の画面優先順位

現在のようにFull Timelineを上に出しすぎない。

優先順位は以下。

1. 解析サマリー
2. 使えそうな進行候補
3. 試聴
4. 保存
5. 編集
6. Full Timeline
7. 解析詳細

Full Timelineは重要だが、最初に見せる主役ではない。  
初期状態では折りたたみでもよい。

---

## 6. 画面状態別の理想UI

### 6.1 MIDI未選択状態

現状の単純な説明カードではなく、大きめのEmpty Stateにする。

表示例:

```text
MIDIからコード進行を採集

MIDIファイルをここにドロップ
または [MIDIを選択]

できること:
1. 曲全体のコードを推定
2. 使えそうな4/8/16小節を抽出
3. 気に入った進行をLoop Vaultに保存
```

要件:

- `.mid` / `.midi` 対応を明記。
- 将来的にD&Dできるならドロップ領域を作る。Tauri側制約があるなら、まず見た目だけでもよい。
- 「MIDI解析」ではなく「コード進行を採集」という体験を前面に出す。

---

### 6.2 解析中状態

解析中に何をしているか見えるようにする。

表示例:

```text
解析中...
ノートを読み込み中
コード候補を検出中
使えそうな進行ブロックを探しています
```

要件:

- 解析が速くても、状態表示がある方が安心。
- エラー時は「読み込めませんでした」「MIDIノートが見つかりませんでした」などユーザー向け文言で表示。

---

### 6.3 解析後状態

初期表示は候補ブロック中心にする。

理想構成:

```text
┌──────────────────────────────────────────────┐
│ ChordDrip_neo-soul-warm_76bpm.mid             │
│ 8小節 / 76 BPM / 4/4                          │
│ [別のMIDIを選ぶ] [クリア]                     │
└──────────────────────────────────────────────┘

┌──────────────────────────────────────────────┐
│ 使えそうな進行候補 6件                        │
│                                              │
│ [候補カード一覧]                              │
└──────────────────────────────────────────────┘

▼ 曲全体のコードを見る
▼ 解析の詳細を見る
```

要件:

- Full Timelineは初期表示で閉じるか、下部に移す。
- 保存先セレクトはここに常時出さない。
- 「候補を試聴して、良いものを保存してください」という案内を短く入れる。

---

## 7. Candidate Blockカード設計

### 7.1 通常表示

通常表示では、保存判断に必要な情報だけ出す。

表示例:

```text
候補 1
1–4小節 / 4 bars
main · intro-like · turnaround

| Dmaj9 | A6/C# | D | Em9 A7sus4 |

⚠ 低音の解釈に注意

[▶ 試聴] [編集] [保存] [コピー]
```

表示項目:

- 候補番号
- 小節範囲
- 長さ
- labels
- コードグリッド
- warning要約
- 主要ボタン
  - 試聴
  - 編集
  - 保存
  - コピー

通常表示で出さないもの:

- summary textarea
- 選択コードinput
- コードラベル編集欄
- raw warning key
- 全コードのconfidenceパーセント
- 保存先セレクト

---

### 7.2 編集モード

「編集」ボタンを押した時だけ編集UIを出す。

表示例:

```text
編集中: 候補 1

| Dmaj9 | A6/C# | D | Em9 A7sus4 |

選択中コード:
[Dmaj9]

候補:
[Dmaj9] [Bm11/D] [F#m7/D]

操作:
[分割] [結合] [削除] [元に戻す]

[▶ このコードを試聴] [▶ 全体を試聴]
[編集を閉じる]
```

編集モードでできること:

- summary編集
- 選択中コードのコードラベル編集
- `parseChordLabel()` による再パース
- alternatives候補があればチップ表示
- 選択コード試聴
- ブロック全体試聴
- 編集済み表示
- 元に戻す

可能なら追加したい操作:

- コードカードのダブルクリック編集
- Enterで確定
- Escでキャンセル
- 隣接コードと結合
- 1小節を2コードへ分割
- コード削除/空欄化

ただし、分割/結合が大きくなる場合はPhase 2.5-Bに分けてもよい。

---

## 8. 保存導線

### 8.1 保存先セレクトの廃止/移動

現状のように、候補を見る前から「保存先」を常時表示しない。

理由:

- ユーザーはまだどの候補を保存するか決めていない。
- 「保存先」は保存ボタンを押した後で聞く方が自然。

---

### 8.2 保存モーダル

候補カードの「保存」を押したら保存モーダルを開く。

表示例:

```text
この進行を保存

| Dmaj9 | A6/C# | D | Em9 A7sus4 |

保存方法:
○ 新しいIdeaとして保存
○ 既存Ideaに追加
○ Chord Memoへコピー

タイトル:
[Progression main - turnaround]

既存Idea:
[選択]

タグ:
[neo-soul] [turnaround] [favorite]

Next Action:
[この進行にベースを付ける]

[保存]
```

保存方法:

1. 新しいIdeaとして保存
   - `createIdeaFromDraft(draft)` を使う。
2. 既存Ideaへ追加
   - `appendBlockToIdea(ideaId, block, analysis)` を使う。
3. Chord Memoへコピー
   - 既存のChord Memoへのコピー経路を使う。
4. Chord Drip形式でコピー
   - 保存とは別にクリップボードへコピーする。

要件:

- 保存系は必ず既存store action経由。
- repository直書きは禁止。
- 保存完了後はtoastなどで分かりやすく通知。
- 保存先が未選択なら保存ボタンをdisabledにする。

---

## 9. Full Timelineの扱い

### 9.1 初期状態

Full Timelineは初期状態で折りたたみ、または候補ブロック下部に配置する。

見出し例:

```text
▼ 曲全体のコードを見る
```

説明文:

```text
MIDI全体から推定したコードです。候補ブロックに含まれない部分も確認できます。
```

---

### 9.2 表示形式

現状の縦リストではなく、可能ならコードグリッド表示にする。

悪い例:

```text
1小節.1 Dmaj9 100%
2小節.1 A6/C# 100%
3小節.1 D 100%
```

良い例:

```text
1–4小節
| Dmaj9 | A6/C# | D | Em9 A7sus4 |

5–8小節
| A6 | Gmaj7 | F#m11 | ... |
```

要件:

- 4小節ごとに区切る。
- 8小節ごとにまとまりを見せる。
- `ProgressionGrid` を再利用できるなら再利用する。
- confidenceは常時表示しない。
- 低信頼やwarningがある箇所だけ「要確認」と表示する。

---

## 10. warning / confidence 表示改善

### 10.1 warningの日本語化

内部キーをそのまま表示しない。

変換例:

```ts
const warningLabels = {
  "ambiguous-bass": "低音の解釈に注意",
  "low-confidence": "コード候補が不安定",
  "melody-heavy": "メロディ混在の可能性",
  "sparse-notes": "音数が少ないため要確認",
  "slash-chord-possible": "分数コードの可能性",
};
```

UIでは短く表示。

```text
⚠ 低音の解釈に注意
```

---

### 10.2 confidenceの丸め

`100%` を全コードに表示しない。

候補:

```ts
function confidenceLabel(value: number): "高" | "中" | "要確認" {
  if (value >= 0.8) return "高";
  if (value >= 0.5) return "中";
  return "要確認";
}
```

表示方針:

- 高: 通常は非表示でもよい。
- 中: 小さく表示。
- 要確認: 目立つように表示。

---

## 11. Chord Drip形式コピー

Phase 2.5では、Chord Dripとの完全連携はしない。  
ただし、保存済み/候補ブロックをChord Dripへ渡しやすくするため、テキストコピーを追加する。

例:

```text
| Dmaj9 | A6/C# | D | Em9 A7sus4 |
```

ボタン案:

- `Chord Drip形式でコピー`
- `Chord Dripへコピー`
- `コード進行をコピー`

実装案:

- `ChordTimelineItem[]` からReChord/Chord Drip風テキストを生成するpure functionをdomainまたはui utilityに追加。
- 小節内に2コードある場合はスペース区切りにする。
- 4小節ごとに改行するか、まずは1行でもよい。
- クリップボードAPIはUI層で扱う。
- 変換ロジックにはテストを追加する。

例:

```ts
export function formatProgressionText(items: ChordTimelineItem[]): string {
  // 例: | Dmaj9 | A6/C# | D | Em9 A7sus4 |
}
```

---

## 12. Library改善

Phase 2.5で余力があれば、LibraryカードにProgression Blockのミニプレビューを出す。

現状:

```text
Progression main - intro-like - turnaround
104 bpm · F major
[1 block]
```

改善案:

```text
Progression main - intro-like - turnaround
104 bpm · F major · IDEA

| Dmaj9 | A6/C# | D | Em9 A7sus4 |

Next Action 未設定
[1 block]
```

要件:

- `progressionBlocks` があるIdeaでは、最初のブロックのsummary/chordsを短く表示。
- 複数ある場合は `+2 blocks` のように出す。
- 検索対象に `progressionBlocks.summaryText` と chord labels を含める。
- 可能なら「Progressionあり」フィルタを追加。

ただし、Capture画面整理より優先度は下げる。

---

## 13. App.tsx分割

報告書上、UIはまだ `src/App.tsx` に大きくまとまっている。  
Phase 2.5では最低でもCapture関連だけ分離したい。

推奨分割:

```text
src/views/CaptureView.tsx
src/components/capture/CaptureEmptyState.tsx
src/components/capture/AnalysisSummary.tsx
src/components/capture/ProgressionCandidateList.tsx
src/components/capture/ProgressionBlockCard.tsx
src/components/capture/ProgressionSaveDialog.tsx
src/components/capture/ChordEditorPanel.tsx
src/components/capture/TimelineDetails.tsx
src/components/capture/warningLabels.ts
src/components/capture/formatProgressionText.ts
```

または既存方針に合わせるなら:

```text
src/views/CaptureView.tsx
src/components/ProgressionBlockCard.tsx
src/components/ChordTimelineGrid.tsx
src/components/ChordEditorPanel.tsx
src/components/EmptyState.tsx
```

制約:

- いきなり全画面を分割しない。
- まずCapture関連だけを分離する。
- 既存挙動を壊さない。
- 分割だけのPRとUX変更PRを分けてもよい。

---

## 14. UI文言改善

日本語UIでは、機能名より体験名を優先する。

候補:

| 現在 | 改善案 |
|---|---|
| MIDI解析 | MIDIコード採集 / コード進行を採集 |
| MIDI Progression Capture | MIDIからコード進行を採集 |
| コードタイムライン | 曲全体のコード |
| 候補ブロック | 使えそうな進行候補 / 採集候補 |
| 保存先 | 追加先 |
| 新規Idea | 新しいネタとして保存 |
| 既存Ideaへ追加 | 選択中のネタに追加 |
| メモへコピー | Chord Memoへコピー |
| Next Actionが必要 | 次の一手が必要 |
| 放置中 | 停滞中 |

今回必須で変えたい文言:

- 画面タイトル: `MIDIからコード進行を採集`
- 候補見出し: `使えそうな進行候補`
- Full Timeline折りたたみ: `曲全体のコードを見る`
- 保存ボタン: `保存`
- コピー: `コード進行をコピー` または `Chord Drip形式でコピー`

---

## 15. 実装ステップ

### Phase 2.5-A: Capture画面の構造整理

目的: MIDI選択後画面を候補ブロック中心にする。

作業:

1. `CaptureView` を `App.tsx` から分離する。
2. MIDI未選択のEmpty Stateを改善する。
3. 解析サマリーを上部にコンパクト表示する。
4. 候補ブロックをFull Timelineより上に表示する。
5. Full Timelineを折りたたみにする。
6. 保存先セレクトを常時表示から削除する。
7. 既存の機能が壊れていないか確認する。

完了条件:

- MIDI選択後、最初に「使えそうな進行候補」が見える。
- Full Timelineが画面を圧迫しない。
- 保存先セレクトが候補選択前に出ない。
- `npm run lint` / `npm test` / `npm run build` が通る。

---

### Phase 2.5-B: Candidate Blockカード整理

目的: 候補カードを「見る・聴く・保存する」ためのカードにする。

作業:

1. `ProgressionBlockCard` を分離する。
2. 通常表示と編集モードを分ける。
3. 通常表示ではコードグリッドと主要操作だけ出す。
4. summary textarea / code input は編集モードのみ表示。
5. warningをユーザー向けラベルにする。
6. confidenceを丸めて表示、または低信頼のみ表示する。
7. 試聴/編集/保存/コピーのボタン配置を整理する。

完了条件:

- 候補カードが一目で「進行候補」と分かる。
- 通常表示がごちゃつかない。
- 編集したい時だけ編集UIが出る。
- raw warning keyがユーザーに見えない。

---

### Phase 2.5-C: 保存モーダル

目的: 保存操作を自然な流れにする。

作業:

1. 候補カードの「保存」から保存モーダルを開く。
2. 保存方法を選べるようにする。
   - 新しいIdeaとして保存
   - 既存Ideaへ追加
   - Chord Memoへコピー
3. 必要入力をモーダル内に配置する。
   - タイトル
   - 既存Idea選択
   - memo
   - tags（余力）
   - Next Action（余力）
4. 保存後にtoastを出す。
5. 既存保存経路を壊さない。

完了条件:

- 候補を見てから保存方法を選べる。
- 保存操作の意味が分かりやすい。
- `createIdeaFromDraft` / `appendBlockToIdea` 経由で保存される。
- repository直書きがない。

---

### Phase 2.5-D: Chord Drip形式コピー

目的: Loop Vaultで採集した進行をChord Dripへ再利用しやすくする。

作業:

1. `ChordTimelineItem[]` からコード進行テキストを生成する関数を追加する。
2. 候補カードに `Chord Drip形式でコピー` を追加する。
3. 保存済みProgression Blockにも同じコピー機能を付ける。
4. 変換関数のテストを追加する。

完了条件:

- `| Dmaj9 | A6/C# | D | Em9 A7sus4 |` 形式でコピーできる。
- 小節内複数コードが自然に表現される。
- コピー成功toastが出る。

---

### Phase 2.5-E: Libraryミニプレビュー

目的: 保存した進行をLibraryで見つけやすくする。

作業:

1. `progressionBlocks` があるIdeaカードにミニコードプレビューを出す。
2. `1 block` バッジだけでなく、短い進行テキストを表示する。
3. 検索対象にprogression block summary/chord labelsを含める。
4. 余力があれば「Progressionあり」フィルタを追加する。

完了条件:

- Libraryで進行内容が開かずに少し分かる。
- 保存したコード進行を探しやすい。

---

## 16. データモデル変更方針

Phase 2.5-A〜Dでは、原則データモデル変更は不要。

ただし、保存ブロックのタグやratingまでやる場合は以下を検討する。

```ts
type SavedProgressionBlock = {
  // existing fields...
  rating?: 1 | 2 | 3 | 4 | 5;
  favorite?: boolean;
  tags?: string[];
  useCase?: "intro" | "verse" | "chorus" | "bridge" | "turnaround" | "loop";
  sourceFileName?: string;
  sourceBarRange?: string;
};
```

互換性:

- optionalまたはzod defaultを使う。
- 旧data.jsonを壊さない。
- `fileVersion` は上げない。
- 破壊的変更が必要なら、先にmigration計画を作る。

Phase 2.5では、rating/tags/useCaseは余力タスク扱いでよい。

---

## 17. テスト方針

### 必須

- 既存テストをすべて通す。
- `npm run lint`
- `npm test`
- `npm run build`

Tauri buildは可能なら最後に実行:

- `npm run tauri build`

### 追加したいテスト

1. `formatProgressionText` のunit test
   - 1小節1コード
   - 1小節2コード
   - slash chord
   - 4小節整形
2. warning label変換のunit test
   - known warning
   - unknown warning
3. confidence label変換のunit test
   - high / medium / needs-review
4. ProgressionBlockCardのUI test
   - 通常表示ではsummary textareaが出ない
   - 編集ボタンで編集モードが出る
   - 保存ボタンで保存モーダルが開く
5. 保存モーダルのUI test
   - 新規Idea保存
   - 既存Idea追加
   - 未選択時disabled

UIテストが重い場合は、pure functionのテストを優先。

---

## 18. 手動確認チェックリスト

実装後、以下を手動確認する。

### MIDI未選択

- MIDI選択前の画面が分かりやすい。
- 何をする画面か分かる。
- MIDI選択ボタンが目立つ。

### MIDI解析後

- 候補ブロックが最初に見える。
- Full Timelineが邪魔しない。
- 解析サマリーがコンパクト。
- コードカードが見やすい。

### 候補カード

- 試聴できる。
- 編集モードを開ける。
- コードラベルを編集できる。
- 編集後に試聴できる。
- warningが日本語で出る。
- raw keyが出ない。
- confidenceがうるさくない。

### 保存

- 新しいIdeaとして保存できる。
- 既存Ideaへ追加できる。
- Chord Memoへコピーできる。
- Chord Drip形式でコピーできる。
- 保存後にLibrary/Detailで確認できる。

### 回帰確認

- Homeが表示される。
- Library検索が壊れていない。
- Detail編集が壊れていない。
- Settingsの言語切替が壊れていない。
- ×ボタンで終了できる。
- export/importが壊れていない。

---

## 19. 優先順位

作業を分けるなら以下の順。

### 最優先

1. CaptureView分離
2. MIDI未選択Empty State改善
3. MIDI選択後の画面順序変更
4. Full Timeline折りたたみ化
5. Candidate Blockカード整理

### 次点

6. 編集モード分離
7. 保存モーダル化
8. warning/confidence表示改善
9. Chord Drip形式コピー

### 余力

10. Libraryミニプレビュー
11. Progressionありフィルタ
12. rating/tags/useCase
13. Settings整理
14. Homeに最近採集した進行を表示

---

## 20. Codexへの最終指示

今回の主目的は、**MIDI解析後画面のUX整理**です。

特に重視すること:

- Full Timelineを主役にしない。
- 候補ブロックを主役にする。
- ユーザーが最初に「使えそうな進行候補」を見られるようにする。
- 保存先は候補選択後に聞く。
- 候補カード通常表示をシンプルにする。
- 編集欄は編集モードだけにする。
- warning/confidenceはユーザー向け表現にする。
- コードカード表示の良さは残す。
- 保存処理は既存store action経由で行う。
- domain層をUI都合で汚さない。
- 旧data.json互換を壊さない。

今回の完了条件:

```text
MIDIを選択した後、
「何を見ればよいか」
「どの候補を聴けばよいか」
「どう保存すればよいか」
が直感的に分かる状態になっていること。
```

---

## 21. 期待する最終体験

Phase 2.5後の理想体験:

```text
MIDIを入れる
↓
「使えそうな進行候補」がカードで並ぶ
↓
コードカードを見る
↓
試聴する
↓
必要なら編集する
↓
保存する
↓
Libraryで再利用する
↓
Chord Dripへコピーして展開できる
```

この状態になれば、Loop Vaultは単なるMIDI解析ツールではなく、  
**自分の耳が反応したコード進行を採集して育てるアプリ**になる。

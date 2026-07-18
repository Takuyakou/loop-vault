# Loop Vault Phase 3.7.1.2 作業報告書

作成日: 2026-07-18

対象: Phase 3.7.1.1追加修正 / Phase 3.7.1.2 Smooth・Style候補統合 / コード追加・試聴・候補表示UX

コードstack最終マージ: PR #117〜#137
コードstack先端merge commit: `3886008b5fd98eba9a78ef09695d47ca37e0c48c`

## 1. 実装結果

保存済みコード進行を、カードを中心に試聴・編集・追加・保存できる画面へ更新した。

- Vaultの保存済み進行をコードカードとして表示し、カードクリックで選択中の試聴音色を鳴らせる。
- コードカードの右クリックでは音を鳴らさず、Quick Chord Editorだけを開く。
- Quick Chord Editor外をクリックしたとき、未適用変更があれば適用・破棄・編集継続を選べる。
- 進行の末尾だけでなく、任意のコード間へ`+`ボタンからコードを追加できる。
- 追加時は前コードの単純コピーではなく、前後コードとKeyから生成した候補を初期値に使う。
- 追加したコードを再度開いても、最大5件の候補を表示できる。
- 元の解析コードでMIDI代替候補が少なくても、文脈候補で最大5件まで補完できる。
- Smooth候補とStyle候補をQuick Chord Editorへ統合した。
- 候補が複数の根拠へ一致した場合は、重複カードを作らず`文脈+スムーズ`のように併記する。
- コード進行上部の試聴ボタンを横並び・折り返しなしへ修正した。
- Vault一覧行の高さとoverflowを修正し、タイトル・メタ情報が上下に潰れる問題を解消した。
- 日本語・英語の候補ラベル、説明、Style不足時の案内を追加した。

主な入口:

- `src/views/ProgressionDetailView.tsx`
- `src/views/VaultView.tsx`
- `src/components/progression-editing/EditableProgressionGrid.tsx`
- `src/components/progression-editing/EditableChordCard.tsx`
- `src/components/progression-editing/QuickChordEditor.tsx`
- `src/domain/progressionEditing/slotQuickCandidates.ts`
- `src/domain/progressionEditing/quickCandidates.ts`

## 2. コードカードと試聴操作

### 左クリック

- コードカードを選択する。
- Progression Detailでは選択中の試聴音色を使って、そのコードを再生する。
- 試聴音色はピアノ / エレピを切り替えられる。

### 右クリック

- カードを選択し、Quick Chord Editorを開く。
- 右クリック自体では試聴しない。
- 候補カードをクリックした場合は、その候補を試聴する。

右クリック時の無音化は`EditableProgressionGrid`のQuick Editor入口を、試聴を含む`onSelect`ではなく、選択専用の`onNavigate`へ接続して実現している。

関連ファイル:

- `src/components/progression-editing/EditableProgressionGrid.tsx`
- `src/views/ProgressionDetailView.tsx`
- `src/views/ProgressionDetailView.test.tsx`

## 3. コード追加

コードカード間と末尾へ`+`ボタンを配置した。追加位置は選択カードに依存せず、押した境界から決まる。

追加処理:

1. 前コード、次コード、Key、進行全体、挿入位置を取得する。
2. `insertionQuickCandidates()`で追加候補を生成する。
3. 最上位の候補を新しいコードとして挿入する。
4. 挿入したカードを選択状態にする。
5. 編集履歴へinsert操作を追加し、Undo / Redo対象にする。
6. 明示的な保存操作で既存のStore actionからVaultへ反映する。

挿入スロットは`editSource: "insert"`を持ち、元の解析候補は持たない。挿入後の再編集ではMIDI解析候補を偽造せず、文脈・Smooth・Styleの修正候補をその場で再生成する。

関連ファイル:

- `src/domain/progressionEditing/splitMerge.ts`
- `src/domain/progressionEditing/chordSuggestions.ts`
- `src/domain/progressionEditing/slotQuickCandidates.ts`
- `src/components/progression-editing/EditableProgressionGrid.tsx`

## 4. 候補生成の実態

### 4.1 候補ソース

現行コードの候補ソースは4種類である。

| 内部値 | UI | 根拠 |
|---|---|---|
| `analyzer` | 検出 / Detection | MIDI解析が保持する代替コード |
| `harmonicContext` | 文脈 / Context | 前後コードとKeyから生成した候補 |
| `smoothConnection` | スムーズ / Smooth | 共通音、声部移動、Bass、Guide Tone、Top Voiceなど |
| `authorReferenceFit` | スタイル / Style | 確認済み進行や採用済み修正に近い候補 |

重要: UIの上限5件は「5種類の生成器」を意味しない。異なるコード候補を最大5枚表示する仕様である。

### 4.2 元の解析コード

基本構成は次の順序を優先する。

```text
検出 + 文脈から最大3件
Smoothから最大1件
Styleから最大1件
不足時は残りの検出 / 文脈 / Smooth / Styleで補完
最大5件
```

解析候補が3件未満でも、前後コードとKeyから作った文脈候補で枠を補う。このため、保存済みコードの`alternatives`が1〜2件でも、通常は5件まで表示できる。

### 4.3 手動追加コード

手動追加コードにはMIDI解析の証拠がないため、検出候補を生成しない。

```text
文脈から最大3件
Smoothから最大1件
Styleから最大1件
不足時は残りの文脈 / Smooth / Styleで補完
最大5件
```

### 4.4 重複処理

- 現在コードは候補から除外する。
- root、quality、tensions、slash bassを正規化して同値判定する。
- 同じChordSymbolが複数ソースから出た場合は1枚へ統合する。
- 統合後も`文脈+スムーズ`のように全根拠を表示する。
- slash bassが異なる候補は別コードとして維持する。
- 同じ入力から同じ順序を返し、乱数と現在時刻へ依存しない。

関連ファイル:

- `src/domain/progressionEditing/contextCandidates.ts`
- `src/domain/progressionEditing/smoothCandidates.ts`
- `src/domain/progressionEditing/styleCandidates.ts`
- `src/domain/progressionEditing/quickCandidates.ts`

## 5. SmoothとStyle

### Smooth

Smooth候補は次の要素を使って、前後へ自然につながるコードを順位付けする。

- 共通Pitch Class
- Guide Toneの半音・全音移動
- Bass移動
- Top Voice移動
- 総声部移動量
- root移動
- Key互換性
- foreign tone
- low-register collision
- loop先頭 / 末尾の接続

Chord Drip repositoryへのruntime importはない。監査後、必要な純粋ロジックをLoop Vault側へ適応している。

### Style

Style候補は無条件には生成しない。`buildAuthorReferenceIndex()`が次のどちらかを満たす場合だけ利用可能になる。

- 確認済み進行のtransitionが5件以上
- 採用済み修正が3件以上

履歴が不足する場合は、架空のStyle候補を作らない。Quick Chord Editorへ「確認済み進行や採用した修正が増えると表示される」と案内し、候補枠は文脈・Smoothで補完する。

関連ファイル:

- `src/domain/progressionEditing/smoothCandidates.ts`
- `src/domain/progressionEditing/styleCandidates.ts`
- `src/components/progression-editing/QuickChordEditor.tsx`
- `docs/phase3.7.1.2-chord-drip-strategy-audit.md`

## 6. UI修正

### Progression Detail

- 大きな進行文字列だけでなく、クリック可能なコードカードを主編集面にした。
- 進行試聴、ピアノ / エレピ、Key、BPM、拍子を同じ操作帯へ配置した。
- 試聴ボタンへ`inline-flex`、`gap`、`whitespace-nowrap`を適用し、アイコンと文字の縦崩れを修正した。
- 任意位置の追加ボタンをカード間へ配置した。

### Quick Chord Editor

- 検出候補と修正提案を分けて表示する。
- 候補ごとに検出、文脈、Smooth、Styleの出自を表示する。
- 候補クリックで試聴、Enterで適用、Escまたは範囲外クリックで終了操作へ進む。
- 未適用変更がある場合は、適用して閉じる / 破棄して閉じる / 編集へ戻るを表示する。

### Vault

- ナビゲーションと進行 / Idea表示を整理した。
- 行の固定高とoverflowによるタイトル・メタ情報の文字切れを修正した。
- ライブラリ / 一覧からProgression Detailへ遷移できる。

## 7. 状態管理と永続化

- Progression Detailの保存は`updateProgressionBlock()`を通る。
- 追加・置換・削除・分割・結合は編集セッション内で履歴管理し、保存時に既存Store actionへ渡す。
- repositoryへの直接書き込みは追加していない。
- Quick候補、文脈候補、Smooth候補、Style候補は一時的な派生データであり、`SavedProgressionBlock`へ保存しない。
- `quickCandidateSelection`は解析フィードバック生成に利用できるが、保存進行へは露出しない。
- `fileVersion`は1のまま。
- `defaultAnalyzerMode`は`legacy`のまま。
- MIDI parser、コード判定重み、Voice Role、Full Timeline、Live MIDI、PlaybackControllerは本作業で変更していない。

## 8. テスト

マージ済み`master`で2026-07-18に実行した結果:

| 検証 | 結果 |
|---|---|
| `npm run lint` | PASS |
| `npm test -- --run` | PASS: 116 files / 654 tests |
| `npx tsc --noEmit` | PASS |
| `npm run build` | PASS |
| `npm run tauri build` | PASS |
| `git diff --check` | PASS |

主な追加・更新テスト:

- 元コードで解析候補が1件でも候補を5件表示する。
- 手動追加コードで候補を5件表示する。
- 手動追加コードに文脈候補を3件以上含める。
- Smooth根拠を重複統合後も保持する。
- Style不足時に偽のStyle候補を生成しない。
- 文脈候補の順序が決定的である。
- 文脈候補の選択メタデータを評価schemaが受理する。
- 右クリックでQuick Chord Editorを開いても試聴しない。
- コードカードの左クリックは選択中音色で試聴する。
- 追加したコードを保存し、進行内の位置と内容を維持する。
- Vault一覧行のタイトル・補助情報を表示する。

## 9. PRとマージ結果

Phase 3.7.1からPhase 3.7.1.2まで、PR #117〜#137を依存順に`master`へマージした。競合は0件。全PRのbaseを直前PRのマージ後に`master`へ更新してからマージした。

| 範囲 | 内容 | 状態 |
|---|---|---|
| #117〜#123 | Phase 3.7.1 Progression Detail / Smart Library | MERGED |
| #124〜#129 | Phase 3.7.1.1 選択・編集UX / 5候補 / QA | MERGED |
| #130 | 進行カード表示とVaultナビ整理 | MERGED |
| #131 | カード試聴と編集終了確認 | MERGED |
| #132 | コード進行へのコード追加 | MERGED |
| #133 | 文脈候補と任意位置追加UI | MERGED |
| #134 | Smooth / Style候補統合 | MERGED |
| #135 | Vault一覧の文字切れ修正 | MERGED |
| #136 | 追加コード候補・右クリック試聴・試聴ボタン修正 | MERGED |
| #137 | 文脈候補による最大5件補完 | MERGED |

コードstackの最終merge commit:

```text
3886008b5fd98eba9a78ef09695d47ca37e0c48c
```

## 10. Windows成果物

- 単体EXE: `D:\dev\Loop Vault\src-tauri\target\release\loop-vault.exe`
- MSI: `D:\dev\Loop Vault\src-tauri\target\release\bundle\msi\Loop Vault_0.1.0_x64_en-US.msi`
- セットアップEXE: `D:\dev\Loop Vault\src-tauri\target\release\bundle\nsis\Loop Vault_0.1.0_x64-setup.exe`

## 11. 既知の制約

- 候補上限は5件だが、候補pool自体が不足する場合や重複統合後は5件未満になり得る。
- Style候補はユーザーの確認済みデータが不足すると表示されない。これは誤った好みをStyleとして提示しないためのgateである。
- 文脈候補は前後コードとKeyを使うルールベース候補であり、MIDI音符から再解析した候補ではない。
- Smoothはcanonical voicingによる評価で、実際の演奏voicingを保存しているわけではない。
- Vite buildでは約858〜869KBのJavaScript chunkが500KB推奨値を超える警告が残る。ビルドとTauri bundle生成は成功している。
- 無関係な未追跡ファイル`docs/loop-vault-phase3-final-uiux-refresh-work-plan.md`と`src-tauri/gen/`はマージへ含めていない。

## 12. ユーザー確認推奨

1. 保存済み進行のコードカードを左クリックし、選択中のピアノ / エレピで鳴ること。
2. 同じカードを右クリックし、音を鳴らさずQuick Chord Editorだけが開くこと。
3. 元コードと途中追加コードの両方で、候補が通常5件表示されること。
4. 候補に`検出`、`文脈`、`スムーズ`、利用可能な場合は`スタイル`が表示されること。
5. コード間の`+`から途中へ追加し、保存・再起動後も順序が維持されること。
6. Quick Chord Editorを範囲外クリックで閉じ、変更時だけ確認ダイアログが出ること。
7. Vault一覧で長いタイトルやメタ情報が上下に切れないこと。
8. 日本語・英語を切り替え、候補ラベルとStyle不足案内が読めること。

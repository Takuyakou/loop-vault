# Loop Vault Phase 3.7.1 作業報告書

作成日: 2026-07-18  
対象: Progression Detail / Quick Chord Editor / Progression Index / Smart Library / Mood v1 / Header整理

## 1. 実装結果

Phase 3.7.1では、保存済みコード進行を「保存後も聴く・直す・分類する・再発見する」ための導線を追加した。

- Vaultの保存済み進行から専用のProgression Detailを開ける。
- 保存済み進行のコード、タイトル、Key、BPM、拍子、メモ、タグを編集できる。
- 編集中の進行を試聴し、Undo / Redo、保存、複製、削除ができる。
- コードカードから軽量なQuick Chord Editorを開き、候補選択、root変更、試聴、適用ができる。
- CaptureとProgression Detailが同じQuick Chord Editorを使う。
- 保存済み進行を由来、和声的特徴、用途、Mood、手動タグで分類・検索できる。
- Vaultの進行表示を「一覧」と「ライブラリ」で切り替えられる。
- ライブラリではお気に入り、最近、カテゴリ、検索、並び順、長さなどを組み合わせて絞り込める。
- ヘッダーの主操作を「+ Idea」に整理し、Live MIDI、設定、保存状態を別グループとして表示する。
- 日本語と英語の両方に新UIの文言を追加した。

主な入口:

- `src/App.tsx`
- `src/views/VaultView.tsx`
- `src/views/ProgressionDetailView.tsx`
- `src/components/progression-editing/QuickChordEditor.tsx`
- `src/domain/progressionClassification/`
- `src/store/vaultStore.ts`

## 2. PR構成

依存する変更を1タスク1PRで積んでいる。マージ順は次のとおり。

| 順序 | PR | ブランチ | 内容 |
|---:|---:|---|---|
| 1 | #117 | `docs/p3-7-1-s0-audit` | 現行実装の監査とPhase計画の取り込み |
| 2 | #118 | `feature/p3-7-1-s1-progression-detail` | Progression Detailと保存・複製・削除 |
| 3 | #119 | `feature/p3-7-1-s2-quick-chord-editor` | Quick Chord Editorの共通化 |
| 4 | #120 | `feature/p3-7-1-s3-progression-index` | 分類ドメイン、派生タグ、Progression Index |
| 5 | #121 | `feature/p3-7-1-s4-smart-library` | Smart Library、カテゴリレール、仮想化 |
| 6 | #122 | `feature/p3-7-1-s5-mood-header` | Mood v1とヘッダー整理 |
| 7 | #123 | `docs/p3-7-1-s6-qa-report` | 最終QAと本報告書 |

この報告書作成時点ではstacked PRであり、`main`へは未マージ。

## 3. Stage別の実装

### S0: 監査

- 既存の保存済み進行、編集ワークスペース、Vault、再生、永続化経路を調査した。
- 既存の`SavedProgressionBlock`を維持し、別entityや別repositoryを作らない方針を確定した。
- 実装境界を`docs/phase3.7.1-audit.md`へ記録した。

### S1: Progression Detail

- `src/views/ProgressionDetailView.tsx`を追加した。
- Vaultの保存済み進行から専用詳細画面へ移動できるようにした。
- 既存の進行編集ドメインと編集UIを再利用した。
- Storeへ`updateProgressionBlock`と`duplicateProgressionBlock`を追加した。
- 保存、複製、削除は既存のVault変更経路を通る。repositoryへの直接書き込みは追加していない。
- Idea Detailは制作アイデア、Progression Detailは保存済みコード進行という役割に分けた。

### S2: Quick Chord Editor

- `src/components/progression-editing/QuickChordEditor.tsx`を追加した。
- CaptureとProgression Detailで同じコンポーネントを使用する。
- Enter、Shift+F10、右クリック、hover時の編集ボタンから開ける。
- 数字1〜5で代替候補、Spaceで試聴、左右キーでroot変更、`U`で初期値へ戻す、`E`でInspector、Enterで適用、Escで閉じる。
- フォーカストラップ、閉じた後のフォーカス復帰、画面端での表示方向反転を実装した。
- Quick Editorの変更は編集中モデルへ適用され、明示的な保存操作でVaultへ反映される。

### S3: Progression Indexと分類

- `src/domain/progressionClassification/`に純粋な分類ロジックを追加した。
- Source、Harmonic Feature、Useの派生タグを実装した。
- 手動タグと自動タグを分離した。
- 自動タグをユーザーが消した場合は`SuppressedAutoTag`として抑止し、再解析で勝手に復活しない。
- 分類taxonomyは`docs/taxonomy-v1.md`へ記録した。
- Progression Indexは保存済み進行から都度派生する非永続データである。
- 1,000件の進行に対するindex構築・絞り込みテストを追加し、100ms未満の条件を検証した。

分類ドメインはReact、Zustand、Tauri API、現在時刻、乱数へ依存しない。

### S4: Smart Library

- `src/components/ProgressionLibraryRail.tsx`を追加した。
- Vaultの進行表示に「一覧 / ライブラリ」切替を追加した。
- すべて、お気に入り、最近、Feature、Use、Mood、Source、Collectionのカテゴリを表示する。
- 同一カテゴリ内はOR、異なるカテゴリ間はANDで絞り込む。
- 既存の検索、並び順、長さ、お気に入り条件と併用できる。
- 各カテゴリの件数を表示する。
- 390px幅ではカテゴリレールをdrawerとして扱う。
- 200件を超える場合は64px固定行の仮想化を使う。

### S5: Mood v1とHeader

- `src/domain/progressionClassification/deriveMoodTags.ts`を追加した。
- Mood候補はBright、Dark、Dreamy、Warm、Tense、Mysterious、Floating、Dramatic。
- 3コード以上、confidence 0.78以上、最大2件の保守的な推定とした。
- 曖昧で相反する進行にはMoodを付けない。
- Moodにも自動タグ抑止を適用する。
- ヘッダーの主操作を`+ Idea`に整理した。
- Live MIDIと設定を補助操作、保存状態を独立した状態表示に分けた。
- 保存状態はLucideのCheck、LoaderCircle、CircleAlertを使い、文字記号を使わない。
- 390pxでは2段、640px以上では1段になる。

### S6: 最終QA

- lint、全テスト、TypeScript型検査、Vite本番ビルド、Tauri buildを実行した。
- 390pxと1280pxでヘッダーを確認し、重なりと横スクロールがないことを確認した。
- 390pxでVaultナビゲーションと`+ Idea`が重なる問題を検出し、small viewportでcontrolsを2段目へ送る修正をS5へ含めた。
- `defaultAnalyzerMode = legacy`と`fileVersion = 1`の維持を確認した。
- `.local-evaluation`、実MIDI、未追跡ファイルをGit管理へ追加していない。

## 4. データと永続化

既存の`SavedProgressionBlock`を引き続き保存単位として使う。Phase 3.7.1で永続化へ追加したのは、自動タグ抑止情報のみである。

- `SuppressedAutoTag`はoptionalで、Zodでは`.default([])`を使う。
- `fileVersion`は1のまま。
- 旧data.jsonを読むschema回帰テストを維持している。
- 派生タグ、Mood判定理由、Progression Index、フィルタ結果はdata.jsonへ保存しない。
- Quick Editorの一時状態も保存しない。
- 保存済み進行の変更はZustand storeのactionから既存の`applyVaultChange()`とautosave経路へ渡る。
- repositoryへの新しい直接書き込みはない。

関連ファイル:

- `src/domain/types.ts`
- `src/domain/schema.ts`
- `src/domain/progressionClassification/suppression.ts`
- `src/domain/progressionClassification/index.ts`
- `src/store/vaultStore.ts`

## 5. テストと検証結果

2026-07-18のstack先端での結果:

| 検証 | 結果 |
|---|---|
| `npm run lint` | PASS |
| `npm test -- --run` | PASS: 110 files / 617 tests |
| `npx tsc --noEmit` | PASS |
| `npm run build` | PASS |
| `npm run tauri -- build` | PASS |
| `git diff --check` | PASS |

主な追加テスト:

- Progression Detailの表示、編集、保存、複製、削除。
- Quick Chord Editorの各入口、キーボード操作、フォーカス、適用、取消。
- Source / Feature / Use / Mood分類と自動タグ抑止。
- 旧data.jsonとの互換性と`fileVersion = 1`。
- Progression Indexの決定性、絞り込み、1,000件時の性能。
- Smart LibraryのOR / AND条件、件数、モバイル表示、仮想化。
- ヘッダーの主操作と保存状態表示。
- Storeの保存・複製・close guard連携。

手動表示確認:

- 390px: ヘッダー2段、横スクロールなし、操作の重なりなし。
- 1280px: ヘッダー1段、操作の重なりなし。
- Vaultの一覧 / ライブラリ切替、Progression Detail遷移、Quick Editor表示を確認済み。

## 6. Windows成果物

- 単体EXE: `D:\dev\Loop Vault\src-tauri\target\release\loop-vault.exe`
- MSI: `D:\dev\Loop Vault\src-tauri\target\release\bundle\msi\Loop Vault_0.1.0_x64_en-US.msi`
- セットアップEXE: `D:\dev\Loop Vault\src-tauri\target\release\bundle\nsis\Loop Vault_0.1.0_x64-setup.exe`

## 7. 既知の制約

- Moodはルールベースの補助分類であり、正解を保証しない。曖昧な進行には付与しない設計。
- My Collectionsはtaxonomy上の入口を用意したが、独立した物理フォルダや別entityは作っていない。
- Progression Indexはメモリ上で都度生成する。クラウド同期や専用DBはない。
- 仮想化は固定64px行を前提にする。
- bulk tag editing、Library内のドラッグ並び替え、AI/LLM Mood分類は未実装。
- MIDI解析アルゴリズム、Live MIDI、PlaybackControllerは本Phaseでは変更していない。
- Vite buildで約834〜844KBのJSチャンクが500KB推奨値を超える警告が残る。ビルド自体は成功している。

## 8. ユーザー確認推奨項目

1. Vaultの保存済み進行を開き、コード編集、試聴、保存後の再起動で変更が残ること。
2. 進行を複製・削除し、一覧とライブラリの両方へ即時反映されること。
3. コードカードのEnter、右クリック、編集アイコンからQuick Editorが開くこと。
4. 日本語・英語の両方で新しい画面とタグが読めること。
5. 既存のdata.json、MIDI解析、Live MIDI、アプリ終了操作に回帰がないこと。
6. 390px相当の狭いウィンドウでヘッダーとLibrary drawerが使えること。

## 9. マージ時の注意

- PRは`#117 -> #118 -> #119 -> #120 -> #121 -> #122 -> #123`の順でマージする。
- 各PRのbaseを、直前PRのマージ後に`main`へ更新してから進める。
- `.local-evaluation`、実MIDI、`src-tauri/gen/`、無関係な未追跡ドキュメントを取り込まない。
- マージ後にmainで同じ最終検証とTauri buildを再実行する。

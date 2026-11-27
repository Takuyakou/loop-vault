# Loop Vault Phase 3.5 作業報告書

## 1. 目的と結論

Phase 3.5 では、Phase 3 までに実装された MIDI コード採集と進行保存を前提に、Vault を「保存した進行を100件規模でも探し、聴き、再利用する画面」へ再設計した。

実装済みの中心機能は以下。

- 進行をカードではなく高密度な行として一覧表示する (`src/views/VaultView.tsx`)
- キーが異なっても度数列で同型進行を検索する (`src/domain/harmony/degrees.ts`)
- キーワード、ピン、キー、小節数、採集元ファイル、タグを AND 条件で絞り込む (`src/domain/progressionFilters.ts`)
- キーボードだけで選択、試聴、停止、詳細表示、コピー、ピン操作を行う (`src/views/VaultView.tsx`)
- Home の今日の Loop にコード名と度数列を併記する (`src/views/HomeView.tsx`)
- 30 Idea / 100進行の検証用データを本番データとは別ファイルへ生成する (`scripts/seed-demo.mjs`)
- 巨大化していた `App.tsx` から画面を `src/views/` へ分離する

MIDI 解析エンジン、repository のアトミック保存、バックアップ、`fileVersion` は変更していない。永続化データの追加は `SavedProgressionBlock.pinned` と `settings.showRomanNumerals` のみで、どちらも旧データを読める default を持つ (`src/domain/schema.ts`)。

## 2. ブランチとPR

Phase 3.5 は1タスク1ブランチ・1PRのスタックとして実装した。現時点では未マージ。

|順序|タスク|コミット|PR|base|
|---|---|---|---|---|
|1|P3.5-01 画面分割|`bc0e28f`|[#19](https://github.com/Takuyakou/loop-vault/pull/19)|`master`|
|2|P3.5-02 デザイントークン|`daed12d`|[#20](https://github.com/Takuyakou/loop-vault/pull/20)|`feature/p3-5-01-view-extraction`|
|3|P3.5-03 度数検索|`f921db4`|[#21](https://github.com/Takuyakou/loop-vault/pull/21)|`feature/p3-5-02-design-tokens`|
|4|P3.5-04 Vault行リスト|`e58ac37`|[#22](https://github.com/Takuyakou/loop-vault/pull/22)|`feature/p3-5-03-degree-search`|
|5|P3.5-05 キーボード操作|`9c0913b`|[#23](https://github.com/Takuyakou/loop-vault/pull/23)|`feature/p3-5-04-vault-rows`|
|6|P3.5-06 フィルターとソート|`f680f43`|[#24](https://github.com/Takuyakou/loop-vault/pull/24)|`feature/p3-5-05-keyboard-browser`|
|7|P3.5-08 デモシード|`7a60e95`|[#25](https://github.com/Takuyakou/loop-vault/pull/25)|`feature/p3-5-06-progression-filters`|
|8|P3.5-07 Home/ナビ整理|`18c558b`|[#26](https://github.com/Takuyakou/loop-vault/pull/26)|`feature/p3-5-08-demo-seed`|

マージ時は #19 から #26 へ下から順に処理する。

## 3. プロジェクト構成の変更

画面コンポーネントを以下へ抽出した。

```text
src/
├─ App.tsx                    # store接続、画面遷移、ダイアログ調停
├─ components/
│  ├─ AppShell.tsx            # グローバルナビ
│  └─ Toast.tsx               # 通知表示
├─ views/
│  ├─ HomeView.tsx            # 今日のLoop、月間指標、最近の進行
│  ├─ VaultView.tsx           # 進行/Idea一覧、検索、試聴、操作
│  ├─ DetailView.tsx          # Idea詳細編集
│  ├─ SettingsDialog.tsx      # 設定、import/export、バックアップ
│  └─ CaptureView.tsx         # MIDI採集ワークベンチ
├─ domain/
│  ├─ harmony/degrees.ts      # 度数変換と検索クエリ解釈
│  └─ progressionFilters.ts   # 進行の絞り込みとソート
└─ styles/
   └─ tokens.css              # 色、余白、角丸、ボタン階層
```

`src/domain/harmony/degrees.ts` と `src/domain/progressionFilters.ts` は React、Zustand、Tauri、現在時刻を import しない純粋層である。UI はこれらの関数を呼び、永続化を伴うピン変更は `VaultView -> updateIdea -> applyVaultChange` の既存経路を通る (`src/views/VaultView.tsx`, `src/store/vaultStore.ts`)。

## 4. データモデルと後方互換

Phase 3.5 で追加した永続フィールドの実物は以下。

```ts
export interface SavedProgressionBlock {
  id: string;
  pinned?: boolean;
  sourceAssetId?: string;
  sourceFileName?: string;
  startBar?: number;
  endBar?: number;
  lengthBars?: number;
  summaryText: string;
  chords: ChordTimelineItem[];
  detectedKey?: string;
  bpm?: number;
  memo?: string;
  tags: string[];
  capturedAt: string;
  analyzerVersion: string;
}
```

```ts
export interface VaultFile {
  app: "loopvault";
  fileVersion: 1;
  settings: { monthlyGoal: number; language: AppLanguage; showRomanNumerals?: boolean };
  ideas: SongIdea[];
}
```

根拠: `src/domain/types.ts`

Zod 側は `pinned: z.boolean().default(false)`、`showRomanNumerals: z.boolean().default(true)` としている (`src/domain/schema.ts`)。初回データにも `showRomanNumerals: true` を設定する (`src/domain/repository.ts:createEmptyVault`)。旧 JSON の読み込みは `src/domain/schema.test.ts` で検証済みで、`fileVersion` は `1` のまま。

## 5. 度数検索エンジン

公開型と関数シグネチャは以下。

```ts
export interface DegreeSymbol {
  degree: number;
  accidental: -1 | 0 | 1;
  quality: ChordQuality;
  bass?: "3rd" | "5th" | "7th";
  label: string;
}

export interface DegreeQuery {
  kind: "degree";
  terms: Array<{ degree: number; accidental?: -1 | 0 | 1; quality?: "major" | "minor" | ChordQuality }>;
}

export interface ChordQuery {
  kind: "chord";
  normalized: string;
}

export interface TextQuery {
  kind: "text";
  normalized: string;
}

export function degreeOf(chord: ChordSymbol, key: string | undefined): DegreeSymbol | undefined
export function degreeSequence(block: SavedProgressionBlock): string[]
export function normalizeQuery(query: string): DegreeQuery | ChordQuery | TextQuery
export function matchProgression(block: SavedProgressionBlock, query: DegreeQuery | ChordQuery | TextQuery): boolean
```

根拠: `src/domain/harmony/degrees.ts`

実装挙動:

- `4536` と `4-5-3-6` は degree query になる
- `IV-V-iii-vi`、`IVmaj7 V7` は Roman numeral query になる
- `Fmaj9` などは chord query になる
- その他は title、genre、mood、memo、tag、source file 等を対象とする text query になる
- degree query は進行全体への完全一致ではなく、連続部分一致
- 同じ度数列ならキーが異なるブロックもヒットする
- `Math.random()`、時計、グローバル状態、副作用は使用しない

テストは `src/domain/harmony/degrees.test.ts` に3件あり、移調された 4-5-3-6、Roman numeral、コード名検索を検証する。

## 6. フィルターとソート

実物の公開インターフェース:

```ts
export interface ProgressionRecord { idea: SongIdea; block: SavedProgressionBlock }
export interface ProgressionFilters {
  query: string;
  pinnedOnly: boolean;
  keys: string[];
  lengths: number[];
  sources: string[];
  tags: string[];
}
export interface ProgressionSort { field: "capturedAt" | "updatedAt" | "key" | "bpm"; direction: "asc" | "desc" }

export function filterAndSortProgressions(
  ideas: readonly SongIdea[], filters: ProgressionFilters, sort: ProgressionSort,
): ProgressionRecord[]
```

根拠: `src/domain/progressionFilters.ts`

全条件は AND 結合。ピン留め済みブロックは、選択したソート条件より前に常に上へ来る。キー/BPMはブロック側を優先し、無ければ親 Idea の値を使う。採集日、更新日、キー、BPMで並べ替えられる。純関数であり、入力配列自体は変更しない。

## 7. Vault UI

`src/views/VaultView.tsx` の Progression ビューは1ブロック1行で、以下を表示する。

- 再生/停止
- コード名列
- 度数列または親 Idea 名
- キー
- BPM
- 採集日
- タグ
- ピン
- コピー

検索欄の placeholder は `4-5-3-6 / IVmaj7 / Fmaj9 / タグで検索`。フィルターはピン、キー、4/8/16小節、採集元ファイル名、タグ。Idea ビューは4列までの小型グリッドへ圧縮した。

キーボード操作:

|キー|動作|
|---|---|
|`↑` / `↓`|選択行を移動|
|`Space`|選択行を試聴/停止|
|`Enter`|親 Idea の詳細を開く|
|`C`|コード進行文字列をコピー|
|`S`|ピンを切り替える|
|`/`|検索欄へフォーカス|
|`Esc`|検索を消してフォーカス解除|

input、textarea、select、contenteditable にフォーカスがある間はグローバルショートカットを処理しない。試聴は既存の `src/audio/chordPreview.ts` を遅延 import して再利用する。

## 8. Home・ナビ・デザイントークン

`src/styles/tokens.css` に背景3段階、border2段階、accent、warning、text3段階、4/8/12/16/24pxの余白、8/12pxの角丸を定義した。ボタン共通クラスは `lv-button-primary`、`lv-button-secondary`、`lv-button-ghost`。

Home (`src/views/HomeView.tsx`) では以下を変更した。

- 今日の Loop のコード名の下に `degreeSequence()` の結果を表示
- `showRomanNumerals` が false の場合は度数列を隠す
- 「次の一手を完了」を primary、試聴と詳細表示を ghost に整理
- 月間完成、Next Action不足、Stale の数値を24px、ラベルを13pxへ統一
- 空状態ではコード採集を primary、Idea作成/Vault表示を ghost に整理

ナビ (`src/components/AppShell.tsx`) のアクティブ表示は下線から面背景へ変更した。

## 9. 検証用シード

`npm run seed:demo` は `scripts/seed-demo.mjs` を実行し、以下を生成する。

- Idea 30件
- SavedProgressionBlock 100件
- キーを分散した 4-5-3-6 の例 75件
- 4/8/16小節、BPM、タグ、採集元ファイル名、ピン状態を分散

出力先は `demo-data/loop-vault-demo-100.json`。`.gitignore` により生成JSONはコミットしない。本番の `data.json` を直接変更せず、必要な場合だけ設定画面の import から読み込む。

最終実行時は100進行を約4msで生成した。これは生成処理の値であり、ユーザー操作を含む「検索から試聴、コピーまで3秒」の実測値ではない。

## 10. テストとビルド

Phase 3.5 最終ブランチでの結果:

|確認|結果|
|---|---|
|`npm run seed:demo`|成功、30 Idea / 100進行|
|`npm run lint`|成功|
|`npm test`|22ファイル、92テストすべて成功|
|`npm run build`|成功|
|`npm run tauri build`|成功|

生成物:

- `src-tauri/target/release/loop-vault.exe`
- `src-tauri/target/release/bundle/msi/Loop Vault_0.1.0_x64_en-US.msi`
- `src-tauri/target/release/bundle/nsis/Loop Vault_0.1.0_x64-setup.exe`

新規/更新テスト:

- `src/domain/harmony/degrees.test.ts`: 度数変換と検索
- `src/domain/progressionFilters.test.ts`: ANDフィルター、ピン優先、ソート
- `src/domain/schema.test.ts`: `pinned` と設定の後方互換
- `src/store/vaultStore.test.ts`: Roman numeral表示設定の保存
- `src/domain/displayLabels.test.ts`: UI表示ラベル
- `src/domain/harmony/romanNumerals.test.ts`: Roman numeral表示

## 11. 既知の制約・未検証

- **PR未マージ**: Phase 3.5 は #19〜#26 のスタック上にあり、`master` にはまだ入っていない。
- **3秒ルールは人手未計測**: 100件シード生成、純関数テスト、ビルドは成功したが、検索開始から試聴・コピー完了までをストップウォッチで計測していない。
- **UI自動テスト不足**: キーボード操作、Homeの度数表示、1080pで15行以上見えることは専用のブラウザE2Eテストを持たない。
- **仮想スクロールなし**: 100件は通常の React map で全行描画する。数千〜数万件への拡張時は再評価が必要。
- **採集元フィルターの粒度**: 現実装は MIDI/手入力という種別ではなく `sourceFileName` の完全一致で絞り込む。
- **度数表示のキー参照**: `degreeSequence(block)` は `block.detectedKey` のみを見る。行のキー表示は親 Idea の key へフォールバックするが、`detectedKey` が無いブロックは親 Idea に key があっても度数列を生成しない。
- **トークン移行は完全ではない**: 共通色と主要ボタンはトークン化したが、既存画面には Tailwind の `teal` / `cyan` / `stone` 直接指定が残る。
- **store型の任意指定**: `VaultStoreState.setShowRomanNumerals?: ...` は実装自体は常に存在するが、型上 optional のまま。呼び出し側は存在確認が必要。

## 12. 次の担当者が確認する手順

1. #19 から #26 を順番にレビュー/マージする。
2. `npm run seed:demo` を実行する。
3. 設定画面から `demo-data/loop-vault-demo-100.json` を import する。
4. Vault の Progression ビューで `4-5-3-6`、`IV-V-iii-vi`、`Fmaj9` を検索する。
5. `↑↓ -> Space -> C` を実行し、3秒以内に目的の進行を確認・試聴・コピーできるか人手で測る。
6. 1080p表示で15行以上見えるか、長いコード名/タグで列崩れがないか確認する。
7. ピンを切り替えて再起動し、状態が保存されることを確認する。

以上が Phase 3.5 完了時点の実装実態である。

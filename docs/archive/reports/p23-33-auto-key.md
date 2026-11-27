# P23-33:取り込み時の未設定キー自動付与(実装報告)

- ブランチ:`feat/p23-33-auto-key`(`fix/p23-31-review` の `e57d22b2` から。master からは切っていない)
- コミット:
  - `f3ddab4a` p23-33-01 S1:自動キーの規則と固定 fixture
  - `848fd578` p23-33-02 S2/S3:テキスト(通常/拡張)の自動キーと保存境界、MIDI の欠落時の補完
  - `692328b3` p23-33-03 S2:状態の要約は有効キーだけ、自動はキー欄に出す
  - `27edf0b7` p23-33-04 S4:キー欄の選択肢に合わせたテストの期待
  - この報告のコミット(最後)
- 依拠:`handoff\specs\P23-33-auto-key-design.md`(設計)・`inbox\P23-32`(P23-32 の作業)

## 1. 変更ファイルと接続した保存経路

### 新規

- `src/domain/importKeyResolution.ts`:推定 `inferImportKey`・決定 `resolveImportKey`・表示 `importKeyLabel`・
  型 `ImportKeyDecision` / `ImportKeyChoice` / `ImportKeyUnknownReason`。React も storage も持たない純粋関数。
- `src/domain/importKeyResolution.test.ts`:設計 §8 の固定 fixture(19 本)。

### 変更(接続)

| ファイル | 何を |
|---|---|
| `src/components/capture/TextCaptureFields.tsx` | `TextKeySelect` に「自動」「未設定」(既定は自動)。推定候補の optgroup はそのまま |
| `src/components/capture/TextProgressionCapturePanel.tsx` | キーの状態を auto / unset / manual に。parse は manual のときだけ。表示・度数・保存は `resolvedKey`。sr-only の状態文も更新 |
| `src/components/capture/ExtendedTextIntakePanel.tsx` | 同じ 3 状態。原文 metadata.key は manual のときだけ。度数は `resolvedKey`。`onSave` に `resolvedKey` を追加 |
| `src/domain/textProgressionDraft.ts` | 保存 payload に `resolvedKey?`(trim、確認キーとは別) |
| `src/views/CaptureView.tsx` | 直接保存・draft context・draft 保存の 3 経路に `resolvedKey` を通す。拡張の `saveExtendedTextProgression` も |
| `src/store/vaultStore.ts` | `TextProgressionIdeaDraft.resolvedKey`(確認キーと同じ正規形で検証)。block の `detectedKey` は `resolvedKey ?? confirmedKey`、新規 idea の `key` も同じ。追加保存は既存 idea の key を上書きせず、空のときだけ有効キーで補う。**`validateSavedTextSource` には渡さない**(原文の検証は `confirmedKey` のまま) |
| `src/views/capture/useCaptureSave.ts` | MIDI 保存境界:既存 `analysis.detectedKey` があればそのまま。無いときだけ保存する和音列から決める |
| `src/store/vaultStore.ts`(`createIdeaFromDraft`) | analysis にキーが無く、境界で解決したキーがあるときだけ block.detectedKey を補う(analysis のキーは置換しない) |

### 保存経路(どこを通るか)

1. 通常テキスト:パネル → `onSaveStandard(converted)` → `CaptureView.saveStandardTextProgression` →
   `textProgressionDraftSavePayload({ resolvedKey })` → `createIdeaFromTextProgression` → `normalizeTextProgressionIdeaDraft` →
   `createSavedTextProgressionBlock`(block.detectedKey)/ idea.key。
2. 詳細編集(draft)から保存:`openTextProgressionDraft` が `textDraftContext.resolvedKey` に写し、
   `textDraftSavePayload` が同じ payload を作る(同じ経路)。
3. 拡張テキスト:`ExtendedTextIntakePanel.onSave(result, title, resolvedKey)` →
   `CaptureView.saveExtendedTextProgression` → `extendedTextSaveData` + `resolvedKey` → 同じ `createIdeaFromTextProgression`。
4. MIDI:`useCaptureSave.saveNew` が `resolveImportKey({ existingKey: analysis.detectedKey, chords })` →
   `createIdeaFromDraft`(idea.key と、analysis にキーが無いときだけ block.detectedKey)。

## 2. 自動付与・未確定・手動優先・意図的未設定(実測)

`inferImportKey` / `resolveImportKey` の単体(`src/domain/importKeyResolution.test.ts`、19/19 PASS)と、
パネルの単体(`TextProgressionCapturePanel.test.tsx` の P23-33 の 5 本)で次を確かめた。

| 状態 | 結果 |
|---|---|
| C F G C(何も選ばない) | **C major**。キー欄は「自動: Cメジャー」、保存の `resolvedKey` = `C major`、`confirmedKey` は無し |
| C Am F | **未確定**(同点の C major / A minor / F major を sort 順で決めない)。保存は可能でキーは付かない |
| C だけ・C G | **未確定**(3 和音・3 種の条件) |
| 手動 D major(C F G C) | **D major** 維持。`confirmedKey` と `resolvedKey` の両方が `D major`。和音・音・時刻は不変 |
| 自動成功のあと「未設定」 | **未確定のまま**(自動を再適用しない)。既存キーがあるときは既存キーを優先 |
| 自動 C 進行 → 自動 Am 進行 | 最新入力の **A minor** に更新 |
| 自動成功 → 空 / 構文エラー | 古い推定が残らない(「自動: 未確定」) |
| 度数だけ(I IV V / 1 4 5) | 従来どおり手で選んだキーが必要(自動は絶対和音が無いので動かない) |

**代表の実測**:`| C | F | G | C |` → `自動: Cメジャー`、`| Dm7 G7 | Cmaj7 |` → `自動: Cメジャー`(ii–V–I)、
`| Am | Dm | E7 | Am |` → `自動: Aマイナー`、`| Bm7b5 | E7 | Am |` → `自動: Aマイナー`。

### 3. major/minor fixture の正答・誤付与・未確定(全体精度は主張しない)

| 分類 | 入力 | 期待 | 結果 |
|---|---|---|---|
| 長調 | C F G C | C major | C major ✓ |
| 長調終止 | Dm7 G7 Cmaj7 | C major | C major ✓ |
| 短調 | Am Dm E7 Am | A minor | A minor ✓ |
| 短調終止 | Bm7b5 E7 Am | A minor | A minor ✓ |
| 相対調競合 | C Am F | 未確定 | 未確定 ✓(3 候補同点) |
| 少数和音 | C / C G | 未確定 | 未確定 ✓ |
| 分数コード | C/E F/A G/B C/E | C major | C major ✓(bass を使わない) |
| 明示指定 | C F G C に D major | D major | D major ✓ |
| 意図的未設定 | 自動成功後に未設定 | 再付与しない | しない ✓ |
| sus/dim | C Gsus4 C G / C Bdim C | 未確定 | 未確定 ✓(sus を V に読み替えない) |
| 12 半音移調 | C F G C を −5〜+11 | 同じキーの移調 | 6 通りすべて一致 ✓ |

誤付与は今回の fixture では 0。ただしこれは**固定 fixture の範囲**で、実曲の付与率・誤付与率を測った主張ではない
(設計 §4 の「未実測の設計値」のまま)。少数和音・相対調・sus/dim は未確定側に倒れる。

## 4. 通常/拡張/MIDI の画面・保存・再読込

- 通常テキスト:キー欄の「自動: …」→ 保存 → Vault の block.detectedKey / idea.key が同じ値。単体の保存経路テスト
  (`TextProgressionCapturePanel.test.tsx` の P23-33、`CaptureView.textProgression.test.tsx`、`vaultStore.test.ts`)で確認。
- 拡張テキスト:同じ絶対進行で通常と同じキー。`# Key:` の明示があれば今までどおり明示値が優先
  (`validateSavedTextSource` は `confirmedKey` と原文 metadata を比較し、自動 resolvedKey は渡さない)。
- MIDI:既存 `analysis.detectedKey` は置換しない(単体で `origin: "existing"`)。欠落時だけ保存境界で補完し、
  idea.key と block.detectedKey が一致する。
- 再読込:保存 → load → serialize → reload でキー・notes・timing が保たれる(`vaultStore.test.ts` の既存 round-trip と
  P23-33 の追加分)。

## 5. 原文・notes・timing・Source 契約の不変

- 入力の chords/notes/timing は変更していない(純粋関数は読むだけ。fixture テストで入力 JSON の不変を確認)。
- 拡張の `textSource.metadata.key` は「原文解釈に使ったキー」のまま。自動キーは原文検証に混ぜない。
- 度数表示だけが有効キーに従う(表示のみ。保存音は変えない)。

## 6. P23-32 レイアウトと既存の取り込み/練習回帰

- P23-32 の CSS・高さ・配置には触れていない。取り込み画面の帯は 4 サイズの既存テスト(p15・capture-flow・
  p23-11・p23-12・responsive)で確認。
- Voicing Loop / Chord Dojo の下流はキーの文字列だけを受ける(同じ有効キー)。

## 7. 最後の確かめと FULL

### 点検(すべて PASS)

- `npx tsc` / `npx tsc -p tsconfig.e2e.json` / `npx eslint .` / `node scripts/lint-tailwind-classes.mjs` /
  `node scripts/lint-source-contracts.mjs` / `npm run build`。

### 関わる範囲

- 単体:`src/domain/importKeyResolution.test.ts` 19/19。`src/components/capture` 52/52 ほか、`src/store/vaultStore.test.ts`・
  `src/views/CaptureView.test.tsx`・`src/domain/textProgressionDraft.test.ts`・`src/domain/extendedTextSave.test.ts` を含む
  122/122(最初の focused 実行)。
- `npm run test:feature -- --fresh`(変更ファイルから広げた範囲)は Playwright まで回り、**最初は 4 件落ちた**:
  - `phase8.8.5` のキー欄の option 数 25(未確定+24)→ 26(自動+未設定+24)と、sr-only の状態文、`option:checked` の字。
  - `phase8.8.6` の状態の要約は「キー 自動: 未確定」になっていた → **状態の要約は今までどおり有効キーだけ**を出し、
    「自動」はキー欄(選択肢)にだけ出すように直した(指示書の「キー欄内で「自動: Cメジャー」等を示す」)。
- 取り込みの E2E 9 本(`phase8.8.5`・`phase8.8.6`・`p23-17`・`phase5.20`・`capture-flow`・`p15-import-check`・`p15-split`・
  `p23-11`・`p23-12`)は **56/56 PASS**。

### FULL(`npm run test:full -- --fresh`)

- **1 回目**:Vitest 6801/1 failed/2 skip で停止。落ちたのは**こちらで変えたテスト**の期待
  (`TextProgressionCapturePanel.test.tsx` が「推定」の optgroup を探していた。自動にしたため無くなった)→ B で直して
  その場で 52/52 を確認。
- **2 回目**(最終コード `27edf0b7`):**FULL PASS**。
  - Vitest **6827/6829**(2 skip)。点検(AI handoff・Source contracts・Phase docs・Runner contracts・Privacy scan・
    E2E TypeScript・Production build・Repository ESLint・App TypeScript・Class lint)は全部 PASS。
  - Playwright **1142/1144**(2 は既存の条件つき skip)、heavy **53/53**。
  - `Git diff check` PASS、`Tracked PNG check` PASS(基準の写真は変わっていない)。

### 残っている差(設計との差。誇張しない)

- 設計 S2 の「E2E/UI:通常と拡張で保存→Vault→再読込のキー一致を 1 本ずつ(新規)」は**足していない**。
  保存経路は単体(パネル→payload→store→block/idea、vaultStore の round-trip)で確認している。ブラウザ 1 本の追加は次の回に。
- 「追加保存先のキー継承」は解決関数と store(既存 idea の key を上書きしない・空のときだけ補う)に用意したが、
  取り込み画面に保存先(idea)を選ぶ入口が無いため、UI からは未接続。
- MIDI の取り込み画面にはキーの表示自体が無い(既存 `analysis.detectedKey` は保存までそのまま)。「自動推定と分かる表示」は
  表示先が無いので追加していない。保存後の Vault では普通のキーとして出る(由来は非永続)。

## 8. 制限(設計のまま。誇張しない)

- 既存 MIDI の **major-only 推定**は置換していない。今回補完するのは「キーが無い」ときだけ。
- SMF の Key Signature メタイベントは**未読取**。調号優先は未対応。
- 自動/手動の**由来は永続化しない**(schema 変更なし)。再読込後は普通のキーとして表示する。
- 転調・モーダル・借用の多い進行は未確定に倒れる(単一キー前提)。
- P23-32 の FULL は完全 PASS で閉じていない(`p5-26-2-overview` の既知の間欠が 1 件)。今回の FULL の結果は別記。

## 9. 未コミット変更 / ブランチ

- ブランチ:`feat/p23-33-auto-key`(`fix/p23-31-review` の `e57d22b2` から)
- コミット:`f3ddab4a` S1 → `848fd578` S2/S3 → `692328b3` S2(状態の要約) → `27edf0b7` S4(テストの期待) → この報告
- 未コミット変更:なし(この報告のコミット後)。
- merge・push・tag・release・EXE 生成はしていない。master は `ebb2675d` のまま。

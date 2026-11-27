# P23-65 — ホーム「今日のループ」・Chord Dojo ホーム幅・Bass Practice ホーム「?」の修正(報告)

- 指示: `inbox/P23-65/P23-65.md`
- ブランチ: `fix/p23-65-home-loop`(local `master` の `e8cd8623` から作成)

## 直した 3 つ

1. **ホーム「今日のループ」の説明削除と右上 1 行化**
   - [src/views/HomeView.tsx](../../../src/views/HomeView.tsx#L271-L525): 「最近入れた進行」の見出し行と `TodayLoopCard` 内の `<p className="lv-home-hint">コードを押すと、その音が鳴ります</p>` を削除(`home.css` の `.lv-home-hint` は同ファイル内他箇所で使用継続のため維持)。
   - `TodayLoopCard` 上段で ♥(`IconButton`)・「他のループ」・`ProgressionMidiControl`(`MIDI を DAW へ`)を `<div className="lv-home-loop-tools">` へまとめ、下段 `.lv-home-loop-actions` からは `<span className="flex-1" />` と `ProgressionMidiControl` を外して 3 ボタンのみに整理。
   - [src/styles/home.css](../../../src/styles/home.css#L142-L152): `.lv-home-loop-tools` (`display: flex; flex-shrink: 0; align-items: center; gap: var(--lv-space-2);`) と `.lv-home-loop-tools [data-midi-export-control] { flex: none; }` を追加し、3 つが縦中央で 1 行に揃うように調整。
2. **Chord Dojo ホーム幅の揃え**
   - [src/views/chord-dojo/dojoHome.css](../../../src/views/chord-dojo/dojoHome.css#L2): `.dojo-home-p20` の左右余白を他ページと揃える `padding:10px 24px 8px;` とし、`max-width` を `1728px` へ変更。
   - 注記(`max-width: 1728px` について): `box-sizing: border-box` 下では左右 `24px`×2 = `48px` の余白が `max-width` の内側に含まれるため、他ページ(`App.tsx` の外側 `px-6` + 内側 `max-w-[1680px]`)と内側の内容を完全に揃えるには `1680 + 48 = 1728px` が必要(実測 `1920×1080` で左端・右端ともに `.bass-practice-shell` と差 `0px`、`1440×900` も差 `0px`)。練習画面側の `max-w-none` は無変更。
3. **Bass Practice ホームの「?」削除**
   - [src/features/bass-practice/ui/BassPracticeHome.tsx](../../../src/features/bass-practice/ui/BassPracticeHome.tsx#L329-L338) と [src/features/bass-practice/ui/bassPracticeHome.css](../../../src/features/bass-practice/ui/bassPracticeHome.css#L46-L60): `helpOpen` 状態・`?` ボタン(`.lv-bh-help`)・`bass-home-help` 説明文・関連 CSS(`.lv-bh-help`, `.lv-bh-help-text` 等)を削除し、「聴いてまねる」の見出しのみ維持(練習画面上帯の「?」は不変)。

## 替えたテスト・足したテスト

- [src/features/bass-practice/ui/BassPracticeHome.test.tsx](../../../src/features/bass-practice/ui/BassPracticeHome.test.tsx#L178-L184): H13 をホームに「キー操作」`?` ボタンが無い確認へ更新。
- [src/views/HomeView.test.tsx](../../../src/views/HomeView.test.tsx#L46-L54): ホームに「コードを押すと、その音が鳴ります」が無いこと・`.lv-home-loop-tools` 内に 3 点が並び `.lv-home-loop-actions` が 3 ボタンであることの確認を追加。
- [e2e/p23-25-bass-practice.spec.ts](../../../e2e/p23-25-bass-practice.spec.ts#L280-L287)・[e2e/p23-36-bass-home.spec.ts](../../../e2e/p23-36-bass-home.spec.ts#L73-L81)・[e2e/p23-47-fix-4-ui.spec.ts](../../../e2e/p23-47-fix-4-ui.spec.ts#L312-L324): ホームの「?」(`キー操作`)が 0 件であることの検証へ整合(練習画面上帯の「?」検証は不変)。
- [e2e/p23-65-home-loop.spec.ts](../../../e2e/p23-65-home-loop.spec.ts): `1440×900`・`1366×768`・`1280×720` で右上 3 点縦中央・横順・右端はみ出し無し・下 3 ボタン 1 行・説明文 0 件・`MIDI を DAW へ` 保存発火、`1920×1080`・`1440×900` で `.dojo-home-p20` 内側左右端と `.bass-practice-shell` の差 `<= 2px`、Chord Dojo 練習画面 `max-w-none` 維持、Bass ホーム `?` 0 件を検証。

## 確かめた写真(`p23-65-assets/`)

| 写真 | 確認したこと | 画像 |
|---|---|---|
| ホーム(`1440×900`) | 今日のループ右上 `♥ · 他のループ · MIDI を DAW へ` が 1 行揃い、下段は 3 ボタン、説明文無し | [home-1440.png](p23-65-assets/home-1440.png) |
| ホーム(`1280×720`) | 1280px でも右上 3 つが 1 行でカード内に収まる | [home-1280.png](p23-65-assets/home-1280.png) |
| Chord Dojo ホーム(`1920×1080`) | 外側左右 24px・最大幅を揃えて左右余白が均等化 | [dojo-home-1920.png](p23-65-assets/dojo-home-1920.png) |
| Bass Practice ホーム(`1920×1080`) | Chord Dojo ホームと内側左右端が一致、「聴いてまねる」右の「?」無し | [bass-home-1920.png](p23-65-assets/bass-home-1920.png) |
| Bass Practice ホーム(`1440×900`) | 「聴いてまねる」右の「?」無し、レイアウト維持 | [bass-home-1440.png](p23-65-assets/bass-home-1440.png) |

### 基準写真(`e2e/visual.spec.ts-snapshots/practice-chromium-desktop-win32.png`)の更新

Chord Dojo ホーム(`practice.png`)のみ `.dojo-home-p20` の左右余白変更(`18px` → `24px`)による 6px 寄せの差分のみが出たため更新(他 5 枚の基準写真は差 0 のまま不変)。

| 前 | 後 | 差 |
|---|---|---|
| [before](p23-65-assets/baseline-practice-before.png) | [after](p23-65-assets/baseline-practice-after.png) | [diff](p23-65-assets/baseline-practice-diff.png) |

## 検証結果

| 項目 | 結果 |
|---|---|
| `npx tsc --noEmit` | PASS |
| `npm run typecheck:e2e` | PASS |
| `npm run lint` (`eslint` / `lint:classes` / `lint:source-contracts`) | PASS |
| `npx vitest run src/views/HomeView.test.tsx src/features/bass-practice/ui/BassPracticeHome.test.tsx` | PASS(2 ファイル・31 テスト) |
| `npm run test:e2e -- e2e/p23-65-home-loop.spec.ts e2e/p23-09-home.spec.ts e2e/p23-25-bass-practice.spec.ts e2e/p23-36-bass-home.spec.ts e2e/p23-47-fix-4-ui.spec.ts e2e/phase5.14-midi-export.spec.ts e2e/visual.spec.ts --project=chromium-desktop` | PASS(44/44、53.6s / `visual.spec.ts` 6/6) |

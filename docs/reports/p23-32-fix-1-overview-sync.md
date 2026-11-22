# P23-32-fix-1:Overview のドラッグ同期(調査と最小修正)

- 作業場所:`<作業フォルダ>\Loop Vault-p23`、ブランチ `fix/p23-31-review`(P23-32 の続き。master からは分岐していない)
- コミット:`259d01f5`(コード修正 1 コミット)。この報告はその上の追記コミット
- 対象:`e2e/p5-26-2-overview.spec.ts:85` の `expect(await scrollLeft(page)).toBeGreaterThan(from)`(1524 > 1524)

## 1. 原因(確定したもの / 仮説のまま)

**確定:読み取りの同期不足。** 製品側のドラッグ処理は
`CorrectionWorkspace.tsx` の `moveFromOverview` → `scrollToBeat` が
`element.scrollTo({ left, behavior: preferredScrollBehavior() })` を呼び、`preferredScrollBehavior()` は
reduced-motion でない限り `"smooth"`(`src/ui/motion.ts:1-7`)。つまりポインタ移動ごとに**なめらかなスクロール**が
始まり、位置は次のフレーム以降に動く。テストは `mouse.up()` の直後に `scrollLeft` を 1 回だけ読んでいたため、
**まだ前の位置(ドラッグ前の値)のまま**の瞬間を読むことがあった。

裏づけ(一時計測。テスト側だけに置き、修正前に削除):

| 観測 | 結果 |
|---|---|
| ポインタ事象 | `pointerdown` 1・`pointermove` 7・`pointerup` 1 → **届いている**(未到達ではない) |
| 最大スクロール | `scrollWidth - clientWidth` = 2420。サンプルは最大 2151 → **端ではない** |
| reduced-motion | `false` → smooth が有効 |
| 解放直後の値 | 例:`from` 1524 に対して **1524**(同じ)/ 1526 / 1535(数 px) |
| その後の値 | 次のフレーム 1526 → 50ms 1553 → 150ms 1963〜2073 → 400ms **2151**(期待方向へ動く) |

**仮説ではなくなった点**:事象不達・最大到達・製品側の競合ではない(3 つとも除外できた)。
**仮説のまま残る点**:6 workers で 3/72 落ちたのは負荷でフレームが遅れ、解放フレームの読み取りが
さらに早くなるため、という説明は**状況証拠**(1 worker では 0/72)。フレーム時間そのものは測っていない。

## 2. 反復(修正前)

`--repeat-each` で same spec を反復、`--retries=0`、ビルドは同一。

| 条件 | 実行数 | 結果 |
|---|---|---|
| workers=1 ×12 | 72(6 テスト ×12) | **72 passed / 0 failed**(1.8 分) |
| workers=6 ×12 | 72 | **69 passed / 3 failed**(31 秒)。落ちたのは対象の 1 テストだけ |

FULL の並列度:直近 FULL(`ef4cf130`)の軽い方は Playwright の既定 workers(この環境では 6)で、
**6 と一致**。したがって 6 workers の再現が FULL の条件に当たる。

## 3. 修正(指示書が許可した 1 行だけ)

```diff
-    expect(await scrollLeft(page)).toBeGreaterThan(from);
+    await expect.poll(() => scrollLeft(page)).toBeGreaterThan(from);
```

比較の向き・基準(`from`)はそのまま。timeout は足していない(既定の poll 間隔・上限)。固定 sleep・
skip/fixme/only・retry・snapshot 更新はしていない。診断用の一時計測は修正前に削除した(最終差分はこの 1 行のみ)。

## 4. 反復(修正後)

| 条件 | 実行数 | 結果 |
|---|---|---|
| workers=1 ×20 | 120 | **120 passed / 0 failed**(3.0 分) |
| workers=6 ×20 | 120 | **120 passed / 0 failed**(54 秒) |

合計 240/240。失敗は残っていない。

## 5. 関連テストと点検

- Overview / Correction Workspace の既存テスト 9 本
  (`p5-26-2-overview`・`correction-workspace`・`correction-workspace-save`・`bar-cut`・`card-delete`・
  `p23-14-card-harmony`・`p23-16-correction-workspace`・`p5-26-1-ui-fixes`・`visual`):**102/102 PASS**。
- `npx eslint e2e/p5-26-2-overview.spec.ts` / `npx tsc` / `npx tsc -p tsconfig.e2e.json` / `git diff --check HEAD`:PASS。
- 共通 runner・config・`e2e/helpers/settle.ts` は変更していない。

## 6. 最後の確かめ(FULL)

- 実行:clean な `259d01f5` で `npm run test:full -- --fresh`(PASS キャッシュ不使用)。
- 結果:**FAIL**(下の 1 件)。指示書の「FAIL なら再実行/追加修正せず証拠を残して停止」に従い、FULL も修正も
  回し直していない。
  - 点検と Vitest は PASS:Class lint・Phase docs・Runner contracts 40/40・Privacy scan・E2E TypeScript・
    Production build・Repository ESLint・App TypeScript・**Vitest 6803/6805**(2 skip)。
  - 軽い方の Playwright:**1 failed**(ほかは passed、skip 2)。落ちたのは
    `e2e/p23-23a-ear-stage.spec.ts:292`「C2/C3/C14: the words, the guide, the pressed keys and the two new listens」で、
    `toHaveText("D♭")` に **`C♯`** が返った(異名同音の綴り)。
  - **heavy は未実行**(軽い方が失敗したため FULL がそこで停止)。
- この 1 件は**今回触っていない画面**(耳の練習)で、P23-31b の FULL でも同じテストが並列時だけ落ち、
  単独では通っている記録がある。今回も**単独 1 回で 7/7 PASS**(証拠として実行したが、FULL の再実行・修正はしていない)。
  対象の直し(smooth scroll の同期)とは無関係な**原因未確定の間欠**として、判断はリードに委ねる。
- FULL の log:`.local-evaluation/test-logs/2026-11-16T09-20-54-577Z-playwright-full.log`。
- SHA の区別:コードの tested HEAD は `259d01f5`。この報告の追記コミットはその上(別 SHA)。

## 7. 残るレビュー事項(この作業では閉じない)

- P23-32 の **`practice.png`(Chord Dojo のホーム)の基準更新**は、指示書の「Voicing Loop の物だけ」から外れる
  判断として未解決のまま(リードの判断待ち)。
- P23-32 の **FULL 回数超過**(指示書の「回し直し 1 回」を超えて 3 回目を回した)も未解決のまま。
- 今回の FULL PASS は master への統合許可ではない(merge・push・tag・release はしていない)。

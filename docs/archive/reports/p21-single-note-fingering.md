# P21: 1 音の手の運指を「手の位置を保つ」形にする

- ブランチ: `feat/p21-single-note-fingering`(master `be209db6` から)
- 実装: `85ab54b9`、最終検証: `d7ce88cc`(修正 1 後。旧記載は `ef58a84e`)
- テストの回し方は master と同じ(`34b2ab20` で `scripts/test-dx/run.mjs` を戻した)
- master へのマージ・push はしていない。

## 1. 原因と決め方

既定の `E1-T` は 1 音の基本の指を左手 L5・右手 R1 とし、指 1 つのずれを重く数え、隣への手の動きを `timePressure(秒)` で割っていた。1 枚 2 秒では手の動きが 0.5 になり、指の重み 2 より軽いため、C→D→E でも L5 が勝っていた。

- `src/domain/p21SingleNoteFingering.ts` を追加。
  - 1 音の手の位置は `handPositionProxy`。Δ≥1 を手を移した、Δ≤0.5 を同じ位置とする。
  - 接続の強さは **(手を移す回数, 手の動きの合計, 基本の指/黒鍵)** の順。時間は使わない。
- `rankPracticeHandFingerings` を 2 段にした。
  1. 今までの `E1-T`(P11-13e の `eRankerCostModel`)で手全体を解く。
  2. 2 音以上のカードの指を固定し、1 音のカードだけ P21 で選び直す。
  - 1 音のカードが 1 枚もない手は 1 段目の結果をそのまま返す(2 音以上の不変と速度のため)。
- 保存した運指(アンカー)は両段で最優先。既定の入口(Voicing Loop、Chord Dojo の通常・今日のレッスン)を P21 にした。`CURRENT`、`eRankerCostModel`、`E_RANKER_POLICY`、P11 実験、記録用の関数は変えていない。

## 2. 重みを整数にした

> **修正 1 で訂正**: 下の `1e12 / 1e6 / 黒鍵 1` は初回案。現在は §修正 1 の `maxCards=8192 / movementUnit=50,000 / moveWeight=200,000,000,000`、黒鍵の重みなし。

- 位置は 0.5 刻みなので **2 倍して整数**(`position2`)。
- `moveWeight = 1e12`、`movementWeight = 1e6`、`blackKeyPenalty = 1`、基本の指は 0〜4 の整数。ローカルは `基本 + 黒鍵`(最大 5)。
- 4096 カード(レッスンの上限)でも:
  - 下の段の最大 = 4096×5 + 4096×160×1e6 ≈ 6.55e11 < 1e12(手を移す 1 回)
  - 合計の最大 ≈ 4096×1e12 + 6.55e11 ≈ 4.10e15 < 2^53 = 9.01e15
  - すべて整数で、上の段が下の段の合計に負けることはない。
- 32 回くり返した L4・L7・R6 で毎回同じ指。L7 の E♭ は L4(黒鍵の重みが効く例)を確認。

## 3. §3 の固定例

`src/domain/p21SingleNoteFingering.test.ts`:

- L1 C2 D2 E2 F2 → L5 L4 L3 L2、位置 21 のまま
- L2 逆 → L2 L3 L4 L5
- L3 C2 F2 G2 C2 → L5 L2 L1 L5
- L4 C2 A2 D2 G2 → L5 L1 L5 L2、位置 21/22/22/22、移す 2 回、動き 2
- L5 C2 C2 → 同じ指
- L6 C2 C3 → L5 L1、21→24、往復 2 回、動き 6
- L7 C2 E♭2 F2 G2 → L5 L4 L2 L1、21/21.5/21/21、移す 0、動き 1
- L8 C2 G2 0 回 / C2 A2 2 回
- R1〜R6(左右逆)、60/100/180/240 BPM、長さ、休み、`unresolved` の区切り、アンカー
- L4・L7・R6 の 32 回くり返し、L7 の黒鍵

## 4. 測った数

純粋な 1 音 17 列(29 個の近いつながり)と合成 Voicing Loop:

| 指標 | 前(E1-T) | 後(P21) |
|---|---|---|
| 近い 1 音で手の位置を保った | 1/29 (3.4%) | 29/29 (100%) |
| 手の位置の動きの合計 | 80 | 11 |
| 同じ音で指が変わった | 0 | 0 |
| 届く範囲を超えた「同じ位置」 | 0 | 0 |
| アンカー違反 | 0 | 0 |
| 2 音以上の指の変更 | 0 | 0 |
| `CURRENT` の変更 | 0 | 0 |
| 記録指紋 | 変更なし | 変更なし |

合成 Voicing Loop スナップショット: 1 音カード 4、近い 3。前は保った 0・動き 8、後は保った 3・動き 0。2 音以上の変更 0、`CURRENT` 0。

指の分布: 前 L5 28・R1 22 のみ / 後 L5 12・L4 3・L3 2・L2 5・L1 6、R1 8・R2 3・R3 2・R4 4・R5 5。

## 5. テストの回し方の比較(レビュー §1)

`scripts/test-dx/run.mjs` は master と同じに戻した(全 workers=1・heavy 追加を撤回)。

3 つの落ちたテスト(`p18-01-stage2` / `p12-4-long` / `p12-theme-score`)を、FULL と同じ 6 workers で各 5 回:

| ブランチ | 落ちた回 | 時間(5回) |
|---|---|---|
| master | 0/5 | 177.9 / 157.2 / 153.5 / 168.9 / 168.5 秒 |
| P21 | 1/5(`p18-01-stage2` のみ) | 170.2 / 167.3 / 167.3 / 167.2 / 167.8 秒 |

Chord Dojo の実際の計算時間(中央値、P21 ブランチで旧モデルと P21 を比較):

| 入力 | 前 | 後 |
|---|---|---|
| 1 音 4 枚 | 0.291 ms | 0.258 ms |
| 2 音以上 8 枚 | 3.733 ms | 3.779 ms |
| 1 音 56 枚 | 3.819 ms | 2.342 ms |
| 混在 56 枚 | 2.094 ms | 1.929 ms |
| 今日のレッスンの freeze | 4.473 ms | 4.700 ms |

P21 が遅くなっている証拠はなく、落ちた 1 回は既存の p18 の揺れと判断した(指示どおり、P21 ブランチでは p18 を直していない)。最終 FULL は master と同じ回し方で PASS。

## 6. 「次への動き」の言葉

> **修正 1 で訂正**: 実装は「動きの from/to がそれぞれ 1 つ、finger があり、estimated でなく、指が違う」場合に手の位置を見る。UI から現在・次の運指を渡す形ではない。

`handMoveSummary` に現在・次の運指を渡し、**1 音どうしで手の位置の差が 0.5 以下・指が変わる**ときは「指を替える(手はそのまま)」と出す。位置が 1 以上変わる場合と 2 音以上の手は今までどおり。UI(`NextMovePreview`)から現在・次の実効運指を渡す。

既存テストの 48→49 の「指だけ」は、運指を渡さないフォールバックとして残し、P21 の位置情報を渡した 48→49(L5→L4)は「指を替える(手はそのまま)」、48→52(位置が 1 変わる)はその言葉にならないことを追加。

## 7. テスト・写真

- 単体: `p21SingleNoteFingering.test.ts` 14、`nextMove.test.ts` 13、`eRankerFingering.test.ts`、`fingering.test.ts`、`uiAudit.test.tsx`、canonical ほか。
- e2e: `e2e/p21-fingering.spec.ts` で Voicing Loop の L1(L5 L4 L3 L2)・L3(L5 L2 L1 L5)。after-l1 を撮り直した。
> **修正 1 で訂正**: Chord Dojo の UI e2e は修正 1 で追加した(`builtin:iv-iii-ii-i`、L2 L3 L4 L5)。下の「未達」は初回の記載。

- **Chord Dojo の UI e2e は追加できていない。** 1 音の saved progression を用意したが、Chord Dojo の練習がその音を 4 音のコードに再ボイシングし、L5 L4 L3 L2 の並びにならなかった。Chord Dojo は同じ `dojoFingerings` を `fingering.test.ts` で 1 音 4 枚として確認している(指示の「e2e」には未達)。
- 写真: `p89-generated/p21/before-l1.png`, `after-l1.png`(撮り直し), `before-l3.png`, `after-l3.png`。

## 8. FULL の全記録

| コード | 回し方 | 結果 | 落ちたもの |
|---|---|---|---|
| `85ab54b9` | 6 workers | FAIL | Vitest `p11-12/uiAudit`、Playwright `p12-4-long` / `p12-theme-score` |
| `8c50388e` | 6 workers | FAIL | Playwright 6 件(p18 ほか) |
| `76d475f6` | 6 workers | FAIL | Playwright 3 件(p18-01-stage2) |
| `da1941d9` | heavy 追加 | FAIL | heavy 3 件(p18 / p12-4-long) |
| `b0901ec3` | 1 worker(後で撤回) | PASS(3329.3 秒) | — |
| `ef58a84e` | **master と同じ 6 workers** | **PASS(986.4 秒)** | — |

最終 FULL: Vitest 6360/6362(既存 skip 2)、Playwright 827/829(既存/条件付き skip 2)、heavy 59/59。

## 修正 1(P21-fix-1)

- ブランチ: `feat/p21-single-note-fingering`
- master(test-slim 入り)をマージ: `6d0d0925`(master `484faa4e`)
- 修正のコミット: `d541f932`(§1)、`aeeab719`(§2)、`d22ac0e7`(§3)、`9bfdd29f`(§4)、`d7ce88cc`(§5)、この報告(§6)

### 1. テストの回し方

- `scripts/test-dx/run.mjs` と `playwright.config.ts` は master と diff が空。master と同じ 6 workers・元の heavy 一覧。
- 前の `b0901ec3`/`da1941d9` の全 1 worker・heavy 追加は取り消し済み。

### 2. 落ちた 3 つのテスト

3 つを `--repeat-each=5`、並列数指定なし(FULL の普通の側と同じ既定)で master と P21 の両方で実行。

| テスト | master 失敗/5 | master 時間(中央値) | P21 失敗/5 | P21 時間(中央値) |
|---|---|---|---|---|
| `p18-01-stage2`「A: from the ② end back to ①…」 | 0/5 | 15,446 ms | 0/5 | 15,441 ms |
| `p12-4-long`「"次のキー（おまかせ）"…」 | 0/5 | 28,311 ms | 0/5 | 28,216 ms |
| `p12-theme-score`「Theme score readable 1920x1080」 | 0/5 | 1,182 ms | 0/5 | 1,185 ms |

- コマンド全体: master 285.7 秒、P21 283.2 秒。どちらも 0 失敗。
- **2-b**: `P12.3-builtins-expected.json` の全進行×全キー(300 呼び出し)を 1 周する時間を 5 回。前(旧 E1-T)中央値 **383.001 ms**・1 呼び出しの最大 **5.190 ms**、後(P21)中央値 **381.066 ms**・最大 **3.818 ms**。P21 が遅い所はない。
- **2-c**: どちらも 0 失敗なので「P21 のせいではない」。P21 用の速度変更はしていない。
- 前回の「P21 1/5・master 0/5」は、test-slim 入り master・同じ `--repeat-each=5` では再現しなかった。前回の 1 回は既存の p18 の揺れ。

### 3. 重み

- 黒鍵の重さは取った。理由: 指 1 本分のずれより軽く、結果を変える場面がない。L7(L5 L4 L2 L1)と R6(R1 R2 R4 R5)は黒鍵なしでも同じ。
- `P21_POLICY = { maxCards: 8192, movementUnit: 50_000, moveWeight: 200_000_000_000 }`。
- 1 音の `local` は基本の指のずれ(0〜4)、2 音以上は 0。`transition` は `delta = |位置の差|`、`quarters = round(delta*4)`、`moves = delta>=1`、`moves*moveWeight + quarters*movementUnit`。全部整数。
- 足りる理由: 位置は −4〜74、1 つの差は最大 78 = 0.25 刻み 312。基本の合計 4×8192=32,768 < 50,000。動きの合計 312×8192×50,000=1.277952×10¹¹ < 2×10¹¹。合計 8192×2×10¹¹ + 1.277952×10¹¹ + 32,768 ≈ 1.6384×10¹⁵ < 2⁵³≈9.0×10¹⁵。整数の足し算だけで丸めがない。
- 8193 枚の 1 音の手は `eRankerCostModel()` と同じ結果になることをテスト(実カード 8193 枚、30 秒枠、12.3 秒)。同じ音 2 つのカードは 1 音と同じ指。L4 32 回は 64 回移動、L7/R6 32 回も各周同じ。
- 元の §3 テスト(L1〜L8、R1〜R6、テンポ、休み、区切り、アンカー、混在)は全部通る。

### 4. 足した e2e

- Voicing Loop: `p21-anchor` を追加。D2 に保存 L2 → カード C/D/E の左手が L3/L2/L1。
- Chord Dojo: ビルトイン `builtin:iv-iii-ii-i:1`(キー C)。Fmaj7/Em7/Dm7/Cmaj7 のベース 53/52/50/48 の左手が **L2/L3/L4/L5**、各コードで左手の印はちょうど 1 つ。
- 保存: Dm7 の D3 に保存 L2 → そのコードの左手 L2。
- `e2e/p21-fingering.spec.ts` は 5 件すべて PASS。

### 5. 「次への動き」

- 指定の `fromMoves`/`toMoves` 判定を「そのまま」の直後に追加。`estimated` でない 1 音→1 音で指が替わり、位置差 0.5 以下なら「指を替える(手はそのまま)」。
- 単体 4 件を追加: 38 L4→40 L3(指を替える)、38 L5→40 L5(指だけ)、36 L5→45 L1(少し動く)、60 R1→62 R2(指を替える)。既存の 99〜103 行の期待は変えずに通る。
- e2e: L1 のカード 2(D)で「指を替える(手はそのまま)」が見える。after-l1 を撮り直した。

### 6. FULL

**PASS** — `d7ce88cc`、781.1 秒、master と同じ 6 workers・元の heavy 一覧。
- Vitest 6366/6368(既存 skip 2)
- Playwright 828/830(既存/条件付き skip 2)
- heavy 53/53

P21 でこれまでに回した FULL(すべて):

| コード | 回し方 | 結果 | 落ちたテスト |
|---|---|---|---|
| `85ab54b9` | 6 workers | FAIL | Vitest `p11-12/uiAudit`、Playwright `p12-4-long`/`p12-theme-score` |
| `8c50388e` | 6 workers | FAIL | Playwright 6 件(p18 ほか) |
| `76d475f6` | 6 workers | FAIL | Playwright 3 件(p18-01-stage2) |
| `da1941d9` | heavy 追加 | FAIL | heavy 3 件(p18/p12-4-long) |
| `b0901ec3` | 1 worker(後で撤回) | PASS(3329.3 秒) | — |
| `ef58a84e` | 6 workers | PASS(986.4 秒) | — |
| `d7ce88cc` | 6 workers(今回) | **PASS(781.1 秒)** | — |
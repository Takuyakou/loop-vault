# P23-39 — Guided Course Stage 0 契約凍結 (v3)

P23-40 の実装が参照する凍結成果物。製品 UI の実装は P23-40 で行う。`src/courseDesign/` は**製品から import されない**設計領域で、公開データ(組込み進行・recipe preset・耳問題)だけを読み取る。

v1 はレビューで `NOT_READY_FOR_P23-40`、v2 は残り 2 点の修正依頼を受けた。v3 はその 2 点だけを直したもので、v1/v2 の成果物は履歴として残す(内容は変更していない)。差分と旧 hash は `freeze-history.md` と `freeze-manifest.json` の `supersedes` に記録した。**P23-40 は v3 だけを読む。**

## version pair (v3)

- bank: `p23-39.bank.lv1-3.v3`
- policy: `p23-39.policy.lv1-3.v3`
- pair: `p23-39.bank.lv1-3.v3+p23-39.policy.lv1-3.v3`
- contract: `p23-39.contracts.v3`

pair が一致しない store は拒否する。合格の移行はしない。

## 成果物

| ファイル | 内容 |
|---|---|
| `inventory.json` | 教材の棚卸し(組込み 43 / shape recipe 81 / 耳問題 417、stable ID・quality/root・beats・notes 出典・judge/source/bass policy・変換可否・scorer 互換、Lv1–3 の (quality, root) coverage と gap)。v1 と同じ内容・同じ SHA-256 |
| `input-contract.md` | 入力の state machine・応答待ち・採取窓・settle・封緘・速度・無効化(具体値) |
| `src/courseDesign/inputContract.ts` + `.test.ts` | 上記の実行可能な契約と決定的反例(注入時計) |
| `src/courseDesign/judgingCorrespondence.test.ts` | 既存 `ChordEntry`/live MIDI/`judgeChord` との対応と差分(gap の明示) |
| `bank-lv1-3-v3.json` | Lv1–3 の bank。name item 126 + ear item 36 = 162 item、same-day/遅延/耳の実 set。各評価 set は対象 quality をすべて含む |
| `policy-lv1-3-v3.json` | 採点 policy。Lv2 の 6 根音と耳 10/8、Lv3 の 30/27・各 quality 4/5・3 秒 80%、「翌日かつ 12 時間以上」 |
| `bank-and-scoring.md` | 教材・評価契約の説明(細胞、set、別問題の定義、耳条件、合格集約、日時条件、v1/v2→v3 差分、反例) |
| `src/courseDesign/bank.ts` + `.test.ts` | bank/set/合格集約(公式)と部分得点(非進級)、遅延日時判定の実行可能な契約 |
| `src/courseDesign/answerPolicy.ts` + `.test.ts` | 記名(未指定 bass 自由)/保存 voicing 完全一致/耳(指定 bass)の分離 |
| `store-contract.md` / `src/courseDesign/storeContract.ts` + `.test.ts` | course store の schema/版/証拠/冪等/破損/**保存先**の契約 |
| `p23-40-plan.md` | P23-40 の実装差分・依存。契約として未決の値は残していない |
| `freeze-history.md` | v1/v2 → v3 の差分、旧 pair/commit/hash、レビュー参照 |
| `freeze-manifest.json` | 成果物の SHA-256・version pair・`supersedes`・差分・test 一覧 |

## 凍結した要点

- **入力**: 応答待ち 10000 ms / 採取窓 1500 ms(最初の Note On から)/ settle 60 ms / 封緘は最も早い境界の時刻。速度 = 完成 Note On − `armedAt`。3 秒は Lv3 の正答だけ。stall 250 ms・タブ非表示・時計飛び 100 ms は無効試行。耳は音源終了コールバックで arm。
- **bank/policy**: Lv1 20/18 + 遅延 10/8 + 耳 10/8、Lv2 20/18 + quality 4/5 + 遅延 10/8 + 耳 10/8、Lv3 30/27 + quality 4/5 + 3 秒 80% + 遅延 12/10。same-day/遅延/耳の各 set は item ID で実在し、遅延 set は same-day set と item が重ならない。
- **評価 set の quality**: Lv1 耳は maj 5 / min 5、Lv2 耳は maj7 3 / min7 3 / dom7 2 / min7b5 2、Lv3 遅延は 6 quality × 2。**問題数と合格閾値は変えない。**
- **合格**: 公式の `evaluateLevel`/`levelPass` は分母・必要件数・quality・根音 coverage・遅延・耳・速度・**日時**をすべて要求し、1 つでも欠けたら合格にしない。遅延は「同日評価の完了より後のローカル日付」かつ「12 時間以上」。時刻欠落・同日・12 時間未満・逆行は不合格。部分表示は `practiceProgress`(正式進級ではない)。
- **答え**: 記名は quality の必須構成音のみ(未指定 bass は自由、転回可)。保存 voicing の完全再現は別 policy。耳は和声 + 指定 bass(root)。
- **保存**: `loop-vault:guided-course-v1:data` / `loopvault/guided-course-v1.json` / envelope `loopvault-guided-course`。pair 不一致は拒否。

## 再生成

```
node node_modules/vite-node/vite-node.mjs scripts/course-design/build-freeze.mts
```

生成後に `inventory.test.ts` / `bank.test.ts` が凍結 JSON との一致を検証する(差分が出たら fail)。

## テスト

```
node node_modules/vitest/vitest.mjs run src/courseDesign
```

53 件(入力 21・対応 5・inventory 4・bank 10・answerPolicy 6・store 7)。実機 MIDI・実音・学習効果は未確認。

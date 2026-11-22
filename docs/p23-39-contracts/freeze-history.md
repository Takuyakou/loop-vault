# P23-39 freeze 履歴(v1 → v2 → v3)

## 1. 版の対応

| | v1(無効) | v2(無効) | v3(この凍結) |
|---|---|---|---|
| contract | `p23-39.contracts.v1` | `p23-39.contracts.v2` | `p23-39.contracts.v3` |
| bank | `p23-39.bank.lv1-3.v1` / `bank-lv1-3.json` | `p23-39.bank.lv1-3.v2` / `bank-lv1-3-v2.json` | `p23-39.bank.lv1-3.v3` / `bank-lv1-3-v3.json` |
| policy | `p23-39.policy.lv1-3.v1` / `policy-lv1-3-v1.json` | `p23-39.policy.lv1-3.v2` / `policy-lv1-3-v2.json` | `p23-39.policy.lv1-3.v3` / `policy-lv1-3-v3.json` |
| pair | `…v1+…v1` | `…v2+…v2` | `…v3+…v3` |
| freeze commit | `64d7f8d7`(記録 `9783a450`) | `895c796b`(記録 `13bb3a4d`) | この v3 の commit(報告に記載) |
| 判定 | **NOT_READY_FOR_P23-40** | **修正依頼 2 点**(`review/P23-39-v2.md`) | レビュー待ち |

v1/v2 のファイルは**内容を変えずに残している**。hash:

| artifact | v1 | v2 | v3 |
|---|---|---|---|
| `inventory.json` | `8e40748d…`(413,001) | 同左 | 同左(教材棚卸しは不変) |
| bank | `0171d0e0…`(16,698) | `16cac564…`(100,191) | `f8c5fcdc…`(100,191) |
| policy | `fb0f8062…`(2,516) | `8af1c5ba…`(3,916) | `6c1b36c1…`(4,605) |

## 2. レビュー指摘と v3 の差

| レビュー | v2 の状態 | v3 |
|---|---|---|
| V2-1 評価セットが対象 quality を網羅していない | Lv2 耳は maj7 6 / min7 4 で dom7・min7b5 0。Lv3 遅延は maj 5 / min 5 / maj7 2 で残り 0。quality 順の先頭 slice が原因 | Lv2 耳は maj7 3 / min7 3 / dom7 2 / min7b5 2(10 問維持)。Lv3 遅延は 6 quality × 2(12 問維持)。Lv1 耳も maj 5 / min 5 にそろえた。set ごとの quality 件数を `bank.test.ts` で固定 |
| V2-2 翌日かつ 12 時間以上を判定できない | `TrialEvidence` に日時がなく、`evaluateLevel` は件数と正答率だけで遅延を合格にしていた | `TrialEvidence.at` を必須にし、`delayEligibility`/`localDateKey` を追加。公式合格は「遅延 block の開始が同日 block の完了より後のローカル日付」かつ「12 時間以上」。時刻欠落・同日・12 時間未満・逆行は不合格。注入時計の反例を追加 |

## 3. v1 → v2 の差(前回の修正。維持)

- 入力の 1.5 秒上限を「最初の Note On から 1500 ms」に直し、応答待ち 10000 ms・settle 60 ms と分離。10000/1500/60 の具体値、stall 250 ms、hidden、clock 100 ms、耳の arm を確定。
- 必須 quality 欠落で合格しない公式集約(`evaluateLevel`/`levelPass`)と、非進級の部分得点(`practiceProgress`)を分離。
- Lv2 6 根音、Lv2 耳 10/8、same-day/遅延/耳の実 set、保存先の物理キーを確定。
- 記名の未指定 bass を自由化(転回可)。保存 voicing 完全一致を別 policy に分離。

## 4. 変わっていないもの

- `inventory.json` の内容(教材棚卸し): hash 不変。417 の進行耳問題は Lv1–3 の正式合格に使わない。
- Lv3 の数値解消(30 問・27/30・各 quality 4/5・3 秒 80%)。
- store の record schema は version 1。変えたのは照合 pair と物理キーの確定。
- §6 の P23-38 製品修正(`a677e93b`)は v3 でも触れていない。
- `src/courseDesign/` は製品から import されない。P23-40 は凍結 JSON のコピーを製品側で読み、契約テストで一致を検証する。

## 5. 移行規則

- P23-40 は **v3 だけ**を読む。v1/v2 の bank/policy を読み替えない。
- v1/v2 pair の store を v3 合格へ自動変換しない。v1/v2 は正式凍結ではないため、移行対象の合格も存在しない。
- 凍結後に bank/policy を変える場合は、この履歴に v4 として pair・hash・差分を追記し、v3 を `supersedes` に移す。黙って同じ pair の中身を変えない。

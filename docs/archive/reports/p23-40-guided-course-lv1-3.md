# P23-40: Guided Course Lv1〜3 縦スライス + P23-39 v3 契約修正

- ブランチ: `feat/p23-39-guided-course-contracts`(P23-38 修正 `a677e93b` を祖先に含む)
- 実装・契約修正の HEAD: **`c360d6ed`**(P23-39 v3 の 2 点 + P23-40 の Lv1〜3)
- 報告 commit: このファイルだけの documentation-only commit
- 状態: **READY FOR HUMAN PRODUCT ACCEPTANCE**(FULL の結果は §3)
- master merge / push / tag / release / EXE 生成は行っていない。Lv4 以降・創作課題は追加していない。

## 1. P23-39 v2 レビューの残り 2 点(v3)

### 1.1 評価セットの quality coverage

レビュー(`review/P23-39-v2.md`)のとおり、v2 は quality 順の先頭を slice したため、評価セットが対象 quality を網羅していなかった。**問数と合格閾値は変えず**、配分だけを固定した。

| set | v2 | v3(凍結) |
|---|---|---|
| Lv2 耳 10 問 | maj7 6 / min7 4、dom7・min7b5 0 | **maj7 3 / min7 3 / dom7 2 / min7b5 2**(4 quality、6 根音) |
| Lv3 遅延 12 問 | maj 5 / min 5 / maj7 2、min7・dom7・min7b5 0 | **6 quality × 2**(12 問) |
| Lv1 耳 10 問 | maj 6 / min 4 | **maj 5 / min 5**(6 根音) |

- `src/courseDesign/bank.test.ts` が **set ごとの quality 件数**を検証する(教材全体の coverage とは別)。
- 凍結 JSON は `bank-lv1-3-v3.json` / `policy-lv1-3-v3.json`。pair は `p23-39.bank.lv1-3.v3+p23-39.policy.lv1-3.v3`。
- 製品側は `src/domain/chordDojo/guidedCourse/bank.json` / `policy.json` に凍結 JSON をコピーし、`frozenFixture.test.ts` が docs との一致を強制する。

### 1.2 「翌日かつ 12 時間以上」を正式合格の必須条件に

- `TrialEvidence.at`(封緘時刻)を必須にし、`localDateKey` / `delayEligibility` を追加した。公式 `evaluateLevel` は次を要求する。
  - 同日 block の**完了**(同日 trial の最大 `at`)より、遅延 block の**開始**(最小 `at`)が後の**ローカル日付**であること。
  - その差が **12 時間以上**であること。
  - 時刻欠落・同日・12 時間未満・逆行は、分母が揃っていても**不合格**。
- 評価は「完了した 1 attempt」だけを使い、未完了の再試行を前の attempt と混ぜない(製品評価も同じ)。
- 注入時計の反例(`bank.test.ts`):11/17 20:00 → 11/18 09:00(13h)合格、同日 13h は「同じ日です」、翌日 10h は「12 時間未満です」、逆行・時刻欠落は不合格。
- 製品側は `review.ts` の `delayEligibility` / `nextDelayAvailableAt` が同じ規則を実装し、`review.test.ts` が契約評価器と同じ判定になることを確認する。

### 1.3 v3 の証拠

- 契約テスト **53/53 PASS**(bank 10 を含む)。
- 旧 v1/v2 の JSON は内容を変えず残し、`freeze-manifest.json` の `supersedes`(v2/v1 の pair・commit・hash)と `freeze-history.md` に差分を記録した。
- v3 の bank sha256 `f8c5fcdc…`、policy `6c1b36c1…`、inventory は v1 と同じ `8e40748d…`。

## 2. P23-40 の実装(Lv1〜3)

### 2.1 入口(既存 P23-38 のカードを置換)

- Chord Dojo ホームの**5 枚目の「ガイド練習」カードはそのまま**(同じ位置・`home-guide`・`home:guide:open`)。押すとコース画面 `guided-course` に入る。二重入口・教材選択・設定 checkbox は増やしていない。
- カードの表示は実データ(`Lv`、同日/遅延の残り)に変えた。`home-guide-change`(旧・教材変更)は無くなった。
- 旧 `GuidedPracticeView`(P23-35/38 の単発ガイド)はホーム入口から外れ、コードと単体テストは履歴として残る。旧 E2E 3 本(単発ガイドの教材選択・テンポ・BPM)は置換された入口のため削除し、`e2e/p23-40-guided-course.spec.ts` に置き換えた。

### 2.2 出題・判定・進級

- `src/domain/chordDojo/guidedCourse/`:
  - `bank.ts`: 凍結 JSON の読み取り、レベル/set、item ラベル。
  - `capture.ts`: 応答待ち 10000 / 採取窓 1500(最初の Note On から)/ settle 60 / 境界封緘 / stall 250 / hidden / clock 100。`capture.test.ts` が契約 harness と同じ結果になることを確認。
  - `answer.ts`: 記名(未指定 bass 自由・転回可)/ 保存 voicing 完全一致 / 耳(和声 + root bass)。`answer.test.ts` が契約 judge と全 item で一致。
  - `review.ts`: 完了 attempt の選択、公式評価(分母・quality 5/4・根音 coverage・耳・遅延・速度・日時)、`coursePlan`(同日 → 結果 → 遅延待ち → 遅延 → 次レベル)。
  - `store.ts`: 専用 store(下記)。
- UI `GuidedCourseView.tsx`: レベル/ブロック/進み、プロンプト、耳の自動再生(終了後に回答窓)、Lv1 の 2 択、ヒント、結果、同日/遅延の結果、遅延待ち、読めない記録の隔離。MIDI 未接続時は「弾けた/まだ」の自己確認(正式合格にはならない)。
- 自己確認と MIDI 確認、ヒントありと独立確認、invalid(disconnected/prepare-failed/clock-jump/capability/stall/hidden)を保存・表示で分離。invalid は分母外で同じ item を再試行する。
- Lv3 の 3 秒は独立正答の 80%。Lv1/Lv2 は速度条件なし。Lv3 終了を「全目標達成」とは表示しない。

### 2.3 専用 store

- `loop-vault:guided-course-v1:data` / `loopvault/guided-course-v1.json` / envelope `{"app":"loopvault-guided-course","fileVersion":1,...}`。ブラウザと Tauri の両方で、一時ファイル → rename、破損は `.corrupt-<token>` に隔離。バックアップ/export には載せない。
- 通常 Dojo・耳・Original・Bass・Vault の記録は読み書きしない。E2E で Dojo の localStorage が入退出の前後で同一であることを確認。
- pair 不一致・未知 version・破損は読めるだけで適用しない(自動移行なし)。保存失敗時はメモリを保持し、部分保存しない。
- record schema は version 1 のまま。評価 attempt を混ぜないための `attemptId` / `block` と、再開用の `active` を追加した(契約文書に追記)。

## 3. 検証

| 対象 | 結果 |
|---|---|
| 契約テスト `src/courseDesign` | **53/53 PASS**(input 21・judging 5・inventory 4・bank 10・answerPolicy 6・store 7) |
| 製品ドメイン `guidedCourse` | **25/25 PASS**(fixture 2・capture 4・answer 4・review 7・store 8) |
| コース画面 unit | **5/5 PASS**(開始・自己確認・再開・破損・同日失敗・遅延待ち・遅延合格) |
| P23-35/38 focused unit | **42/42 PASS**(guidedPractice 37・GuidedPracticeView 2・BPM 3) |
| コース E2E | **5/5 PASS**(入口/5 枚目、MIDI 正解と保存分離、自己確認、破損保持、4 サイズ + axe) |
| ホーム/アクセシビリティ回帰 | **15/15 PASS**(p12-home-layout・p23-27-home・accessibility) |
| focused FEATURE | App TS / source contracts / class lint / changed ESLint PASS、Vitest **6937/6939 PASS**、Playwright selected **FAIL 1**(下記) |
| app TypeScript / full lint / phase-docs / AI handoff / diff check | PASS |
| **fresh FULL**(`c360d6ed`、cache なし) | **PASS — 1006.7 秒**。Vitest **6937/6939**(既存 skip 2)、Playwright full **1157/1159**(既存/条件付き skip 2)、heavy **53/53**、Runner contracts 40/40、production build、gallery excluded、Git diff check、Tracked PNG check すべて PASS。goto の開き直り 0 回 |

- **FEATURE の Playwright 1 件**: `e2e/p16-ear-keyboard.spec.ts` の 768×640 で白鍵の縦横比が 3.12(<3.5)。耳の鍵盤の負荷依存で、P23-28 報告にも同じ 3.12 と単独 3.84/4.21 の記録がある。今回の変更ファイル(コース/契約)は耳の鍵盤を触っていない。**同じ spec が FULL の light pass で PASS** したため、原因未確定の間欠失敗として記録し、FULL は PASS とした。
- FULL は `c360d6ed` のコード・テストで実行した。実行中に contract 説明文とこの報告だけを追記したが、コード・テスト・凍結 JSON は変えていない。FULL の 16 step はすべて PASS(diff check・PNG check を含む)。
- 実機 MIDI・実音・学習効果は未確認。物理 latency は測定済みと主張しない。

## 4. 変更ファイル

- 契約: `src/courseDesign/bank.ts` + test、`docs/p23-39-contracts/`(README・bank-and-scoring・input-contract・store-contract・p23-40-plan・freeze-history・manifest・v3 JSON)、`scripts/course-design/build-freeze.mts`、`docs/reports/p23-39-guided-course-contracts.md`(v3 追記)
- 製品: `src/domain/chordDojo/guidedCourse/`(8 実装 + 5 test)、`src/views/chord-dojo/GuidedCourseView.tsx` + test、`ChordDojoView.tsx`、`DojoHome.tsx`、`chord-dojo.css`
- E2E: `e2e/p23-40-guided-course.spec.ts` 追加、旧単発ガイドの 3 本を削除

## 5. 制約・未実行

- master merge / push / tag / release / EXE 生成なし。Lv4 以降・Lv9 創作・最終創作試験なし。
- 実機 MIDI、実音の聴取、学習効果、物理 latency は未確認。自動テストで確認した範囲を超えて主張しない。
- 旧 P23-35/38 の単発ガイド画面はホームから外れた。コードと単体テストは残すが、製品入口はコースに置き換わった。

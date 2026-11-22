# P23-39: Guided Course Stage 0 契約凍結(v2)+ レビュー指摘修正

- ブランチ: `feat/p23-39-guided-course-contracts`(P23-38 修正 `a677e93b` を祖先に含む。§6 の製品コードは v2 で未変更)
- **tested HEAD: `895c796b`**(契約コード・凍結成果物・説明文の commit。この報告はその後の documentation-only commit)
- **凍結: `p23-39.contracts.v2` / pair `p23-39.bank.lv1-3.v2+p23-39.policy.lv1-3.v2`**
- 状態: **CONTRACT_READY_FOR_REVIEW**。v1(`p23-39.contracts.v1` / `64d7f8d7`)はレビューで `NOT_READY_FOR_P23-40` と判定されており、**正式凍結ではない**。本 v2 の正式凍結判定はレビュー後。
- merge / push / tag / release / EXE 生成 / P23-40 開始は行っていない。

参照:`review/P23-39.md`(reviewed `9783a450`)。

## 1. レビュー指摘の修正

### 1.1 P1 入力上限 1.5 秒が 3 秒評価と矛盾

**修正**: 1 つの数字を延ばすのではなく、3 つの時間と封緘・速度の定義を分離した(`src/courseDesign/inputContract.ts`)。

| 時間 | v2 | 起点 |
|---|---|---|
| 応答待ち | 10000 ms | `armedAt` → 最初の Note On。超過は `no-input` |
| 採取窓 | 1500 ms | **最初の Note On** → 上限。arm からではない |
| settle | 60 ms | 最後の Note On → 封緘。**required 音数に達していなくても期限を立てる** |
| 封緘 | 最も早い境界 | `sealedAt` は境界時刻。poll 遅延で動かない。境界以降の入力は捨てる |
| 速度 | `completionAt - armedAt` | 完成 Note On。3 秒条件は Lv3 の正答だけ |

- partial が settle しない不整合を解消(partial の安定集合は `incomplete` として中立に封緘)。
- `event()` が境界を越えた入力を封緘時点で捨てる。`advance(9000)` のような遅い poll でも `sealedAt` は境界のまま。
- 耳の `armedAt` を音源終了コールバックの `performance.now()` に固定(終了前の Note On は回答でない)。
- 負荷・非表示・時計の無効化を具体値で確定:poll 間隔 > 250 ms → `stall`、visibility 非 visible → `hidden`、単調差と wall 差 > 100 ms または逆行 → `clock-jump`。分母から除外して再試行。

**反例(注入時計、すべて PASS)**:

| 反例 | 結果 |
|---|---|
| 2 秒で弾いた正解(arm 0 → Note On 2000) | 2060 で封緘、`speedMs=2000`、`played`、3 秒以内。1.5 秒上限で消えない |
| 3 秒境界 2999 / 3000 / 3001 | 以内 / 以内 / 超過 |
| partial(60@1000, 64@1050) | 1110 で `settled`、notes `[60,64]`、`incomplete`、速度なし |
| settle を更新し続ける採取 | 2500 で `capture-window` 封緘 |
| 期限後の Note On(1200、deadline 1060) | 1060 で封緘し、入力は set に混ざらない |
| 境界ちょうど(1060)の入力 | 無視 |
| 遅い poll(`advance(9000)`) | `sealedAt=1060`、再 `advance` も同じ |
| 応答待ち後の最初の打鍵 | 打鍵後は応答期限を適用しない(採取窓は残る) |
| 耳: 4999 の Note On → 5000 で arm → 6800 完成 | 4999 は無視、`speedMs=1800` |
| stall 250 / 251、clock 100 / 101、hidden | 250・100 は有効、251・101・hidden は無効 |

### 1.2 P1 不完全な結果で合格

**修正**: `levelPass` を正式進級の集約器に作り直し、部分得点を別関数へ分離した(`src/courseDesign/bank.ts`)。

- `evaluateLevel` / `levelPass`: 凍結 same-day set の**完全一致**(20/20、30/30、重複・set 外・未実施は不合格)、quality 5 問すべての評価と 4/5、根音 coverage(6 / 12)、凍結遅延 set(10/10、12/12)と 8 または 10、耳 set(10/10)と 8、Lv3 速度 80% をすべて要求。invalid は分母から除外し、同じ item で再試行。MIDI 確認済み・ヒントなしの正答だけを分子にする。
- `practiceProgress`: 途中の評価数・正答数・必要数だけを返す**非進級** helper(`formal: false`、`note: "practice only; never a promotion"`)。正式判定には使わない。
- Lv2 の quality は 4 quality × 5 問、Lv3 は 6 quality × 5 問。欠落を平均で隠さない。

**反例(すべて PASS)**:

| 反例 | 結果 |
|---|---|
| `levelPass(3, 空 evidence)` | false(分母・set なし) |
| 27 正答だが quality block 欠落(25/30 評価) | false |
| 27/30 だが `min7b5` 3/5 | false(1 quality でも不足) |
| 必須 item の代わりに同じ item を重複 | false(duplicate + missing) |
| 自己確認 mode | false(正式合格にしない) |
| ヒントありの正答 | 独立正答から除外し false |
| 速度なしの正答 | 「3 秒以内」に数えず false |
| 完全な 27/30 + 12/10 + 速度 22/27・各 quality 4/5 以上 | true |
| 完全な証拠に invalid 試行を追加 | true(invalid は分母外) |

### 1.3 P1 教材・評価契約の不足(P23-40 への先送り)

**修正**: P23-39 v2 で次の 5 件を確定し、bank/policy/set を実在させた。

1. **Lv2 の 6 根音**: C/G/F/A/D/E。各 quality 5 問(計 20)で、quality ごとに 5 根音を使い、残り 1 根音の cell を遅延用 spare にした。20 問全体で 6 根音すべてが出る。
2. **Lv2 の耳 10/8**: policy に `ear {questions:10, pass:8}` を戻し、bank に 24 cell から 6 根音を網羅する 10 問を実在させた。Lv1 は 2 択(maj/min)表示 + 実演、Lv2 は表示なしで quality を聴き分けて実演。根音提示・1 回再生・再生し直しはヒント・和声 + root bass で判定。
3. **同日と別日の「別問題」**: 次のとおり明示した(別順序だけは不可)。
   - Lv1 name: 同日で 12 cell を全部使うため**別 cell は成立しない**。遅延 10 問は**別 item + 別 placement**(8 cell × inv2 + 2 cell × inv1)。
   - Lv2 name: **別 cell 4(spare)+ 別 item + 別 placement 6**。別 cell だけでは 10 問に足りない。
   - Lv3 name: 同日 30 問で 30 cell を使うため**別 cell は成立しない**。遅延 12 問は**別 item + 別 placement**。
   - 遅延 set は same-day set と item ID が重ならない(`bank.test.ts` で強制)。
4. **耳の計測開始・負荷/非表示・保存先**: 1.1 のとおり `armedAt`・`stall`/`hidden`/`clock-jump` を確定。保存先は `loop-vault:guided-course-v1:data` / `loopvault/guided-course-v1.json` / envelope `loopvault-guided-course` / fileVersion 1(`storeContract.ts` の定数 + test)。
5. **存在しない問題集合を前提にしない**: 耳は 417 の進行耳問題ではなく bank 内の合成単和音(Lv5/Lv7 の進行耳は使わない)。same-day/遅延/耳の全問が item ID で存在し、`bank.test.ts` が件数・cell・根音・quality・placement の一致を凍結 JSON と照合する。

**反例・確認(すべて PASS)**: Lv2 の name item は 6 根音、same-day は 5 問/quality、遅延は spare 4 + 別配置 6。Lv1/Lv3 の遅延は共有 cell で placement が必ず異なる。Lv1/Lv2 の耳 set は 6 根音。bank/policy の凍結 JSON と `buildBank(2338)`/`POLICY` が一致(ドリフトなし)。seed を変えても item 集合は同じで順序だけ変わる。

### 1.4 P2 記名課題の bass 条件

**修正**: `policy.answerPolicy.nameRecall` から source voicing の bass 要求を削除し、`answerPolicy.ts` で分離した。

- `name`: quality の必須構成音(root + 3 度。5 度は任意。maj7/min7/dom7 は 7 度、min7b5 は ♭5 が必須)。**未指定 bass は自由で、転回はすべて合格**。
- `saved-voicing`: authored notes の完全一致(音・octave・doubling)。記名とは別 policy。
- `ear`: 和声 + 指定 bass(root)。上の voicing は自由。
- 製品の `judgeChord(..., 'core')` は root bass を強制するため、記名にはそのまま使わない(`judgingCorrespondence.test.ts` に差分を固定)。

**反例(固定 fixture、すべて PASS)**: Cmaj7 の `[48,52,55,59] [52,55,59,60] [55,59,60,64] [59,60,64,67]` は `name` で全合格。`[48,52,59]`(5 度省略)も合格、`[48,52]`(7 度欠落)は不合格、`[48,52,55,59,61]`(余分音)は不合格。`saved-voicing` は `[48,52,55,59]` だけ合格し転回を拒否。`ear` は転回(bass が root でない)を拒否。製品 core judge は同じ Cmaj7 転回を不合格にする(差分として記録)。

## 2. bank / policy / manifest / 説明文の同時更新と旧 freeze との差

| 成果物 | v1 | v2 |
|---|---|---|
| bank | `p23-39.bank.lv1-3.v1` / 70 item / 5 根音(Lv2) | `p23-39.bank.lv1-3.v2` / 162 item / 6 根音 + 耳/遅延 set / sha256 `16cac564…` |
| policy | `p23-39.policy.lv1-3.v1` / Lv2 耳なし | `p23-39.policy.lv1-3.v2` / Lv2 耳 10/8 / sha256 `8af1c5ba…` |
| inventory | `8e40748d…` | 同左(内容不変) |
| manifest | v1 pair | v2 pair + `supersedes`(v1 の pair/commit/hash/レビュー判定)+ `differencesFromV1` |
| 説明文 | input/store/p40-plan | input/store を v2 化、`bank-and-scoring.md` と `freeze-history.md` を追加 |

- v1 の bank/policy ファイルは**内容を変えずに残した**(hash も v1 のまま)。P23-40 は v2 だけを読む。v1 からの合格移行はしない。
- manifest は自己参照の commit hash を埋めない。凍結 commit はこの報告と `freeze-history.md` に記録する。
- v2 の freeze 参照:`docs/p23-39-contracts/freeze-manifest.json`、pair `p23-39.bank.lv1-3.v2+p23-39.policy.lv1-3.v2`、contract `p23-39.contracts.v2`。

## 3. 検証(実行したもの)

| 対象 | 結果 |
|---|---|
| 契約テスト `src/courseDesign` | **52/52 PASS**(入力 21・対応 5・inventory 4・bank 9・answerPolicy 6・store 7) |
| 関連 focused(P23-38/35) | **42/42 PASS**(`guidedPractice.test.ts` 37、`GuidedPracticeView.bpm.test.tsx` 3、`GuidedPracticeView.test.tsx` 2) |
| app TypeScript(`npx tsc --noEmit`) | PASS |
| `npm run lint`(eslint + class lint + source contracts) | PASS |
| `npm run validate:phase-docs` / `validate:ai-handoff` | PASS |
| `git diff --check` | PASS |
| FULL | **実行していない**(指示どおり不要。P23-38 の旧 FULL は流用しない) |
| UI E2E | **実行していない**(§6 の UI は未変更。契約変更は courseDesign 内で製品 import なし) |

- 実行していないものを PASS と書かない。実機 MIDI・実音・学習効果は未確認。
- 既存テストの期待値変更は、v1 契約テストの入力境界・partial settle・合格集計・bass policy の仕様変更に対応する範囲だけ。skip / retry / 閾値緩和はしていない。

## 4. 変更ファイル(`895c796b`)

- `src/courseDesign/inputContract.ts` + `.test.ts`(3 時間の分離、境界封緘、stall/hidden/clock、耳 arm)
- `src/courseDesign/bank.ts` + `.test.ts`(Lv2 6 根音・耳、実 set、置換可能な答案、公式/部分得点の分離)
- `src/courseDesign/answerPolicy.ts` + `.test.ts`(新規。name/saved-voicing/ear の分離)
- `src/courseDesign/judgingCorrespondence.test.ts`(製品 adapter との差分を更新)
- `src/courseDesign/storeContract.ts` + `.test.ts`(保存先の凍結、pair 内部整合)
- `scripts/course-design/build-freeze.mts`(v2 生成、supersedes/differences)
- `docs/p23-39-contracts/`(README、input-contract、store-contract、p23-40-plan、bank-and-scoring、freeze-history、manifest、v2 JSON)

## 5. 制約

- 製品コース実装・専用 store の live 運用・UI 接続は行っていない。P23-40 は開始していない。
- §6 の P23-38 修正(`a677e93b`)は変更していない。focused 42 で維持を確認。
- 創作課題(Lv9/旧 Lv10)は扱っていない。Lv4 以降は画面に出していない。
- 未解決の契約事項はない(`input-contract.md` §7、`store-contract.md` §7)。残るのは P23-40 の実装と実機確認。

## 6. P23-39 v3 �ǋL(2026-11-17 / review/P23-39-v2.md)

v2 �̃��r���[�Ŏc���� 2 �_�����𒼂��Av3 �Ƃ��ē��������B���i�R�[�X�̎����� P23-40 �ōs��(�� `docs/reports/p23-40-guided-course-lv1-3.md`)�B

### 6.1 �]���Z�b�g�� quality coverage

- **Lv2 ��**: v2 �� quality ���̐擪 10 cell �� slice �������� maj7 6 / min7 4 �� dom7�Emin7b5 �� 0 �������Bv3 �� **maj7 3 / min7 3 / dom7 2 / min7b5 2** �� 10 ��ɌŒ肵�A6 ������ԗ�����B�␔�E���i�_(10/8)�͕ς��Ȃ��B
- **Lv3 �x��**: v2 �� maj 5 / min 5 / maj7 2 �������Bv3 �� **6 quality �~ 2 = 12 ��**�B�␔�E���i�l(12/10)�͕ς��Ȃ��B
- **Lv1 ��**: ���ł� maj 5 / min 5 �ɂ��낦��(�� quality �� v2 �ł��܂܂�Ă���)�B
- `bank.test.ts` �� set ���Ƃ� quality ���������؂���(���ޑS�̂� coverage �ƍ������Ȃ�)�B

### 6.2 �x���̓�������

- `TrialEvidence.at` ��K�{�ɂ��A`delayEligibility` / `localDateKey` ��ǉ��B�������i�́u�x�� block �̊J�n������ block �̊�������̃��[�J�����t�v���u12 ���Ԉȏ�v��v������B
- ���������E�����E12 ���Ԗ����E�t�s�͕s���i�B�������v�̔���(11/17 20:00��11/18 09:00 ���i�A���� 13h�E���� 10h�E�t�s�E�����͕s���i)�� `bank.test.ts` �ɌŒ�B
- �]���͊������� 1 attempt �������g���A�������̍Ď��s�������Ȃ�(P23-40 �̐��i�]���ł�����)�B

### 6.3 ���ʕ��ƌ���

- pair: `p23-39.bank.lv1-3.v3+p23-39.policy.lv1-3.v3` / contract `p23-39.contracts.v3`
- bank `f8c5fcdc�c`�Apolicy `6c1b36c1�c`�Ainventory �� v1 �Ɠ��� `8e40748d�c`�Bv1/v2 �̃t�@�C���͓��e��ς����A`freeze-manifest.json` �� `supersedes` �� `freeze-history.md` �ɋL�^�B
- �_��e�X�g **53/53 PASS**(bank 10 ���܂�)�B�^�Elint�Edocs�Ediff check �� P23-40 �̍ŏI���ōĎ��s���A���̌��ʂ� P23-40 �񍐂ɋL���B
- v3 �̌_�� commit �� P23-40 �̎��� commit �Ɋ܂܂��Btested HEAD �� P23-40 �񍐂ɋL�ڂ���B

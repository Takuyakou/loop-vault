# Loop Vault P4.1.3-M5 — Manual Recoverability Contract v1

- 作成日: 2026-07-26
- 対象: P4.1.3 M0〜M4
- **旧 P4.1.2-H4 の記録は変更しない**

---

## 1. なぜ別契約なのか

P4.1.2-H4 は `must-show-catalog-recall` を **14/16 FAIL** と記録した。その記録は履歴として維持し、書き換えない。

新しい契約が測るのは別のことである。

| 契約 | 問い |
|---|---|
| Catalog Hard Gate（H0で凍結） | **自動生成器**が必要な窓を提案したか |
| **Manual Recoverability v1**（本契約） | **人**が欲しい区間へ到達し、作り、聴き、残せるか |

生成器が窓を出せないのは**不足**である。ユーザーが欲しい区間を表現する手段が無いのは**行き止まり**である。P4.1.3 が塞いだのは後者だけで、前者は Stage F の宿題として残る。

自動 `must-show generation recall` が100%でなくても昇格してよいのは、**不足の側を任意範囲選択・編集・試聴・保存で確実に補完できるようになったから**である。

---

## 2. Hard Gate 17項目の結果

`scripts/check-manual-recoverability.ts` → `05-manual-recoverability-results.json`

| Gate | 結果 | 詳細 |
|---|---|---|
| `timelineRangeSelectionSuccessRate` | **PASS** | 10/10 区間が範囲として表現可能 |
| `arbitraryLengthCandidateCreationRate` | **PASS** | **910/910 範囲、64種類の長さ** |
| `manualDraftEventReachability` | **PASS** | 10/10 |
| `manualDraftEditorReachability` | **PASS** | 10/10 |
| `previewReachability` | **PASS** | 10/10 |
| `saveReachability` | **PASS** | 10/10 |
| `catalogNonDestructive` | **PASS** | 10/10 Pattern数不変 |
| `recommendationNonRegression` | **PASS** | 10/10 完全一致 |
| `deterministicDomainFunctions` | **PASS** | 10/10 が3回同一 |
| `privateMidiTracked` | **PASS** | **0 files** |
| `timelineNonRegression` | **PASS** | **100/100 一致** |
| `reloadConsistency` | **PASS** | `manualDraftSave.test.ts`（保存→parse→比較） |
| `chordDojoReachability` | **PASS** | 同（`idea.progressionBlocks` の普通の一員） |
| `schemaCompatibility` | **PASS** | 同（`vaultFileSchema.parse`） |
| `fileVersion` | **PASS** | 同（**1**） |
| `tauriBuild` | **PASS** | msi と nsis の2バンドル生成 |
| `rollbackAvailable` | **PASS** | 各Stageが独立したマージコミット |

**全17項目 PASS。**

### 測定場所を分けた理由

11項目はコーパスを通す測定なのでスクリプトで、4項目（reload / Chord Dojo / schema / fileVersion）は store と schema を必要とするのでテストスイートで測っている。スクリプト側では `not-evaluated` と出るが、**どこで確かめたかを明記して一覧から落とさない**。P4.1.2 で「13 Gate のはずが実質12だった」ことがあり、同じ形の抜けを繰り返さないためである。

---

## 3. 任意長 property test

**19小節・22小節に特化した実装になっていないこと**を、2つの独立した方法で確認した。

### 3.1 コーパス上の総当たり（Gate）

実際の MIDI から解析した Timeline に対し、長さ1〜64小節 × 開始位置を7小節刻みで全走査:

```text
910/910 範囲が作成成功、64種類の長さすべてで成功
```

### 3.2 seed固定の property test（`manualRangeProperty.test.ts`）

休符・1小節2コード・小節をまたぐ持続コードを含む96小節の素材に対し、seed `20260726` で300範囲を生成:

| 主張 | 結果 |
|---|---|
| 使える範囲が200件以上、長さが40種類以上 | PASS |
| すべての範囲で Draft が作れる | PASS |
| すべてのイベントが範囲内に収まる | PASS |
| すべての Draft が保存可能 | PASS |
| すべてが Editor に1イベント1スロットで届く | PASS |
| 3回作って同一 | PASS |
| 11/13/17/19/21/22/23/27小節が**あらゆる開始位置で**成立 | PASS |

**製品コードに長さ別の分岐は無い。**

---

## 4. Quality Target（測定のみ、必須ではない）

| 指標 | 値 |
|---|---|
| `timelineSourceComplete` | **9/10** |
| `repairableWithin1RangeSelection` | **9/10** |
| `repairableWithin2Edits` | **9/10** |
| `repairableWithin5Edits` | **9/10** |
| `meanManualRepairOperationCount` | **1.5** |
| `medianManualRepairOperationCount` | **1** |
| `meanNearestCandidateBarIoU` | 0.75 |
| `meanBoundaryAdjustmentBars` | 2.7 |
| `timeToSavedProgression` | **測定不能**（実際の人と画面が要る。操作数は代用ではない） |

---

## 5. M0 の10区間 — 最終結果

| 区間 | 小節 | Timeline完備 | 範囲選択 | コード編集 | 保存 | 再読込 | 合計操作 |
|---|---|---|---|---|---|---|---|
| H3_clean sec2 | **19** | yes | 1 | **0** | ok | ok | **1** |
| H3_clean sec6 | **22** | yes | 1 | **0** | ok | ok | **1** |
| H3_stress sec2 | **19** | yes | 1 | **0** | ok | ok | **1** |
| H3_stress sec6 | **22** | yes | 1 | **0** | ok | ok | **1** |
| S14_clean b2 | 4 | yes | 1 | 0 | ok | ok | 1 |
| S16_clean verse | 8 | yes | 1 | 0 | ok | ok | 1 |
| S16_clean chorus1 | 8 | yes | 1 | 0 | ok | ok | 1 |
| S16_clean chorus2 | 8 | yes | 1 | 0 | ok | ok | 1 |
| S16_stress verse | 8 | yes | 1 | 0 | ok | ok | 1 |
| S24_stress sec6 | 20 | **NO** | 1 | 5 | ok | ok | 6 |

**現行UI以前は 0/10 が「表現不能」だった。いまは 10/10 が到達し、9/10 が1操作で Gold と一致する。**

### Timeline が不完全な1件

`S24_stress sec6` は `A7#5` を `A7` と検出している（増五度が取れていない）。範囲選択だけでは Gold と一致せず、既存のコード置換で5箇所直す必要がある。

- **手動コード追加・置換で修正できる**: PASS（合計6操作、保存可）
- **操作数を正直に報告**: 上表のとおり
- **Stage F バックログへ登録**: §7

Manual Recoverability Hard Gate は、Timeline が不完全でもユーザーがコードを直して保存できれば PASS としてよい、という契約なのでこの1件も PASS に含まれる。**手動救済は検出の代わりではない**という M0 以来の記録は維持する。

---

## 6. 段階昇格

| 条件 | 結果 |
|---|---|
| 1. Manual Recoverability Hard Gate 全通過 | **PASS**（17/17） |
| 2. Catalog Safety 再確認 | **PASS**（§6.1） |
| 3. Endless Critical Guard | **PASS**（H4 で確認、本Phaseで変更なし） |
| 4. 19・22小節の手動救済 | **PASS**（1操作・編集0回・Gold一致） |
| 5. 任意長 property test | **PASS**（910/910、64長） |
| 6. Timeline 100/100 非回帰 | **PASS** |
| 7. schema 互換 | **PASS**（`fileVersion` 1、無変更） |
| 8. Tauri build | **PASS** |
| 9. rollback 可能 | **PASS** |
| 10. private MIDI 混入なし | **PASS**（0 files） |

**10条件すべて満たしたので、Candidate Catalog + Manual Candidate Rescue を段階昇格する。**

### 6.1 Catalog Safety 再確認

| 項目 | 結果 |
|---|---|
| 全生成 Pattern 到達 | PASS |
| 全 Occurrence 到達 | PASS |
| Pattern 重複 0 | PASS |
| exact duplicate 0 | PASS |
| Recommendation padding 0 | PASS |
| Endless Critical Guard | PASS |
| clean 8-bar 推薦1件 | PASS |
| Chord Drip Timeline 100/100 | PASS |

P4.1.3 は Catalog / Recommendation / 選定ロジックを1行も変えていないので、H4 の測定がそのまま有効である。加えて、Draft 作成前後で Pattern 数と Recommendation が一致することを M2 / M4 の両方で assert した。

### 6.2 最終default

```ts
defaultAnalyzerMode = "phase4-v1";        // 変更なし
```

| 項目 | 状態 |
|---|---|
| `defaultAnalyzerMode` | **`phase4-v1`（変更なし）** |
| Candidate Catalog | `phase4.1.2-v1` 系で opt-in（変更なし） |
| Recommendation | 単段方式 |
| Manual Candidate Rescue | **既定で利用可能**（Full Timeline に入口） |
| G2（two-pass） | opt-in のまま |
| `phase4.1-v1` | 削除していない |
| Stage F | **未着手のまま** |
| 保存schema / `fileVersion` | 無変更 / 1 |

**手動救済は Analyzer モードに依存しない。** Full Timeline があれば動くので、既定の `phase4-v1` のままで使える。これが「既定を変えずに昇格できる」理由である。

---

## 7. Stage F バックログ

本Phaseでは修正していない。P4.1.3 が保証するのは、**これらの誤りが残っていてもユーザーが手動で直して保存できること**である。

| 項目 | 実測された影響 |
|---|---|
| tension 脱落（`A7#5` → `A7`） | S24_stress sec6 で5箇所の置換が必要 |
| `derived-length` がセグメンタ境界のずれに耐えない | H3 の19・22小節が生成されない（H4 の FAIL 原因） |
| `D/E → Em11` / `E/F# → F#m11` | 未測定 |
| rootless + walking bass | 未測定 |
| 転回形誤認 / arpeggio 過分割 / humanized overlap | 未測定 |
| root 選択と `qualityEvidence` の分離 | 未着手 |

---

## 8. rollback

各 Stage は独立したマージコミットで、**製品の既定を一度も変えていない**。

| 範囲 | 手順 |
|---|---|
| M4 のみ | PR #201 を revert |
| M3 | PR #200 を revert |
| M2 | PR #199 を revert |
| M0/M1 | PR #198 を revert |
| P4.1.3 全体 | #198〜#202 を新しい順に revert |

保存データの移行は無い（`fileVersion` 1、schema 無変更）。手動候補を保存済みのユーザーがいても、保存されたものは普通の `SavedProgressionBlock` なので revert しても読める。force-push は一度も使っていない。

# Loop Vault Phase 4.7 最終報告

## 1. 最終判定

**Non-Promotion** とした。

Canonical Bass SemanticsはContract Aで整合し、Part A Shadowはrank 1、既存候補、Top-3、Analyzer出力を完全に維持した。新規Gold Devでもcandidate recallは56.2500%から61.4583%へ改善し、5件を救済した。一方で次の事前固定Gateを満たさなかった。

- candidate economy: **0.468750/event**（上限0.25/event）
- runtime overhead: **8.6720%**（上限5%）

指示書の停止規則に従い、新規ValidationとHoldoutは実行していない。Product接続、feature flag、Analyzer変更、score変更は行っていない。

## 2. PR / Commit

| Stage | PR | Commit | 結果 |
|---|---|---|---|
| P4.7-00 | [#277](https://github.com/Takuyakou/loop-vault/pull/277) | `5a6cdac` | Contract A、baseline、Gate固定 |
| P4.7-01 | [#278](https://github.com/Takuyakou/loop-vault/pull/278) | `e11f6ff` | real scope診断 |
| P4.7-02 | [#279](https://github.com/Takuyakou/loop-vault/pull/279) | `a0a77db`, `0ba5cdb` | Part A Shadow、incumbent-preserving tie-break |
| P4.7-03 | [#280](https://github.com/Takuyakou/loop-vault/pull/280) | `f3ddb3e` | 不変条件、既存Dev押し出し診断 |
| P4.7-04 | [#281](https://github.com/Takuyakou/loop-vault/pull/281) | `49d08ab` | 新規Gold corpusとintegrity |
| P4.7-05 | [#282](https://github.com/Takuyakou/loop-vault/pull/282) | `c7447e5` | New Dev評価、停止条件到達 |
| P4.7-06〜08 | 未作成 | なし | Dev FAILにより未実行 |
| P4.7-09 | 本PR | 本文書のcommit | Non-Promotion確定 |

各PRは直前Stageをbaseにしたstacked PRであり、Correction Log PR #275には依存していない。

## 3. Canonical Bass Semantics / Repository Audit

判定は **Contract A**。

- `Dm7`のbass省略はroot bassを意味する。
- `Dm7/D`はcanonicalize時に`Dm7`へ統一する。
- `Dm7/A`、`Dm7/C`はnon-root slash bassとして保持する。
- parser、serializer、canonicalizer、factorization、dedup、Gold、UI、persistence、representabilityの境界はContract Aで整合した。
- Product domain、Analyzer、Timeline、voicing、boundary、aggregate、fallback、Vault schemaはPhase 4.7で変更していない。

根拠: `docs/phase4.7/00-canonical-bass-semantics.md`、`src/domain/chordIdentity.ts`、`src/domain/chordFactorization.ts`、`src/domain/chordVoicing.ts`。

## 4. Baseline / Real Scope

既存Devは320 events。frozen baselineは次のとおり。

- candidate recall: 78.7500%
- displayed Top-3 canonical: 70.6250%
- counterfactual ranking Top-3 canonical: 73.1250%
- Top-3 root: 95.9375%
- MRR: 0.675005
- correction cost mean / p90: 0.768750 / 3
- manual input required: 12.5000%

Automatic bass attachmentの実スコープ:

- bass attachment events: 320/320
- raw candidates: 80,640
- slash-only identity / lost plain identity: 20,800 / 20,800
- provenance-eligible companion: 1,770
- broad applicable events: 289/320（90.3125%）
- Product Top-3 slash-only: 369
- Product rank 1 slash-only: 30
- raw rank 1 score tie: 17/320（5.3125%）
- existing Gold: root-position 320、slash 0。したがって既存corpusは回帰専用とした。

候補populationのfamily別発火数は `docs/phase4.7/01-real-scope.json` に固定した。Part Aが実際に生成したfamilyは13:1、7sus4:6、m7:3、m9:11、maj9:3、min11:2、six:3。

## 5. Part A Shadow / Tie-break

実装: `scripts/phase47/partAShadow.ts`

- raw winnerがnon-root slashで、同じroot/quality/tensionsのplain identityが欠け、全構成音のnote-instance provenanceが揃う場合だけplain companionを最大1件生成する。
- quality、root、scenario固有の分岐はない。
- source slash/core ID、rule ID、note instance、pitch class、bass attachment、canonical round-tripをprovenanceへ記録する。
- generated scoreはsource raw scoreを保持するが、Part Bのbass evidence scoringとは混ぜない。
- tie-breakは**全incumbent列を元順序のまま先に置き、generated companionをstable suffixへ置く**。同点でも既存候補を押し出さない。

Property Test:

- 9 qualities × 12 rootsでplain companion生成を検証。
- 128 deterministic candidate setsでrank 1とincumbent相対順を検証。
- duplicate、provenance不足、非決定性、1件超過を回帰テスト。

## 6. 既存Dev Invariants / Displacement

- rank 1 raw/canonical/score/source: 320/320不変
- baseline candidate set / score / relative order: 320/320保持
- duplicate / provenance欠落: 0 / 0
- Product rank 1、Top-3、candidate+score、Analyzer hash: frozen baselineと完全一致
- generated: 29、0.090625/event、max 1
- deterministic hash:一致
- runtime: 182.715ms → 188.345ms、overhead 3.0814%（PASS）
- heap median: 12,821,200 → 19,487,232 bytes
- existing Top-3 canonical/root: 73.1250% / 96.2500%、変更なし
- baseline Gold Top-3 canonical/root保持: 234/234、308/308
- new canonical/root miss: 0 / 0
- applicable: 29、改善22、conditional efficacy 75.8621%
- non-applicable: 291/291不変、Inertness 100%
- MRR: 0.674845 → 0.675117
- correction cost mean/p90: 0.784375/3 → 0.784375/3
- manual input required: 12.5000% → 12.5000%

## 7. New Gold Corpus

Corpus: `loop-vault-bass-companion-identity-gold-v1`

- 36 files、288 events、1,930 notes、20,925 bytes
- Dev / Validation / Holdout: 各12 files、96 events
- clean/stress: 各split 6/6
- plain/slash Gold: 各split 48/48
- 12 keysを各splitへ1 fileずつ配置
- m7、m9、maj9、7sus4、13、maj7、dom7を各splitへ配置
- root、third、fifth、seventh、passing、pedal、non-chord、shortを各splitへ配置
- same/separate track、short/medium/longを層化
- split間file/scenario/SHA重複: 0
- parser round-trip: 36/36
- representable: 288/288
- SHA-256 / byteLength: PASS
- MIDIおよびmanifest本体は`.local-evaluation`に生成し、Git管理外

Integrity段階のbroad measured applicability:

- Dev: 92（最低24）
- Validation: 91（最低12）
- Holdout: 91（最低12）

これはprecision評価ではなく、固定corpusの技術的applicability確認である。

## 8. New Dev

New Dev 96 eventsへ固定Part Aを適用した結果:

| Metric | Baseline | Shadow |
|---|---:|---:|
| Candidate recall | 56.2500% | 61.4583% |
| Top-3 canonical | 5.2083% | 5.2083% |
| Top-3 root | 17.7083% | 17.7083% |
| MRR | 0.053904 | 0.054110 |
| Correction cost mean | 1.906250 | 1.906250 |
| Correction cost p90 | 2 | 2 |
| Manual input required | 0% | 0% |

- actual Part A applicable: 45/96（最低24をPASS）
- candidate rescue / loss: 5 / 0
- rank 1変更: 0
- candidate set / score / relative order保持: 96/96
- baseline Gold Top-3 canonical/root保持: 5/5、17/17
- new canonical/root miss: 0 / 0
- non-applicable Inertness: 51/51、100%
- duplicate / provenance欠落: 0 / 0
- deterministic: PASS

Family別candidate gain/loss:

| Family | Applicable | Gain | Loss |
|---|---:|---:|---:|
| 13 | 8 | 1 | 0 |
| 7sus4 | 9 | 1 | 0 |
| dom7 | 8 | 1 | 0 |
| m7 | 2 | 0 | 0 |
| m9 | 5 | 1 | 0 |
| maj7 | 7 | 0 | 0 |
| maj9 | 6 | 1 | 0 |

Bass condition別gainはthird 1、seventh 2、pedal 1、short 2、medium 4。plain Gold / separate trackで各5件を救済し、全groupでlossは0。

失敗Gate:

- generated 45、平均**0.468750/event**、max 1。平均上限0.25を超過。
- runtime 78.950ms → 85.797ms、overhead **8.6720%**。上限5%を超過。
- heap median 28,097,040 → 39,757,968 bytes。

## 9. Validation / Holdout / Product

- New Validation: **未実行**。Dev Gate FAILの停止規則による。
- New Holdout: **未実行**。Validation未実行かつ未通過のため。
- Product接続: **未実装**。
- feature flag: **未実装**。全split Gate通過前にdefault ONを作らない規則による。
- automatic bass attachmentのProduct挙動: 変更なし。
- `defaultAnalyzerMode`: `phase4-v1`のまま。
- `fileVersion`: `1`のまま。
- Vault schema / data migration: 変更なし。
- private MIDI / `.local-evaluation` tracked files: 0 / 0。

Part Bへ進む条件はPart A Promotion後であり、今回は満たしていない。bass evidence scoring、plain/slash score separation、rank 1品質改善は未着手。

RollbackはProduct変更がないため不要。Shadow stackを取り込まなくても現行Productは完全に同一であり、取り込んだ場合も評価スクリプトとdocsだけでProduct経路には接続されない。

## 10. Correction Log

ローカル`analysis-feedback.jsonl`は検出されず、集計母数は次のとおり。

- saved events: 0
- progressions: 0
- accepted rank1 / selected rank2 / selected rank3 / manual input: 0 / 0 / 0 / 0
- family別出現・修正: 0
- root / quality / seventh / tension / bass変更: 0 / 0 / 0 / 0 / 0

最低母数100 events / 20 progressionsに未達。Correction LogはFixed Goldや今回のPromotion判定へ使用していない。

## 11. Gate Summary

Contract、Part A/B分離、rank 1、Analyzer hash、candidate superset、既存score/provenance、Top-3保持、new miss 0、applicability、candidate recall改善、Inertness、MRR、correction cost、manual input、duplicate、provenance、determinism、schema/privacyはPASS。

**G23 candidate economy**と**G25 runtime**がFAIL。G31の最終build検証結果は本PRで記録する。G32はValidation/Holdoutを開かなかったため規律を維持した。G33 feature flag rollbackはProduct未接続のため非該当。

## 12. 結論と次の分岐

Part Aの情報保存効果は確認できたが、新規Gold Devで広く発火しすぎ、事前固定したcandidate budgetとruntime budgetを超えた。Gateは緩和しない。Validation/Holdoutを覗かず、Productも変えず、Shadow・corpus・評価基盤だけを残す。

次に検討する場合は、今回のDev結果へ後付け調整するのではなく、適用範囲と計算量を事前登録した別Phaseとして設計する。Part BはPart A Promotion後まで開始しない。

## 13. 最終検証

- `npm run lint`: PASS
- `npx tsc --noEmit`: PASS
- `npm test -- --run`: 213 files / 1,706 tests PASS
- `cargo test`: 24 tests PASS
- `npm run build`: PASS
- `npm run tauri build`: PASS
- `git diff --check`: PASS
- `npm run check:staged`: PASS
- tracked `*.mid` / `*.midi`: 0
- tracked `.local-evaluation`: 0

生成物:

- `D:\dev\Loop Vault\src-tauri\target\release\loop-vault.exe`
- `D:\dev\Loop Vault\src-tauri\target\release\bundle\msi\Loop Vault_0.1.0_x64_en-US.msi`
- `D:\dev\Loop Vault\src-tauri\target\release\bundle\nsis\Loop Vault_0.1.0_x64-setup.exe`

残る警告はViteの500 kB超chunk warningのみ。既存のbundle構成に由来し、Phase 4.7のProduct変更はない。

# P4.3-06 Voicing Failure Taxonomy

分類規則version: `p43-failure-taxonomy-v1`

dev分類を固定後、validation 10 MIDI / 96 eventsを一度だけ実行した。

## First Loss Stage

| Stage | dev 320 | validation 96 |
|---|---:|---:|
| pass | 204 | 60 |
| note-selection | 28 | 9 |
| fallback-policy | 34 | 2 |
| role-derived | 38 | 25 |
| representation-type | 16 | 0 |
| boundary-derived | 0 | 0 |

validationでもrole-derivedは26.04%（25/96）発生し、Product roleによる
exact低下は16.67point、source usable低下は27.08pointだった。
boundary-derivedはdev/validationとも0。

## Failure Cluster Priority

優先度:

```text
affectedEventCount
× meanCorrectionSeverity
× productImpact
× validationReproducibility
```

| 順位 | cluster | dev events | validation events | score |
|---|---|---:|---:|---:|
| 1 | melody contamination | 60 | 18 | 424.00 |
| 2 | simultaneous frame wrong | 59 | 25 | 388.00 |
| 3 | fallback despite usable source | 40 | 11 | 250.00 |
| 4 | aggregated misclassified | 16 | 0 | 241.50 |
| 4 | arpeggio under-collection | 16 | 0 | 241.50 |
| 6 | top-note missing | 18 | 0 | 192.38 |

validationに対象scenarioが無いclusterは「否定」ではなく未再現として係数0.5。

## 最大Failure Cluster

`melody-contamination`

- dev: 60 events / 20 files
- clean 1、stress 59
- validation: 18 events
- Product roleでdistractor leakとfallbackが増える
- 同一track内だけでなく、推定roleがmixed/harmonyへ残すmelody evidenceも含む

Phase 4.4で選ぶ改善対象はこの1 clusterとする。抽出器のscore、representation、
fallbackを同じPRで同時修正しない。

## Secondary Findings

- `simultaneous-frame-wrong`はmelody contaminationと重なるeventが多い。
- `fallback-despite-usable-source`はnote exactでもconfidence/coverage policyで
  generatedへ落ちる40 dev events。音符抽出精度と製品利用率を分けて扱う必要がある。
- V17の完全arpeggio 16 eventsはすべてaggregatedをsimultaneousと判定し、
  under-collectionを起こす。validationにはaggregate fixtureが無い。
- bass missingは主要clusterにならず、Oracle Aのdev bass accuracyは100%。
- stale-after-editは全snapshotで100%。

## 停止判断

このStageでは改善実装を行わない。分類と次Phase候補だけを固定する。
detector、Voice role、Voicing extractor、threshold、fallback policyは変更していない。

成果物:

- `docs/phase4.3/05-voicing-ablation-validation.json`
- `docs/phase4.3/06-voicing-failure-taxonomy.json`
- `.local-evaluation/phase4.3/failure-taxonomy-dev-events.json`

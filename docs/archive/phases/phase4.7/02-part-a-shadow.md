# Phase 4.7-02 Part A Shadow

Existing Dev 320 eventsへ、評価専用のquality-agnostic Part A ruleを適用した。
Product、UI、Vault、Analyzer pipelineには接続していない。

## Rule

1. baseline raw winnerがautomatic bass由来のnon-root slashである
2. 同coreのplain identityがbaseline集合にない
3. plain chordの全構成音をnote-instance provenanceで説明できる
4. canonical round-tripが一致する
5. 同scoreでplain companionを一件だけ追加する
6. incumbent-preserving tie-breakでbaseline candidateを先に保つ

## Results

- generated total: 29
- average / event: 0.090625
- maximum / event: 1
- rank 1 unchanged: 320 / 320
- baseline sequence retained: 320 / 320
- canonical duplicate: 0
- missing provenance: 0
- deterministic hash: `ab1bc6d0582d7571d3e3da0eb2d97c1dd2e9bb2f74b84e38727416abfa8e892e`

## Family

| Family | Generated |
|---|---:|
| 13 | 1 |
| 7sus4 | 6 |
| m7 | 3 |
| m9 | 11 |
| maj9 | 3 |
| min11 | 2 |
| six | 3 |

## Economy Gates

- average <= 0.25: PASS
- max <= 2: PASS
- duplicate 0: PASS
- provenance 100%: PASS

既存rank 1をslash優先として再定義したのではなく、同点時にincumbentを維持した。

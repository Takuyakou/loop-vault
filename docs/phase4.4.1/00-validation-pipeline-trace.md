# Phase 4.4.1 Validation Pipeline Trace

## 実行範囲

- 対象: 専用corpusのValidationにある既知の汚染6イベント
- 固定filter設定: `{"minimumRoleConfidence":0.65,"minimumConcurrentNonMelodyPitches":4,"minimumConcurrentSupportBeats":0.2}`
- Analyzer: `phase4-v1`
- fileVersion: `1`
- Holdout: **未実行**
- 製品経路・閾値・heuristic・Gate・schema: **変更なし**

Validation全48イベントのProduct結果から、既存のpitch-only evaluatorで汚染と判定される6イベントだけを詳細traceした。`noteInstanceId`はMIDI parserの配列index、track、channel、tick、duration、pitchから決定的に作り、raw noteからfilter、candidate、winner、最終sourceVoicingの寄与元まで維持した。

## 集計

| 項目 | 件数 |
|---|---:|
| 詳細trace | 6 |
| filter発火 | 0 |
| note instance集合変化 | 0 |
| filter直後pitch集合変化 | 0 |
| final sourceVoicing pitch集合変化 | 0 |
| Exact変化 | 0 |
| melody leak変化 | 0 |
| 汚染6件内status変化 | 0 |
| Validation全体status変化 | 7 |
| 未filter noteからの再構築 | 0 |

## 6イベント

| Event | removed instance | filter pitch set | 別track同pitch | simultaneous | winner score | status | 最初の無効化Stage | 分類 |
|---|---:|---|---:|---:|---|---|---|---|
| M12_clean/e04 | 0 | 43,53,57,59,63,64,65,66,70 → 43,53,57,59,63,64,65,66,70 | 0 | 12 → 12 | 0.5519930248112992 → 0.5519930248112992 | review → review | filter-trigger | filter-not-triggered, candidate-unchanged |
| M12_clean/e06 | 0 | 45,55,58,61,63,64,65,66,70 → 45,55,58,61,63,64,65,66,70 | 0 | 12 → 12 | 0.5924930248112992 → 0.5924930248112992 | review → review | filter-trigger | filter-not-triggered, candidate-unchanged |
| M12_stress/e04 | 0 | 43,52,53,57,59,63,64,65,66,69,70 → 43,52,53,57,59,63,64,65,66,69,70 | 0 | 12 → 12 | 0.5325 → 0.5325 | review → review | filter-trigger | filter-not-triggered, candidate-unchanged, missing-harmony-dominant |
| M12_stress/e06 | 0 | 45,55,58,61,63,64,65,66,67,70 → 45,55,58,61,63,64,65,66,67,70 | 0 | 12 → 12 | 0.5778333333333332 → 0.5778333333333332 | review → review | filter-trigger | filter-not-triggered, candidate-unchanged, missing-harmony-dominant |
| M13_clean/e04 | 0 | 43,57,59,63,64,65,66,70 → 43,57,59,63,64,65,66,70 | 0 | 8 → 8 | 0.7619166666666668 → 0.7619166666666668 | review → review | filter-trigger | filter-not-triggered, candidate-unchanged |
| M13_stress/e04 | 0 | 43,57,59,63,64,65,66,67,70 → 43,57,59,63,64,65,66,67,70 | 0 | 8 → 8 | 0.665218933525842 → 0.665218933525842 | review → review | filter-trigger | filter-not-triggered, candidate-unchanged |

## Candidate経路

各eventのJSONには次を分離して保存した。

- filter前後の`noteInstanceId`集合とpitch集合
- 同pitchを保持する別Trackのnote instance
- simultaneous候補の全件、aggregate候補、構造key、`roleScore`、score、confidence
- winnerと最終sourceVoicingへ寄与したnote instance
- removed IDがShadow winnerへ再流入したか
- final pitch set、status、Exact、melody leakの独立差分

## Usableだけが上昇した理由

Validation全体のreview/not-found→usableは7件で、逆方向は0件だった。最終pitch setが不変のままusableへ変化したeventは7件である。

汚染6件とUsableが上昇した7件は**別のevent cohort**だった。汚染6件ではfilterが1件も発火せず、note instance、pitch set、candidate、final sourceVoicing、Exact、melody leak、statusがすべて不変だった。漏洩pitchのfilter判定は次の段階で止まっている。

| 汚染Event | 漏洩pitch noteのfilter拒否理由 |
|---|---|
| M12_clean/e04 | n30:t3:c2:s6182:d216:p65: concurrent-harmony-1<4 (support=57) |
| M12_clean/e06 | n50:t3:c2:s10445:d216:p70: concurrent-harmony-1<4 (support=61) |
| M12_stress/e04 | n30:t3:c0:s6171:d215:p65: role-is-bass, concurrent-harmony-0<4 (support=none) |
| M12_stress/e06 | n50:t3:c0:s10443:d229:p70: role-is-bass, concurrent-harmony-0<4 (support=none) |
| M13_clean/e04 | n29:t3:c2:s6182:d216:p65: concurrent-harmony-3<4 (support=57,59,64) |
| M13_stress/e04 | n29:t4:c0:s6194:d207:p65: concurrent-harmony-3<4 (support=57,59,64) |

一方、Usable上昇7件ではfilterが各4 note instanceを除外した。除外したmelody noteがsimultaneous windowの境界を細かく分割していたため、除外後は同一のharmony contributor集合がより長い区間を占めるwinnerへ切り替わった。winner durationは0.481250〜0.585417 beatから1.143750〜1.220833 beatへ伸び、duration項の上昇でconfidenceが0.751699〜0.760033から0.804699〜0.810866へ上がり、`0.78`のUsable境界を越えた。7件ともfinal pitch setは不変で、roleScore上昇は主因ではない。

Exactとmelody leakは最終pitch setだけを比較するため、この「note instance除外 → window境界変化 → duration score上昇 → status変化」を観測しない。

| Status変更Event | removed instance | 別track同pitch | winner roleScore | confidence | final pitch set | status |
|---|---:|---:|---|---|---|---|
| M11_stress/e01 | 4 | 0 | 0.1546630182919005 → 0.1546630182919005 | 0.759699452743785 → 0.8108661194104518 | 48,55,59,62,64 → 48,55,59,62,64 | review → usable |
| M11_stress/e02 | 4 | 1 | 0.15717370114385384 → 0.1546630182919005 | 0.753076055171578 → 0.8046994527437852 | 45,52,55,59,60 → 45,52,55,59,60 | review → usable |
| M11_stress/e03 | 4 | 1 | 0.1546630182919005 → 0.1546630182919005 | 0.7551994527437851 → 0.8060327860771184 | 50,57,60,64,65 → 50,57,60,64,65 | review → usable |
| M11_stress/e05 | 4 | 0 | 0.1546630182919005 → 0.1546630182919005 | 0.7563661194104516 → 0.809866119410452 | 52,59,62,64,67 → 52,59,62,64,67 | review → usable |
| M11_stress/e06 | 4 | 1 | 0.1546630182919005 → 0.1546630182919005 | 0.751699452743785 → 0.8083661194104517 | 45,55,58,61,64 → 45,55,58,61,64 | review → usable |
| M11_stress/e07 | 4 | 0 | 0.1546630182919005 → 0.1546630182919005 | 0.7570327860771184 → 0.8095327860771184 | 50,57,60,62,65 → 50,57,60,62,65 | review → usable |
| M11_stress/e08 | 4 | 0 | 0.1546630182919005 → 0.1546630182919005 | 0.7600327860771185 → 0.8075327860771184 | 43,53,55,60,62 → 43,53,55,60,62 | review → usable |

## 再構築検査

Shadow winnerの寄与元にremoved `noteInstanceId`が再出現したeventは0件だった。したがって後段が未filter noteからsourceVoicingを再構築した証拠はない。

## 不変条件

- Holdoutは読み込みも実行もしていない
- Analyzer / Timeline / public schema / fileVersionは変更していない
- filter設定、判定閾値、heuristic、Gateは変更していない
- 本traceは`scripts/phase441`の診断経路だけで、製品経路へ接続していない

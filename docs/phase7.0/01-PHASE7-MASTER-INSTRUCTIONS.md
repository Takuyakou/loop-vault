# Loop Vault Phase 7 FINAL
## Core v2 Research / Architecture / Evaluation — Full-Autonomy Execution Instructions

この文書をPhase 7の最終実行契約とする。
古いPhase 7提案・途中メモ・会話上の案と矛盾する場合、本書を優先する。
ただし repository直下のAGENTS.mdにcredential・private data・不可逆Git操作について本書より厳しい規則がある場合、その安全規則を優先する。

---

# 1. Mission

Loop VaultのMIDIコード検出・解析エンジンをCore v2として再設計するため、研究・比較・評価・設計決定を行う。

Phase 7は「既存Coreを少し改善するPhase」ではない。
また「巨大Transformerへ移行するPhase」でもない。

次の候補を同じ評価契約で比較し、必要ならハイブリッド構成を採用する。

- deterministic rule / template
- factorized candidate generation
- role-aware evidence
- adaptive boundary proposals
- segment lattice
- local scorer
- DAG / semi-Markov style temporal decoder
- optional ML priors
- external baseline (BACHI official implementation where practically executable)
- minimal copy baselines

最終判断は結果から行う。Deep Researchの推奨architectureを事前に勝者として扱わない。

---

# 2. User-facing truth: what Loop Vault must preserve

Loop Vaultは単なるChord Symbol recognizerではない。
Vaultへ保存されたカード、特にSource MIDI / Voicing Loopでは、ユーザーが元MIDIから採集した実際のvoicingを再利用・練習できることが重要である。

よって評価を二層に分ける。

## Tier 1 — Voicing Fidelity（主指標）

対象となる伴奏のMIDI note numberを、octave / register / placement込みで正しく保存・再現できるか。

評価対象:

1. independent Gold target notes
2. analyzer extraction result
3. persistence / reload result
4. card/reference playbackへ渡すnote numbers
5. whole-progression playbackへ渡すnote numbers（存在する場合）

各地点をGoldへ直接照合する。
「card playbackとwhole playbackが互いに一致」だけではPASSにしない。両方同じ誤りでも一致するため。

元音付きSourceでは勝手にroot / fifth / extensionを追加・削除・octave移動しない。

## Tier 2 — Harmonic Interpretation（補助だが必須）

対象伴奏のpitch-class content、bass、harmonic identity、candidate recall、Top-K、symbol renderingの妥当性を測る。

同じ発音内容を持つ複数のコード名は、Tier 2のplayback-equivalent評価では同時に正解になり得る。
例: 同一bass・同一pitch contentである C6 / Am7/C 等。

ただし内部のharmonic interpretationをすべて同一identityへ潰してはならない。
Root / quality / bass / extensions / omissions等の分析情報は保持し、renderer preferenceと分離する。

canonicalExactは診断用の副指標として残すが、Phase 7全体の最上位指標にしない。

---

# 3. Input type and evaluation axis must stay separate

「コードだけのMIDI / melody混在MIDI」は入力条件である。
「Tier 1 / Tier 2」は評価軸である。

両方の評価軸を、Goldが存在する限り両方の入力条件へ適用する。

### Chord-only input
- 明示的に伴奏だけのMIDIなら、最高音だからという理由で勝手にmelody扱いして削除しない
- ただし passing note / re-strike / sustain residual / voicing change は別問題として扱う

### Mixed input
- Gold roleを持つevaluation corpusでは、melodyを除いた伴奏note numberに対してTier 1を測定
- Gold roleはoracle condition以外の通常解析へ渡さない
- melody leakだけでなく、true harmony noteを誤って削除したharmonic false-removalも測る

将来のUIに「コードだけのMIDI」指定を追加する案はPhase 7では仕様提案まで。本番UI実装は禁止。

---

# 4. Three temporal structures

Phase 7では時間構造を少なくとも以下へ分離する。

1. Harmonic Boundary
2. Voicing Boundary
3. Ornament / Note Event

## Harmonic Boundary
harmonic identity / harmonic stateが変わる境界。

## Voicing Boundary
harmonic identityが同じでも、安定した対象voicingのMIDI note-number set / register配置が構造的に変わる境界。

例:
Cmaj7のまま `C3-G3-B3-E4` → `C3-B3-E4-G4` へ変化する場合、Tier 1では別voicing card候補。

## Ornament / Note Event
一時的な装飾・単音経過・re-strike等で、安定したvoicing/harmonic stateそのものは変わっていないもの。

重要:
- 「1声部だけ動いた = 必ずornament」ではない
- 「複数声部が動いた = 必ずchord change」でもない
- durationだけで分類しない
- evidenceとして bass / guide-tone / multi-voice motion / pitch-content / sustain / onset cluster / preceding-following context を使う

---

# 5. Passing note vs passing chord

Chords.midのような短い経過和音を、短いという理由だけで潰してはならない。

## Splitしない方向の例

単一声部だけが短時間動き、他声部が同じharmonic / voicing skeletonを維持しているpassing note / neighbor / ornament。

## Splitすべき候補

短時間でも複数声部・bass・guide tone等がまとまって変化し、新しい安定したharmonic / voicing stateを形成するpassing chord / intermediate voicing。

1 beat / 1/2 beat、さらに短い真の和音変化もあり得る。
「short = ornament」という固定規則は禁止。

duration thresholdを使う場合:
- 比較前にfreeze
- duration単独で判定しない
- after-result retune禁止

Synthetic test categoryへ最低限以下を含める。

- single-voice passing note
- neighbor note
- appoggiatura-like note
- same-voicing re-strike
- same-voicing arpeggio
- voicing-only change
- 1-beat passing chord
- half-beat passing chord
- true harmonic change
- sustained pedal residual
- bass pedal point

Chords.midはGitへ含めない。local-only real-MIDI regression caseとして利用し、Synthetic categoryと同じtaxonomyで測る。

---

# 6. Correction Cost

実用上の修正負担を測る。

最低限、別々に集計する。

1. note correction cost
   - missing notes
   - extra notes
   - octave/register errors
2. boundary / card-count correction cost
   - missing split
   - unnecessary split
   - voicing boundary miss
   - harmonic boundary miss
3. role correction cost
   - melody leak
   - harmony false removal
4. harmonic interpretation correction
   - wrong bass/root/quality/factors where materially relevant
5. naming-only correction
   - playback-equivalentで表示名だけ異なるケース

Naming-only differenceをTier 1 correction costへ含めない。

---

# 7. Minimum Copy Baselines

P7-09では最低限、次の3つを必須baselineとする。

## Copy-Oracle
Gold boundary + Gold target notesをそのまま保存。
目的: extraction以前ではなく persistence / reload / playback pipelineの上限確認。

## Copy-Simple
単純なpre-registered boundary heuristic + 対象音をそのまま保存。
コード名推定なし。
目的: 最小segmentationだけでTier 1がどこまで達成できるか測る。

## Copy-ProductBoundary
現行Coreのboundary + 対象音そのまま保存。
コード名推定なし。
目的: 現行損失がboundary由来かidentity/ranking由来か分離。

Core v2がCopy-Simple / Copy-ProductBoundaryよりTier 1で悪化した場合は明示的regressionとして報告する。

Copy baselineはCore v2候補の勝敗を自動決定するものではない。原因分離の対照群である。

---

# 8. Candidate / Ranking / Decoder interaction

単体componentの成績だけで候補を落とさない。

最低限以下を比較する。

- old Identity × old Decoder
- B2-style/new Identity × old Decoder
- old Identity × C1/C2-style new Decoder
- new Identity × C1/C2-style new Decoder

特に `new Identity × new Decoder` は、単体結果が悪くても必ず評価する。

P5.40で局所identity/ranking改善がtemporal partition interactionで最終結果を壊した経験を踏まえ、component interactionを一級の研究対象とする。

P7-09の最終比較は「1個ずつ改善して勝者だけを足す」greedy tournamentにしない。

---

# 9. Role × Boundary oracle ablation

P7-01で2×2 oracle ablationを実施する。

- Product Boundary × Product Role
- Gold Boundary × Product Role
- Product Boundary × Gold Role
- Gold Boundary × Gold Role

ただしP7-01開始前またはP7-01冒頭に、必要corpusがGold Boundary / Gold Roleを実際に供給できるか監査する。
不足している場合は既存truthを書き換えず、versioned evaluation-only fixtureを作る。

Chord Drip系だけではmelody separationを十分測れない可能性があるため、Harmony Support Gold / equivalent melody-containing corpusでも実施する。

追加指標:
- melody-role accuracy
- melody note included as tension count/rate
- melody leak
- harmony false-removal
- role-derived first-loss count

Gold roleはoracle ablation専用。通常candidateへ漏らさない。

---

# 10. Holdout / anti-overfit

既存known corporaはdev / regressionとして扱う。

新しいsynthetic sealed holdoutを比較実験前に生成・sealし、Final evaluationまで答えを開かない。

Final Holdoutではできる限り以下のみを返す。
- overall aggregate
- category aggregate
- performance
- confidence interval / paired comparison summary

failed MIDI id / exact expected answer / exact failure positionを開発側へ返さない。

一度詳細を見たholdoutはValidationへ降格し、同じholdoutをFinal判定に再利用しない。

Phase 6 Runnerが未完成でも、Phase 7はCodex自身が答えを参照できない構成を可能な範囲で作る。
不可能ならその制約を明記し、holdout integrityを過大主張しない。

---

# 11. Research budget

- Phase 7 total: maximum 14 calendar days相当の研究範囲
- P7-09 tournament: maximum 24 configurations
- one component / hypothesis: maximum 6 tuning iterations
- final sealed holdout後のretune: 0

時間そのものを待機して計測するという意味ではない。作業量と探索範囲の上限として扱う。

同じ失敗を無制限に重み調整し続けない。

---

# 12. External baseline — BACHI

可能ならBACHIの公式・著者公開版をexternal baselineとして実行する。

ルール:
- 非公式再実装を「BACHI」と呼ばない
- license / environment / model weight / preprocessing条件を記録
- Loop Vault vocabularyへ無理に変換して公平性を装わない
- BACHI native output metricと、mapping可能な共通subset metricを分ける
- 実行不能なら理由を記録し、推測値を作らない

---

# 13. Live MIDI decision

Core v2 offline analyzerとLive MIDI low-latency pathを同一実装へ強制統合しない。

Phase 7で以下を比較し、P7-10でdecisionを出す。

- shared evidence primitives only
- shared candidate engine, separate decoder
- fully separate live simplified path

判断基準:
- latency
- deterministic behavior
- accuracy relevant to live use
- implementation complexity
- regression risk

Phase 7ではproduction Live MIDI pathを変更しない。

---

# 14. Vault vocabulary audit

既存Vault / parser / renderer vocabularyを集計し、次を分ける。

- observed in real/synthetic corpora
- representable by current parser
- representable by current candidate engine
- playback-equivalent but symbol-different
- genuinely unsupported harmonic structure
- renderer-only alias issue

巨大固定辞書へ blindly拡張しない。

Core v2候補表現はfactorized/open representationを比較対象に含める。

---

# 15. Required measurements

最低限の測定対象:

1. Role
2. Harmonic Boundary
3. Voicing Boundary
4. Voicing Fidelity (Tier 1)
5. Harmonic Identity / Candidate Recall / Ranking (Tier 2)
6. Temporal Decoder / final timeline
7. Persistence / Reload / Playback fidelity

加えて:
- correction cost
- Top-K
- candidate recall ceiling
- over-segmentation / under-segmentation
- melody contamination
- long-tail subset
- simple-chord regression
- CPU time / peak memory
- determinism

---

# 16. Production invariants during Phase 7

Phase 7完了時点まで以下を維持する。

- production Analyzer behavior: unchanged
- defaultAnalyzerMode: unchanged
- Vault schema: unchanged
- fileVersion: unchanged
- migration: unchanged
- MIDI Exporter production contract: unchanged
- Live MIDI production behavior: unchanged
- Chord Dojo behavior: unchanged
- Voicing Loop production behavior: unchanged

Research codeはscripts / tests / docs / isolated experiment modulesを優先する。
必要な場合もproduction接続はfeature pathへ入れない。

---

# 17. Privacy / local files

Chords.midその他private MIDI/audio:
- Git add禁止
- tracked docsへfilenameがprivateである場合は記録しない
- raw notes / exact private transcription / checksum / absolute pathをtracked reportへ残さない
- ignored-local aggregate / anonymous IDsを使う

Synthetic/public-safe fixturesはtracked可能。

---

# 18. Git policy

- main/masterへmergeしない
- push/tag/releaseしない
- Stageごとに明確なcommitを残す
- destructive reset / force push禁止
- unrelated dirty worktreeを勝手に消さない
- stage開始時にGit realityを監査

Branch名はrepo realityに合わせてよいが、Phase 7専用branch/worktreeを推奨。

---

# 19. Final decision principle

Phase 7の最終Architectureは、単一metric最大化で選ばない。

少なくとも以下を同時に満たす方向を採用する。

- Tier 1: source voicing fidelityが強い
- Tier 2: candidate recall / harmonic interpretationが改善
- passing chordを潰さない
- melody contaminationを抑える
- correction costが低い
- long-tail chordで改善
- simple chordで重大退行なし
- component interactionが安定
- runtimeが現実的
- failureを分解・説明できる
- Phase 8で実装可能なcomplexity

根拠なく「95%」などのmagic thresholdを後付けしない。
Baseline / confidence interval / category behavior / correction costを合わせて判断する。

# Loop Vault Phase 4.4 最終報告

## 結論

Phase 4.4のメロディ混入除去は**非昇格**とした。

Devでは明確に改善したが、固定設定を一度だけ適用したValidationで必須Gateを満たさなかった。計画の規律に従い、閾値の再調整と専用Holdout評価を行わず、製品経路へ接続していない。

## 実施範囲

| Stage | 内容 | 結果 |
|---|---|---|
| P4.4-00 | Corpus integrity、Baseline、Gate固定 | 完了 |
| P4.4-01 | M1/M2/M3失敗機序分類 | M3（局所メロディ混入）が支配的 |
| P4.4-02 | Gold per-note roleによるOracle A+ | 局所note filterが有効と確認 |
| P4.4-03 | 介入と探索範囲の事前固定 | 完了 |
| P4.4-04 | event-local shadow filter | 完了、製品未接続 |
| P4.4-05 | 専用Dev調整と既存Corpus回帰 | PASS |
| P4.4-06 | 固定Validationを一度だけ評価 | FAIL |
| P4.4-07 | 新専用Holdout | 未実行 |
| P4.4-08 | 昇格判断 | 非昇格 |

## 選択した介入

選択した変数は、コード区間内で独立したメロディVoiceのnoteだけを除外してVoicing抽出へ渡す`event-local-note-filtering`である。

フィルタ条件:

- Voice roleが`melody`
- role confidenceが固定閾値以上
- Voiceがmonophonic
- highest voice shareが0.5以上かつlowest voice shareより大きい
- 区間内でpolyphonicな和声支持が固定音数・固定時間以上同時に存在
- source noteの除外だけを行い、新しいnoteは追加しない

固定設定:

```json
{
  "minimumRoleConfidence": 0.65,
  "minimumConcurrentNonMelodyPitches": 4,
  "minimumConcurrentSupportBeats": 0.2
}
```

実装: `src/domain/voicing/melodyContaminationFilter.ts`

## Dev結果

専用Dev:

| Metric | Product | Shadow | Delta |
|---|---:|---:|---:|
| Contamination events | 20 | 3 | -17（85%減） |
| Melody leak | 3.13% | 0.47% | -2.66pp |
| Exact | 87.50% | 98.13% | +10.63pp |
| Recall | 100.00% | 100.00% | 0pp |
| F1 | 98.77% | 99.81% | +1.05pp |
| Usable | 85.00% | 90.63% | +5.63pp |
| Bass | 100.00% | 100.00% | 0pp |
| Top / Register | 88.13% | 98.75% | +10.63pp |

既存60 MIDI Dev:

- F1: 96.26% → 97.01%
- Plain Block Exact: 93.75% → 93.75%
- sourceにないnote追加: 0

根拠: `docs/phase4.4/05-dev-results.json`

## Validation結果

専用Validation:

| Metric | Product | Shadow | Delta |
|---|---:|---:|---:|
| Contamination events | 6 | 6 | 0 |
| Melody leak | 2.54% | 2.54% | 0pp |
| Exact | 62.50% | 62.50% | 0pp |
| Recall | 79.46% | 79.46% | 0pp |
| F1 | 87.25% | 87.25% | 0pp |
| Usable | 25.00% | 39.58% | +14.58pp |
| Bass | 100.00% | 100.00% | 0pp |
| Top / Register | 87.50% | 87.50% | 0pp |

失敗したGate:

- contamination reduction 25%以上
- melody leakが改善方向
- ExactがDevと同じ改善方向

新規major failureは0、sourceにないnote追加も0だった。

根拠: `docs/phase4.4/06-validation-results.json`

## 非昇格時の製品状態

- `filterEventLocalMelodyContamination()`は製品コンポーネント、store、保存経路、Analyzerから呼ばれていない
- `defaultAnalyzerMode = "phase4-v1"`を維持
- `fileVersion = 1`を維持
- schema変更なし
- boundary / aggregate / fallback / chord label / Timeline変更なし
- MIDI、音声、`.local-evaluation`生成物のGit追跡なし

Shadow実装は診断と次期研究のため残すが、製品挙動はPhase 4.4開始前と同じである。

## Corpus IntegrityとBaseline

既存Voicing Corpus:

- 60 MIDI / 30 scenarios / 496 events / 6382 notes
- SHA一致: 60/60、byteLength一致: 60/60
- clean / stress pair: 30、split重複: 0
- Dev baseline: Exact 75.94%、Precision 96.07%、Recall 96.45%、F1 96.26%
- Dev Usable / Fallback: 67.81% / 32.19%
- Dev Bass / Top / Register: 100.00% / 82.50% / 82.50%

専用Melody Contamination Corpus:

- 32 MIDI / 16 scenarios / 256 events / 2576 notes
- split: Dev 20 files、Validation 6 files、Holdout 6 files
- SHA一致: 32/32、byteLength一致: 32/32
- Gold track role / per-note role / excluded distractor / register情報: 全件あり
- split重複: 0
- 専用Dev Product baseline: Exact 87.50%、Precision 97.56%、Recall 100.00%、F1 98.77%
- 専用Dev Usable / Fallback: 85.00% / 15.00%
- 専用Dev Bass / Top / Register: 100.00% / 88.13% / 88.13%

## 失敗機序とOracle

専用Devの20汚染イベント:

- M1 same-track role mixing: 1
- M2 track-role misclassification: 2
- M3 downstream retention: 17

専用Validationの6汚染イベント:

- M1: 0
- M2: 2
- M3: 4

M3が両splitで最大failure clusterだった。

Oracle A+はGold voicingを直接返さず、Gold per-note roleで入力noteを選んだ後に現行抽出器を通した。専用DevではA+がExact 100%、汚染0、ValidationではExact 66.67%、Precision 100%、Recall 78.57%、F1 88.00%、汚染0だった。A+−AはDev Exact +11.88pp、Validation Exact +4.17ppで、局所note選択が有効な介入候補だと確認した。

選ばなかった介入:

- role evidenceだけの補正: M3を直接解消しない
- melody Voiceの無条件除外: bass誤分類や同一track和音を壊す危険がある
- Analyzer / boundary / aggregateの再調整: Phase 4.4の対象外

初期ShadowはDev汚染を20件から11件へ減らした。固定gridとDevのみの調整後は20件から3件へ減ったが、Validationへ一般化しなかった。

## 回帰監視

既存60 MIDI Dev:

- 全体F1: 96.26% → 97.01%
- Plain block Exact: 93.75% → 93.75%
- Rootless Exact: 93.75% → 93.75%
- Arpeggio Exact: 37.50% → 37.50%
- sourceにないnote追加: 0

Chord label列とTimelineは、フィルタを製品Analyzerへ接続していないため完全一致である。

## PR Stack

- [#235 P4.4-00](https://github.com/Takuyakou/loop-vault/pull/235)
- [#236 P4.4-01](https://github.com/Takuyakou/loop-vault/pull/236)
- [#237 P4.4-02](https://github.com/Takuyakou/loop-vault/pull/237)
- [#238 P4.4-03](https://github.com/Takuyakou/loop-vault/pull/238)
- [#239 P4.4-04](https://github.com/Takuyakou/loop-vault/pull/239)
- [#240 P4.4-05](https://github.com/Takuyakou/loop-vault/pull/240)
- [#241 P4.4-06](https://github.com/Takuyakou/loop-vault/pull/241)
- P4.4-07はValidation Gate未達によりPR・評価とも未実施
- [#242 P4.4-08](https://github.com/Takuyakou/loop-vault/pull/242)
- [#243 P4.4-UI](https://github.com/Takuyakou/loop-vault/pull/243)

Commit:

- `a01c021` P4.4-00
- `f041513` P4.4-01
- `8e88219` P4.4-02
- `9619f63` P4.4-03
- `03e698b` P4.4-04
- `eb4a4f1` P4.4-05
- `add6424` P4.4-06
- `199f822` P4.4-08
- `ec36b9a` P4.4-UI

## Voicing Source Chip

Core精度改善と独立したP4.4-UI PRで実装した。

表示:

- `元MIDI`: 互換性のある`midi-extracted`かつ同時押鍵Voicingで、検証済みまたは自動利用confidence以上
- `自動生成`: source voicingがない、またはコード編集でstale
- `要確認`: aggregated note set、低confidence、不正データ、元MIDI以外のsource

対象:

- Capture Preview: 自動候補カードと手動範囲Draft
- Progression Detail: 選択コードのVoicingパネル
- Chord Dojo: 現在練習中のコード

判定は`src/domain/voicing/voicingSourceStatus.ts`へ集約し、全画面が同じ結果を使う。チップは色だけに依存せず、アイコン・テキスト・`aria-label`・理由tooltipを持つ。保存schemaとVoicing抽出ロジックは変更していない。

## 最終検証

- `npm run lint`: PASS
- `npx tsc --noEmit`: PASS
- Vitest: 197 files / 1660 tests PASS
- `cargo test`: 24 tests PASS
- `npm run build`: PASS
- `npm run tauri build`: PASS
- `git diff --check`: PASS
- default analyzer: `phase4-v1`
- `fileVersion`: 1
- private MIDI: Git追跡0件
- `.local-evaluation`: Git追跡0件
- 既知警告: Viteの500 kB超chunk warningのみ

生成物:

- `src-tauri/target/release/loop-vault.exe`
- `src-tauri/target/release/bundle/msi/Loop Vault_0.1.0_x64_en-US.msi`
- `src-tauri/target/release/bundle/nsis/Loop Vault_0.1.0_x64-setup.exe`

## Rollback

Rollback:

- 製品経路は未接続なので、通常利用時の機能rollbackは不要
- Shadow研究コードを撤去する場合はP4.4-04以降のstackを取り込まない
- 評価結果を残して実装だけ戻す場合は`src/domain/voicing/melodyContaminationFilter.ts`のexportとテストをrevertする

## 残課題

Validationの6汚染イベントでは、固定フィルタがnoteを除外しても抽出結果の汚染noteが変わらなかった。次期検討ではHoldoutを開かず、新しいDevデータまたは失敗機序の追加診断から、抽出器が区間内noteを選ぶ過程とfilter後のstatus判定を分けて調べる必要がある。

既存のValidation結果を見て今回の閾値を変更することはしない。

最終PR: [#243 P4.4-UI](https://github.com/Takuyakou/loop-vault/pull/243)

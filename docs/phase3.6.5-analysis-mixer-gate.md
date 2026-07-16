# Loop Vault Phase 3.6.5 Stage C 実装判断ゲート

- 判定日: 2026-07-16
- 対象: Stage C — Analysis Mixer（解析ミキサー）
- 判定: **Phase 3.6.5では実装せず、Phase 3.6.5.1へ延期する**
- 既定Analyzer: `legacy`を維持する
- 根拠仕様: `docs/phase3.6.5-voice-aware-midi-detection-plan.md` §13、§15、§21

## 1. 判定の要約

Stage Cは、Stage A/Bの結果を見て必要性と効果が確認できた場合だけ実装する条件付きStageである。現時点では、clean syntheticで`voice-aware-rerank-v1`の小幅な改善は確認できる一方、dirty strict guardは失敗している。さらに、Stage Cの価値を直接測る実MIDI、Voice選択ablation、Role誤分類、手動Voice選択時の修正コストがいずれも未計測である。

したがって、解析ミキサーを今実装しても、どのVoice操作が必要か、操作が精度と修正時間を改善するか、複雑なUIに見合う利用需要があるかを実測で説明できない。実装を先行すると、解析品質の問題をUI操作へ転嫁し、未検証の非同期再解析・dirty state・キャッシュ管理まで同時に増やすことになる。

この判断はStage Cを不要と断定するものではない。再開条件を事前に固定し、必要な測定が揃った時点でPhase 3.6.5.1として再判定する。

## 2. 仕様上の4条件と実測

計画§13.1は、解析ミキサーを実装する条件として次の4項目を挙げている。

| 実装条件 | 現在の実測 | 判定 |
|---|---|---|
| 実MIDIで自動Role判定の誤りが頻発 | Real MIDI Gold / Silver / Bronze / Unlabeledはすべて0件。Role正解ラベルと誤分類率も0件。`all_instruments.mid`は不在 | **判定不能** |
| Voice選択で候補品質が明確に改善 | `AnalysisInput` APIはあるが、auto / preset / manual mask / role overrideの比較ablationは0件 | **未確認** |
| 修正コストが手動Voice選択で減る | 操作補正コスト自体は測定済みだが、Voice選択あり・なしのpaired比較は0件 | **未確認** |
| ユーザーが楽器を選んで解析したい用途を持つ | 実利用セッション、操作観察、明示的な用途記録のartifactがない | **未確認** |

4条件のうち、満たしたと実証できる条件は0件である。計画§13.1の「条件を満たさない場合はPhase 3.6.5.1へ延期可能」に従い、Stage Cを延期する。

## 3. 現在ある評価結果

### 3.1 実MIDI評価

`artifacts/real-midi-evaluation/report.json`の件数は次のとおりである。

| Dataset | 件数 | Stage C判断への利用 |
|---|---:|---|
| Gold | 0 | 正解精度・非退行を評価不能 |
| Silver | 0 | 保存ラベルとの一致傾向を評価不能 |
| Bronze | 0 | disagreement・review需要を評価不能 |
| Unlabeled | 0 | 実入力でのRole分布・性能・操作需要を観測不能 |

`docs/phase3.6.5-audit.md`でも、`all_instruments.mid`がrepositoryと評価corpusの双方に存在せず、指定診断はblocked / 未達と報告されている。`artifacts/phase3.6.5-dirty-baseline/report.md`にも同ファイル不在とReal Gold 0件が記録されている。

### 3.2 clean / dirty accuracy

`artifacts/phase3.6.5-voice-aware/report.md`および`artifacts/phase3.6.5-candidate-diversity/report.md`のclean 100件では、legacyに対して`voice-aware-rerank-v1`が次の改善を示した。

| 指標 | legacy | voice-aware | 差 |
|---|---:|---:|---:|
| Root@1 | 57.76% | 58.19% | +0.43pp |
| Quality@1 | 60.83% | 61.37% | +0.54pp |
| Exact@1 | 13.69% | 13.69% | +0.00pp |
| Exact@3（B1後） | 19.67% | 21.23% | +1.56pp |

clean guardと決定性はPASSしている。しかしdirty 1,100件のstrict guardは**FAILED**である。最終レポートでは`type0`、`drums`、`melody`、`metadata-missing`、`sustain`、`jitter`、`same-channel-mixed`がmixed、`combined`がregressedであり、計画§15.3のdirty改善条件を満たしていない。

cleanの小幅改善だけを根拠に、ユーザー操作を増やすStage Cを実装することはできない。

### 3.3 操作補正コスト

`artifacts/phase3.6.5-correction-cost/report.md`の平均操作補正コストは次のとおりである。

| Dataset | legacy | voice-aware | 差（voice-aware - legacy） |
|---|---:|---:|---:|
| clean | 2.7457 | 2.7060 | -0.0397（改善） |
| same-channel-mixed | 2.8965 | 2.8459 | -0.0506（改善） |
| sustain | 2.7457 | 2.7864 | +0.0407（退行） |
| combined | 2.8412 | 2.9064 | +0.0652（退行） |

これはAnalyzer間の比較であり、Stage Cの「手動Voice選択あり・なし」の比較ではない。Voice選択によって補正コストが下がるという主張には使えない。カテゴリ間でも改善と退行が分かれており、B2 reportのstrict guardはFAILEDである。

### 3.4 Stage C固有の不足データ

- Voice選択 / preset / role override ablation: **0件**
- 自動Roleの正解ラベル付きVoice: **0件**
- Role誤分類率: **未計測**
- 手動Voice選択あり・なしのpaired補正コスト: **0件**
- 実利用でVoice選択が必要だったセッション: **0件記録**
- `all_instruments.mid`による3分MIDI性能計測: **未実施（入力不在）**

## 4. 今回実装しないもの

Phase 3.6.5では、次を実装しない。

- collapsed Voice summary
- Voice strip、Mute / Solo、role override UI
- `auto` / `harmony-and-bass` / `exclude-melody` / `all` preset UI
- 200ms debounceによる即時再解析
- request sequence / latest-only / stale result discard
- WorkerまたはTauri commandへの解析移送
- per-Voice cumulative profile cache
- Voice変更時のdirty guardと編集state破棄フロー

未実装の理由は工数ではなく、4条件を判定するデータがなく、dirty回帰も残っているためである。UIだけ先に追加しても解析精度の改善は保証されず、同期解析をそのまま再実行すればUI freezeの危険も増える。

`src/domain/midi/analysis.ts`の`defaultAnalyzerMode`は引き続き`legacy`とする。計画§15.4の既定切替条件のうち、dirty改善、Real Gold非退行、補正コスト低下、3分MIDIのUI非停止、manual QAが満たされていないためである。

## 5. すでにある内部準備

Stage CのUIは未実装だが、Stage A2/A4で解析入力の内部APIは準備済みである。

```ts
export interface AnalysisInput {
  voices: Voice[];
  enabledVoiceIds: string[];
  roleOverrides: Record<string, VoiceRole>;
}

export type VoiceSelectionPreset = "auto" | "harmony-and-bass" | "exclude-melody" | "all";
```

根拠: `src/domain/midi/types.ts`

`src/domain/midi/voiceAwareReranker.ts`は`AnalysisInput`を受け取り、enabled Voiceとrole overrideをVoice-aware evidenceへ反映できる。これはUIを作らずにCLIまたはテストharnessからStage C固有ablationを行うための入口として再利用できる。

注意点:

- APIが存在することは、Stage Cの効果が確認済みという意味ではない。
- `AnalysisInput`をセッション一時状態として扱い、`data.json`へ保存しない契約は計画§13.6のまま維持する。
- 現在のZustand/UIにはStage Cの再解析ジョブ管理、sequence、cache、dirty guardは実装されていない。

## 6. Phase 3.6.5.1の再開条件

以下は今後の結果を見て緩めない、事前固定の最低条件とする。すべて満たした場合にのみStage C実装へ進む。

### 6.1 最低sample

1. **実MIDI 30件以上**を収集する。
   - Gold 20件以上（正解コードと区間を人手確認）
   - Silver / Bronze / Unlabeled 合計10件以上
   - うちType 0または複数楽器混在10件以上、same-channel混在5件以上、sustainを含む5件以上
   - 同一曲の派生書き出しは1件として数え、最低3つの異なる制作元または生成条件を含める
2. **Role正解ラベル付きVoice 200件以上**を用意する。
   - `bass`、`harmony`、`pad`、`melody`を各25件以上含める
   - percussionは別集計し、channel 9 hard ruleの確認に使う
3. **Voice選択paired ablationを300区間以上**で実行する。
   - 同じMIDI・同じ境界でautoとmanual selection / role overrideを比較する
   - manual側は結果を見て都合よく選ばず、Voice role正解ラベルから機械的に生成する
4. **利用需要を10回以上の実ワークフロー**で観察する。
   - 少なくとも10 MIDIを実際の採集フローで処理する
   - 「候補が悪いので楽器を除外・role修正したい」という操作意図を各セッションで記録する

### 6.2 合格閾値

4条件を次の数値で判定する。

| 条件 | 合格閾値 |
|---|---|
| 自動Role誤りが頻発 | 正解ラベル付き非percussion Voiceの誤分類率が**15%以上**、またはRole誤りが原因でprimary候補を誤る実MIDIが**20%以上** |
| Voice選択で候補品質が明確に改善 | paired ablationでRoot@1またはQuality@1が**2.0pp以上改善**し、もう一方とBoundary Precision / Recallが退行しない。Exact@3も退行しない |
| 手動Voice選択で修正コストが減る | 平均操作補正コストが**0.10以上低下**し、MIDI単位paired bootstrap 95%信頼区間の上限が0未満 |
| ユーザー用途がある | 10実ワークフロー中**3回以上**でVoice除外またはrole overrideの明示需要が記録され、そのうち**2回以上**で候補または補正コストが実際に改善 |

加えて、計画§15.3のhard guardを満たすことを必須とする。

- clean: Root@1 / Quality@1 / Boundary / correction costが非退行
- dirty: strict guard PASS。少なくとも`drums`、`type0`、`same-channel-mixed`、`combined`でregressed / mixedを残さない
- Real Gold: legacyに対してRoot@1 / Quality@1 / Exact@1 / Boundary / operation correction costが非退行
- 決定性: 同一MIDI bytesと同一`AnalysisInput`でdeep equal

sample不足はPASSとして扱わず、`not-evaluable`とする。

### 6.3 性能ゲート

`all_instruments.mid`そのもの、または次を満たす代替fixtureを用意してから測定する。

- 3分以上
- Type 0または複数Voice混在
- bass / harmony / pad / melody / percussionを含む
- Program Change、CC64 sustain、同一channel混在のうち2項目以上を含む

対象環境で、初回解析とVoice変更後再解析の双方について以下を満たすこと。

- 解析完了1秒以内
- main threadの50ms超long taskを発生させない
- stale requestの結果がUIへ適用されない

## 7. 将来の実装境界

Stage Cを再開する場合も、既存の永続化とdomain分離を変えない。

### 7.1 状態と永続化

- `AnalysisInput`、選択preset、request sequence、解析中状態はZustandの一時analysis stateに置く
- `currentVault()`およびrepository保存対象へ追加しない
- `data.json`、backup、fileVersionを変更しない
- MIDI bytes、parsed SMF、Voice別prefix profileはrepositoryへ保存しない

### 7.2 非同期再解析

- 解析はWeb Workerを第一候補とし、Tauri commandはブラウザ互換性または性能要件を満たせない場合のみ検討する
- UI入力後200ms debounce
- requestごとに単調増加する`sequence`を付与
- result / errorの双方で現在sequenceと一致しない応答を破棄
- 最新requestだけをanalysis stateへ反映
- 新規MIDI、clear、preset変更でもsequenceを進め、旧requestを無効化
- 再解析開始前に再生を停止し、dirty guard承認後だけ編集stateを破棄する

### 7.3 cache

- raw MIDI fingerprintとanalyzerVersionをsession cache keyに含める
- parse済み`TimedNote`、`Voice`、per-Voice cumulative profileを再利用する
- role overrideではparseをやり直さず、必要なevidence合成とrerankだけを再計算する
- cacheはセッション限定かつ上限付きとし、別MIDIへ切り替えた際に解放可能にする

### 7.4 UI

- 初期表示はcollapsed summaryのみ
- Voice数、推定Role、低confidence、除外数を要約する
- mixerは明示操作で展開し、Mute / Solo、preset、role overrideを提供する
- 変更で解析結果が変わること、未保存編集が破棄されることをdirty guardで明示する
- analyzerの内部詳細やscore dumpを通常UIへ常時表示しない

## 8. PR stackと根拠

Phase 3.6.5の実装は次の積み上げPRに分離されている。Stage C gateはこのstack上のStage A/B実装とartifactを参照する。

| PR | 内容 | 主な根拠 |
|---|---|---|
| [#85](https://github.com/Takuyakou/loop-vault/pull/85) | Voice解析基盤の監査 | `docs/phase3.6.5-audit.md` |
| [#86](https://github.com/Takuyakou/loop-vault/pull/86) | Voiceモデルとraw SMF解析 | `src/domain/midi/rawSmf.ts`, `src/domain/midi/voices.ts` |
| [#87](https://github.com/Takuyakou/loop-vault/pull/87) | Voice Role推定とevidence profile | `src/domain/midi/voiceRoles.ts`, `src/domain/midi/voiceProfiles.ts` |
| [#88](https://github.com/Takuyakou/loop-vault/pull/88) | 決定的dirty MIDI corpus | `src/domain/midi/evaluation/degrade.ts`, `artifacts/phase3.6.5-dirty-baseline/` |
| [#89](https://github.com/Takuyakou/loop-vault/pull/89) | Voice-aware rerankerと評価guard | `src/domain/midi/voiceAwareReranker.ts`, `artifacts/phase3.6.5-voice-aware/` |
| [#90](https://github.com/Takuyakou/loop-vault/pull/90) | 候補多様性 | `src/domain/midi/candidateDiversity.ts`, `artifacts/phase3.6.5-candidate-diversity/` |
| [#91](https://github.com/Takuyakou/loop-vault/pull/91) | 操作ベース補正コスト | `src/domain/midi/correctionCost.ts`, `artifacts/phase3.6.5-correction-cost/` |
| [#92](https://github.com/Takuyakou/loop-vault/pull/92) | コード修正の安全な伝播 | `src/domain/progressionEditing/similarSegments.ts` |

## 9. 最終判断

Stage Cの実装ゲートは**未通過**である。

- clean改善だけでは、解析ミキサーの必要性を証明できない
- dirty strict guardがFAILEDで、`combined`はregressedしている
- 実MIDIは全tier 0件で、Role誤分類と実運用性能を測れない
- Voice選択ablationと手動選択の補正コスト比較が0件である
- ユーザーのVoice選択需要を示す観察記録がない

よってPhase 3.6.5ではStage Cを実装せず、`defaultAnalyzerMode = "legacy"`を維持する。Phase 3.6.5.1では、本書§6のsample・閾値を測定前に固定したまま評価し、全条件を満たした場合のみ§7の境界で実装を開始する。

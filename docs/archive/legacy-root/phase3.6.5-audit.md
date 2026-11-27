# Loop Vault Phase 3.6.5 Stage 0 Audit

監査日: 2026-07-16
監査対象: `master` (`d136287`)
対象範囲: MIDI parser / channel / Program Change / Voice・track構造 / role推定 / scoring・reranker / 評価データ / Phase 3.6.3 Editor / Phase 3.6.4 Capture UI

## 1. 結論

現行実装には、Phase 3.6までのtrack単位hybrid解析、Phase 3.6.1のlegacy境界固定reranker、Phase 3.6.2の評価フライホイール、Phase 3.6.3の進行編集、Phase 3.6.4のCapture UIが存在する。一方、Phase 3.6.5が前提とするVoice単位 (`trackIndex x channel`) の解析、Note On時点のProgram Change、Voice別role evidence、dirty corpus、候補多様化、修正伝播、解析ミキサーは未実装である。

中心的な問題は、`@tonejs/midi`がSMF読込時に元trackを現在programとchannelの組で再構成する一方、公開`Note`がchannelを保持しないことである。現行parserの`track.notes[0].channel`と`note.channel`参照は`undefined`になり、app側の`trackIndex`は元SMF trackではなく再構成後のindexになる。元track identityとProgram Change時系列を失った後では、計画書どおりのVoice (`source trackIndex x channel`) を正しく作れない。raw SMF event adapterまたは同等のsource-identity保持戦略の確定がStage A1のblockerである (`node_modules/@tonejs/midi/src/Midi.ts:55-78,180-227`, `node_modules/@tonejs/midi/src/Note.ts:57-98`, `src/domain/midi/parser.ts:14-51`)。

| 監査項目 | 現状 | 判定 |
|---|---|---|
| channel保持 | 型はあるが、公開`Note`にchannelがなく現行代入値は`undefined` | 実質未実装 |
| Program Change | `@tonejs/midi`がprogram/channel別trackへ分割後、代表`instrument.number`のみ参照。時系列・明示/既定の区別なし | 未実装 |
| Voice (`trackIndex x channel`) | 元track identityが失われ、型・集計・APIもない | Stage A1 blocker |
| role推定 | track単位の名前・代表program・実測特徴によるhard classify | 実装済みだがPhase 3.6.5要件とは相違 |
| percussion除外 | channel参照が`undefined`のためchannel 9 hard ruleが機能せず、track名頼み | 要修正 |
| Top-K scoring | 内部Top-8、決定的sortあり | 実装済み |
| legacy境界reranker | legacy候補保持、閾値を全て満たす場合のみ置換 | 実装済み |
| dirty synthetic corpus | 生成CLI・カテゴリなし | 未実装 |
| `all_instruments.mid` | repositoryおよび指定評価corpusに存在しない | 再現blocked / Stage 0未達 |
| real MIDI評価 | 基盤は存在するが現行artifactはGold/Silver/Bronzeすべて0件 | 基盤のみ |
| Progression Editor | original/current、alternatives、構造編集、Undo/Redo、修正ログあり | 実装済み |
| Capture UI | file summary、minimap、候補、timeline、editor、保存導線あり | 実装済み |
| Analysis Mixer | state/API/UIなし | 未実装 |

## 2. Parser / channel / Program Change

### 2.1 実際のデータ経路

`parseMidi(bytes)`は`@tonejs/midi`でSMFを読み、同ライブラリが再構成した`Track[]`を`MidiSongData`へ変換する (`src/domain/midi/parser.ts:1-70`)。

- `@tonejs/midi`はraw eventへabsolute timeを付与した後、元track内のeventを現在programとchannelの組で新しいtrackへ分ける (`node_modules/@tonejs/midi/src/Midi.ts:55-78,180-227`)。
- したがって`midi.tracks`のindexは元SMF track indexと同一とは限らず、1つの元trackが複数の再構成trackへ分割される。channelを持たないtrack name等のmeta eventはdefault側にだけ残り得る (`node_modules/@tonejs/midi/src/Midi.ts:188-223`)。
- `@tonejs/midi`の`Track`には`channel`があるが、公開`Note`のfieldはmidi、velocity、noteOffVelocity、ticks、durationTicksでありchannelはない (`node_modules/@tonejs/midi/src/Track.ts:43-46,78-115`, `node_modules/@tonejs/midi/src/Note.ts:57-98`)。
- 現行parserは利用可能な`track.channel`ではなく`track.notes[0].channel`と各`note.channel`を型assertionで読んでいるため、どちらも`undefined`になる (`src/domain/midi/parser.ts:14-16,42-51`)。
- `TimedNote`には`channel?`が定義されているが、現行`@tonejs/midi`経路では値が入らない (`src/domain/midi/types.ts:6-13`)。
- `MidiTrackInfo.program`は再構成trackの`track.instrument.number`の1値だけである。ライブラリ側のdefaultは0で、現行modelはProgram 0明示とProgram Changeなしを区別できない (`node_modules/@tonejs/midi/src/Instrument.ts:19-41`, `src/domain/midi/parser.ts:18,25-31`)。
- Program Changeイベント列、event tick、元track index、明示Program Changeの有無は`MidiSongData`に存在しない (`src/domain/midi/types.ts:15-38`)。
- `normalizeNotes()`は再構成trackの代表programを全noteへ付けるだけで、元SMF上のProgram chronologyを復元できない (`src/domain/midi/normalize.ts:13-35`)。

### 2.2 Type 0 / Program Changeで確認した具体的な問題

1. `@tonejs/midi`の再構成により、Type 0の1 source trackはprogram/channelごとの複数trackへ分かれる。app側にはその全てを同じsource trackへ戻す識別子がない (`node_modules/@tonejs/midi/src/Midi.ts:180-227`, `src/domain/midi/types.ts:15-38`)。
2. 現行`isPercussion`のchannelは`track.notes[0].channel`から読むため常に`undefined`である。channel 9 hard ruleは実行されず、track nameからpercussionと推定できた再構成trackだけが除外される (`src/domain/midi/parser.ts:14-23,38-40`)。
3. 各`note.channel`も`undefined`なので、`normalizeNotes()`の`note.channel === 9`も機能しない。track名にdrum hintがないchannel 9 noteはweighted profileへ混入し得る (`src/domain/midi/parser.ts:42-51`, `src/domain/midi/normalize.ts:31`, `src/domain/midi/profiles.ts:31-43`)。
4. **Note On/Off跨ぎの潜在的欠落**: Program Change前にNote On、変更後に対応Note Offがある場合、`splitTracks()`は両eventを異なるprogram/channel trackへ振り分ける。`Track`は同一再構成track内だけでNote Onに対応するNote Offを探し、見つからなければNoteを追加しないため、そのnoteが失われる可能性がある (`node_modules/@tonejs/midi/src/Midi.ts:195-223`, `node_modules/@tonejs/midi/src/Track.ts:82-116`)。
5. sustain CCも再構成trackへ分配された後、app modelでは再構成`trackIndex`だけを保持する。元track/channel/program chronologyへ戻す情報はない (`src/domain/midi/parser.ts:33-36`, `src/domain/midi/types.ts:23-38`)。

### 2.3 テストの実態

現行MIDIテストにはtrack名・再構成後trackIndexベースのケースはあるが、raw source track identity、Type 0、同一source track複数channel、channel 9混在、Program Change時系列、Program 0明示/未指定、Program Changeを跨ぐNote On/Offを検証するテストはない (`src/domain/midi/analysis.test.ts`, `src/domain/midi/trackRoles.test.ts`, `src/domain/midi/normalize.test.ts`)。

## 3. Voice / track roleの実態

### 3.1 Voiceモデル

`Voice`、`VoiceRole`、`VoiceRoleEvidence`、`AnalysisInput`、`VoiceSelectionPreset`に相当する型は現行コードにない。解析のキーは一貫して`trackIndex`だが、この値は`@tonejs/midi`再構成後のtrack indexであり、元SMF track identityではない。

- `TrackRole`は`bass | harmony | mixed | melody | percussion` (`src/domain/midi/types.ts:4`)。
- hybrid側は別の`HybridTrackRole`を持ち、`drums | bass | chord | pad | arpeggio | melody | lead | counter | unknown`である (`src/domain/midi/trackRoles.ts:5`)。
- role profileは`Map<number, TrackRoleProfile>`で、keyはtrackIndex (`src/domain/midi/trackRoles.ts:50-64`)。
- weighted profileも`roles.get(note.trackIndex)`を使う (`src/domain/midi/profiles.ts:25-43`)。

### 3.2 role推定

`inferTrackRoleProfiles()`はtrackごとにnote count、平均pitch、平均duration、pitch range、notes/bar、onset polyphony、低域/高域比率、反復pitch比率を計算する (`src/domain/midi/trackRoles.ts:7-48`)。

分類はweighted evidence合成ではなく、if文の先勝ちである (`src/domain/midi/trackRoles.ts:67-77`)。

1. percussion/name
2. bass name / GM 32-39 / low-register
3. pad
4. arpeggio
5. chord
6. lead
7. melody
8. counter
9. unknown

GM program evidenceはBassの32-39だけで、Programの明示性、track name evidence、measured evidenceを個別scoreとして保持しない (`src/domain/midi/trackRoles.ts:67-101`)。再構成時にchannel/programが分割されてもtrack name meta eventは全分割先へ複製されないため、name evidenceも元trackと同等には残らない。confidenceは理由の件数から`min(0.95, 0.55 + reasons.length * 0.1)`で算出され、証拠ごとのconfidenceではない (`src/domain/midi/trackRoles.ts:54-63`)。

## 4. Profile / scoring / reranker

### 4.1 現行profile

`WeightedPitchProfile`は`qualityPcs`、`rootPcs`、`bassPcs`、`topPcs`を持つ (`src/domain/midi/profiles.ts:8-14`)。ただしVoice別profileではなく、track roleの`qualityWeight`と`rootWeight`をnoteへ適用して全体へ加算する (`src/domain/midi/profiles.ts:25-47`)。Phase 3.6.5の`root / bass / quality / tension`別Voice evidenceとは異なり、独立した`tensionEvidence`はない。

prefix-sum相当の`CumulativePitchFeatures`は既にあり再利用可能だが、現在は全noteを集約した境界別テーブルで、Voice別cacheではない (`src/domain/midi/profiles.ts:16-23,49-80`)。

### 4.2 候補scoring

`scoreChordCandidates(profile, key?, topK = 8)`は12 root x 21 templatesを採点し、`totalScore`とcanonical chordで決定的にsortして上位8件を返す (`src/domain/midi/candidates.ts:34-57`)。score breakdownにはcore/extension coverage、bass/slash/key compatibility、foreign/missing/ambiguity penalty、evidenceがある (`src/domain/midi/candidates.ts:17-30,68-107`)。

現状は純score順であり、異root、同root別quality、bass仮説、equivalent pitch-setを枠として選ぶ`selectDiverseAlternatives()`はない。UIへ渡るtimeline alternativeは多くの経路で最大2件である (`src/domain/midi/legacyBoundaryReranker.ts:110-124`, `src/domain/midi/hybrid.ts:48-59`)。

### 4.3 legacy-boundary-rerank

`legacy-boundary-rerank-v1`は次の構成で実装済みである (`src/domain/midi/legacyBoundaryReranker.ts`)。

- legacy timelineを先に生成し、そのbar/beat/durationを境界として固定する (`src/domain/midi/legacyBoundaryReranker.ts:74-95`)。
- legacy chordを必ず候補集合の先頭へ加えて重複除去する (`src/domain/midi/legacyBoundaryReranker.ts:45-52,128-135`)。
- score lead、core coverage、root evidence、foreign penalty、missing-core penaltyの全条件を満たす場合だけ置換する (`src/domain/midi/legacyBoundaryReranker.ts:53-71`)。
- 既定解析modeは現在も`legacy`である (`src/domain/midi/analysis.ts:8-19`)。

新mode`voice-aware-rerank-v1`は`MidiAnalyzerMode`にもdispatcherにも存在しない (`src/domain/midi/types.ts:58`, `src/domain/midi/analysis.ts:13-20`)。

## 5. 評価データと再現可能性

### 5.1 synthetic corpus

`docs/loop-vault-evaluation-corpus/manifest.json`にはChord Drip生成の決定的な100 MIDIケースがあり、manifestの`files`も100件である。recipeはpreset、12 key、major/minor、4/8/16 bars、voicing、patternを組み合わせるが、dirty degradation分類はない (`docs/loop-vault-evaluation-corpus/manifest.json`)。

現行artifact (`artifacts/midi-dataset-evaluation/report.json`) は次を記録している。

- synthetic labeled: 100件
- legacy: Root 0.577586 / Quality 0.608297 / Exact 0.136853 / Top-3 0.196659 / Correction 918
- legacy-boundary-rerank: Root 0.579741 / Quality 0.614763 / Exact 0.137931 / Top-3 0.215517 / Correction 917
- real-world unlabeled: `not-provided`, 0件

`npm run eval:degrade`は`package.json`に存在せず、Type 0 merge、drums/melody overlay、metadata removal、jitter等を作る実装もない (`package.json:scripts`)。

### 5.2 real MIDI

Gold / Silver / Bronzeを分離する型・schema・CLIは実装済みである (`src/domain/midi/realEvaluation/types.ts`, `src/domain/midi/realEvaluation/schema.ts`, `scripts/evaluate-real-midi.ts`)。ただし現行artifact (`artifacts/real-midi-evaluation/report.json`) はGold 0 / Silver 0 / Bronze 0 / Unlabeled 0である。ローカルevaluation領域にも`promoted-corrections.jsonl`と`real-midi-cases.jsonl`は0行、source indexは空配列であり、Stage Cの実装判断に使える実MIDI測定値はない。

### 5.3 `all_instruments.mid`

`all_instruments.mid`はrepository全体および`docs/loop-vault-evaluation-corpus`に存在しない。したがって計画書Stage 0の`all_instruments.mid`診断再現は**blockedかつ未達**であり、完了扱いにできない。現状から確認できるのは、同等のType 0混在入力で問題になるコード経路だけである。

## 6. Phase 3.6.3 Progression Editorとの統合点

Phase 3.6.3の編集workspaceは実装済みで、Phase 3.6.5 B/Cから再利用できる。

- `EditableChordSlot`は`originalChord`、`currentChord`、alternatives、confidence、warnings、editSourceを保持する (`src/domain/progressionEditing/types.ts:17-31`)。
- `EditableProgression`はslot一覧、選択slot、history、historyIndexを保持する (`src/domain/progressionEditing/types.ts:33-39`)。
- edit sourceはmanual label、alternative、structure editor、split/merge/delete/resetを区別する (`src/domain/progressionEditing/types.ts:8-15`)。
- candidateからoriginal/currentを生成し、保存用candidateへ反映する純関数がある (`src/domain/progressionEditing/editableProgression.ts:12-51`)。
- Capture上でUndo/Redo、reset、split、merge、delete、alternative適用、構造編集、試聴が接続されている (`src/views/CaptureView.tsx:945-1238`)。
- 保存時のみ、対象edit sourceを`manual-label | alternative-selection | structure-editor`へ変換してcorrection eventを生成する (`src/domain/midi/feedback.ts:5-71`, `src/views/CaptureView.tsx:347-425`)。

制約:

- 現行correction eventにはenabled Voice set、role profile、propagation shown/accepted/rejected、操作数、経過時間がない (`src/domain/midi/feedback.ts:5-23`)。
- `buildCorrectionEvents()`はoriginal/edited配列をindexで対応させるため、split/merge/deleteは対象外として除外される。B2の最小correction costを直接復元できるログではない (`src/domain/midi/feedback.ts:35-60`)。
- **既存schema不整合**: producerの`MidiChordCorrectionEvent.editMethod`は`structure-editor`を生成できるが、real-evaluation側`midiChordCorrectionEventSchema`は`manual-label | alternative-selection`しか受理しない。structure editor由来eventはpromotion CLIでschema validationから脱落する (`src/domain/midi/feedback.ts:5-23,65-71`, `src/domain/midi/realEvaluation/schema.ts:94-114`, `scripts/promote-midi-corrections.ts:67`)。
- B3の類似区間提案・一括適用operationは存在しない。

## 7. Phase 3.6.4 Capture UIとの統合点

Captureは`AnalysisState { status, result?, error? }`を受け、同期`analyzeMidiBytes()`を呼ぶ (`src/store/vaultStore.ts:59-65,128-132,513-528`)。解析結果はstoreの一時stateであり、`currentVault()`にはsettingsとideasだけが入るため、解析途中stateは`data.json`へ保存されない (`src/store/vaultStore.ts:725-731`)。

結果画面の現在順序は次の通りである。

1. file summary (`src/views/CaptureView.tsx:496-523`)
2. song minimap (`src/views/CaptureView.tsx:525-538`)
3. candidate blocksとInspector (`src/views/CaptureView.tsx:540-610,945-1238`)

Phase 3.6.5のcollapsed Voice summaryはminimapとcandidate blocksの間へ置くのが既存レイアウトと計画書の双方に合う。共通Modal、dirty candidate tracking、未保存編集の選択ガードは既にあるため再解析確認に再利用できる (`src/components/Modal.tsx`, `src/views/CaptureView.tsx:117-123`)。

現行state/APIには以下がない。

- `AnalysisInput`
- parsed notes / Voices / per-Voice cache
- enabledVoiceIds / roleOverrides / preset
- request sequence / stale result discard
- reanalysis action / debounce
- analysis Voice summary / mixer UI

解析はstore action内で同期実行されるため、重いVoice再解析を追加するとmain threadをblockする可能性がある (`src/store/vaultStore.ts:513-524`)。

## 8. Stage別の具体的な実装先

以下は現行責務に沿った予定配置であり、Stage 0では作成しない。

| Stage | 予定ファイル | 既存変更点 |
|---|---|---|
| A1 | `src/domain/midi/rawSmf.ts`, `src/domain/midi/voices.ts`と各test | raw source track/channel/program chronologyを保持するadapterを先に確定し、`types.ts`へVoice型を追加 |
| A2 | `src/domain/midi/gmRoles.ts`, `voiceRoles.ts`, `voiceProfiles.ts`と各test | `profiles.ts`のprefix-sumをVoice別に再利用 |
| A3 | `src/domain/midi/evaluation/degrade.ts`, `degrade.test.ts`, `scripts/degrade-midi-corpus.ts` | `package.json`へ`eval:degrade`、clean/dirty別artifact |
| A4 | `src/domain/midi/voiceAwareReranker.ts`とtest | `types.ts`のmode、`analysis.ts` dispatcher、legacy境界固定rerank |
| B1 | `src/domain/midi/candidateDiversity.ts`とtest | `candidates.ts`の内部Top-8を入力に最大5件選択 |
| B2 | `src/domain/midi/evaluation/correctionCost.ts`とtest | `feedback.ts`を後方互換のまま追加event/schemaで補強 |
| B3 | `src/domain/progressionEditing/correctionPropagation.ts`とtest | `src/components/progression-editing/ChordInspector.tsx`へcollapsed提案、一括操作を単一history entry化 |
| C | `src/components/analysis-mixer/AnalysisVoiceSummary.tsx`, `AnalysisMixer.tsx` | `vaultStore.ts`の一時analysis state/action、`CaptureView.tsx`のminimap直下、既存`Modal`/dirty guard再利用 |

現行の高水準`@tonejs/midi` objectからは、元track identityとProgram Change時系列を復元できない。A1ではraw SMF eventを読むadapter、またはsource track/channel/program chronologyを同等に保持する別戦略を先に確定し、domain解析へ外部ライブラリ型を漏らさず自前型へ変換する必要がある。これは任意の技術スパイクではなく、Voice model実装前のblockerである。

## 9. 主なリスク

1. **source identity喪失**: `@tonejs/midi`のprogram/channel別split後のindexを元track indexとして扱っており、計画書のVoice identityを構築できない (`node_modules/@tonejs/midi/src/Midi.ts:180-227`, `src/domain/midi/parser.ts:14-51`)。
2. **channel 9除外の不発**: 公開`Note`にchannelがないため現行channel読み取りは`undefined`で、drum hintのないpercussionが解析へ混入し得る (`node_modules/@tonejs/midi/src/Note.ts:57-98`, `src/domain/midi/parser.ts:14-50`)。
3. **Program chronologyとnote欠落**: 明示/既定Program 0を区別できず、Program Changeを跨ぐNote On/Offは再構成track分離により失われる可能性がある (`node_modules/@tonejs/midi/src/Midi.ts:195-223`, `node_modules/@tonejs/midi/src/Track.ts:82-116`)。
4. **型のrole二重化**: `TrackRole`と`HybridTrackRole`で語彙が異なる。VoiceRole追加時に変換境界を明示しないとUI・評価・scoringで意味がずれる (`src/domain/midi/types.ts:4`, `src/domain/midi/trackRoles.ts:5`)。
5. **実データ不足**: dirty corpus、`all_instruments.mid`、real Goldがないため、改善・回帰・Stage C必要性を数値で判定できない。
6. **main thread block**: 現在の解析actionは同期で、sequence/cancel/cacheがない (`src/store/vaultStore.ts:513-524`)。
7. **feedback schema不整合と後方互換**: producerは`structure-editor`を出すがconsumer schemaは拒否する。まず既存不整合を解消し、その上でVoice/propagation fieldは新eventまたはoptional fieldとして拡張する必要がある (`src/domain/midi/feedback.ts:19`, `src/domain/midi/realEvaluation/schema.ts:107`)。
8. **default mode回帰**: `legacy`を維持し、Voice-awareは明示modeでのみ追加する必要がある (`src/domain/midi/analysis.ts:8-19`)。

## 10. Stage C実装判断ゲート

### 10.1 現時点の判断

**判定保留。Stage C実装条件を評価できる入力が不足している。**

自動role誤り頻度、Voice選択による候補改善、手動Voice選択によるcorrection cost低下を測れるdirty/realデータが0件である。加えて、期待Voice roleと正解Voice maskを注釈するschema、それを読んで比較するCLIが現行評価基盤にない。計画書はStage Cの定性的条件を示すが、合否thresholdと必要sample sizeは定義していないため、現時点では再現可能なゲート判定を行えない。

### 10.2 Stage Cゲートへ必須の入力

以下は監査で提案する測定入力であり、元計画書で承認済みの数値基準ではない。Stage A/B完了までにannotation schema、CLI、合否threshold、最低sample sizeを別途確定し、同一dataset revisionとanalyzer version付きで提出する。

1. **Dirty synthetic category別結果**
   clean / type0 / drums / melody / metadata-missing / sustain / jitter / same-channel-mixed / combinedについて、Root@1/@3、Quality@1/@3、Exact@1/@3、correction cost、runtime、legacy差。
2. **Real MIDI Gold結果**
   sourceを解決できるGoldケースでlegacy対voice-awareのRoot/Quality/Exact/Boundary/correction cost。Gold 0をblockingとするのは本監査の**提案ポリシー**であり、元計画書のStage C条件ではない。採用する場合は必要件数と対象分布を先に決める。
3. **role誤り率**
   Voiceごとに自動role、期待role、confidence、誤分類理由を記録し、ファイル単位・role単位の頻度を出す。
4. **Voice選択ablation**
   auto、harmony-and-bass、exclude-melody、all、および人手正解maskを同じケースで比較し、候補品質が変わるケース数と差分を出す。期待role/mask用schemaと評価CLIは新設が必要である。
5. **修正コスト比較**
   自動のみと手動Voice選択ありで、mean / median / P90、manual input rate、candidate chip selection rate、time to corrected progressionを比較する。
6. **ユーザー用途の証跡**
   「楽器を選んで解析したい」ケースの件数またはQA記録。精度差がない場合はUIを追加しない判断材料にする。
7. **性能測定**
   `all_instruments.mid`相当の3分MIDIでparser / Voice build / role / profile / score / diversity / rerank / totalを計測し、total 1秒以内とUI freezeなしを別々に確認する。
8. **dirty guard UX確認**
   未保存編集ありでVoice条件を変えた際、キャンセルでは状態不変、確定時のみ編集破棄・最新requestだけ反映されること。

### 10.3 ゲート判定

- 「頻発」「明確に改善」の数値thresholdと最低sample sizeは未定義である。Stage C着手前に承認可能な値へ固定する。
- role誤りが頻発し、手動Voice選択で候補品質またはcorrection costが明確に改善し、ユーザー用途も確認できる場合: Stage Cを実装する。
- 自動Voice-awareで十分で、手動選択の改善が小さい場合: collapsed summaryだけ、またはPhase 3.6.5.1へ延期する。
- 判定時も`defaultAnalyzerMode = "legacy"`は変更しない。既定切替はclean非退行、dirty改善、real Gold非退行、correction cost低下、決定性、性能、manual QAをすべて満たした別ゲートで行う。

## 11. Stage 0完了条件に対する結果

- Stage 0全体: **未完了 / blocked**。`all_instruments.mid`不在のため指定診断を再現できない。
- parser/channel/Program Changeコード監査: 完了。高水準object化前のsource identityとProgram chronology保持戦略がA1 blocker。
- Voice/track structureコード監査: 完了。Voiceモデルなし、現行trackIndexは再構成後index。
- role/scoring/reranker監査: 完了。track hard classifyとlegacy境界rerankerを確認。
- corpus inventory: 完了。clean synthetic 100件、dirty 0、real評価0、`all_instruments.mid`なし。ファイル固有診断は未達。
- Phase 3.6.3/3.6.4統合監査: 完了。Editor、feedback、minimap、Capture挿入位置と再利用箇所を確認。
- `all_instruments.mid`診断再現: **未達**。入力ファイルがrepositoryに存在しないため。
- コード実装: 実施していない。

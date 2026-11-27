# TXT-JAZZ Stage 00 — 保存・試聴・消費側の調査

対象コードは `21d4828d0d62b35da574a2a32e3c2bfa39eea3a9`、ブランチは `feat/txt-jazz-stage00`。2026-10-11 の合成データ調査。製品ソース・既存テスト・schema は変更していない。alt の表現は未決定。ここにある「SUPPORTED」は既存関数の返り値であり、未実装の TXT-JAZZ / alt 対応の合格を意味しない。

機械可読の実測は [consumers-evidence.json](consumers-evidence.json)。`hypotheticalAltered` は現型に存在しない印を診断用に直接渡した反事実入力、`labelOnlyAlt` は構造が通常 dom7 のまま label のみ `G7alt` にした入力である。どちらも正しく解析できた alt ではない。

## 1. §2.2 の保存・型の事実

| 項目 | 現在の事実と根拠 |
| --- | --- |
| 1: minMaj7 | 既に `ChordQuality` と Zod にある。`src/domain/types.ts:31`、`src/domain/schema.ts:21`。追加不要。 |
| 2: tensions | `9,b9,#9,11,#11,13,b13,#5` の8値。要求の自然9/13・b9/#9/#11/b13 は全て表せる。`types.ts:35`、`schema.ts:49`。`alt` は無い。 |
| 3: label | 必須文字列として Vault に保存する (`schema.ts:99`)。しかし表示・編集・移調・snapshot の境界で構造から作り直す。label を永続的な意味の唯一の保管先にはできない。経路は4章。 |
| 4: optional field | 現 `chordSymbolSchema` は strict (`schema.ts:92`)。未定義 `altered:true` を含む chord は拒否。Vault v2 reader はその chord の属する **idea 全体を quarantine** する (`schema.ts:465`)。単に JSON に field を足せば安全、ではない。 |
| 9: 推奨音の出どころ | 保存 snapshot は `source:"manual"`、`userVerified:true`、`extractorVersion:"text-style-v1:generated-close"`（選択した別styleなら末尾がそのstyle）で、sourceVoicing は作らない。`textProgressionVoicing.ts:62`。MIDI由来は `midi-extracted`。`manual` という値だけでは人間の入力とアプリ生成を区別できず、既存は extractorVersion と厳密な snapshot 形状で区別する。 |

Phase 11 の規約 `docs/phase11.0/P11-02.md` は exact Preview persistence と provenance-only origin classification を要求する。現在の識別は `textProgressionStyleFromSnapshot` (`textProgressionVoicing.ts:82`) で、単純な `source:"generated"` は既存 enum に無い。`resolveTimelineItemVoicing` が `origin:"practice-override"` を返すことも、音が人間作成だったという証明ではない。今回の調査ではこの既存表現を変更していない。

通常保存は `textProgressionDraftSavePayload` (`textProgressionDraft.ts:154`)、拡張保存は `extendedTextSaveData` (`extendedTextSave.ts:18`) が、欠けた practice override に `createTextProgressionStyleSnapshot(...,"generated-close")` を付ける。拡張では `textSource.generatedVoicingPolicyId="text-defining-basic-full-v1"` も保存する (`textSource.ts:8,54`)。通常入力にはこの textSource は無い。

合成8構造（minMaj7/minMaj7+9/slash、dom7、明示複数テンション3種、label-only）を既存 `JsonVaultRepository.save → load → exportTo → importFrom(replace)` に通し、各段階の chord 構造と MIDI notes は全て一致、quarantine 0。fileVersion は2。実ファイル保存ではなく独立の `BrowserMemoryVaultStorage` を使った。新fieldを含まない現データの往復の証拠であり、新schema採用後の全互換性の保証ではない。

## 2. 試聴の処理と実音（§3-4/8）

通常/拡張の既定テキスト試聴は `voiceTextChordForAudition` (`src/domain/textChordTones.ts:11`)。bass/root を MIDI43〜54 に置き、残りの全pitch classを60〜71へ置く。**context-free** と明記され、前後のコードを考慮しない。上声5音の制限は無い。全て MIDI note number、C4=60 として表す。

| 入力構造 | 既定テキスト試聴 | 意味の確認 |
| --- | --- | --- |
| C minMaj7 | 48,63,67,71 | C,E♭,G,B。♭3と長7を含む。 |
| C minMaj7 +9 | 48,62,63,67,71 | Dを加える。D/E♭の半音はC4以上。 |
| C minMaj7 /G | 43,60,63,71 | 指定Gが最低音。 |
| G dom7 | 43,62,65,71 | 通常G7。 |
| G dom7+b9,#9,b13 | 43,62,63,65,68,70,71 | 三つの明示変化音A♭/B♭/E♭を全て含む。 |
| G dom7+b9,b13 | 43,62,63,65,68,71 | b9/b13を含み、#9/#11を足さない。 |
| G dom7+b9,#11 | 43,61,62,65,68,71 | b9/#11を含む。 |
| label-only G7alt、または仮想 altered:true | 43,62,65,71 | **普通のG7**。分類を理解しない現関数がそのまま音を作る危険を実測。 |

全9合成ケースで既定テキスト試聴の指定bassが最低音で、C4より下の隣接半音は無かった。この小さな調査を全コードの保証にはしない。

既存の別関数 `voiceChordForPreview` (`chordVoicing.ts:47`) は上声を `.slice(0,5)` で切る。G7+b9,#9,b13 では **43,59,62,63,65,68** を返し、#9の B♭ が落ちる。テキスト既定と通常Auto/旧previewの経路を同一視できない。

試聴styleは4種 (`textProgressionVoicing.ts:12`)。minMaj7は generated-close / shell-17 / open-17 で音が返り、rootless-abは `undefined`。minMaj7/G の shell-17 は **47,55,63,67**、open-17 は **47,55,67,75** で、最低音がBになり、§7の「指定bassを必ず最低音」と一致しない。既定 generated-close のみを見て、全styleが安全とは報告しない。

### 生成失敗・誤った成功

- 非対応の合法styleは `undefined`。`createTextProgressionStyleSnapshot` は未生成/音数2未満・10超なら `undefined` (`textProgressionVoicing.ts:67`)。既存の全生成に§7.5の記号との意味照合validatorがあるわけではない。
- 非法quality `alt` を強制注入すると `qualityIntervals[quality].filter` で **TypeError**。これは合法 minMaj7 入力での例外ではない。実装前の不正入力診断である。
- 非法 tension sentinel `alt` を強制注入すると既定テキスト試聴は **43,62,65,71,NaN** を返し、例外が出ない。証拠 JSON はNaNを文字列 `"NaN"` として明示した（JSONのnullへの暗黙変換は使っていない）。schemaはこの入力を拒否する。
- label-only / 仮想fieldは例外を出さず通常G7音を返す。単なる try/catch では誤生成を防げないという§7.5の懸念は現コードで成立する。
- `resolveVoicingForUse` (`voicing/resolveVoicing.ts:11`) は使用不能な音がある場合に generatedFallbackへ進む。今回の追加仕様が求める「生成不能コードの登録音は保存しない・代替音で出題しない」を自動的に満たす共通境界ではない。

## 3. 消費側に必要な情報と現挙動（§3-5/6、§8）

新しい共通の情報依存宣言表は現製品には無い。`evaluateTextProgressionCapabilities` (`textProgression.ts:424`) は機能ごとの条件を独立評価するが、altの分類理解は判定しない。次の表は**調査結果の宣言**で、製品に実装したtableではない。

| 消費側 | 実コードが使う情報（入口を含む） | minMaj7 | label-only/仮想altの現挙動 | 根拠 |
| --- | --- | --- | --- | --- |
| Vault 保存 | chord全構造・label、notes/provenance、v2 strictschema | 保存/再読/export/import可 | label-onlyは保存可、未知fieldはschema拒否/quarantine | schema.ts:92,367,465 / repository.ts:140,147,155 |
| Dojo「登録した音を覚える」 | 登録notes、元eventとの対応、source availability。入口snapshotはroot/quality/tensions/bass/labelも検証・正準化し、sessionにはChordSymbolを保存する | 保存notesを収集、exact判定合格。+12移動は不合格 | notesでのexact練習自体は可だがsnapshot由来occurrence labelはG7へ落ちる。未知fieldは strict lesson schemaにも問題 | chordDojo/collect.ts:18 / session.ts:14 / judging.ts:8 / lessonModel.ts:5 |
| Root Motion | **生成音は根音のみ**。ただし入口でChordContext全snapshotを検証し、quality/tensions/bassと正準label/署名/BPM/key/section条件に依存 | 入口unsupported-source（minMaj7がContext allowlist外） | label/flagを失ったG7のContext経由なら根音パスを生成。altを保持した対応とは呼べない | rootMotionVault.ts:39,51,69 / chordContextSnapshot.ts:16,295,523 |
| Bass Practice | bassline生成pitchはbass??rootのみ、key/BPM/拍位置等。**現picker入口はChordContext全snapshot依存**。旧direct helperはlabelFromSymbolでquality/tensionsも読む | 旧direct Bassは成功、現Context/picker経由は非対応 | 根音/bass音は出るがlabel/flagがG7に落ちる。入口全体をroot/bass-onlyと宣言できない | vaultPickerCandidates.ts:68 / vaultBassline.ts:14,26 / bassline.ts:13,29 |
| Chord Context | root/quality/tensions/bassから音を作る。label正準化・timing/key/BPM/section。保存override選択経路はnotesも使う | voiceChordContextもsnapshotもunsupported | dom7として受理して通常G7音、flag/label分類は失う | chordContextSnapshot.ts:157,523,592 / chordContextPlayback.ts:79,200,214,237 / vaultSavedChordNotes.ts:9 |
| Voicing Memory | stored notes/representation/source/provenance、互換判定用のstructured chord key。manual/live notesは人間の確定音を優先する既存例外あり | 保存notesをそのまま返す | normalizedChordKeyがlabel/仮想flagを読まないので普通dom7と同一視。新分類の全互換性は未実装 | voicing/normalizeVoicing.ts:8 / compatibility.ts:5,18 / resolveVoicing.ts:11 |
| Voicing Loop Generated | structured symbolの全意味、style/study/context/modifiers、timing/key。Saved/Source/Custom exact familyとは別 | 下表の経路依存 | **全生成経路がflagを失いG7として成功し得る**。§8の新alt非対応gateが必要 | progressionVoicingPractice/snapshot.ts:240 / voicingResolution.ts:63 / studyGenerator.ts:68 |

「根音のみ」「根音・bassのみ」は**音を作る最下層だけ**には当てはまるが、機能全体には検証・label生成等の依存がある。従って現コードのままalt対応を認定しない。独立の消費側判定を将来整備するときは、表示から入口・保存・音・判定まで一貫して分類を失わないことを確かめる必要がある。

登録音無しの minMaj7 を `collectVault` に渡すと voicings は空で、登録音課題は生成されない。一方「自分の進行」には `voiceChordForPreview` の代替音で残る (`collect.ts:30`)。登録音一覧の既存表示は「登録した音はまだありません…」であり、コードごとの「非対応」カードではない (`ChordDojoView.tsx:223`)。§7.5の文言を現状そのままで実現済みとは言えない。UI操作/E2Eはこの調査では実行していない。

### Voicing Loop の style と現在の主UIを区別する

P12.4の旧調査にある詳細5種だけでは現UIの挙動を説明できない。現在 `ProgressionVoicingPracticeView.tsx:383` は既定Basic（teacher）/Coreのstudy指定とColor/Open modifierを resolverへ渡す。

| 経路 | minMaj7 / minMaj7+9 | minMaj7/G | G7+b9,#9,b13 | label-only/仮想alt |
| --- | --- | --- | --- | --- |
| legacy詳細5種: basic-full/basic-shell/rootless-shell/full-shell/left-hand、fallback無 | **5種全UNSUPPORTED_RULE** | 同左 | 5種SUPPORTEDだが殆どは明示音の一部を落とす。full-shellは全変化音を含む実音 | 全5種 ordinary dom7としてSUPPORTED |
| 現UI Basic/Core × Color off/on × Open off/on（8組） | **全8組SUPPORTED** | Color off4組SUPPORTED、Color on4組UNSUPPORTED_RULE | Color off4組SUPPORTEDで全明示音を含む、Color on4組UNSUPPORTED_RULE | 全8組 ordinary dom7としてSUPPORTED（Colorで自然9等を追加） |
| 詳細形に `detailedFallbackStudy:"teacher"`（4種） | Teacherへの明示shapeFallback付きSUPPORTED | 同左 | 元の詳細形がSUPPORTEDなので代替なし | 元の詳細形がSUPPORTEDなので代替なし |
| Extended Textの別policy `text-defining-basic-full-v1`、study指定無しbasic-full | SUPPORTED、定義全pitch class | SUPPORTED | SUPPORTED、定義全pitch class | G7としてSUPPORTED |
| Saved exact family | 登録notesがあればSUPPORTED | 同左 | 同左 | notesは維持されてもsnapshot label/flagが失われる |

実音の全表はJSONの `loop` / `study` / `detailFallback`。Textpolicyはsnapshot上の実在フラグを診断用に付けて resolverを測ったもので、現parserが未対応の minMaj7テキストを実際にExtended保存できた証拠ではない。

例：explicitTripleの legacy basic-full は43,53,68,71（#9,b13が不足）、full-shell は43,53,59,63,68,70（3つとも有り）。現UI teacher/core Color offは43,53,59,63,68,70。明示PairのColor onは43,53,69,71,75,80で自然9を加える。既存styleが要求記号を完全保持する前提にしてはいけない。

## 4. label / field の消失経路と A・B・C（未決定）

| 候補 | 実現性・互換性への影響 |
| --- | --- |
| A: optional altered | **技術的に可能、未実装**。調査用のschema `.extend({altered:z.literal(true).optional()})` では旧field無し/newtrue双方を受理した。旧データを新readerで読める方向は設計できる。ただし現reader/旧EXEはnewfieldを拒否し、当該ideaをquarantineする。types/schemaだけでなくclone/transpose/normalized identity・fingerprint/format/editor/lesson/cache/export/import/各consumerの情報依存境界に対応が必要。fileVersion2のまま変更する互換政策も利用者判断。 |
| B: label | **現条件では不可**。Vault往復は保存するが、移調/正準化等で1経路以上確実に失う（下表）。既存identityはlabelを無視する。labelだけを意味の正本にするには従来機能の大きな変更が要る。 |
| C: tension sentinel | **現状態は不可、採用には広い意味修正が必要**。enum追加だけで既存reader互換を失い、interval lookupはNaNを返す。実テンションの音程・必須音・カウント/表示/identity/生成/style規則が数値tensionを前提にするため、特別分類値を全ての経路で分離する必要がある。「fieldを増やさない」だけで安全になる案ではない。 |

本調査は選択・採用をしていない。Aのlocal schema probeは製品schemaを変更していない。

| 経路 | 観測した消失/衝突 | 根拠 |
| --- | --- | --- |
| formatChordSymbol / makeChordSymbol | source labelを参照せず構造から再生成、label-only G7alt→G7 | chords.ts:211,384 |
| Practice transpose | 明示field列挙で再構築。12キー全て label-onlyのalt分類が失われる。G7alt→A7。仮想fieldも落ちる。明示tensions自体は残るが表示は `A7b9#9b13` という別format（括弧なし） | practiceTransposition/transposeChordSymbol.ts:95,177 |
| Voicing Loop snapshot | field列挙＋labelをparseしてsemantic一致しなければ再構築。G7altは現parserで読めずG7。仮想fieldも捨てる | progressionVoicingPractice/snapshot.ts:240,259 |
| ChordContext snapshot | quality/tension allowlist、明示field列挙、labelFromSymbolで再構築。label/新fieldの情報を保存しない | chordContextSnapshot.ts:157,592 |
| Structure editor | root/quality/bass変更は makeChordSymbol(root,quality,existingTensions,bass)。label分類/新fieldを渡さない | components/progression-editing/ChordStructureEditor.tsx:41 |
| Other correction paths | manual label parser / quick candidate / chordSuggestions・contextActionsは構造/現parser基準。cloneChord自体はspreadで未知fieldもコピーするが、その後の再構築先全てが安全という意味ではない | progressionEditing/editableProgression.ts:192、fastLabelEntry.ts:1、chordReplacement.ts:118 |
| Identity / memory compatibility | normalizedChordKeyはroot/quality/tensions/bass/omissions、label・未定義fieldを無視。plainG7とlabel-only/仮想altは同じkey | voicing/normalizeVoicing.ts:8、chordIdentity.ts:64 |
| Dojo recording boundary | shared chordSymbolSchemaを使う lessonChordSchemaがstrict。新fieldの対応にはVaultだけでなく練習保存も監査が必要。収集のoccurrence harmonyにはtensions/新分類の欄は無い | chordDojo/lessonModel.ts:5、collect.ts:23 |

新fieldを保存してよいかについて：合成 chord の分類印自体は私的audio/MIDI/pathではない。既存のprivacy規約は raw text / provenance / captured performance を何でもlogへ出してよいという許可にはならない。今回の証拠は合成記号・合成notes・安全な論理idのみで、実Vault・録音・外部MIDIは読んでいない。

## 5. 部分parseエラー・上限・仕様との相違（§3-9/10）

合成 `| Cmaj7 | Unknown |` は通常/拡張とも、読めたイベント1つが診断用結果に残るが `canConvert:false`。通常は `createTextProgressionDraft`、拡張は `extendedTextSaveData` が例外で拒否。UIも両方の保存handlerで `!result.canConvert` を止める (`TextProgressionCapturePanel.tsx:262`、`ExtendedTextIntakePanel.tsx:134`)。通常UI保存ボタンは `textSaveBlockedReason(result.canConvert,...)` 経由でdisabled。**読めた部分だけの保存はできない**。部分保存を可能にする新仕様ではない。

| v3仕様の前提 | 現実と扱い |
| --- | --- |
| 4096文字単位 /12小節 /48token | **現在は通常8192 /32 /128** (`textProgression.ts:9`)。合成13小節は保存前parse成功。拡張は65536文字単位/256小節/4096score tokens・attacks/2400harmonic spans (`extendedTextBudgets.ts:2`)。縮めたり拡げたりしていない。 |
| 12小節超で分割取り込み説明が必要 | 13小節はエラーにならない。通常上限超の文言は「最大32小節です。」で、セクション分割の説明は無い (`TextProgressionCapturePanel.tsx:627`)。12はChordContext/Bass選択sectionの上限であり、入力の上限ではない。文言変更もStage01承認後の検討事項として保留。 |
| minMaj7 は生成Loop全体で未確認/非対応になり得る | 現Basic/Coreは多数の組合せで生成可。legacy5種のみの結果を全体へ一般化しない。 |
| alt表現を付ければ知らない機能は既存非対応表示になる | 現実はplain dom7扱いで成功し得る。明示的consumer境界が必要。 |
| 試聴は前後のvoice leadingを考慮するかもしれない | テキスト既定は明示的context-free。Loop studyのoptimizerとは別。 |
| 生成音のsourceはアプリ生成専用enumである可能性 | 現在manual＋extractorVersionで識別、source enumにgeneratedは無い。 |
| 登録音無しコードはコードごとの既存非対応表示 | 登録音リストから欠け、全部無い場合はempty message。自分の進行ではAuto fallbackを使う。§7.5との整合は追加設計の確認が要る。 |
| minMaj7の正準表示 Cm(maj7)、explicitに♭♯ | 現formatは `CmMaj7`、`CmMaj7(9)`、`G7(b9,#9,b13)`。移調専用formatは別書式。今は調査のみで変更していない。 |

## 6. 実行記録と限界

1. 一時 `p12-generated/TXT-JAZZ/consumers-probe.ts` を `node_modules/.bin/vite-node.cmd` で実行。最終 **exit0、121assert、9入力、3.08秒**。ASSERTは既存挙動（安全な往復・非対応・危険な消失）を確認したもので、新実装acceptanceではない。さらに9×8の現Study組合せ・legacy5・fallback4・全12キー移調を観測した。証拠JSONはこの最終runのもの。
2. 既存関連単体 `vitest run ... --reporter=dot`：**10file /107tests PASS、exit0、1.47秒**。対象は `textProgressionVoicing.test.ts`、`progressionVoicingPractice/p11SavedVoicing.test.ts`、`chordDojo/collect.test.ts`、`chordContextSnapshot.test.ts`、`rootMotionVault.test.ts`、`vaultBassline.test.ts`、`chordContextPlayback.test.ts`、`schema.test.ts`、`repository.test.ts`、`chordVoicing.test.ts`。ログは ignored `p12-generated/TXT-JAZZ/consumers-focused.log`。
3. 初期probeのKeySignature手作り入力でlabelsを欠いた調査器の不備は、既存 `getCanonicalKey` を使って修正した。製品例外とは数えない。Study拡張時の一時script括弧syntaxerror（exit1）も修正して再実行。合法minMaj7/明示tensionの測定では製品例外無し。意図した不正qualityのTypeError/不正sentinelのNaNは失敗経路の証拠として残した。
4. probe最終SHA256は `17ABC4A41DAB472BD1F064165944C1542C9EDC3F52190D24A5AF128919C8E592`。調査後に**この自分の一時scriptだけを削除**。合成evidence JSONは残す。

全E2E・FULL・native/EXE・実MIDI・実audio・実Vault UI saveは未実行。parserの全トークン結果は別のparser監査に委ね、ここでは構造を直接生成して保存/消費側を分離調査した。将来altfieldが採用された後の実入力→保存→Dojoの統合合格は、このStage00で認定していない。Stage01には進まない。

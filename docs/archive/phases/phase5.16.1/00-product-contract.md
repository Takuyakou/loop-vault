# Phase 5.16.1 Product Contract

## Product promise

Degree Echoは、未知の短いdegree phraseを聴き、任意のsing-along後に単独で歌い、度数として考え、ベースで弾き、自己評価し、別Keyへ移調するoffline practiceである。

この機能は演奏を録音・解析・採点しない。UI、Home、Historyのすべてで次の意味を維持する。

- `自己評価`
- `Self-rated`
- `自動採点ではありません`

`Pitch Accuracy`、`Rhythm Accuracy`、`Duration Accuracy`、`Overall Score`、cent accuracy、analysis confidence、input quality、microphone由来に見えるwaveform/meterは禁止する。

## Enabled / disabled contract

Bass Practiceは外部application feature flag
`enableBassPracticeDegreeEcho`だけで接続し、実装開始時のdefaultはOFFとする。
repositoryやpersisted settingsはこのflagを読まず、enablement authorityを持たない。

OFFの場合:

- Practiceは既存Chord Dojoだけを表示する。
- HomeとHistoryへBass Practice UIを追加しない。
- Practice Repositoryをload/saveしない。
- audio graph、timer、keyboard listenerを作らない。
- Chord Dojo、Live MIDI、Analyzer、MIDI Exporter、Vault schemaの挙動を変えない。

ONの場合:

- Sidebarは変えず、Practice内に`Chord Dojo | Bass Practice`を表示する。
- Bass Practice内で動作可能に見せるmodeはDegree Echoだけとする。
- Rhythm Echo、Bassline Echo、Vault sourceを表示・生成・保存しない。

## Supported user flow

```text
Home / Practice
→ Bass Practice
→ Degree Echo setup
→ ready
→ Listen 1
→ recall
→ Listen 2 (optional sing-along)
→ Solo Sing dwell
→ Think in Degrees
→ Play on bass
→ Reveal
→ Self Review
→ optional Transfer after Good/Easy
→ Next
→ Session Summary
```

UIがplayback完了前に結果を捏造したり、sing dwell未完了で`歌えた`を有効にしたりしてはならない。

## State machine

許可状態:

```text
setup
ready
listening
recall
singing
thinking
playing
review
transfer-offer
transfer
completed
abandoned
```

基本遷移:

```text
setup → ready
ready → listening
listening → recall
recall → singing
singing → thinking
thinking → playing
playing → review
review → transfer-offer | completed
transfer-offer → transfer | completed
transfer → review
```

例外:

- Sing disabled: `recall → thinking`
- Sing skip: `singing → thinking`、`singSkipped = true`
- route/mode leave: resource解放とunsaved attempt保護後に`abandoned`
- reviewから先へ進むにはrating必須
- 無効遷移はstateを変更せずtyped errorを返す

## Primary action contract

一つの状態に同格primary CTAを複数置かない。

| State | Primary action |
|---|---|
| ready | 再生 |
| recall | 歌唱へ |
| singing | 歌えた |
| thinking | 演奏開始 |
| playing | 演奏終了 |
| review | 自己評価 |
| transfer | 移調チャレンジ開始 |
| completed | 次へ |

Hint、Replay、Skip Sing、Stop、Closeはsecondary actionである。

## Degree exercise contract

- modeは`degree`のみ。
- monophonic、1〜6 notes、1 beat〜1 bar。
- same generatorVersion + seed + normalized settingsはbyte-equivalentなsemantic exerciseを生成する。
- generator retryはmax attemptsで終了し、生成不能を明示errorにする。
- answer、playback timeline、hint、fretboard marker、singing referenceは同一target event timelineから導出する。
- 4-string / 5-string、right / left handed、fret rangeを生成前に検証する。
- playable bass range外のnoteを黙ってoctave近似しない。
- Level presetはdifficulty各軸の集合であり、単一整数をsource of truthにしない。

初期語彙はpresetへ明示的に割り当て、全候補を無理に有効化しない。Phase 5.16.1で許可された語彙以外はexperimentalにも表示しない。

## Listening and singing

- Listen 1は静かに聴く。
- Listen 2は任意でsing-alongできる。
- playback停止後にSolo Singへ進む。
- sing completion gateは`clamp(phraseDuration * 0.8, 1,000 ms, 8,000 ms)`。
- dwell経過前の`歌えた`はdisabled。
- `歌唱をスキップ`は常に明示可能で、failureとして表示しない。
- skipは`independentSuccess = false`。
- microphone permission、recording、input meterは一切使わない。

Singing Reference:

- `Auto | Original | +1 Octave | +2 Octaves`
- original bass answerは不変。
- melodic contourとinterval classを維持し、reference eventのoctaveだけを変更する。
- same exercise + settingは同じreferenceを返す。
- settingとresolved shiftをattempt snapshotへ保存する。

## Hint ladder

Hintは0から順に1段ずつ進み、飛ばせない。最高使用levelをattemptへ保存する。

| Level | Degree Echo disclosure |
|---|---|
| 0 | answer情報なし |
| 1 | Key / tonal context |
| 2 | note count + contour |
| 3 | degree sequence |
| 4 | note names + fretboard markers |

Hint 3/4使用時はGood/Easyでも`independentSuccess = false`。Hint利用自体をfailureとは表示しない。

## Self review and independent success

Rating:

```text
Again | Hard | Good | Easy
```

Optional self-reported issue:

```text
Pitch | Rhythm | Duration | Recall | Fretboard
```

`Pitch`を含むissueはユーザー自己申告であり、測定結果ではない。

Independent success v1:

```text
rating is Good or Easy
AND hintLevel <= 2
AND singSkipped is false
AND singGateCompleted is true
```

この値はcanonical derived fieldである。repositoryはwrite/loadの両方で再計算し、
persisted値との不一致を黙って補正しない。不一致recordはwrite時にreject、load時に
Practice quarantineへ隔離し、Home、History、queue、transfer、session summaryへ含めない。

表示名は`Self-rated independent success`または日本語で自己評価由来と明示した同義語に限定する。

## Review queue and transfer

同じ保存履歴と同じqueue policy versionから同じqueueを生成する。tie-breakはstableなexercise/attempt ID順とし、wall-clockの呼び出し順やMap insertion orderに依存しない。

- Again: 2〜3問後、difficultyを1段階下げる。
- Hard: session後半または次session冒頭、同pattern、tempoを少し下げる。
- Good: 次sessionまたは翌日、同difficulty、別key/variation。
- Easy: 2〜3日後、Transferを強化する。

Transfer:

- Good/Easy後だけ提示する。
- same degree sequence、same rhythm、different key。
- optional different start string/fret。
- source attempt relationを保存する。
- Again/Hardはretryを優先する。

## Home contract

既存Homeの主役を変えず、小型の`今日のベース練習`カードを追加する。

- first run: `最初のセッションを始める`
- due > 0: 残り件数と次focus
- due = 0: `今日の復習は完了`
- CTA: Degree Echo setupを開く
- data source: Practice Repositoryのpure derived summary
- flag OFF: hidden

大型dashboard、fake score、Analyzer/Vaultへの副作用は禁止する。

## History contract

既存HistoryへPractice Repository由来のsession summaryを追加する。

表示可能:

- session date
- Degree Echo
- completed / target count
- rating distribution
- Self-rated Good/Easy count
- no-hint self-rated independent count
- average listen count
- average hint level
- transfer result
- next focus

accuracy、confidence、自動改善提案として表示しない。past attemptは元sourceがなくても最小snapshotから表示できなければならない。

## Fretboard contract

- 4-string standard tuningと5-string standard tuning。
- right-handed / left-handed presentation。
- configured fret range内だけを表示。
- target markerはHint 4まで表示しない。
- note / degree切替。
- narrow viewportはhorizontal scroll可。
- color以外にtext、shape、legendで意味を伝える。
- screen-reader alternativeはstring、fret、note/degree、sequence orderをtextで提供する。
- live input、low-B detection、camera fingeringを表示しない。

## Keyboard and accessibility

| Key | Action |
|---|---|
| R | Replay |
| H | Next hint |
| Space | Current primary action |
| S | Sing completed |
| 1 | Again |
| 2 | Hard |
| 3 | Good |
| 4 | Easy |
| N | Next |
| T | Transfer |
| Esc | Stop / Close |

shortcutはinput、textarea、select、contenteditable、IME composition中に奪わず、modifier付入力とkey repeatで実行しない。

必須:

- visible focus
- route/mode change後の合理的なfocus
- state/status用polite live region
- visual orderとDOM order一致
- reduced motion
- axe critical/serious violation 0または明示exception
- 1024×720から1920×1080のviewport matrixでhorizontal body overflow 0、最下部へ到達可能

## Audio and resource safety

- global `PlaybackController`、Tone.js graph、master volume、Top Bar meterを再利用する。
- componentごとのAudioContextを作らない。
- rapid replayは前generationをcancelする。
- stop、route leave、mode leave、unmount、app closeでnote/timer/listenerを解放する。
- 二重playback graphを開始しない。
- playback完了までは次状態へ進めない。
- meterはplayback stateだけを表し、microphone inputに見せない。

## Protected product surfaces

次はPhase 5.16.1の変更理由にしてはならず、最終Gateで非退行を確認する。

- Sidebar item/order/width behavior
- Chord Dojo scoring、scroll、Live MIDI ownership
- Homeの既存focus/monthly/recent/pipeline
- Historyの既存Vault event
- Analyzer code/config/results
- MIDI Exporter feature flag、file output、drag behavior
- Vault schema、`fileVersion: 1`、data path、backup/recovery
- global master volume、preview sound、Top Bar level meter

## Release acceptance

Phase 5.16.1は、active instructionのAcceptance 1〜38をすべて証拠付きで満たした場合だけ完了とする。通常failureは根本原因を修正して再実行する。mainへmergeせず、Rhythm Echo、Bassline Echo、Phase 5.17へ進まない。

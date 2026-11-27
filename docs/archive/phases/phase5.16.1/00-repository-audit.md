# Phase 5.16.1-00 Repository Audit

## 判定

Phase 5.16.1は、`docs/p5161-00-audit`の隔離worktreeから開始できる。開始commitは`97b03f49542b8eac6b95e8e1c1fb657731d64223`で、開始時のworktreeはclean、tracked MIDIとtracked `.local-evaluation`はいずれも0件だった。Phase 5.15の作業worktreeは変更せず、Phase 5.16指示書10ファイルだけを相対path・byte size・SHA-256一致で専用worktreeへ複製した。

P5.16.1-00ではアプリコードを変更していない。以後の実装はAnalyzerから独立させ、Vault schema、Chord Dojo、Live MIDI、MIDI Exporter、Sidebar、global audio contractを保護する。

## Source controlとscope

- branch: `docs/p5161-00-audit`
- starting commit: `97b03f49542b8eac6b95e8e1c1fb657731d64223`
- parent commit: `41f50c0faafe35e6dbe576be4587b41e8a860086`
- remote default baseline: `origin/master` at `2eb36b63a064c4ee44e0d071836b2d722f534502`
- active instruction: `docs/phase5.16/stages/phase5.16.1-degree-echo-core.md`
- Phase 5.16.1対象: Degree Echo coreだけ
- 明示的非対象: Rhythm Echo、Bassline Echo、Vault source、metronome、DI/録音、microphone、自動採点、Phase 5.17

## Navigationと画面構成

### App / route

React Routerは使用せず、`src/App.tsx`が`AppView`のlocal stateを持ち、条件renderで画面を切り替える。`src/components/AppShell.tsx`の`AppView`とSidebarは、Home / Chord Capture / Vault / Practice / Live MIDI / History / Settingsの既存構成を実装している。

実装seam:

- Sidebarに新しいPractice専用項目を追加しない。
- `view === "practice"`の内側に`Chord Dojo | Bass Practice` subnavigationを置く。
- `PracticeView`をChord Dojoの既存entryとして保持し、Bass Practiceは別componentへ分離する。
- Homeからは既存`practice` viewへmode stateだけを渡す。URL routerがないため、最小のApp stateまたはtyped navigation requestで実現する。
- route変更時、`#main-content`はscroll位置を先頭へ戻しfocusを受ける既存契約を維持する。

### Chord Dojo

`src/views/PracticeView.tsx`は3,220行の既存Chord Dojo実装で、Vault progression、Live MIDI、PracticeClock、移調、Mix、voicing practiceを統合している。Phase 5.16 domainをこのファイルへ混在させると回帰とresource lifecycleの危険が大きい。

決定:

- 既存`PracticeView`の内部判定・保存形式・Live MIDI lifecycleは変更しない。
- subnavigation shellだけを薄く追加し、Chord Dojo componentは既定選択のまま維持する。
- Bass Practiceは`src/features/bass-practice/`配下でdomain/application/ui/infraを分離する。
- feature flag OFFでは従来の`PracticeView`だけがrenderされ、初期化・storage read・audio side effectを起こさない。

既知の注意点:

- 既存Chord Dojoはmount時にLive MIDIをactivateし、unmount時に所有している接続をdeactivateする。
- cleanupはPracticeClockとclose preparationを解放するが、同じcleanup block内では`playbackController.stop()`を呼ばない。新しいBass Practiceはroute/mode離脱時の明示stopを必須とし、既存Dojoの挙動変更は回帰testを伴う別の最小修正として扱う。

## Home

`src/views/HomeView.tsx`は今日のfocus、monthly overview、recent progressions、pipeline、stale itemsを表示し、既存`PlaybackController`で進行previewを行う。

実装seam:

- Practice Repositoryから導出した小型カードを既存Heroより下の補助領域へ追加する。
- first run / due / completed todayの3状態を明示する。
- CTAはBass PracticeのDegree Echo setupへ遷移するだけとし、Vault、Analyzer、既存Home統計を変更しない。
- flag OFFならDOMへ出さない。
- Homeの既存hashとvisual snapshotをbaselineとして保護する。

## History

`src/views/HistoryView.tsx`は現在、Vaultの`SongIdea[]`からcapture、Idea update、Chord Dojo practice、status eventを導出する。検索・event type filter・日付groupを持つが、外部event logはない。

実装seam:

- Practice Repositoryからsession summaryを別のpure derivationで生成し、既存event群と表示上で合成する。
- source of truthはPractice Repositoryで、Vault progressionの`practice` fieldへ書き戻さない。
- summaryはcompleted count、rating distribution、平均listen数、transfer結果、次focusだけを表示する。
- `Self-rated` / `自己評価` / `自動採点ではありません`を一貫して表示し、accuracy/score/confidenceを表示しない。
- 1,000 attempts相当では全attemptを直接renderせずsession summaryまたはページング済みcollectionを使用する。

## Playback / audio

### 既存基盤

- `src/audio/playbackController.ts`はglobal singletonを提供し、source、starting/playing/idle、generation cancellation、subscriberを管理する。
- `src/audio/chordPreview.ts`はTone.jsを使用し、instrumentをmodule scopeで再利用し、timer cancellation、releaseAll、instrument交換時disposeを実装する。
- `previewMidiNotes`にはmonophonic note eventのlook-ahead schedulerが既にある。
- `src/audio/masterVolume.ts`は`Tone.getDestination()`へglobal volumeを反映する。
- `src/components/PlaybackLevelMeter.tsx`はPlaybackController stateだけを表示し、global stop actionとして動作する。

不足しているseam:

- `PlaybackRequest`はchord/timelineだけで、`previewMidiNotes`をcontroller経由で利用できない。
- `PlaybackSourceKind`は`practice`までで、Chord DojoとBass Practiceのsource identityを区別できる命名がない。
- note playback completionをUI state machineへ結ぶには、controller lifecycleを拡張するかapplication adapterで完了Promise/callbackを安全に橋渡しする必要がある。

実装方針:

- target event timelineを唯一の正とし、exercise answer・bass playback・singing referenceを同じevent列から導出する。
- AudioContextをcomponent mountごとに作らない。Tone graphとglobal destinationを再利用する。
- route leave、mode leave、rapid replay、unmount、app closeでgeneration cancellationとstopを実行する。
- UI meterは実入力meterとして見せず、既存のplayback state表示だけを使う。
- playback timingをUIの`setTimeout`だけで正にしない。

## Degree / key asset

- `src/domain/harmony/degrees.ts`はChordSymbolをkey相対degreeへ変換する検索向けutilityであり、bass note generatorではない。
- `src/domain/practiceTransposition/keyCatalog.ts`はmajor/minor各12 key、canonical accidental、日英label、parse/normalizeを提供する。
- `src/domain/practiceTransposition/circleOfFifths.ts`は近接key poolと全key poolを決定論的に作る。

再利用境界:

- canonical key catalog、pitch-class normalization、circle-of-fifths poolは再利用できる。
- Chord用`DegreeSymbol`をDegree Echoのmonophonic event型へ流用しない。
- generatorはseeded PRNG、bounded max attempts、4/5-string tuningとfret rangeによるplayabilityを独立domainとして実装する。
- same seed + same settingsは同じexercise、別seedは固定fixture内で十分なvariationを生成することをproperty testで固定する。

## Storage

### 既存Vault repository

`src/domain/repository.ts`は`loopvault/data.json.tmp`へserialize後、`loopvault/data.json`へrenameする。起動時backup、最大20世代、invalid JSONのcorrupt file隔離、future version拒否を備える。Tauri adapterはAppData scoped filesystem、browser adapterはmemory storageである。Vault storeはautosaveを直列化し、書込み失敗時にunsaved stateを保持する。

### Practice repository方針

- Vault schemaと`fileVersion: 1`を一切変更しない。
- `loopvault/practice-v1.json`を別repositoryとして持つ。
- repository interface、strict schema、temp-write/rename、backup rotation、corruption isolation、future version handlingを既存契約に合わせる。
- 同時saveはsingle-flightで直列化し、古いsave完了で新しいrevisionをsaved扱いにしない。
- write failure時はactive sessionとunsaved revisionをmemoryに残す。
- browser/test adapterは本番Tauri fileと混同せず、restart検証可能なinjectable storageを使う。
- raw MIDI、audio、microphone data、絶対path、personal filenameを保存しない。

## Feature flags

現状はBass Practice flagが存在しない。既存flag baselineは以下。

- MIDI Exporter: `loop-vault:progression-midi-export-enabled:v1`、default ON
- Analyzer profile: `loopvault.accuracyFirstFeatures`、default `stable`
- Analysis feedback: default ON

Phase 5.16.1は外部application flag
`enableBassPracticeDegreeEcho`を唯一のauthorityとして追加し、default OFFで接続する。
repositoryはflagを読まず、persisted dataにもenablementを保存しない。flag OFFでは以下を保証する。

- Practice subnavigation追加なし
- Home cardなし
- History practice summary追加なし
- Practice repositoryのload/saveなし
- audio graph初期化なし
- Chord Dojo、Analyzer、Exporterの挙動不変

## Design tokens / shared UI

`src/styles/tokens.css`にdark navy surface、teal/indigo accent、semantic status、focus、spacing、radius、motion、sidebar/topbar tokenがある。`src/components/ui/primitives.tsx`にButton、Surface、Badge、EmptyState等の共有primitiveがある。

実装方針:

- reference mockの情報階層を参照しつつ、色・spacing・controlは既存tokenとprimitiveを使う。
- challenge cardを主役にし、metricを上へ出さない。
- stateごとのprimary CTAは1つだけにする。
- fretboard markerはHint 4まで非表示、色だけに依存せずlabel/shapeを併用する。

## Accessibility / keyboard / responsive

既存基盤:

- skip linkとfocusable `#main-content`
- route change後のfocus移動
- global `:focus-visible`
- `prefers-reduced-motion: reduce`でanimation/transitionを実質停止
- Playwright axe、keyboard、responsive、reduced-motion、visual suites
- viewport matrix: 1024×720、1280×720、1366×768、1440×900、1920×1080

Degree Echo追加要件:

- R/H/Space/S/1–4/N/T/Escを実装し、input/select/contenteditable中は奪わない。
- `event.repeat`、composition、modifier入力を拒否する。
- state changeはpolite live regionで通知し、primary actionへfocusを移しすぎない。
- visual orderとDOM/screen-reader orderを一致させる。
- 4/5-string、left/right、fret range、Hint 4 markerにscreen-reader用のtext summaryを付ける。
- 1024×720でも主操作と最下部へscroll到達可能にする。

## Test strategy lock

### P5.16.1-01

- generator determinism / different seed / all keys / presets
- 4-string / 5-string / handedness / fret range / note count / phrase duration
- bounded failure / invalid transition / hint ordering / singing reference / transfer relation

### P5.16.1-02

- same exercise produces same audio events
- rapid replay / stop / route leave / mode leave / dispose
- listen count / dwell gate / skip / octave reference
- no microphone API and no fake input meter

### P5.16.1-03

- subnavigation and flag OFF behavior
- full Degree UI flow and single primary action
- Home first-run/due/completed states
- keyboard-only / axe / long labels / viewport / visual / reduced motion
- Hint 4 fretboard markers, 4/5-string, handedness

### P5.16.1-04

- every rating and optional issue
- independentSuccess truth table
- deterministic queue / retry / transfer
- atomic save / backup / corruption / future version / write failure / reload
- History honesty and Home derived state

### P5.16.1-05

`00-baseline-lock.json`のtargeted protected-surface gatesとfull release gatesを実行し、hash差分は意図したintegration seamだけ説明する。

## 主なriskとmitigation

| Risk | Evidence | Mitigation |
|---|---|---|
| Chord Dojo回帰 | 既存PracticeViewが3,220行でLive MIDI/clock/storageを統合 | Bass Practiceをfeature moduleへ分離し、subnav shellだけで接続 |
| audio leak / stuck sound | controller外のnote preview APIとroute cleanup差 | controller lifecycleへ統合し、全離脱pathをtest |
| Vault汚染 | 既存Dojo進捗はVault block内に保存 | Practice Repositoryを別file/version/schemaに固定 |
| fake scoring | UI mockはmetricを置きやすい | self-rated文言と禁止語のtestを追加 |
| nondeterministic queue | timestamp/Map iterationへ依存し得る | stable sort keyとseeded tie-breakをdata contractで固定 |
| browser restartの誤解 | browser Vault adapterはmemory only | storage adapter注入testとTauri path contractを分離 |
| UI overflow | challenge + side panel + fretboardが縦横に大きい | 既存main scrollを維持しviewport matrixで検証 |
| scope creep | reference mockに未実装modeが含まれる | Degree Echo以外のtab/controls/domainを実装しない |

## P5.16.1-01への引継ぎ

最初のcode stageではUIやrepositoryへ接続せず、`src/features/bass-practice/domain`のpure types、state machine、PRNG、generator、difficulty、hint、transfer、singing referenceとproperty testsだけを実装する。既存`src/domain/practice`との型名衝突を避け、外部barrel exportはBass Practice feature境界内に限定する。

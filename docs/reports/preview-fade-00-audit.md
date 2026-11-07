# 試聴の切れ目をなめらかにする — Stage 00(調査。コードは変えていない)

P16 のマージ後に行う別フェーズの Stage 00。調べただけで、コードは1行も変えていない。
(この文書は、どのコミットにも入れていない。必要なら、別途コミットする。)

先に: 「耳の練習専用の鳴らし方(`earSound.ts`)を作る」指示は、この会話の中には届いておらず、`earSound.ts` は作っていない(リポジトリにも無い)。取り下げは了解。

## 0. まず分かったこと(一番大事)

**プツプツが出るのは、`previewMidiNotes`(= 再生の依頼の種類 `type: "notes"`)を使う画面だけ。**
`chordPreview.ts` の `stopPreview()` には、道が2つある。

| 道 | 条件 | 止めたときにすること | 音の切れ方 |
|---|---|---|---|
| ゆるやかな道 | 先の時刻に予約した音が無い(`instrumentHasScheduledAudioEvents` が偽) | `releaseAll()` だけして、楽器は 1.1 秒あとに捨てる(その間、同じ音色なら使い回す) | サンプラーの余韻(piano は 1 秒)で自然に消える。**切れない** |
| 急な道 | `previewMidiNotes` が1つでも音を予約した | `releaseAll()` → すぐ `dispose()`(その場で楽器を捨てる) | 鳴っている音が途中でぶつ切れる。**これがプツ** |

`instrumentHasScheduledAudioEvents` を真にするのは、`previewMidiNotes` の2か所(`chordPreview.ts` の 215・290・295 行付近)だけ。`previewChord`(`type: "chord"`)と `previewChordTimeline`(`type: "timeline"`)は、タイマーで「今」鳴らすだけで予約しないので、ゆるやかな道を通る。
→ **Chord Dojo のカード・Vault・Home・Capture の試聴は、連打してもプツプツしない側**。プツが出うるのは `type: "notes"` の側(§1 の B)。

なお、急な道は「止める」だけでなく、**次の再生を始めるとき**にも通る(`beginPreview` が毎回 `stopPreview` を呼ぶ。`playbackController.play` も先に `driver.stop()` を呼ぶので、2回続けて呼ばれる)。つまり、**鳴っている最中に次を鳴らすと、前の音がぶつ切れる**。

## 1. 使っている画面・処理の一覧と、「すぐ無音」に頼っているか

調べ方: `chordPreview` / `playbackController` を使うファイルを全部拾い(非テストで 48 ファイル、止める・鳴らす呼び出しは約 100 か所)、30 のまとまりに分けた。頼り方は、コードを読んで判断した(実機では確かめていない)。

**頼り方の見方**: ◎ 頼らない(音が少し残っても困らない)/ ○ 止めたことを「合図」としては使うが、音の消える時刻には頼らない / △ 止める → すぐ次を鳴らす(重なり方が変わる)/ 要注意 をつけたもの。

### A. 1つのコードを試聴する(`type: "chord"`。ゆるやかな道。プツは出ない)
| # | 場所 | 使い方 | 頼り方 |
|---|---|---|---|
| A1 | `views/chordAudition.ts`(コード候補の試聴) | `toggle` | ◎ |
| A2 | `components/PlayToggle.tsx`(Detail などの再生ボタン) | `toggle` | ◎ |
| A3 | `components/progression-editing/CorrectionPropagationPanel.tsx` | `PlayToggle` 経由 | ◎ |
| A4 | `components/capture/ExtendedTextIntakePanel.tsx` | `toggle`(1コード) | ◎ |
| A5 | `components/correction-workspace/CorrectionWorkspace.tsx`(カードの試聴) | `toggle` / `play`(連続して別のカードを鳴らす) | △ 次のカードをすぐ鳴らす。重なりが短くなるだけ |
| A6 | `views/chord-dojo/ChordDojoView.tsx`・`ChordDojoEndlessView.tsx` | `play`(`type: "chord"`、答えを聴く・カード) | ◎(止めるのは画面を離れるとき) |
| A7 | `views/chord-dojo/Master251View.tsx` + `master251Audition.ts` | `play`(`chord` と `timeline`)・`stop`。世代の番号とタイマーで自前の管理もしている | ○ 合図(終わり)は使うが音の消える時刻には頼らない |

### B. 音の列を鳴らす(`type: "notes"`、または `previewMidiNotes` 直接。**急な道。プツが出うる**)
| # | 場所 | 使い方 | 頼り方 |
|---|---|---|---|
| B1 | `views/ear-practice/*`(耳で弾く。`earPlayback.ts`) | `play(notes)`・`stop`。聴く(L・K・R・カードを押す)のたびに前を止めて次を鳴らす | △ **連打が一番多い画面**。ただし開始時刻は「鳴り始めの時刻」から計算していて、止めた音の消える時刻には頼らない |
| B2 | `audio/textTransport.ts` + `components/capture/useTextTransport.ts`(テキスト取り込みの再生) | `play(notes, dynamicTempo)`・`stop`。ループの折り返し(`launch(0)`)・位置の移動(`launch(beat)`)のたびに、**前の音を止めてすぐ次を鳴らす** | △ 要注意: ループの折り返しのたびに、前の周の最後の音がまだ鳴っていれば、その最中に急な道を通る(プツが出うる。最後の小節が休みなら、前の再生はすでに終わっている)。テンポの変更(`setPreviewMidiNotesBpm`)は止めずに調整する |
| B3 | `components/correction-workspace/CorrectionWorkspace.tsx`(曲の再生) | `play(notes)`・`stop`。範囲のループで、`onEnded("completed")` の合図で次の周を始める | ○ 合図には頼るが、消える時刻には頼らない。折り返しで、最後の音が鳴っていれば急な道 |
| B4 | `features/bass-practice/application/degreePlayback.ts` + `degreePracticeSession.ts`(度数練習) | `play(notes)`・`stop`・`isPlaying`。`onEnded` で次の段階へ進む | ○ 合図 |
| B5 | `features/bass-practice/ui/BasslinePracticeView.tsx`(12 か所の `stopPreview`) | お手本(`previewMidiNotes`)・録音の準備や画面の切り替えのたびに `stopPreview()` | ○ 録音を始める前に止めるが、スピーカーからマイクへの回り込みは数十 ms 以下では差が出ない見込み(要確認) |
| B6 | `features/bass-practice/ui/BassPracticeView.tsx`・`RhythmPracticeView.tsx`・`RootMotionPracticeView.tsx` | `previewMidiNotes`・`stopPreview`(画面を離れるとき・次の問題) | ○ |
| B7 | `features/bass-practice/recording/ui/useRecordCompareSession.ts` | お手本の再生(`playTarget`)・停止。録音との聴き比べ | ○ |
| B8 | `components/pre-analysis/PreAnalysisWorkspace.tsx`(3 か所) | `previewMidiNotes`・`stopPreview`(取り込み前の聴き確認。範囲を変えるたびに止めて鳴らす) | △ |
| B9 | `features/bass-practice/midi/LibraryView.tsx` | `stopPreview`(5 か所。「練習する」・取り込みの前に止める) | ◎ |

### C. 進行全体の再生(`type: "timeline"`。ゆるやかな道)
| # | 場所 | 使い方 | 頼り方 |
|---|---|---|---|
| C1 | `views/HomeView.tsx`(今日のループ。`timelinePlayhead.ts` が再生位置を出す) | `toggle` / `stop`。再生位置は、コントローラの状態(開始時刻)から計算 | ○ 音の消える時刻には頼らない(開始の合図だけ) |
| C2 | `views/VaultView.tsx`・`DetailView.tsx`・`ProgressionDetailView.tsx`・`ProgressionWorkspacePage.tsx` | `toggle`・`stop`(保存・離れる・音色を変えるとき) | ◎ |
| C3 | `views/CaptureView.tsx`・`views/capture/useCaptureIntake.ts`・`captureRuntime.ts`(`stopCapturePlayback`) | `toggle`・`stop`(進行の確認) | ◎ |

### D. アプリ全体の止め
| # | 場所 | 使い方 | 頼り方 |
|---|---|---|---|
| D1 | `App.tsx`(2 か所)・`components/AppShell.tsx`(停止ボタン)・`store/closeGuard.ts`(2 か所。終了・切り替え前) | `playbackController.stop()` | ◎ 止めたあとすぐ画面を閉じることがあるが、音が数十 ms 残っても困らない |
| D2 | `components/PreviewSoundProvider.tsx`(音色の切り替えで止める) | `stop()` | ◎ |
| D3 | `hooks/usePlaybackState.ts`・`components/PlaybackLevelMeter.tsx` | 状態(開始/終了)を読むだけ | ◎ |

### E. 別の仕組み(`chordPreview` の止め方に影響されない/されうる)
| # | 場所 | 使い方 |
|---|---|---|
| E1 | `practice/ProgressionVoicingTransport.ts`(Voicing Loop) | 自前の楽器 + `Gain` を使う(`createPreviewInstrument(sound, output)`)。試聴は2組を使い回す。**プツは出ない側** |
| E2 | `features/bass-practice/midi/playback.ts`(MIDI ライブラリの練習) | `createPreviewInstrument` で和音の楽器を作り、自前で管理(`stopPreview` の対象ではない) |
| E3 | `features/bass-practice/application/chordContextToneDriver.ts`・`rhythmMetronome.ts`・`freepatsBass.ts` | ベースの練習の伴奏・メトロノーム。自前の楽器。`freepatsBass` は `chordPreview` からも(ベースの音色で)呼ばれる |

**「すぐ無音であること」に頼っている場所は、見つからなかった。**
- リズムの判定は MIDI の入力の時刻で行い、音の消える時刻は使っていない。
- メトロノームは、`notes` の中のクリック音(止めれば一緒に消える)か、別の仕組み(E3)。
- 再生位置・ループの周は、`onStarted` / `onEnded` の「合図」と、自前のタイマーで管理している。止めた時点で合図(`stopped`)は同期的に出るので、音が数十 ms 残っても進み方は変わらない。
- 「次の音を同じ時刻に鳴らす」ために、前の音の消えるのを待つ場所も無い(止める → すぐ次を鳴らす、は B2・B3・B8・A5 にあるが、いずれも新しい楽器で鳴らすので、古い楽器が数十 ms 消えていくのとは別の経路)。

## 2. 「Gain を 12〜20ms で 0 に下げてから捨てる」にした場合

### 困る場所
1. **テスト**(§4)。`stopPreview()` の直後に `dispose` が1回呼ばれていることを確かめるものが3つある。
2. **楽器の出力に Gain を挟む必要がある**。`createPreviewInstrument(sound, output)` は、出力先を渡せる(Voicing Loop と同じ)ので、piano・electric-piano はそのまま使える。**ベース系(`clean-bass`・`singing-reference`・`freepats-*`)は出力先を渡せず**、`toDestination()` に直接つながる。`chordPreview.ts` の中の2つ(`createCleanBassInstrument`・`createSingingReferenceInstrument`)は、その場で直せる。`freepatsBass.ts` は、`options` に出力先を足す直しが要る(ほかの使い手 E3 にも触る)。
3. **エフェクトの後ろに Gain を置く**必要がある(electric-piano はリバーブまで含めた「最後」)。今の `dispose` は、リバーブの余韻もぶつ切りにしている。Gain を最後に置けば、余韻ごと下がる(これは良い方向の変化)。
4. **捨てるのが 12〜20 ms 遅れる**。その間、古い楽器と新しい楽器が同時に存在する(重なりは数十 ms)。連打が 50 回/秒を超えなければ、古いものは同時に 2 つまで(Voicing Loop も「最大 2 つ」に制限している)。メモリは、piano のサンプラー1つ分が一時的に倍になる程度。
5. **フェードをかける時刻**は、音の時計(`Tone.now()`)ではなく、タイマー(`setTimeout`)で `dispose` する必要がある。タブが裏に回って音の時計が止まっても、必ず捨てられるように(Voicing Loop も `AUDITION_RETIRE_MS = 24` のタイマー)。
6. **予約済みの未来の音**: フェードのあいだに、予約した音が(下がっている最中の)Gain を通して鳴りうる。ただし数十 ms で、音量はすでに下がっている。`dispose` で止める(今と同じ)ので、長くは残らない。

### 楽器を毎回作り直している理由(使い回せるか)
- **音色の切り替え**(`instrumentSound !== sound`)のときは、別の楽器(別のつなぎ)が要るので、作り直す。これは変わらない。
- **同じ音色でも作り直しているのは、急な道のとき**。理由は、`previewMidiNotes` が 1.5 秒先までの音を前もって予約する(`lookAheadSeconds = 1.5`)ため。Tone.js の楽器には、予約済みの未来の音だけを取り消す手段が(確認できた範囲では)無く、`dispose()` が「予約の取り消し」を兼ねている。ゆるやかな道では、同じ音色なら 1.1 秒のあいだ使い回している(テスト「reuses the %s instrument when chord cards are clicked rapidly」)。
- **使い回すための条件**: 予約の先読みを短くする(`dynamicTempo` の道は、すでに 90 ms 先までしか予約せず、1音ずつ `triggerRelease` する)か、Tone の `releaseAll(time)` が未来の予約も取り消すことを確かめる。**後者は、このStage では確かめていない**(要確認。実際の Tone.js で、先の時刻に予約した音が `releaseAll` で消えるかを測る実験が要る)。先読みを短くすると、タイマーが止まったとき(重い処理・裏のタブ)に音がずれやすくなる。今の 1.5 秒は「タイマーが止まっても音が時計に乗る」ためで、テスト「keeps note offsets on the audio clock when the rolling timer stalls」がそれを守っている。したがって、**先読みは短くしないほうがよい**。
- ピアノのサンプラーを作り直すコスト(音の読み込み・デコード)は、測っていない(要確認)。急な道のたびに作り直しているので、連打すると、鳴り始めが遅れる可能性がある。

## 3. Voicing Loop の audition の仕組みは、共通に取り出せるか

`ProgressionVoicingTransport.audition` の仕組み:
- 楽器 + `Gain` の組を2つ用意し、順番に使う(`auditionVoices[2]`)。
- 次の組を使うとき、前の組を `AUDITION_FADE_SECONDS = 0.012`(12 ms)で下げ(`releaseAll(now)` 付き)、次を `AUDITION_ATTACK_SECONDS = 0.005`(5 ms)遅らせて立ち上げ、立ち上げ後 12 ms で 1 にする。
- 捨てるときは、下げたうえで 24 ms 後に `dispose`(最大2つ)。
- 重要な前提: **audition は「1つのコードを2秒鳴らす」だけで、先の時刻の予約をしない**。だから、同じ楽器を使い回しても、前の予約が残らない。

**案**
- **案 A(おすすめ): `chordPreview` の中を直し、フェードの道具だけ共通にする**。
  - `rampOutputGain`・フェードの秒数・「捨てるまでの待ち」の定数を、小さな共通のファイル(例 `audio/outputFade.ts`)に取り出し、Voicing Loop と `chordPreview` の両方が使う。
  - `chordPreview` では、楽器ごとに `Gain` を持たせ、急な道(`disposePreviewInstrument`)を「Gain を 12〜20 ms で下げる → 楽器を手放す(`instrument = undefined`)→ 24〜40 ms 後に捨てる」に変える。古い楽器は、最大2つまで。次の再生は、新しい楽器で始める(今と同じ)。
  - 理由: 呼び出し側(30 か所)の使い方は変わらない。予約の取り消しという、`chordPreview` 固有の事情(§2)を、そのまま扱える。
- **案 B: audition の「2組を使い回す」仕組みごと、共通の部品にして `chordPreview` に使わせる**。
  - 向かない点: 2組の使い回しは「予約が残らない」前提(上の「重要な前提」)。`previewMidiNotes` は先読み 1.5 秒の予約をするので、使い回すと、前の予約が次の再生に混ざる。先読みを短くするか、予約の取り消しが確かめられるまでは、使えない。
  - 向く点(将来): ゆるやかな道(`chord` / `timeline`)の試聴は、2組の使い回しにすると、楽器の作り直しも減らせる。ただし、今は、そこは困っていない。

→ 案 A で始め、Stage 01 で、実際の Tone.js を使って、(1)フェード後に `dispose` すればプツが消えるか、(2)`releaseAll` が未来の予約を消すか、(3)ピアノのサンプラーの作り直しにかかる時間、を測るのがよい。

## 4. 今のテストで、`dispose` がすぐ呼ばれることを確かめているもの

直すと変わる(`stopPreview()` / 次の再生の直後に、`dispose` が1回呼ばれていると確かめている):

| ファイル | テスト(行) | 確かめていること |
|---|---|---|
| `src/audio/chordPreview.test.ts` | "plays raw MIDI notes in bounded windows and releases them on stop"(約 282〜308 行) | `stopPreview()` の直後に `electric.releaseAll` が呼ばれ、`electric.dispose` が 1 回 |
| 同 | "keeps note offsets on the audio clock when the rolling timer stalls"(約 332〜358 行) | `stopPreview()` の直後に `bass.dispose` が 1 回 |
| 同 | "replaces the active practice timbre without leaving a second graph sounding"(約 360〜378 行) | 次の再生の直後に、前の `bass.dispose` が 1 回、`releaseAll` も呼ばれる |

直しかたの見込みでも、要る手直し:
- 同じファイルの Tone の模擬(`Tone` を差し替えている部分)に、`Gain`(`gain.rampTo` / `linearRampToValueAtTime` / `cancelScheduledValues` / `getValueAtTime`)の模擬が要る。
- "notifies natural completion exactly once"(約 179〜193 行。終わりの 1.1 秒後に `releaseAll` と `dispose` が 1 回)は、終わりの道も同じフェードにするなら、待ち時間が数十 ms 増える。終わりの道は変えない(余韻が減衰したあとなので、プツが出ない)なら、変わらない。

変わらないもの:
- "reuses the %s instrument when chord cards are clicked rapidly"(約 196〜220 行)・"cancels a request while audio startup is pending"・"routes sampled Piano and every Electric Piano effect into the caller-owned output ..."(約 104〜136 行。`output.dispose` が呼ばれないこと): ゆるやかな道・出力先を渡す道は、変えない。
- `playbackController.test.ts`・`textTransport.test.ts`・`earPlayback.test.ts` など、`chordPreview` の代わりに偽のドライバを使うテスト: `stop()` が呼ばれたことしか見ないので、変わらない。
- `ProgressionVoicingTransport.test.ts`(約 130〜136・511・853・1227 行の `dispose` の数): Voicing Loop 自身の仕組み。案 A なら変えない(共通のファイルに定数と関数だけ移すので、数え方は変わらない)。
- ベースの練習の画面のテスト(`BasslinePracticeView.chordContext.test.tsx` の `disposed`・`degreePracticeSession.test.ts` の `session.dispose()`)は、それぞれの画面の自前の部品の `dispose` で、`chordPreview` のものではない。

## 5. 実機で、プツプツが出る画面を確かめる手順(利用者にお願いする)

準備: ヘッドホン。音量はふだんの半分くらい。ピアノ(sound は「ピアノ」)で一度、「エレピ」で一度、同じ手順を試す。

**対照(プツが出ないはずの側)**
1. Chord Dojo の練習で、コードのカードを素早く(1秒に3〜4回)8回押す(カードの聴き直し)。→ プツが出ないことを確かめる。
2. Voicing Loop で、停止中にコードのカードを素早く連打する。→ 出ないはず(参考)。

**プツが出うる側(急な道)。それぞれ、「連打」と「再生中に止める」を試す**
| 画面 | 手順 |
|---|---|
| 耳で弾く | 「1コードずつ弾く」の段階で、「今のコードを聴く(L)」を素早く8回。次に、`K`(前のコードから続けて)と、カードを押す(別のカードを、鳴っている最中に)。 |
| テキスト取り込みの再生 | 再生を始め、鳴っている最中に停止 → 再生を5回。ループをオンにして、折り返しの所(曲の終わりと頭)で、プツがないか聴く。位置を動かす(シーク)操作があれば、鳴っている最中に動かす。 |
| 補正画面の曲再生 | 再生を始めて、鳴っている最中に停止を押す。範囲のループで、折り返しの所を聴く。 |
| ベース練習(度数・ベースライン) | 「お手本を聴く」を押して、鳴っている最中に止める → もう一度、を5回。 |

**記録してほしいこと**(画面ごとに、表で): 画面の名前 / 音色(ピアノ・エレピ・ベース)/ 「止めるとき」「次を鳴らすとき」「ループの折り返し」のどこで鳴ったか / 毎回か、ときどきか / 「プツ」か「ブツッ」か「ざらつき」か。プツが出なかった画面も「出なかった」と書いてもらう(対照になる)。

**仮説との照らし合わせ**: プツが出る画面は、§1 の B の画面だけで、A・C のコード/進行の試聴では出ない、と予想している。A・C でも出るなら、仮説(急な道だけが原因)が違うので、教えてほしい。

## 6. 次の Stage に回すこと(要確認)

- 実際の Tone.js で、(1)Gain を 12〜20 ms で下げてから `dispose` するとプツが消えるか、(2)`releaseAll(time)` が、先の時刻に予約した音を取り消すか(取り消せれば、急な道が要らなくなり、楽器を使い回せる)、(3)piano のサンプラーの作り直しの時間、を測る(ブラウザで鳴らして録音して波形を見る)。
- `freepatsBass` に出力先を渡せるようにする影響(E3 の使い手の確認)。
- 実機の確認(§5)の結果を見て、直す対象の画面を決める。

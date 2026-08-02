# Contract 03 — Playback, Singing, Hints & Timing

---

## 1. Playback

既存Audio基盤を監査して再利用する。

優先:

1. PlaybackController
2. Tone.js graph
3. global master volume
4. preview lifecycle
5. Top Bar meter contract

禁止:

- mountごとのAudioContext
- route離脱後の発音
- oscillator / event leak
- Live MIDI inputのopen
- fake microphone meter
- playback timerをsetTimeoutだけで正とする

target event timelineを正とする。

---

## 2. Singing Flow

推奨順:

```text
Listen 1:
楽器を持たずに聴く

Listen 2:
任意で一緒に歌う

Solo Sing:
再生停止後に単独で歌う
```

`歌えた`ボタンを即時有効にしない。

### Minimum Dwell Gate

初期式:

```text
gateDuration =
clamp(phraseDuration * 0.8, 1.0 sec, 8.0 sec)
```

Gate経過後に`歌えた`を有効化する。

これは歌唱を録音・判定するものではない。

### Skip

`歌唱をスキップ`を明示提供する。

結果:

- `singSkipped = true`
- independentSuccess = false
- failure扱いにはしない
- Reviewと履歴へ記録

---

## 3. Singing Reference

ベース音域を歌えない問題へ対応する。

設定:

```text
Auto
Original
+1 Octave
+2 Octaves
```

Auto:

- target pitchを人声向け範囲へ移す
- melodic contourとinterval classを維持
- bassで弾く正解MIDI noteは変更しない
- singing referenceだけを移調する

同じexercise / settingから同じreferenceを生成する。

---

## 4. Hint Ladder

共通:

- Hint 0〜4
- 順番を飛ばさない
- 使用levelを保存
- Hintは失敗ではない
- Hint 3 / 4はindependentSuccessをfalse
- 最初からTABを表示しない

### Degree Echo

```text
Hint 1: Key / tonal context
Hint 2: note count + contour
Hint 3: degree sequence
Hint 4: note names + fretboard markers
```

### Rhythm Echo

```text
Hint 1: tempo / meter
Hint 2: start position
Hint 3: rhythm syllable / subdivision
Hint 4: full visual rhythm
```

### Bassline Echo

```text
Hint 1: chord progression
Hint 2: contour / root movement
Hint 3: degree sequence
Hint 4: note names + fretboard markers
```

---

## 5. Count-in / Metronome

Phase 5.16.1:

- Degree Echoではcount-inを必須にしない
- Play開始の視覚countdownは任意
- playback timelineを正とする

Phase 5.16.2:

- metronome必須
- 1または2小節count-in
- click音量
- count-in ON/OFF
- playbackと同じtempo / meter
- clickとtargetのscheduleを同じclockから生成
- route離脱で停止

Phase 5.16.3:

- Basslineでは1小節count-inを初期既定候補
- Vault sourceのmeterを尊重

---

## 6. Timbre

共通候補:

```text
Clean Bass
Muted Bass
Singing Reference
Metronome
```

音色研究をPhase 5.16へ持ち込まない。

決定論的で、same exerciseからsame audio eventsを作る。

# Contract 04 — Shared UX, Home, History & Accessibility

---

## 1. Practice Navigation

Sidebarは維持する。

```text
WORKSPACE
  Home
  Chord Capture
  Vault
  Practice
  Live MIDI

SYSTEM
  History
  Settings
```

`Practice`内:

```text
Chord Dojo | Bass Practice
```

5.16.1ではBass Practice内にDegree Echoだけを表示する。
未実装modeを動作するように見せない。

5.16.2以降にmode tabsを追加する。

---

## 2. Shared Vocabulary with Chord Dojo

概念語彙を揃える。

| Chord Dojo | Bass Practice |
|---|---|
| 見て弾く | Hint 4 |
| 名前で弾く | Note Name |
| 度数で弾く | Hint 3 |
| 近いKey | Transfer |
| 全Key | Advanced Transfer |

UI表記:

- `Manual Review`ではなく`自己評価`
- `Self-rated`は補助説明に使用
- `Transfer`は必要に応じて`移調チャレンジ`
- `Listen first. Fretboard second. TAB last.`はサブコピーとして使用可能

Domainを無理に統合しない。

---

## 3. Layout

```text
Practice Subnavigation
↓
Mode / Session Header
↓
Challenge Card + Session Side Panel
↓
Fretboard / Rhythm View
↓
Self Review / Transfer
```

Challengeを主役にする。

禁止:

- metricをChallengeより上へ置く
- 同格Primary CTAを複数
- fake score card
- 1024×720で下部へ到達不能

---

## 4. Primary Action

状態ごとに主操作を1つにする。

```text
ready       → 再生
recall      → 歌唱へ
singing     → 歌えた
thinking    → 演奏開始
playing     → 演奏終了
review      → 自己評価
transfer    → 移調チャレンジ開始
completed   → 次へ
```

Secondary:

- Hint
- Replay
- Skip Sing
- Stop
- Close

---

## 5. Fretboard

- 4 / 5 string
- left / right
- fret range
- target / hint display
- Hint 4までmarker非表示
- note / degree切替
- horizontal scroll
- screen-reader alternative
- color以外の区別
- 1024×720

Phase 5.16ではlive inputを表示しない。

---

## 6. Home

Phase 5.16.1で最小カードを追加する。

```text
今日のベース練習
残り 8問

次: Degree Echo
6度と♭7度の聞き分け

[練習を始める]
```

条件:

- 既存Homeの主役を壊さない
- 大型Dashboard化しない
- due 0なら`今日の復習は完了`
- first runなら`最初のセッションを始める`
- feature flag OFFなら非表示

---

## 7. History

Practice session summaryを既存Historyへ追加する。

カード例:

```text
Bass Practice
Degree Echo
8 / 10 completed
Self-rated Good or Easy: 6
No-hint independent: 4
Average listens: 1.6
```

自動精度と誤解させない。

---

## 8. Keyboard

共通:

```text
R      Replay
H      Hint
Space  Primary action
S      Sing completed
1      Again
2      Hard
3      Good
4      Easy
N      Next
T      Transfer
Esc    Stop / Close
```

Phase 5.16.2:

```text
M      Metronome toggle
C      Count-in toggle
```

要件:

- input/select中はshortcutを奪わない
- key repeatで多重実行しない
- focus visible
- focus restore
- live region
- reduced motion
- screen-reader順序 = visual順序

---

## 9. Viewport Matrix

```text
1024 × 720
1280 × 720
1366 × 768
1440 × 900
1920 × 1080
Windows 200% scale smoke
```

主要操作と最下部へ到達可能にする。

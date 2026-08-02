# Contract 01 — Honesty, Scope & Autonomy

この契約はPhase 5.16.1〜5.16.3へ共通適用する。

---

## 1. Honesty

Phase 5.16は自己評価モードである。

必須表示:

```text
自己評価
Self-rated
自動採点ではありません
```

表示禁止:

- Pitch Accuracy
- Rhythm Accuracy
- Duration Accuracy
- Overall Score
- cent accuracy
- analysis confidence
- input quality
- fake waveform from microphone
- fake input meter
- 自動解析したように見える改善文

表示してよい指標:

- completed exercises
- self-rated success
- no-hint success
- average listen count
- average hint level
- transfer success
- rating distribution
- issue tag count
- retention result
- streak

自己評価由来であることをUI・History・Homeで一貫して明示する。

---

## 2. Scope

Phase 5.16.1〜5.16.3は以下を共通非対象とする。

- microphone capture
- DI録音
- pitch / onset / duration detection
- automatic scoring
- low-B detection
- camera fingering
- cloud sync
- social
- full-mix source separation
- Practice専用Sidebar項目
- Vault schema変更
- Chord Dojo置換

---

## 3. 自動運用

通常のGate failureでは停止しない。

Codexが自動で行う:

1. failureを分類
2. 未コミット作業を保持
3. 根本原因を調査
4. 最小修正
5. targeted test
6. self review
7. 再修正
8. Gate PASS
9. report
10. commit
11. 次Stage

停止条件は`PLAN.md`に限定する。

---

## 4. Correctness

- same seed + same settings = same exercise
- exercise answerとplayback timelineが同一source
- Hint 3 / 4使用時はindependent successにしない
- Sing skip時はindependent successにしない
- fake completion禁止
- unsupported sourceを近似しない
- source削除時に別進行へ黙って置換しない

---

## 5. Privacy

- 完全offline
- external APIなし
- microphone permissionなし
- raw Vault MIDIをPractice logへ複製しない
- personal filename / pathを保存しない
- crash reportへexercise全文を入れない
- source snapshotは必要最小限
- recording data 0

---

## 6. Regression Protection

共通保護対象:

- Chord Dojo scoring
- Chord Dojo scroll
- Live MIDI lifecycle
- Analyzer
- Phase 5.14 MIDI Exporter
- Vault schema
- `fileVersion`
- Sidebar
- global volume
- Top Bar level meter
- existing History

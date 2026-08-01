# Contract 02 — Practice Domain, State Machine & Storage

---

## 1. State Machine

共通状態:

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

無効遷移を許可しない。

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

- Sing disabled設定時は`recall → thinking`
- Sing skip時は`singing → thinking`
- route leaveは保護後`abandoned`
- reviewからnextへ進むにはrating必須

---

## 2. Shared Types

```ts
type PracticeMode = "degree" | "rhythm" | "bassline";

type PracticeRating = "again" | "hard" | "good" | "easy";

type PracticeIssue =
  | "pitch"
  | "rhythm"
  | "duration"
  | "recall"
  | "fretboard";

interface PracticeExercise {
  id: string;
  version: 1;
  generatorVersion: string;
  seed: string;
  mode: PracticeMode;
  source: PracticeSource;
  tonalContext?: TonalContext;
  tempo: number;
  meter: TimeSignature;
  targetEvents: PracticeTargetEvent[];
  difficulty: PracticeDifficulty;
  hints: PracticeHint[];
  singingReference: SingingReference;
}

interface PracticeAttempt {
  id: string;
  exerciseId: string;
  sessionId: string;
  startedAt: string;
  completedAt?: string;
  listenCount: number;
  hintLevel: 0 | 1 | 2 | 3 | 4;
  singSkipped: boolean;
  singGateCompleted: boolean;
  responseLatencyMs?: number;
  rating?: PracticeRating;
  mainIssue?: PracticeIssue;
  independentSuccess: boolean;
  transferOfAttemptId?: string;
  generatorSnapshot: GeneratorSnapshot;
}

interface PracticeSession {
  id: string;
  startedAt: string;
  completedAt?: string;
  targetCount: number;
  completedCount: number;
  mode: PracticeMode;
  attemptIds: string[];
}
```

型名はrepository conventionsへ合わせる。

---

## 3. Independent Success

```text
rating = Good / Easy
AND hintLevel <= 2
AND singSkipped = false
AND singGateCompleted = true
```

を初期定義とする。

Again / Hardはfalse。

Hint 3 / 4使用時は、Good / Easyでもfalse。

この指標は自動演奏精度ではない。
`Self-rated independent success`と表示する。

---

## 4. Review Policy v1

```text
Again
→ 2〜3問後
→ 難度1段階down

Hard
→ session後半または次session冒頭
→ 同pattern、tempo少しdown

Good
→ 次sessionまたは翌日
→ 同難度、別key / variation

Easy
→ 2〜3日後
→ Transfer強化
```

決定論的queueを使用する。

同じ履歴から同じqueueを作る。

---

## 5. Storage

PracticeはVaultと別のversioned repositoryを持つ。

候補:

```text
appData/practice-v1.json
```

必須:

- atomic write
- temporary file + rename
- version
- migration
- corruption isolation
- backup
- write failure時にactive session保持
- app起動を妨げない
- Vault `fileVersion`不変
- source削除後もpast attempt表示可能

Practice履歴へ保存:

- exercise snapshot
- attempt metadata
- rating
- issue
- hint
- listen
- transfer relation
- sourceの必要最小snapshot

保存しない:

- raw MIDI
- audio
- personal path
- full source filename
- microphone data

---

## 6. History

既存HistoryへPractice Repositoryから派生表示する。

表示:

- session date
- mode
- completed count
- rating distribution
- no-hint self-rated success
- average listen count
- transfer result
- next focus

専用global event logの大規模改修は禁止。

---

## 7. Home Review Queue

HomeカードはPractice Repositoryからderiveする。

```text
今日のベース練習
残り N問
次: <mode / focus>
[練習を始める]
```

routeへ必要なquery/stateだけ渡す。

HomeカードからVaultやAnalyzerを変更しない。

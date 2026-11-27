# Loop Vault Phase 4.1.2 — D Candidate lane

- 作成日: 2026-07-25
- 対象モード: `phase4.1.2-v1`（**製品既定は `phase4-v1` のまま**）
- Timeline / qualityEvidence / canonical identity: **変更なし**

---

## 1. 3レーン

| レーン | 見出し（日） | 見出し（英） |
|---|---|---|
| progression | 使えそうな進行候補 | Progressions worth trying |
| vamp | ワンコード／ヴァンプ候補 | One-chord and vamp candidates |
| fragment | その他の断片 | Other fragments |

分類は `classifyCandidateKind`（Stage Cで追加）を候補生成時に適用し、`ProgressionBlockCandidate.kind` として渡す。**非永続・表示用**で、保存schemaは変わらない。

### 1.1 vampは削除しない

ワンコードループは**楽曲上の形**であって進行の劣化版ではない。Phase 4.0 でヴァンプを減点しない設計にした判断はそのまま維持し、専用レーンを与える。

補助レーンには短い説明を添える。

```text
vamp:     1コードで回すループです。進行として使う場合は展開が必要です。
fragment: 進行として不完全な短い区間です。
```

### 1.2 fragmentはfallback以外で主レーンへ入れない

Stage C の `kindRank` により fragment は最後に並ぶ。progressionが存在する曲では上位に来ない（`twoBarFragmentsInTop3 = 0` が56/56でPASS）。progressionが存在しない曲では fragment だけが残るため、そのまま表示される。

### 1.3 レーンが1つだけのときは見出しを出さない

ワンコードだけの曲（L06相当）で「ワンコード／ヴァンプ候補」という見出しと注記だけが並ぶと、**候補一覧が「本来あるべきものが無い」という通知に見える**。populatedなレーンが1つのときは見出しを省き、単なる候補リストとして出す。

### 1.4 分類のない候補は主レーンに残す

`phase4-v1` など分類を持たないモードの候補は `kind` が未設定になる。それらは主レーンに残す。既定モードの表示が変わらないことを保証するため。

---

## 2. Gate結果（56 file評価）

Stage C から**変化なし**。Dは表示のみの変更で、選定結果には触っていない。

| Gate | 判定 |
|---|---|
| `visiblePatternDuplicateCount = 0` | 56/56 PASS |
| `visibleSlotWasteCount = 0` | 56/56 PASS |
| `progressionPrecisionAt3 = 100%` | 56/56 PASS |
| `twoBarFragmentsInTop3 = 0` | 56/56 PASS |
| `rank-constraint order` | 56/56 PASS |
| `runtime <= 3000ms` | PASS |
| `deterministic` | PASS |
| `rank-constraint top3MinHits` | 39/56 |
| `rank-constraint allVisibleMinHits` | 41/56 |
| `coverage >= 90%` | 53/56 |
| `longestUncoveredRun < 8` | 54/56 |
| `occurrenceReachability = 100%` | 54/56 |

**PASSは7項目**。

---

## 3. 追加したテスト

`src/views/CaptureView.lanes.test.ts`（6件）

```text
orders progressions, then vamps, then fragments
keeps vamps rather than dropping them
omits a lane that has nothing in it
drops the headings when only one lane is populated
keeps the original card numbering across lanes
leaves candidates from an analyzer without classification in the main lane
```

カード番号はレーンをまたいでも元の順序を保つ。ユーザーが「候補3」と言うときの番号がレーン分割で変わらないようにするため。

---

## 4. 触っていない層

`matchWindow` / `smoothTimeline` / `qualityEvidence` / `chordIdentity` / `blockQuality` / `groupIntoPatterns` / `attachSourceVoicing` / 保存schema / `defaultAnalyzerMode`。

`OccurrenceList` も変更していない。各Occurrenceの個別試聴・保存はレーン分割の前後で同じ経路を通る。

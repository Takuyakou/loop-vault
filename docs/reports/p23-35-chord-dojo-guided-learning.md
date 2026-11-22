# P23-35:Chord Dojo「見本なしガイド」実装(途中停止の報告)

- ブランチ:`feat/p23-35-dojo-guided-learning`(基点 `fix/p23-31-review` / `37958aac`。理由:指示書の設計基準 P23-32-fix-1 の報告まで含む最新の P23 系統で、P23-33 の自動キーは Dojo のコードに及んでいないため)。master からは切っていない。
- コミット:`994781e8` p23-35-01 S1(ドメインと単体テストのみ)
- **結果:未完成で停止。** S1 は完成・検証済み。S2/S3 の入口と画面は試作したが、**ビルドしたアプリで「ガイドを始める」を押すと Dojo 画面ごと消える(アプリのメイン内容が空になり、ページの実行文脈も失われる)**。原因を特定できないまま、指示書の停止条件(未知の競合)に該当するため証拠を残して止めた。

## S0:実行 HEAD と書き込み経路(確認した事実)

- 基点 `37958aac`。`git status` はクリーンから開始(P23-34 の報告 1 つは未追跡のまま保護)。
- 通常の記録書き込み:`session.advance`(`matched`/`taskResults`)、`progress.applyAttempt`、`lapRecords`、`rememberRecent`、`recordPracticeOpen`、`storage`(`loop-vault:chord-dojo-v1:data`)。ガイドはこれらを一切呼ばない設計にした。
- 教材の元:組み込み `buildBuiltin(id, root)`、保存 `collect.ts` の `VaultProgression`(範囲は `progressionInRange`)。target は `progressionTarget`(保存音は exact、組み込みは core)、判定は `judgeChord`、表示は `targetSnapshot`/`GrandStaff`/`PracticeKeyboard`/`PracticeFrame`。

## S1:完成(コミット済み・単体 16/16 PASS)

`src/domain/chordDojo/guidedPractice.ts`(React も storage も持たない純粋層):
- `buildGuidedLesson`:2〜4 カードの連続範囲を凍結(コード同一性・notes・beats・judge/bass/top・元の位置)。範囲外・1 コード・5 コード以上・空 notes・不正 BPM は拒否。**各カードで `judgeChord(target, target.notes).ok` を開始前に検査**し、通らなければ理由つきで拒否(音の追加・削除はしない)。
- セッション:`startGuidedSession` / `restartGuidedSession` / `recordGuidedCard` / `retryGuidedRound` / `hintGuided` / `advanceGuidedStage` / `endGuidedSession`。段階は ①listen ②see ③recall ④tempo ⑤apply。`epoch`/`attemptId` で古い結果を弾く。補助(`hinted`)・自己確認(`self`)・未確認を区別し、**「合格」とは表示しない**。
- 表示 policy:`guidedAnswerVisible`(① ② だけ表示)・`guidedHintVisible`(③ のヒント時だけ現在カードを表示)。
- 単体テストは独立 fixture(手書きの C/Am7/F、G7、C/E、5 度省略、ルートレス相当)で、製品関数から期待音を再計算していない。16 件 PASS。

## S2/S3:試作(未コミット・未接続)

- `src/views/chord-dojo/GuidedPracticeView.tsx`(未追跡):開始設定(教材・キー・範囲・テンポ)、5 段階、お手本、ヒント、結果、終了。既存の `PracticeHead`/`PracticeCard`/`GrandStaff`/`PracticeKeyboard` を再利用。
- `e2e/p23-35-guided-learning.spec.ts`(未追跡):OFF の通常開始・ON の 5 段階・ヒント・終了の 3 本。
- 入口(チェックボックス)と `ChordDojoView`/`dojoNav` の接続は**試作後に元へ戻した**(アプリを壊した状態を残さないため)。差分は上の 2 ファイルのみ未追跡で残している。

## 停止した理由(証拠)

1. `npx playwright test e2e/p23-35-guided-learning.spec.ts`:
   - OFF の 1 本は PASS(チェックボックスは既定 OFF、通常の「練習する」は従来どおり練習画面へ、バッジ不変)。
   - ON の 1 本:「ガイドを始める」を押した直後、`[data-dojo-screen]` が DOM から消え、`body` のテキストは skip link だけになる。その後 `page.evaluate` が **Execution context destroyed**(ページの再読み込み/クラッシュ相当)。
2. 同じコンポーネントを jsdom で描画すると、開始設定→① まで正常に描画される(`guided-practice` が存在)。
3. 切り分け:`GrandStaff` を静的要素に置換 → 変化なし。`PracticeKeyboard` も置換 → 変化なし。React の描画エラーは error boundary の probe に届かず(probe は「none」)、**effect かその外側**で落ちている可能性が高い。production ビルドでは `pageerror`/`console.error` に何も出ない。
4. 指示書 §8 の「未知の競合/依存の場合は証拠と最小代替案を出して停止」に該当すると判断した。**推測で製品コードを直していない。**

## ④ テンポ段階(設計どおり「対象外」)

既存のテンポ段階は `tempoPlan()` が `ProgressionVoicingTransport` と Voicing Loop の練習記録に結びつき、View 側の `commit`/`advance`/lap と密結合している(§4 の「既存tempoがViewへ密結合」)。抽出は通常経路の改造を要求するため、指示書の代替規定に従い ④ を「対象外」と明示して ⑤ へ進む設計にした(`guidedStageResultText` が「対象外」を返す)。

## 未実行

- focused/FEATURE/UI/FULL:S1 の単体(16/16)以外は未実行。**FULL は実行していない**(機能が動かない状態で FULL を回しても意味がないため。指示書の「最終コードで fresh FULL 1 回」は未達)。
- 3 幅の画面確認、MIDI の固定入力 E2E、記録非更新の storage 境界テスト:未実行。

## 残した物

- 報告(これ)と `done/P23-35.md`。
- 未追跡の試作:`GuidedPracticeView.tsx` と `e2e/p23-35-guided-learning.spec.ts`(接続していないので既存画面に影響しない)。P23-34 の調査報告も未追跡のまま保護。
- 次の実装指示に必要な最小の続き:①production で落ちる原因の特定(vite dev + React の error overlay で再現)、②effect の副作用(interval/`useDojoMidi`/`playbackController`)を外した状態での再現確認、③④ の扱い(対象外のままでよいか)、⑤ の受け皿の確定。

---

# P23-35-fix-1 追記(2026-11-16 20:55 JST / 基点 994781e8 / 最終HEAD 7f20894c)

上の「停止の報告」はそのまま残す。以下は P23-35-fix-1 の指示(`P23-35-fix-1-resume.md`)に対する追記で、
①画面消失の分類、②S1 契約の不足の修正、③UI adapter の不足の修正、④tempo の解釈訂正と接続、
⑤検証と未実行を時点つきで記録する。**master への merge / push / tag / release / EXE 生成は行っていない。**

コミット: `3304da33`(S1 ドメインと反例テスト) / `74812380`(入口・view・④・E2E) /
`5f8d4b27`(テンポ初期値・上下限・settle を既存 Dojo 設定へ) / `5cbe3d97`(入口を 1 行に保つ) /
`ce701113`(① の音声終了テスト) / `7f20894c`(この報告)。

## 1. 画面消失 — 何を確かめ、どう分類したか

### 1-1. 使った計測(一時 spec。最終候補から削除済み)

同じ合成教材(定番の進行の先頭カード)・同じブラウザ(Playwright chromium)・1280×720 で、
`page.on` と init script により次を時系列で記録した。

- URL、`framenavigated`(main frame か)、`domcontentloaded`、`load`、`page close`、`page crash`、`browser disconnected`
- document への request、failed request、dialog、console(全種)、`pageerror`
- `beforeunload` / `pagehide` / `unload` / `window.error` / `unhandledrejection`(init script 内)
- click 直前・直後の `#root` の子要素数、`[data-dojo-screen]` の有無と値、`body.innerText`、React root の状態
- click 後 0.8 秒・2.3 秒の 2 点でも同じ計測(teardown の影響かどうかを分けるため)

### 1-2. 結果(production preview / dist、1280×720)

2 とおりの最小接続で試した。どちらも `guided-start` の click 後も Dojo の画面は残った。

- 接続 A(採用): ガイドを独自の画面として `ChordDojoView` の入口で早期 return し、
  `data-dojo-screen="guided"` の section に `GuidedPracticeView` を描く。通常の `one()` は呼ばない。
- 接続 B(比較用): 既存 `one(task,'builtin-progressions')` で `screen='practice'` と `today` を作ってから、
  既存 practice 分岐の内側で `GuidedPracticeView` を描く(試作時に近い形)。

両方に共通して、click 後 2.3 秒まで次が観測された。

- `document request` は最初の `/?p12=midi` の 1 回だけ。click 後の新しい document request は無い。
- `framenavigated` は最初の 1 回だけ(main frame)。click 後の navigation は無い。URL は不変。
- `DOMContentLoaded` / `load` は最初の 1 回だけ。click 後の再 load は無い。
- `page close` / `page crash` / `browser disconnected` / dialog / failed request は 0 件。
- `pageerror` は 0 件、`console.error` も 0 件(出たのは Tone.js の log と AudioContext の warning だけ)。
- `#root` の子要素数は 4 のまま(`skip link` + `lv-app-frame` + …)。`body` は通常のアプリ全体。
- `[data-dojo-screen]` は click 後も存在し、値は A が `guided`、B が `practice`。
- `guided-practice` が表示され、① の文言とカードの答えが出ている。

### 1-3. 分類

- **描画例外ではない**: 例外も error boundary への到達も無く、画面は描画されている。
- **navigation / reload ではない**: click 後に document request も `framenavigated` も無い。
- **browser crash / close ではない**: crash/close/disconnect が 0 件で、click 後 2.3 秒まで評価できる。
- **テスト後処理の artifact ではない**: 同じ page で click 後 2 点の `page.evaluate` が成功している。

したがって 994781e8 時点の未追跡 view と、上の 2 つの接続では**現象を再現できなかった**。
当時の「`Execution context destroyed`」は、画面が消えた状態で次の locator / evaluate が失敗し、
その後 teardown に入ったことの結果として説明できる(navigation の証拠は無い)。
**試作時の接続コードは git に残っていないため、当時の接続のどこが画面を消したかを断定はしない。**
断定できるのは「ガイドの view 自体・effect・既存 clock の再利用が、production でも dev でも画面を
消さない」ことまでで、これは下の 1-4 と §5 の再実行で確認した。

### 1-4. dev と production preview の比較

- production preview(`vite build` + `vite preview`、fixture 有効ビルド): ガイドの spec 5 本 PASS(最終コード `ce701113`)。
- dev(`vite dev`、StrictMode + React error overlay 有効、fixture 有効): 同じ 4 本 PASS(`74812380` のツリー。
  追加した ① の音声終了テストは dev では回していない)。
- jsdom(前回の報告)も含め、3 つの環境で同じ view が動く。

### 1-5. 残したもの

- 診断用の spec、診断用の dev 設定、診断用の console.log は最終候補から削除した。
- 一時的に切り離した既存コードは無い(A/B の差分は上に記録し、最終は A のみ)。

## 2. S1 契約の不足の修正(`src/domain/chordDojo/guidedPractice.ts`)

### 2-1. 古い結果の拒否

- `GuidedCardTicket { sessionId, epoch, attemptId, cardIndex, stage }` を追加。
  view は入力採取の開始時に `guidedTicket(session)` で取得し、判定結果と一緒に reducer へ渡す。
- `recordGuidedCard(session, ticket, ok, message)` は次の順で拒否する:
  `ended` → `not-judging`(①⑤) → `stale-session`(sessionId 不一致。**新 session と旧 session の
  epoch が同数でもここで拒否**) → `stale-attempt`(stage/epoch/attemptId/cardIndex のいずれか不一致)
  → `already-judged`(同じカードの成功は 1 回だけ)。
- 受理のたびに `attemptId` を進めるので、同じ ticket の二重配送は 2 回目で `stale-attempt`。
- `endGuidedSession` は status と epoch の両方を進め、終了後の結果を拒否する。
- `rearmGuidedInput`(MIDI 切断/再接続)は epoch と attemptId を進め、再接続前の結果を拒否する。
- ④ 用に `recordGuidedTempoCard(session, ticket, ok)` を追加。同じ ticket 規則で、小節境界ごとに
  成否を記録し、成否にかかわらず次のカードへ進む(1 周を最後まで通したら `roundComplete`)。
- 反例テスト(手書き fixture): 旧カード、旧周(もう一度)、旧段階、終了後、終了まで進めた後、
  再接続前、同じ ticket の二重成功、epoch が同数の旧 session、④ の周をまたぐ境界。**36 件 PASS**。

### 2-2. 教材 snapshot

- `GuidedCard` は `event: DojoChord`(教材の chord を `structuredClone` し、`notes` も別配列にコピー)・
  `chord`(event.chord)・`notes`(コピー)・`beats`・`sourceIndex`・`index`・`target` を持つ。
  `source`(保存音の occurrence)・`keyContext`・`degree`・`referenceHands`・`displayFingers` は
  落とさずに保持する。`progressionTarget({...event, notes})` に渡すので、保存音の `source` がある
  教材は既存契約どおり `judge:'exact'` になる。
- 範囲は `resolveRange` で検証する。整数・有限・`0 <= start <= end <= total-1`・2〜4 枚。
  NaN・小数・範囲外・start>end は**理由つきで拒否**し、clamp しない。
- 元の位置(`sourceIndex`)と session 内の位置(`index`)を分けて保持する。
- 反例テスト: 入力の `notes.push` / `length=0` / `beats` 書き換え / chord.label 書き換え後も
  lesson・target・notes・beats・identity が不変。`source` が exact を保つ。hand/finger が残る。
  範囲の 5 反例。**製品関数の出力を期待値にしていない**(期待値は手書きの音)。

### 2-3. ヒント状態

- 周の補助(`hintUsed`)と、いま開示中のカード(`hintCard`)を分離した。`selfConfirmed` は別の事実として
  保持し、ヒントと自己確認が上書きで消し合わない(`guidedAssistanceLabel` は
  「補助あり（自己確認）」を返す)。
- `hintGuided` は現在カードだけを開示し、次のカードへ移ると `hintCard` は `null` に戻る(周は補助ありのまま)。
- 明示試聴(`markGuidedHint`)もヒント。③⑤ の試聴はその周を補助ありにする。
- `guidedCardAnswerVisible(session, index)` で**カード単位**に表示可否を返す(全カード一括ではない)。

### 2-4. 結果の意味

- ① は `markGuidedListenPlayed`(再生の `completed` でのみ呼ぶ)が無ければ `未確認`。
- ② の完了は「見ながら」と表示し、**「見本なし」とは表示しない**。
- ⑤ の「試して終了」は `selfConfirmed` を立てて `試して終了（自己申告）`。合格とは表示しない。
- 「もう一度」は前の周を `rounds` に残す(結果・補助・自己確認・attemptId)。
- `guidedMaterialsVisible` は ③④⑤ で教材名・コード列・度数を隠す。

## 3. UI adapter の不足(§3 の各項目)

| 指示の項目 | 対応 |
|---|---|
| ChordEntry を poll するが MIDI subscription が無い | 既存の `liveMidiService.subscribeBatches` を購読し、既存 practice と同じ timestamp 計算で `ChordEntry.event` に渡す。poll は既存と同じ 10ms |
| `useDojoMidi(false)` では演奏音が有効にならない | `useDojoMidi(true)` に変更(既存の入力ピアノ)。mute は使わない(自分の演奏音は必要) |
| アンマウント/段階遷移の preview 停止がコメントだけ | 段階/status 変化と unmount で `playbackController.stop()`、④ は transport も停止 |
| recall 時も `PracticeHead.title` に lesson.name | ③④⑤ は title を「見本なしガイド」にし、degrees を出さない |
| `visible` を全カードへ渡し 1 件の hint で全開示 | `guidedCardAnswerVisible(session,index)`。ヒントは現在カードだけ |
| `materialFor` の beats が `source.chords[index]` でずれる | `progressionInRange` が返す entry をそのまま使う(部分範囲の beats 調整も既存関数のまま) |
| builtin の keyLabel が常に major | `keyLabel(root, builtin.mode)` |
| source/hand 情報の切り捨て | `GuidedCard.event` に保持。表示は `frozenDisplay` → `targetSnapshot(plan)` → `snapshotFingerLabels` |
| ① のお手本が現在カード 1 つだけ | `type:"timeline"` で範囲全体を 1 回再生。`onEnded('completed')` のときだけ ① を取り組み済みに |
| epoch 照合前に最新 activeCard へ古い結果 | ticket を入力採取時に取得し、reducer 側で照合 |
| next が音声/処理中も押せる | `previewing || tempoRunning` 中は 次へ/もう一度/お手本 を disabled |
| 戻る/自己確認等が元指示と未一致 | 戻るは一覧へ。MIDI が無いときだけ「弾けた(自分で確認)/まだ」を出す。Esc は再生/テンポの停止のみ(段階移動・破棄をしない) |
| ガイド中に通常のキー操作が動く | `ChordDojoView` のグローバル keydown をガイド中は無効化(Enter で通常 practice が進まない) |
| テンポ初期値・上下限が既存 Dojo と違う | 開始設定の初期値を `file.settings.progBpm`、上下限を 30〜240 にし、`ChordEntry` の settle も `file.settings.settleMs` を使う(`5f8d4b27`) |

GrandStaff と PracticeKeyboard は元に戻した。debug の仮置きは無い。

## 4. ④ tempo の解釈訂正と接続

前回の「④ は全教材で対象外」は**誤り**だった。実コードを確認した結果:

- `tempoPlan(chords,bpm)` は block を作り、`buildProgressionVoicingPracticeSnapshot` と
  `resolveProgressionPracticeVoicings` を呼び、`ProgressionVoicingTransport` を返すだけ。
  **この関数の中に Dojo 成績の書き込みは無い。**
- 記録との結合は `ChordDojoView` 側の `commit` / `advance(...,{recordedTempo:true})` /
  `recordTempoRound` にあった。ガイドはこれらを一切呼ばない。
- そこで `tempoPlan` を意味変更なしに 2 つへ分けた:
  `tempoPlanData(chords,bpm)`(snapshot + plan。時計は作らない)と
  `tempoPlan`(= `tempoPlanData` + `new ProgressionVoicingTransport(true)`)。
  追加で `canUseTempo(chords,bpm)`(同じ計算を試すだけ)を用意し、開始設定で教材ごとに判定する。
- ガイドの ④ は `tempoPlan` の時計をそのまま使い、`onTransportBeat` の小節境界で
  `recordGuidedTempoCard` を呼ぶ。カウントイン 0、参照音なし、メトロノームは既存設定。
  ヒント(明示試聴・見本確認)では時計を止め、周を先頭からやり直し、補助ありにする。
- **対象外になるのは「既存の時計で snapshot を作れない教材」だけ**。その場で理由を出して ⑤ へ進める。
  全教材 `tempoAvailable=false` にはしていない。

## 5. 検証(実行したもの・結果)

- 単体(この領域): `guidedPractice.test.ts` **36/36 PASS**。
- FEATURE(変更ファイル指定、fresh): PASS — App TypeScript / source contracts / class lint / changed ESLint /
  Vitest 105 / Playwright 52。(※ `74812380` より前のツリー。最終コードは下の FULL で確認)
- ブラウザ(production preview、fixture ビルド、1280×720): `e2e/p23-35-guided-learning.spec.ts` **5/5 PASS**
  (OFF の通常開始、ON の 5 段階+MIDI 固定入力+③ の非表示+④ の開始/停止/ヒント停止+記録非更新、
  ガイド終了、① の音声終了、1440/1280/768 の 3 幅。2 回連続でも 10/10 PASS)。
- 同じ spec を dev(StrictMode + overlay)でも **4/4 PASS**。
- `npm run lint` PASS。`npm run build`(tsc + vite) PASS。
- 1 回目の FULL で、入口の追加が既存の `p22-01-back`(戻るボタンの y が +4px)と
  `p22-01-list`(5 幅の横 overflow: `.sr-only` の 1px 要素)を落とした。入口を 1 行に収め、
  説明を `title` と `aria-label` に移して `5cbe3d97` で修正し、両 spec と新規 spec の **42/42 PASS** を確認した。
  既存の期待値・snapshot は変更していない。
- FULL: **PASS** — `ce701113`(dirty tracked 0、cache 無効、fresh)。
  App/E2E TypeScript・Repository ESLint・class/source lint・phase docs・AI handoff・privacy scan・
  runner contracts 40/40・production build・gallery excluded すべて PASS。
  Vitest 6839/6841(既存 skip 2)。Playwright full 1147/1149(既存/条件付き skip 2)、heavy 53/53。
  `goto` の開き直り 0 回、FULL 中の tracked PNG 変更なし。所要 984.7 秒。
  FULL はコード `ce701113` で実行した。最終コミット `69d9f6dc` はこの報告だけの差分で、コードは変えていない。

## 6. 未実行・制約

> ※ この節は fix-1 時点の未実行。④ 1 周・自己確認・a11y・保存比較は下の fix-2 追記の
> §2〜§5 で実施済み(本文は履歴として残す)。

- MIDI は**合成 fixture の固定イベント**。実機 MIDI は未接続。
- 音は聴いていない(headless)。① の「取り組み済み」は、範囲の再生が終わるまで 次へ が押せないこと、
  終了後に取り組み済みになることを E2E で確認した。耳での確認ではない。
- ④ は開始・停止・ヒント停止・対象外判定をブラウザで確認し、カード境界の消費は単体で確認した。
  **1 周を最後まで実演奏する E2E は回していない**。
- 自己確認のボタンは MIDI が無いときだけ出る。E2E では通していない(単体と分岐の確認のみ)。
- アクセシビリティは FULL の既存 a11y spec と、既存の role/label の再利用に依存する。
  ガイド専用の新しい a11y テストは追加していない。
- 3 幅は「横 overflow が増えない・操作できる」の確認。見た目の総合評価はしていない。
- 学習効果は未検証。ガイドはセッションのみで、永続記録を作らない。

---

# P23-35-fix-2 追記(2026-11-16 22:30 JST / 基点 `877e6180` / 製品コード `6b62acbe` / FULL 実行 HEAD `1bfd3639`)

fix-1 の実装は維持し、受け入れ検証の不足だけを補完した。新機能は追加していない。
今回の検証で見つかったガイドの不具合 5 件は、原因を特定して最小修正した(§3)。製品の
judge / 既存 clock / 保存 schema の契約は変更していない。

## 1. 独立した固定期待値(fixture 表)

期待値はすべてテスト内の literal。`buildBuiltin` / `progressionTarget` / DOM / 保存 JSON から
テスト時に再計算していない。由来は次の 2 つの公開物だけ。

- `builtins.p12-4.expected.json`: リポジトリに固定されている表示音の golden(転記)。
- `src/testing/dojoJudgeAnswers.ts`: 独立に手書きされた公開合成の答え(既存)。

| # | 教材の選び方 | コード(表示順) | 期待 notes(literal) | beats | judge 契約 |
|---|---|---|---|---|---|
| 1 | 定番の進行 → キー C を明示 → 見出し「3-6-2-5」 | Em7 / A7 / Dm7 / G7 | `[52,59,62,67] [57,61,64,67] [50,60,65,69] [55,62,65,71]` | 4,4,4,4 | core |
| 2 | 同上 → 見出し「裏コードのターンアラウンド」 | Cmaj7 / E♭7 / Dm7 / D♭7 | `[48,59,64,67] [51,58,61,67] [50,57,60,65] [49,56,59,65]` | 2,2,2,2 | core |
| 3 | `?p104=judge` → 自分の進行 → 全体 → 設定で開始 9・終了 12 | Csus4 / Cmaj7/E / Cmaj7 / Cmaj7 | `[48,53,55] [52,55,59,60] [48,55,59] [52,55,59]` | 4,4,4,4 | すべて exact(保存音の occurrence あり) |
| 4 | adapter テスト用の手書き `VaultProgression`(下記) | Cmaj7 / Cmaj7/E / Dm7 / G7 | `[48,55,59,64] [52,55,59,60] [50,57,60,65] [55,59,62,65]` | 2,6,4,4(範囲で clip) | exact |

- 表 3 は 3 度/ルートの省略と slash を含み、コード構成音の再生成では同じ音列にならない
  (`[48,55,59]` は C-G-B で 3 度なし、`[52,55,59]` は E-G-B でルートなし、`Cmaj7/E` は slash)。
  手書きの `source` occurrence も持つので exact のまま。
- 表 4 は `chordBeatRanges` を `{0-2, 2-8, 8-12, 12-16}`、`task.range={startBar:1,endBar:2}` とし、
  範囲境界で 6 beats に切り詰められることを確認する(beats/notes/source の対応)。
- core の教材(表 1・2)は既存契約のまま。すべて exact へは変えていない。

## 2. 検証した層と結果

| 項目 | 層 | 結果 |
|---|---|---|
| ② の鍵盤/楽譜/カードへ渡る音 = 固定期待値 | jsdom(adapter)+ browser | PASS(表 1・3・4 の notes 一致、`[data-score-midi]` 不使用の確認は ③) |
| 試聴要求の notes と長さ = 固定期待値 | jsdom: `playbackController.play` を spy | PASS。`type:"timeline"`、`durationBeats=[2,6,4,4]`、`explicitMidiNotesByEventId` が表 4 の notes。呼び出し引数の一致であり、実波形の同等性ではない |
| ②③ を固定 MIDI で全カード完了 | browser(`__p12Midi` の固定イベント) | PASS(表 1: 4/4、表 3: 1 枚目のみ確認 + exact の音域拒否) |
| 不足音・明確な余分な音で成功/送りしない | browser | PASS(表 1 の 2 枚目に +1 半音 → 「余分な音」で送らない、表 3 は 1 オクターブ上を音域違いで拒否) |
| ③ で正解が隠れ、失敗で不足音名を出さない | browser | PASS(全 4 カードの label と notes が body の HTML に無い、`[data-score-midi]`/`[data-target-id]` 0、誤りは「まだ合っていません」) |
| ヒント試聴後は現在カードだけ開示、次は隠れる、周は補助あり | browser | PASS(0 枚目のみ開示 → 成功で 1 枚目は「?」、周の補助は保持) |
| 部分範囲の beats/source/notes 対応 | jsdom(adapter) | PASS(表 4 の timeline 長) |

## 3. ④ を 1 周演奏する検証(実 tempo 経路)

各テストは実 `tempoPlan` の clock で 1 周し、MIDI は進行状態(`guided-tempo-status` の `（n/N）`)
に同期して固定 fixture の音を入れた。固定 sleep でカード開始/完了を推測していない。
BPM 120・2 beats/カードで 1 周 4 秒。

| ケース | 結果 |
|---|---|
| A 全カード正しい | PASS — 4/4、自然終了、次段階へ。カードごとに記録される |
| B 中間カードを明確に誤り | PASS — 3/4。誤ったカードは成功にせず、他は記録 |
| C 途中停止 → 先頭から再開 | PASS — 停止で半周の判定を捨て、再開は `（1/4）` から。二重評価・二重終了なし |
| D ヒント操作で停止 → 補助あり → 先頭から | PASS — 完了後も結果は「補助あり」で、「見本なし」と報告しない |
| E 最終カード後の残り Note On / 遅い callback | PASS — ⑤ に判定は増えず、保存記録も不変(§4) |

### 見つけた不具合と最小修正(実装)

1. **④ が最初の 1 カードしか記録しなかった**(A で発覚)。`close()`/`armTempo()` が
   `sessionRef.current` を読んでいたため、境界ごとに `setSession` の反映前の session を arm し、
   次の記録が stale として捨てられていた。修正: tempo の closure 内で適用済み session を
   ローカルに持ち回る(`live = applied.session`)。全カードが記録され 1 周が完了する。
2. **停止→再開で半周の判定が持ち越された**(C)。修正: 停止時に部分的な周を破棄して先頭から
   やり直す(`retryGuidedRound`)。自然終了では破棄しない。
3. **② の自己確認が「見ながら」と同じ表示だった**。修正: `見ながら（自己確認）`/
   `見ながら（補助あり・自己確認）` と表示し、MIDI 判定と区別する。
4. **④ のヒント後に前回の「N/N 合いました」が残った**。修正: ヒント/停止で summary を消す。
5. **開始・段階移動で focus が body に落ちた**。修正: 段階見出しの説明へ focus を移す
   (`tabindex=-1`、答えは含まない)。

## 4. 保存記録の保護(入口から終了まで)

比較の起点は**通常一覧が出た後・ガイド ON の前**。事前に意味のある記録を隔離 storage に入れた。

- 種: Dojo store に「途中 cursor(`0:recall:0:1`)・taskResults・matched 4・仮の合格・passed の型・
  keys/recent」、`dojo-recent:v1` に 2 件、`practice-opens:v1` に 1 件。
- 比較した面: `loop-vault:chord-dojo-txt-jazz-v1:data`(現在の Dojo 記録。today/cursor/成績/周回)、
  `loop-vault:chord-dojo-v1:data`(旧)、`loop-vault:chord-dojo-theme-v1:data` /
  `-theme-ranges-v1:data`(旧テーマ)、`loop-vault:dojo-recent:v1`、`loop-vault:practice-opens:v1`、
  `loop-vault:voicing-drill-v1:data`、`loop-vault:jazz-progressions-v1:*`、
  `loop-vault:original-practice-v1:*`。
- 除外(インフラ。理由: 練習成績ではない設定/接続状態): `global-bpm`・`master-volume`・
  `preview-sound`・`metronome-enabled`・`live-midi-*`・`p10-*`(表示/試聴の好み)・
  `voicing-loop-*`(Voicing Loop の好み/最近/音源。ガイドは触らない)・`llm-preferences`・
  `advisor-metrics`・`progression-midi-export-enabled`・`voicing-practice-preferences`。
- 時点: ON 前 → ON → 教材選択 → 設定変更(範囲/テンポ) → 開始 → ② 誤り → ② 成功 → ③ 入る →
  ③ ヒント → ③ 成功 → ④ 入る → ④ 開始 → ④ 停止 → ⑤ 入る → ⑤ 試聴 → 終了 → 一覧へ →
  2 回目のガイド(中断) → 一覧へ。**全時点で意味的に同一**(オブジェクト比較)。
- 終了後、ホームの通常の「続きから」(`practice-start`)で同じ課題・段階
  (`0:recall:0:1`)に戻れることを確認。
- 自己確認のみの経路(MIDI 無し)でも、開始前と終了後で同じ比較が一致。

## 5. 自己確認とアクセシビリティ

- 自己確認のみで ②③ を最後まで進められる。結果は `見ながら（自己確認）` /
  `補助あり（自己確認）` で MIDI 判定と区別し、⑤ は `試して終了（自己申告）`。保存記録は不変。
- キーボードだけで ON(Space)→教材(Enter)→開始(Enter)→②③④ を操作できる。
- checkbox の accessible name は「見本なしガイド」+「聴く・見て弾く・思い出す、の順に練習します。
  通常の成績には加算しません」。
- ガイド中は通常 Dojo の global Enter が動かない(Enter を押しても段階が動かず、通常 practice も
  開かない)。Esc は再生/テンポの停止だけを行い、段階を動かさない。
- ③④ で答えが漏れない: 全カードの label と notes が body の HTML(テキスト・属性・sr-only・
  live region を含む)に無いこと、`[data-score-midi]`/`[data-target-id]` が 0 であることを確認。
- axe: 開始設定・③・④ のガイド部分に違反 0。
- 3 幅(1440/1280/768)は既存 spec で「横 overflow なし・主要操作が到達可能」を確認済み。

## 6. 画面消失についての報告表現の訂正

fix-1 の §1-3 に「view/effect/clock が画面を消さないと証明した」「`Execution context destroyed`
は teardown の結果として説明できる」と読める表現があったが、これは**言い過ぎ**だった。訂正する。

- 採用する結論: **現在の接続では dev / production とも再現しない。旧接続が git に残っていないため、
  当時の根因は未確定。** teardown は説明可能な仮説であって確定ではない。
- 今回確認できたこと: 現接続で開始→終了までをブラウザで通しても画面消失は起きない(§2・§4 の
  E2E)。それ以上は主張しない。
- この歴史的未確定事項は、実装の blocker にはしない(現行経路の動作は上記で確認済み)。

## 7. 検証の実行結果(コマンド)

- focused: `guidedPractice.test.ts` 37 件 + `GuidedPracticeView.test.tsx` 2 件 = **39/39 PASS**。
- ガイド E2E: `e2e/p23-35-guided-fix2.spec.ts` **9/9 PASS**、`e2e/p23-35-guided-learning.spec.ts`
  5/5 PASS(関連 43 件も PASS)。
- 関連回帰: `dojo-display-judge`・`dojo-long-hardening`・`accessibility` の 20 件 PASS。
- lint PASS / app・e2e TypeScript PASS / build PASS。
- **fresh FULL: FAIL(1 件)。** `1bfd3639`、cache 無効、dirty tracked 0。実行時間 約 13 分。
  - PASS: Source contracts / AI handoff / Class lint / Phase docs / Runner contracts 40/40 /
    Privacy scan / E2E TypeScript / Production build / Repository ESLint / App TypeScript /
    Gallery excluded。Vitest **6842/6844**(既存 skip 2)。
  - Playwright full: **1155 passed / 1 failed**。失敗は
    `e2e/p23-23b-ear-result.spec.ts` の「C1/X3: a question without a name shows the key and the
    degrees only」で、「名前のない問題」が出るまで最大 24 問進めるループが 24 問で尽きた
    (`ear-result-name` が 1 件残る)。**耳の練習(乱択の問題バンク)の既存 spec で、P23-35 の
    ガイドの変更ファイルを import していない。**
  - 証拠の切り分け: 同じ spec を単独実行すると **8/8 PASS**(2.3 分)。再現しない順序/乱択依存の
    失敗と判断した。指示(§6.5「FULL が落ちたら追加修正/再実行せず、失敗証拠を報告して停止」)に
    従い、FULL の再実行・当該 spec の修正はしていない。
  - heavy pass は full の失敗後に実行されていない(ログに heavy の行が無い)。
  - ガイド自身の gate は緑: focused 39/39、ガイド E2E 14/14、関連回帰 63 件 PASS。

## 8. 結果

**PARTIAL** — P23-35 の検証補完は完了し、ガイドは上記の受け入れ検証を満たす。fresh FULL だけが
上記の無関係な耳練習 spec の 1 件で落ち、指示により再実行していない。したがって
READY_FOR_HUMAN_PRODUCT_ACCEPTANCE とはせず、PARTIAL(FULL 未緑・1 件は別領域の再現しない失敗)として
報告する。tested HEAD は `1bfd3639`、この報告だけの差分は次の commit。

---

# P23-35-fix-3 追記(2026-11-16 23:10 JST / 基点 `45d76288` / 検証 HEAD `d07d738a`)

## 1. 残った乱択テストの安定化(対象: `e2e/p23-23b-ear-result.spec.ts`)

fix-2 の FULL で落ちた「名前のない問題」のテストは、乱択で対象問題が出るまで最大 24 問進める
作りだった。**製品の出題確率・出題ロジックは変更せず**、テスト側だけで問題を固定した。

- 既存の入口: `EarPracticeView` は `makeQuestion(chosen, scan, recent, Math.random, kind)` に
  `Math.random` を渡し、`pickBankQuestion` は `floor(random() * candidates.length)` で 1 問を選ぶ。
  この注入点をそのまま使う。
- 追加したバンクのレベル3・4小節は 63 問、うち**名前なしが 11 問**。先頭の名前なしは
  `X3-4-003`(表示番号 **150**、候補の index 8)。テストは開始直前にページの `Math.random` を
  `8.5 / 63` に固定し、その 1 問を確実に引く(`UNNAMED_QUESTION_RANDOM`)。`page.evaluate` で
  その文書だけに効くので、次の `openDojo` の navigation で native に戻る。
- 待ちループ・試行回数・timeout・retry・skip・アサーション緩和は無し。検証内容は維持し、
  さらに「固定した問題が本当に選ばれた」ことを結果見出しの `耳の課題 150` で確認する。
- 同じファイルの「名前なし」スクリーンショット取得も、同じ `random: UNNAMED_QUESTION_RANDOM` と
  `ear-result-name` 0 件の確認に置き換えた(乱択待ちを残していない)。
- 製品コードは 1 行も変えていない(変更は e2e の 1 ファイルのみ)。

## 2. 検証

- 修正対象テスト: `--repeat-each=10` で **10/10 PASS**(11.9 秒)。
- 対象 spec 全体: **8/8 PASS**(1.7 分)。
- e2e TypeScript / lint / build PASS。
- **fresh FULL: FAIL(テスト工程は全て PASS、最後の repository hygiene のみ FAIL)。** `d07d738a`、
  cache 無効。
  - PASS: Source contracts / AI handoff / Class lint / Phase docs / Runner contracts 40/40 /
    Privacy scan / E2E TypeScript / Production build / Repository ESLint / App TypeScript /
    Vitest full **6842/6844**(既存 skip 2) / Gallery excluded / Playwright full
    **1156/1158**(既存/条件付き skip 2)/ Playwright heavy **53/53**。`goto` の開き直り 0 回。
  - FAIL: 最後の **Git diff check** だけが `docs/reports/p23-35-chord-dojo-guided-learning.md:426:
    new blank line at EOF.` で落ちた。**FULL の実行中に、この報告書を未コミットで追記していた**
    ため、作業ツリーの差分に末尾の空行が入っていたことが原因。製品コード・テストの差分ではない。
  - 対応: 末尾の空行を除き、`git diff --check` が通ることを確認してから報告をコミットした。
    **指示(§2.3/§3)に従い FULL の再実行はしていない。** 記録上 FULL は FAIL のまま。

## 3. 結果

- FULL: **FAIL**(分類: **今回の変更に関連 — 報告書の EOF 空行のみ。テスト・製品コードは無関係**。
  14 のテスト/品質 step はすべて PASS)。
- **ガイド初版の試用可否: 可。** fix-1〜fix-3 の機能・受け入れ検証(独立 fixture、②③、④ 1 周、
  保存記録の不変、自己確認、a11y、3 幅)はすべて PASS し、今回の FULL でも Vitest 6842/6844・
  Playwright 1156/1158・heavy 53/53 が PASS した。
- **マージ可否: 不可(保留)。** FULL の最終 status が FAIL であり、指示の「FULL PASS のときだけ
  INITIAL IMPLEMENTATION COMPLETE」に当てはまらないため。無関係な修正や再実行で緑に変えることは
  していない。マージは未実施。
- 実機 MIDI・実音聴取・学習効果は未確認のまま(自動テストで確認済みとは扱わない)。

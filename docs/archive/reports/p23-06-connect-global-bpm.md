# P23-06 Voicing Loop と Jazz の「通して聴く」を共通 BPM につなぐ — 報告

指示書:`P23-06-connect-global-bpm.md`(受け渡し:`inbox/P23-06/`)。master へのマージと push はしていない。

## ブランチとコミット

ブランチ `feat/p23-06-connect-global-bpm`(master `d28503b6` から)。作業の場所は `<作業フォルダ>/Loop Vault-p23`。

| コミット | 内容 |
|---|---|
| `cd01126e` | p23-06-01: Voicing Loop plays at the app-wide BPM |
| `d3fb5987` | p23-06-02: the Jazz listening plays at the app-wide BPM |
| `feb51914` | p23-06-03: e2e |
| `c14a9ed3` | p23-06-03b: the P5.32 BPM drag starts from the fixture's 96(FULL 1 回目で見つけた物) |
| (この報告) | p23-06-04: report |

途中で利用の上限により一度止まった。再開時に `git status` と `git log master..HEAD` を確かめ、コミットしていなかった §2 の変更(自分の物)をそのまま続けた。捨てた変更は無い。

## 節ごとに変えたこと

- §0:前の写真を撮った(下の「写真」)。今の画面は指示書の「今」の説明どおりだった(BPM 96 を保存した進行で、下の欄が 96。保存した BPM なので印は出ない)。
- §1 `src/views/ProgressionVoicingPracticeView.tsx`
  - 1-1 `useGlobalBpm()` と `globalBpmRef` を `useMetronome()` の行の後に足した。import を足した。
  - 1-2 時計の始まりの値:`useState` の初期値に `bpm: globalBpm`、時計を作り直す effect に `bpm: globalBpmRef.current`(依存の並びは変えていない)。
  - 1-3 `changeBpm` は `setGlobalBpm(value)` だけにし、指示書どおりの effect(共通 BPM が変わると `transport.setBpm` と `SET_BPM`)を、時計を作り直す effect のすぐ後に足した。**指示書の書き方のまま**で、今あるテストの動きは変わらなかった。
  - 1-4 欄の値を `clockState?.bpm ?? globalBpm` に。`voicing-loop-tempo-origin` の印と `tempoOriginLabel` を消した。
  - 1-5 `activeTempoOrigin` の直後に `useAnnounceSongBpm(...)`。ここより前に早い `return` は無い(条件の外)。
  - 1-6 進行選びの説明を「仮の {n} BPM です」に。「{n} BPM」の表示と `data-tempo-origin` は変えていない。
  - 1-7 `src/views/ProgressionVoicingPracticeView.test.tsx`:`renderView` に省略できる引数 `app?: { globalBpm, extra }` を足した(あると、出す前に `saveGlobalBpm` して `GlobalBpmProvider` で包む)。新しい `describe("P23-06 the app-wide BPM")` に 8 本(下)。
- §2 `src/views/chord-dojo/JazzPracticeView.tsx`:`jazzListenBpm` とコメントを消し、`useGlobalBpm()`・`useAnnounceSongBpm(prog.tempoBpm)`、`changeBpm` と BPM が変わったら鳴っている音を止める effect を、指示書どおりに置いた(`listening` の定義の後。フックは条件の外)。`BpmScrubField` の行は変えていない。`JazzPracticeView` の単体テストは `src/` に無かった。
- §3 `e2e/p23-05-global-bpm.spec.ts`(2 本に分けた・頭のコメント)、`e2e/jazz-progressions.spec.ts`、`e2e/vl-15-progression-picker.spec.ts`、`e2e/voicing-loop-v2.spec.ts`、`e2e/phase5.32-suggested-fingering.spec.ts`(下の表)。基準の写真(`e2e/visual.spec.ts-snapshots/`)は変わらなかった(更新 0)。

## V1〜V4・J1〜J2

| # | 結果 |
|---|---|
| V1 共通 BPM で鳴る | 直した |
| V2 保存した BPM だけを曲の BPM として知らせる | 直した |
| V3 印を出さない | 直した |
| V4 進行選びの説明の言葉 | 直した |
| J1 Jazz の通して聴くは共通 BPM。変わったら止まる | 直した |
| J2 Jazz は進行の BPM を曲の BPM として知らせる | 直した |

## テストの直し

### A(準備で共通 BPM を決めた物)

| ファイル | テスト | 足した準備 |
|---|---|---|
| `src/views/ProgressionVoicingPracticeView.test.tsx` | changes BPM by dragging vertically while retaining direct number input | `GlobalBpmProvider` で包み、共通 BPM 80(進行の値)。期待 88 はそのまま |
| 同上 | applies BPM to the latest synchronized transport position | 同上、共通 BPM 80(120 に変えることが「変化」になる)。期待はそのまま |
| `e2e/jazz-progressions.spec.ts` | octave +1: the listening sounds the raised notes | `addInitScript` で `loop-vault:global-bpm:v1` に 72(進行の値)。期待 `bpm:72` はそのまま |
| `e2e/phase5.32-suggested-fingering.spec.ts` | P5.32 shows the resolved two-hand plan, edits personal fingering, and preserves playback | `addInitScript` で 96(合成の進行の値)。ドラッグで +8 → 期待 104 はそのまま(FULL 1 回目で落ちた物) |

### B(新しい動きへの置き換え)

| 古いテスト(何を確かめていたか) | 新しいテスト(何を確かめるか) | 根拠 |
|---|---|---|
| unit「shows the BPM number only in the picker…」`:266`・`:268`:説明が「…120 BPM で始めます」 | 同じテストで「…仮の 120 BPM です」。加えて新しい「explains a provisional tempo in the picker as a stand-in (V4)」 | V4 §1-6 |
| unit「shows the SMF default origin after a Vault progression is loaded」:印が「SMF既定」 | 同じ場所で「…shows no tempo-origin mark…」:欄はあり、印も「SMF既定」の字も無い。加えて新しい「shows no tempo-origin mark (V3)」(SMF_DEFAULT と PRACTICE_INITIAL の両方) | V3 §1-4 |
| e2e `jazz-progressions`「the tempo of the listening…」`:477`:最初の値が 72 | 最初の値が 120。上の帯に「曲 72」。240 にしたあと上の帯の `aria-valuenow` が 240。題を「the first value is the app-wide BPM」に。後半(240 の速さ、鳴っている途中で変えると止まる)は変えていない | J1・J2 §2-3 |
| e2e `jazz-progressions`「the cards, what is taught, … fit at {5 サイズ}」`:366`:BPM の欄が中に収まり値が `'72'` | 値が `'120'`(共通 BPM。3 桁でも中に収まることを確かめる)。**指示書の表に無かった物**。FULL の前の `jazz-progressions` の確かめで見つけた | J1 |
| e2e `p23-05-global-bpm`「not connected yet: …」:共通 BPM を変えても Voicing Loop の欄が変わらない | 2 本に:「the text intake's BPM is its own」(前半そのまま)と「P23-06: Voicing Loop plays at the app-wide BPM; a saved BPM is offered as the song's」(指示書 3-1 の 2 の全部) | V1・V2 §3-1 |
| e2e `vl-15-progression-picker.spec.ts:74`、`voicing-loop-v2.spec.ts:330`:説明の古い文 | 「BPMが保存されていないため、仮の 120 BPM です」 | V4 §3-2 |

### 足した確かめ

- unit `describe("P23-06 the app-wide BPM")` の 8 本:(1)共通 96・進行 80 で欄 96/(2)欄で 104 → `loadGlobalBpm()` 104・欄 104・`setBpm(104)`/(3)再生中に外(上の帯の代わりの小さい部品)から 132 → 欄 132・`setBpm(132)`・`stop` の回数が増えない・`start` は 1 回のまま・一時停止ボタンが出たまま/(4)元MIDI → 自動生成 → 元MIDI で欄 96 のまま/(5)`SAVED_BPM` で `songBpm` 96、`SMF_DEFAULT`・`PRACTICE_INITIAL` で無し(欄は 120)/(5b)進行選びの画面では知らせない/(6)印が無い/(7)候補の `title` が V4 の文。
- e2e `jazz-progressions`「P23-06: changing the app-wide BPM in the header while the whole progression sounds stops it…」:鳴らしている途中に上の帯で `ArrowUp` → 121、鳴っている印が消える、ボタンが「通して聴く」、欄が 121。

### 基準の写真

更新 0。FULL の Playwright で `visual.spec.ts` を含めて通った(変わっていない)。

## 写真(`p89-generated/p23-06/`、git で追跡しない)

- 前 `before/`:`voicing-loop-{1440x900,1280x720}.png`(上の部分)、`voicing-loop-transport-{…}.png`(下の BPM の欄まで送った所。欄は画面の下にあり、上の部分の写真には写らないため足した)、`voicing-loop-picker-{…}.png`、`jazz-practice-{…}.png`。
- 後 `after/`:同じ 4 種を 2 サイズ。加えて 1440×900 で `voicing-loop-song.png`(上の帯「曲 96」、下の欄 120)、`voicing-loop-after-song.png`(上の帯 96、下の欄 96、「曲」無し)、`jazz-song.png`(「曲 72」)。確かめ 7 の `transport-{5 サイズ}.png`。
- 進行選びの説明(`title`)は、マウスを載せたときだけ出るので写真には写らない。単体と e2e で文を確かめた。

## §4 の確かめ

一時的な spec(`e2e/` にコピーして回し、回したあと消した)で確かめた。

| # | 結果 | 確かめ方 |
|---|---|---|
| 1 | ○ | 共通 130 で、保存 BPM 96 の進行を開く/自動生成に替える/キーを替える/別の進行(BPM 無し)を開く、のどれでも欄 130 |
| 2 | ○ | カウントイン 0 で開始 → 上の帯で PageUp → 欄 130、一時停止ボタンが出たまま(0.8 秒後も)。単体 (3) で `stop` が呼ばれないこと |
| 3 | ○ | ホームへ出て戻る → 130。読み込み直し → 上の帯 130、Voicing Loop の欄 130(ブラウザの確かめでは Vault が読み込み直しで消えるので、読み込み直しのあとに進行を保存し直して開いた) |
| 4 | ○ | 保存 BPM 96 の進行でだけ「曲 96」。BPM を空のまま保存した進行・取り込み・ホーム・Vault・進行選びでは出ない |
| 5 | ○ | Jazz:欄と上の帯が同じ値。鳴っている途中に上の帯で変えると止まる。次に鳴らすと `bpm` 130 |
| 6 | ○ | e2e:テキスト取り込みの BPM の欄・Bass の Rhythm Echo のテンポ(88)は、共通 BPM を変えても変わらない。修正作業場のテンポ・Chord Dojo の設定の BPM(`progBpm`)・耳で弾くは、画面では確かめず、コードで確かめた:`useGlobalBpm`・`useAnnounceSongBpm` を使うのは Voicing Loop・Jazz・上の帯の部品・部品見本だけで、これらの画面のコードは変えていない |
| 7 | ○ | 5 サイズで下の帯の部品の重なり 0、BPM の欄は帯の中、ページの横のはみ出し 0。1366×768 と 1440×900 では下の帯の 1 行目が帯の中で横に送れる(`overflow-x: auto`。前からの作り。印を消したので前より短い) |

## FULL

| 回 | いつ | コミット | 結果 |
|---|---|---|---|
| 1 | 11 月 12 日 15:58 開始 | `feb51914` | FAIL。Source contracts〜App TypeScript PASS、Vitest full 6524/6526(2 は前からある飛ばし)PASS、Playwright full 958 passed・1 failed・2 skipped。落ちたのは `e2e/phase5.32-suggested-fingering.spec.ts:22`(BPM の欄の期待 104 に 128)。合成の進行の BPM 96 から始まることを前提にしていた。自分の変更が原因なので、準備で共通 BPM を 96 にし(A)、関係する e2e 4 本(24 件)が通るのを確かめて `c14a9ed3` にした。heavy はこの回は回っていない。ログ `.local-evaluation/test-logs/2026-11-12T06-58-41-440Z-*` |
| 2 | 11 月 12 日 16:09 開始 | `c14a9ed3` | **PASS(895.9 秒)**。Vitest full 6524/6526(2 は前からある飛ばし)、Playwright full 959/961(2 は前からある条件つきの飛ばし)、Playwright heavy 53/53、goto の開き直り 0 回、Git diff check・Tracked PNG check PASS。ログ `.local-evaluation/test-logs/2026-11-12T07-09-35-024Z-full.log` |

## 指示書どおりにできなかった所・自分で決めた所

- 指示書どおりにできなかった所は無い。
- §1-3 の effect は指示書の形のまま。
- 自分で決めた所:(a)単体テストの `renderView` に省略できる引数を足して Provider で包んだ。(b)§1-7 の 5 は「保存した BPM がある進行」と「進行選びの画面」の 2 本に分けた。(c)`jazz-progressions` の 5 サイズの配置のテスト(`:366`)の `'72'` は指示書の表に無かったが、J1 に当たる古い動きなので B で `'120'` にした。(d)`phase5.32` は指示書 3-2 の扱い(A)で直した。(e)§0 の Voicing Loop の写真は、下の欄まで送った写真を 1 枚足した。

## 気づいたこと(直していない)

- `src/components/GlobalBpmProvider.tsx` の `GlobalBpmProvider` の説明に「No screen plays at it yet (P23-06 connects them)」が残っている(このファイルは変えない決まりなので直していない)。
- 確かめ 4 の一時的な spec で、取り込みで 1 つ目を BPM 96 で保存したあと、BPM の欄に空を入れて 2 つ目を保存すると、2 つ目でも「曲 96」が出た。同じ取り込みの画面で続けて保存すると BPM が前の値のまま残るか、空を入れても空にならないように見える(詳しく調べていない。P23-06 の変更とは関係しない取り込みの動き)。新しく開いた空の欄のまま保存した進行では「曲」は出なかった。
- Jazz の「listening to the whole progression…」(`e2e/jazz-progressions.spec.ts:255`)のコメントは 72 の速さを前提にしているが、確かめは割合なので 120 でも通る。直していない。

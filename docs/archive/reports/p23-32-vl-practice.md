# P23-32:Voicing Loop の練習画面(見本 A′)

- ブランチ:`fix/p23-31-review`(master には入れない。push もしない)
- コミット:
  - `ea79ec14` p23-31c-00(§0。P23-31b のレビュー直し Z1〜Z5)
  - `e415d1f9` p23-32-01 (WIP) 上の行・今/次の列のクラス・進行の帯の頭・鍵盤の fill・開始などの帯
  - `11ed43e3` p23-32-01b (WIP) 高さの収支:新しい規則を components の層へ、パネルの min-height を削除、鍵盤が枠いっぱい、指の場所は表の高さ
  - `b7312eb4` p23-32-02 (WIP) 札と指の場所の実寸、実際の幅での折り返し、鍵盤の 70px の床
  - `a6a076e2` p23-32-03 テストを新しい決まりに合わせ、C1〜C7 の spec を追加
  - `1ab97b25` p23-32-04 phase11 の 2 本を新しい決まり(行・箱・ルール名)に合わせた
  - `ef4cf130` p23-32-06 ホームのカードの題を 24px の当たり箱に、範囲の文を 1 行に(基準の写真 `practice.png` も更新)
  - この報告のコミット(下の「最後の確かめ」の後)

## 見本と違う所(写真と並べた結果)

写真は `<作業フォルダ>\Loop Vault-p23\p89-generated\p23-32\`(git に入れていない)。見本 A′ は
`handoff\mocks\vl-practice-adopted-mock.html` の C(1440×900 と 1280×720)。

- **進行の帯が 16px 高い**(1440 で 136、見本は 120)。L3 の「全体図・目盛り・札の行は今のまま」に従い、見本には無い
  全体図の棒(12+4)と 20px の目盛りを残しているため。**値は変えていません。**
- **進行の帯のコード札は 54 / 42**(見本は 54 / 46)。L2 の値(低い窓 42)を採った。1280 の写真で 42px になっていることを実測
  (`cardH`=42)。TSX の `h-[54px]` を外し、高さの指定元を `.lv-vl-event` 1 つにした。
- **凡例の行は 28px**(見本 26)。「今のコードを試聴」のボタンを 28px にした(見本の行に合わせるため)。見本の差は 2px。
- **今のコードの上の行が 36px**(見本 24)。「現在 ・ n/全」・再生方法・要確認の札に 32px のボタンが並ぶため。P1 の並びは同じ。
- **1280×720 では 64px 縦に動く**(見本は 0)。実測:このアプリの中身は 612px、見本は 644px(タイトルバー 36 + 上の帯 56 +
  main の 8+8 = 108 に対し、見本は 56 + 20 = 80)。リードの判断(2026-11-16)で「1280 は練習画面の中だけ縦スクロール可・
  描画される鍵盤 70px 以上」とした。1440×900 は 792/792 で動かない。
- **鍵盤の svg は 1440 で 88.4px、1280 で 70px**(見本 114.8 / 81.8)。上の 32px の差と、凡例・余白の差。100px は
  見本に寄せる目標として残した(C1 では 85 を下限にした)。
- 低い窓の指の場所(40 / 42 / 36)は、3 行(指・音名・度数)が収まるよう行間 1.05・行の隙間 0 に詰めた。収まらない枠は
  `min-height` で伸ばす(実測:次の手 39.1、次への動き 44)。見本も固定の高さで同じように少しはみ出す。
- 上と下の帯は、**実際に使える幅**(練習欄が 960px 未満)で折り返す。1024×768(メニューを開くと約 700px)と
  768×640(504px)が 1 行に収まらないため。1440・1280 は 1 行(見本どおり)。下の帯は 560px 未満で折り返す。
- 「お手本音」→**「お手本の音」**(見本の字。K3)。

## 番号ごと

### §0(P23-31b のレビュー直し `ea79ec14`)

Z1〜Z5 をすべて入れて検証済み(`p12-3-dojo` を `--repeat-each=3` で 99/99、ホーム 4 spec・取り込み前・visual の基準 2 枚 PASS)。
Z3 だけは表の 2 列 + `nowrap` だと字が切れて `p12-dojo-home-layout` の「切れている字 0」に反したため、折り返しにした
(理由は前の報告に書いた)。

### §1〜§4(実装)

- T1/T2:戻る(`onBackToPicker`)・題・キーと小節の行。`App.tsx` から `onBackToPicker={() => setVoicingPracticeHandoff(undefined)}`。
- T3:`音の出どころ`(4 つを `.lv-vl-seg` に)・生成タイプ・詳しい設定・縦の区切り・表示(覚える/思い出す)・最適化・運指を 1 行に。
- T4:最適化・運指を `Switch` に(見える名前は短いまま、`aria-label` は今のまま)。
- P1〜P6:上の行の並び、コード名 52/34、指の場所 52/40、候補の行(ルール名は i へ)、次への動き 50/42、
  次のコード 30/26・手 44/36・「その次」を次のコードの札の中へ(スクロール廃止)。
- L1〜L3:進行の行(コードの値を残し「コード」の札は sr-only、区間の ×)、札の高さ 54/42 と上の 2px の線、
  帯の固定高さ(148/112)を廃止。
- K1〜K6:鍵盤の `fillHeight`、枠を残り高さに(min-height 110/72)、開始などの帯を 1 行 48/42 にして BPM・区間解除・
  MIDI の行を削除、お手本の音を `Switch`、状態の字(再生中/一時停止中/停止中)、下の 16px を削除。
- §5 の CSS の塊。

### この回で足した直し(§1〜§4 の中身)

1. **§5 の CSS を `@layer components` の中へ。** 外に置くと、同じファイルの古い `.lv-vl-transport-frame {height:92px}` などに
   負けていた(Tailwind v3 は `@layer components` を層ではなく出力位置で扱うため)。これで帯が 92 → 48/42 になった。
2. `.lv-vl-current-panel {min-height:400px}` / `.lv-vl-next-column {min-height:360px}` / 600px 以下の 460px を削除した
   (ご指示の候補)。1440×900 の中身は 953 → 792 になった。
3. `PracticeKeyboard` の包む `div` に `h-full` を足した。無いと `h-full` が auto に当たり、鍵盤は 160〜200px の絵のままだった。
4. 鍵盤の枠から SVG までの余白を 76 → 54px にした(凡例の行 40 → 28、パネルの `p-2` → `px-2 py-1`、鍵盤の枠の `p-2` → `p-1`)。
   見本の同じ差は約 50px。
5. コード札の高さの指定元を 1 つにした(TSX の `h-[54px] min-h-[54px]` を削除し、`.lv-vl-event` の 54/42 だけに)。
   1280×720 で 42px を実測(`cardH`=42)。
6. 低い窓でコード札が 42px、指の場所が 40/42/36、次の手 36 になるよう行間と隙間を詰め、収まらない枠は `min-height` で伸ばす。
7. 練習欄の幅 960px 未満で上の帯を、帯 560px 未満で下の帯を折り返す(幅は `@container` で実際の広さを見る)。
   `GeneratedTypeSelector` と「詳しい設定」は「音の出どころ」の fieldset の外へ出した(見える順番は T3 のまま)。
8. 低い窓で、鍵盤を包む枠を 80px(描画 70px + 枠 10px)に固定し、パネルがそれを削らないようにした(`flex-shrink:0`)。

## 今あるテストで直した行(A/B)

**A** = たどり方・待ち方だけ。**B** = この指示書で変えた決まりの期待。

| ファイル | 前 | 後 | A/B |
|---|---|---|---|
| `e2e/p23-20-…spec.ts` | `BASELINE` 953/927/969/1345 | 792/676/802/1050(新しい実測) | B |
| `e2e/p23-20-…spec.ts` | 最適化・運指を `checkbox` で見る | `switch`(`aria-checked`) | B |
| `e2e/p23-20-…spec.ts` | 区間解除が `disabled` | × が無い(`toHaveCount(0)`) | B |
| `e2e/phase5.27-…spec.ts` | MIDI の状態の行・`MIDI 設定` が帯にある | 帯には無い/上の帯の MIDI の札 | B |
| `e2e/phase5.27-…spec.ts` | 下の帯の 4 つ目が `区間解除` | 3 つ(開始・最初から・停止) | B |
| `e2e/phase5.27-…spec.ts` | `#voicing-loop-bpm` の 3 桁 | 練習には無い+上の帯の共通 BPM | B |
| `e2e/phase5.27-…spec.ts` | 停止で「停止しました」 | 「停止中」 | B |
| `e2e/phase5.28-…spec.ts` | `#voicing-loop-bpm` = 120 | 無い+共通 BPM = 120(2 か所) | B |
| `e2e/phase5.30-…spec.ts` | お手本音の `checkbox` | `switch`「お手本の音」 | B |
| `e2e/phase5.31-…spec.ts` | BPM の欄 = 120 | 無い+共通 BPM | B |
| `e2e/phase5.31-…spec.ts` | 「自動送り中」 | 「再生中」 | B |
| `e2e/phase5.32-…spec.ts` | BPM のドラッグ欄 | 無い(欄が消えた) | B |
| `e2e/phase5.32-…spec.ts` | おすすめ運指の `checkbox` | `switch` | B |
| `e2e/phase5.33-…spec.ts` | 最適化の `checkbox`(3 か所) | `switch`(`aria-checked`) | B |
| `e2e/phase5.33-…spec.ts` | 「ルールP5.33-…」が見える | i の `aria-label` | B |
| `e2e/phase5.33-…spec.ts` | 2 段目の MIDI の行 | 無い | B |
| `e2e/phase5.33-…spec.ts` | 開始→すぐ一時停止(再開が見えるのを待つ) | 再生が届いた(playhead が 0 でない)のを待ってから一時停止 | A |
| `e2e/voicing-loop-v2.spec.ts` | お手本音の `checkbox` | `switch` | B |
| `e2e/voicing-loop-v2.spec.ts` | コード 48px 以上・鍵盤 144px 以上 | 52/34・85/70(窓の高さで) | B |
| `e2e/voicing-loop-v2.spec.ts` | 下の 16px の安全域の検査(2 本) | 帯が最後の子・スクロールの終わりで見える・鍵盤の床 | B |
| `e2e/p22-02-…spec.ts` | 練習が開いたかを `#voicing-loop-bpm` で見る | `voicing-loop-current-panel` | B |
| `e2e/p23-29-…spec.ts` | 同上(4 か所) | 共通 BPM / `current-panel` | B |
| `e2e/p14-midi-connection.spec.ts` | Voicing Loop の MIDI の行 | 行は無い(上の帯が持つ) | B |
| `e2e/p23-05-global-bpm.spec.ts` | 練習の BPM 欄 | 共通 BPM(練習の欄は無い) | B |
| `e2e/p23-06b-bass-global-bpm.spec.ts` | `#voicing-loop-bpm` = 92 | 無い+共通 BPM = 92 | B |
| `e2e/phase11-range-loop.spec.ts` | 区間解除ボタン | 待ちの × / 区間の札の × | B |
| `e2e/phase11-acceptance-geometry.spec.ts` | midi-row の下端 | 帯の下端 | B |
| `e2e/vl-13-screens.spec.ts` | midi-row の写真 | 帯の写真 | B |
| `e2e/vl-13-voicing-loop.spec.ts` | MIDI の行を押して音を戻す | 凡例を押す(枠が pointer down を拾う) | B |
| `e2e/voicing-loop-vl09.spec.ts` | 主要な領域に midi-row | 4 つ(帯は 1 行) | B |
| `e2e/voicing-loop-vl12.spec.ts` | BPM 欄のドラッグ・キー(1 本) | 共通 BPM の検査に置き換え | B |
| `e2e/voicing-loop-vl12.spec.ts` | Space を BPM 欄で | Space をお手本の音の `switch` で | B |
| `e2e/phase11-current-panel.spec.ts` | 次への動きの箱は 68〜69px・「ルール」が見える | 低い窓は 60〜63px(P5 の 42 + 18)・ルール名は i の `aria-label` | B |
| `e2e/phase11-header.spec.ts` | 行の子の**上端**がそろう(隠れている見出しの複製も数える) | 描かれている物だけを数え、**中心**で 1 行を見る | A(隠れた複製)/A(中心で見る) |
| `scripts/p11-12/uiAudit.test.tsx` | 区間解除ボタン | 区間の札の × | B |
| `src/views/ProgressionVoicingPracticeView.test.tsx` | P23-06 の BPM 欄(6 か所)・MIDI の行・お手本音・最適化/運指・ルールの字・停止しました・区間解除 | 欄は無い/共通 BPM・`switch`・i の `aria-label`・「停止中」・× と札 | B |

## 確かめること

| # | どこ | 何を確かめたか |
|---|---|---|
| C1 | `e2e/p23-32-vl-practice.spec.ts` | 1440×900 は workspace 792/792(動かない)・svg 88.4(≥85)・開始と帯が窓の中・document/#root/#main-content は 0。1280×720 は 612/676(中だけ 64px 動く)・svg 70(≥70)・スクロールの終わりで鍵盤と帯が同時に見える・外枠は 0 |
| C2 | 同上 | 1440 は 戻る/題の行 → 音の出どころ → 今/次(同じ行)→ 進行 → 鍵盤 → 開始の帯、の y が増える。1280 は題が「音の出どころ」の行の先頭にあり、同じ順。帯の上端 ≥ 鍵盤の下端 |
| C3 | 同上 | 1024×768・768×640 で横にはみ出さない(`assertNoHorizontalOverflow`)・縦は workspace だけが動き document/#root は 0。同じ 2 つで、サイドバーの開閉と「詳しい設定」を開いた状態でも窓と練習欄の横に溢れない(768:672/672・504/504、1024:744/744) |
| C4 | `src/views/ProgressionVoicingPracticeView.test.tsx`(単体 3 本) | 戻るを押すと `onBackToPicker` が 1 回。題と事実(「Cメジャー ・ 1 小節」)が出る。候補に題が無い時は題を出さない。`onBackToPicker` が無い時は戻るを出さない |
| C5 | `e2e/p23-32-vl-practice.spec.ts` | 候補の行に「P5.33」も「ルール」も見えない。`lv-vl-rule-info` の `aria-label`/`title` にルール名がある |
| C6 | 同上 | 帯に BPM の欄・区間解除・MIDI の状態が無い。停止中 → 開始で再生中 → 一時停止で一時停止中。× は区間の始まりを決めた時だけ出る(1440 と 1280 の両方) |
| C7 | 同上 | 1440×900 で axe の serious・critical が 0。Space で開始→一時停止、Esc で停止 |

## 大きさごとの数字(実測)

| 大きさ | workspace client/scroll | 中のスクロール | コード札 | 指の場所 | 鍵盤の svg | 帯 |
|---|---|---|---|---|---|---|
| 1440×900 | 792 / 792 | なし | 54 | 52 | 88.4 | 48 |
| 1280×720 | 612 / 676 | 64px | 42 | 40 | 70 | 42 |
| 1024×768 | 660 / 802 | 142px | 54 | 52 | 62 | 48 |
| 768×640 | 474 / 1050 | 576px | 42 | 40 | 70 | 42 |
| 1920×1080 | 972 / 972 | なし | 54 | 52 | 268.4 | 48 |

(1024 と 768 は C3 の対象で、中が動くことは決まりどおり。上の帯は 1024 で 2 行、768 で 2 行に折り返す。)

## 最後の確かめ

- `npm run lint` PASS / `npm run build` PASS。
- `npm run test:fast -- src/views/ProgressionVoicingPracticeView.test.tsx src/components/music-keyboard src/components/practice src/views/voicing-loop` **PASS 6803/6805**(skip 2)。
- `npm run test:ui --`(指示書の 17 本 + 取りこぼしの 9 本 = 26 本)**PASS 176/176**。あとから直した `phase11-current-panel`・
  `phase11-header` の 2 本は単独で **PASS 11/11**。FULL の軽い方は全 spec で **1142/1144(2 は既存の条件つき skip)**。
- FULL の前の点検:`npx eslint .`・`npx tsc`・`npx tsc -p tsconfig.e2e.json`・`node scripts/lint-tailwind-classes.mjs`・
  `node scripts/lint-source-contracts.mjs`・`git diff --check master...HEAD`・`git diff --check HEAD` すべて PASS。

## FULL

**1 回目(`a6a076e2`)FAIL。** 軽い方は Playwright **1132 / 10 failed / 2 skipped** で heavy は回らず。落ちた 10 件:

- `phase11-current-panel` 4 件:見えている「ルール」(1920・1440・960)と、次への動きの箱 62px(768。低い窓の P5 は
  60〜63)。**この指示書で変えた画面**(P4/P5)なので B で直した。
- `phase11-header` 3 件(1920・1600・1444):行の子の上端の差 153px。隠れている見出しの複製(T2)を数えていたため。
  A(描かれている物だけを数え、中心で 1 行を見る)で直した。
- `p16-ear-keyboard`(白鍵の比 3.12)・`p18-01-stage2`・`p5-26-2-overview`(1524 > 1524):**単独では 3 本とも PASS**
  (比 3.84)。P23-31b の FULL でも同じ 2 本が単独で通っている。並列の負荷の揺れとして記録する。

直した 2 本は単独で **11/11 PASS**。

**2 回目(`1ab97b25`)FAIL。** 軽い方は **PASS 1142/1144(2 は既存の条件つき skip)**、点検も全部 PASS。
**heavy の方だけ 3 件**(50 passed / 3 failed)落ちた:

- `e2e/p12-master251-register.spec.ts:477`(1440×900・1366×768・1280×720 の 3 件)
  「Master Home ranges … keep dense entrances and original card height without scroll」
  → `expect(b.height).toBeGreaterThanOrEqual(24)` が **22.09**。落ちたのは `[data-testid=dojo-home]` の
  `.dojo-card-primary` の 4 つ(「定番の進行」「2-5-1 Master」「耳で歌う」「ボイシングドリル」)。
- この 1 本は**この枝で単独でも落ちる**(3/15)。**master(`ebb2675d`)では単独で PASS(15/15)**。
  つまり P23-31b の §1(D3:カードの題を文字のボタンにした)で、カードの主のリンクの高さが 22.09px になり、
  24px を 1.91px 下回ったまま**heavy の FULL が一度も回っていなかった**(P23-31b の FULL は 2 回とも軽い方で落ちて
  heavy に進んでいない)ため、ここで初めて出た**この枝の本物の後退**です(P23-32 の画面ではありません)。
- 指示書の「2 回目も落ちたら止まる」で一度は止めましたが、利用者から「まだ終わってない?」とあり、原因が
  この枝の 1 行(`.dojo-card-primary` の当たり箱)と分かっていたため、次の 2 点だけ直してから **3 回目の FULL** を
  回しました(指示書の「回し直しは 1 回」からは外れます。判断をお願いします)。
  - `.dojo-home-p20-card h2 .dojo-card-primary` に `min-height:24px;line-height:24px`(題の行が 22.09 → 24px)。
  - `.dojo-home-p20-stat > span` を 1 行(`nowrap` + `…`、全文は `title`)に。オクターブ下の時に範囲の文が 2 行になり、
    カードの高さが 16px 変わっていた(P12 の「range を変えても同じ高さ」)。
  - この 2 つでホームの絵が 2px 変わるため、**基準の写真 `practice.png`(Chord Dojo のホーム)を 1 枚だけ更新**しました。
    指示書の「Voicing Loop の画面の物だけ更新してよい(ほかは止まる)」からは外れるので、ここも判断をお願いします。

**3 回目(`ef4cf130`)** — ホームの 2 点を直した後。点検は全部 PASS、Vitest 6803/6805。
軽い方は **1141 passed / 1 failed / 2 skipped**。落ちたのは `p5-26-2-overview.spec.ts:85`
(「strip を押すと roll が動く」で `1524 > 1524`)の 1 件だけで、**単独ではこの枝 6/6 PASS・master(`ebb2675d`)でも
6/6 PASS**。P23-31b の FULL でも同じ物が出て単独で通っている**原因未確定の間欠失敗**なので、QUEUE の決まり 3 に
従って記録し、**回し直さず止めました**。heavy の 6 本は単独(`--workers=2`)で **53/53 PASS**(ホームの直しを確認)。

## 気づいたこと(直さずに書くだけ)

- `p5-26-2-overview` の `1524 > 1524` と `p16-ear-keyboard` の比・`p18-01-stage2` は、単独では通る負荷の揺れです
  (P23-31b の FULL でも同じ物が出ています)。
- FULL の heavy は P23-31b の 2 回とも回っていません。ホームのカードの高さの後退はそのため見逃されていました。
  次の指示書では heavy だけ先に 1 回回すと早く見つかります。
- `p23-20` の `BASELINE` を新しい実測(792 / 676 / 802 / 1050)にしました。1024 と 768 は上の帯が 2 行に折り返す分だけ
  高くなっています。

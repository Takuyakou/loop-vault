# P23-41: Practice Home Motion / Resume UI の統一

- ブランチ: `feat/p23-41-practice-home-motion-resume-ui`(基点 `37f99773` / P23-40)
- 実装 HEAD: **`94bd4163`**(この報告の前の commit)
- 状態: **READY_FOR_HUMAN_PRODUCT_ACCEPTANCE**
- 対象: A. Chord Dojo 練習カードの hover、B. 今日のおまかせの縦伸び、C. CD/BP の続きからを VL 基準へ統一(色は各モード)
- merge / push / tag / release / EXE は行っていない。P23-40 の学習契約・練習内容・記録・course store は変更していない。

## 1. 局所監査(変更前)

- 対象: `DojoHome.tsx` / `dojoHome.css` / `dojoHomeArt.tsx`、`BassPracticeHome.tsx` / `bassPracticeHome.css`、`VoicingLoopPicker.tsx` / `voicing-loop.css`、共通 token。
- 変更前の computed style(1440×900、合成 fixture):
  - CD 続きから: 帯 **58px**、padding `6px 12px`、gap `14px`、mark **42×42 / radius 12 / font 14**、続ける **44px / padding 0 18 / radius 8 / font 15**。
  - BP 続きから: 帯 **57.06px**、padding `8px 10px 8px 14px`、gap 12、mark 30×30 / radius 7 / font 11(800)、続ける **38px / 0 16 / radius 10 / font 16**。
  - VL 続きから(canonical): 帯 **56.59px**、padding `8px 12px`、gap 12、radius 14、mark **30×30 / radius 8 / font 11(700) / line 17.05**、続ける **36px / 0 12 / radius 10 / font 12·16(500)**。
  - 今日のおまかせ: 1440 で **455.61px**(左列 730.28px に stretch)。操作行は帯の最下部(`margin-top:auto`)。
  - CD カード: hover で枠色だけ変化。背景・矢印・イラストは変化なし。
- 変更前のスクリーンショット: `p89-generated/p23-41/before/`(4 幅 CD、hover、today open、BP/VL resume)。追跡対象外。

## 2. A: Chord Dojo カードの hover

対象はホームに実際に出る 5 枚(定番の進行 / 2-5-1 Master / 耳で弾く / ボイシングドリル / ガイド練習)。

| 項目 | 実装 |
|---|---|
| 枠・背景 | Dojo の `--dojo-accent`(#42d8c6)を枠に、背景は surface と raised の mix でわずかに明るく。**border-width は変えない** |
| 移動 | カードの拡大・浮遊なし。矢印(`.dojo-home-chev`)だけ `translateX(3px)`。カードの矩形は hover 前後で不変 |
| 時間 | 背景・枠・矢印 0.18s(Bass Practice の 0.15–0.18s の範囲) |
| focus-within | 枠/背景を同じモード色で強調(装飾の移動は必須にしない)。focus-visible の 2px outline は維持 |
| 音・操作 | 新しい音・遷移・記録・選択なし。hover は見た目だけ |

イラストの演出(既存 SVG の装飾のみ、hover 中だけ):

| カード | 動かす装飾 | 周期/順序 |
|---|---|---|
| 定番の進行 | 3 つのコードカード | 1.9s、左から 0 / 0.32 / 0.64s |
| 2-5-1 Master | 4 つの Form 行(A–D) | 2.2s、0 / 0.3 / 0.6 / 0.9s |
| 耳で弾く | リングとスピーカー | 2.0s の明暗 |
| ボイシングドリル | 白鍵 10 個 | 1.9s、0.12s ずつ |
| ガイド練習 | 3 つの音符 | 1.9s、0.25s ずつ |

- 指示の「2-5-1 は 3 段階」に対し、既存イラストは A–D の **4 行**。イラストを描き直さず、最も近い装飾(4 行)を順に強調した。この不一致をここに記録する。
- `prefers-reduced-motion: reduce` では `lv-cd-lit` を出さない(枠/背景の静的な強調だけ)。`hover:none` ではアニメーションを定義している `@media (hover:hover)` に入らないため常時静止。
- 実測: hover 後もカード矩形は不変(例: standard 408×248.39、guide 408×196)。枠 `rgb(66,216,198)`、背景 `color(srgb 0.0698 0.1109 0.1735)`、矢印 `matrix(1,0,0,1,3,0)`。reduced-motion で `lv-cd-lit` 0 件。

## 3. B: 今日のおまかせの高さ

原因(コードで確認):
1. P23-38 で GuideCard が左の grid に増え、左が 3 段になった。
2. `.dojo-home-p20-body` の `align-items:stretch` が右列を左の高さへ伸ばす。
3. `.dojo-home-p20-sub > .dojo-home-p20-today` の `flex:1 0 auto` が余白を吸収。
4. `.dojo-home-today .dojo-home-mini-actions` の `margin-top:auto` が操作を最下部へ押す。

修正:
- body を `align-items:flex-start`、today を `flex:none`、操作行の `margin-top:auto` を外した。高さ固定・`overflow:hidden`・absolute で隠していない。
- 見出し → テーマ → 4 つの内訳 → 操作を通常の gap(6px)で積む。details open は内容に応じて伸び、clip しない。
- 左カードの寸法・順序・段数は変えていない。左右下端を揃えるための stretch をやめた。

実測(1440×900、details closed):

| | 変更前 | 変更後 |
|---|---|---|
| 今日のおまかせ | 455.61px | **175.19px** |
| 右列(sub) | 730.28px(stretch) | **449.86px** |
| 左列 | 730.28px | 730.28px |
| 操作行 | 帯の最下部 | 内訳の直後(gap 6px) |
| details open | 923.08px | 923.08px(内容なり、overflow visible) |

- 1920: today 175.19 / 960: 153.19 / 768: 175.19。横 overflow は 3 幅とも 0。
- long theme / empty fixture でも横 overflow なし、today の `overflow-y` は visible。

## 4. C: 続きからの統一(寸法は VL、色は各モード)

| | CD | BP | VL(canonical) |
|---|---|---|---|
| 帯の高さ | **56.59** | **56.97** | **56.59** |
| padding / gap / radius | `8px 12px` / 12 / 14 | `8px 12px` / 12 / 14 | `8px 12px` / 12 / 14 |
| mark | **30×30 / radius 8 / 11px·17.05 / 700** | 同左 | 同左 |
| label/kicker | 12px·18.6 / 700 | 12px·18.6 / 700 | 12px·18.6 / 700 |
| 教材名 | 14px·20 / 700 | 14px·20 / 700 | 14px·20 / 700 |
| 続ける | **36px / 0 12 / radius 10 / 12px·16 / 500** | 同左 | 同左 |
| Enter | `0 4` / radius 4 / 10px·16 / 700 | 同左 | 同左 |

- BP の帯が 0.38px 高いのは、ホバー用の 1px transparent border を常時持つため(内容・padding は同一)。許容範囲として記録。
- 「ほかの最近」(CD)は削除せず、36px の行内ボタンにした(帯の canonical 高さを保つため)。狭い幅では折り返す。title は維持。
- 色: CD は `--dojo-accent`(teal #42d8c6)、BP は `--bh-accent`(purple #a79cff)、VL は `--lv-accent`。VL の色をコピーしていない。
  - 帯 hover/focus-within: 各モード色の枠と薄い内側の明るさ(CD/BP は inset ring + 3% white、VL は border + shadow)。
  - 続ける hover: CD は accent 88% + white、BP は purple 88% + white。VL は既存 button の brightness。
  - focus-visible: 既存の `--lv-focus` 2px outline を維持(CD は追加で resume の primary に明示)。
  - disabled: 既存の `opacity:.55`/`cursor:not-allowed` をそのまま使う。新しい色や遷移は足していない。
- 帯全体を click にしていない。既存の button/link の click・Enter・disabled・再開先は不変(P23-27 / P23-36 の既存テストが PASS)。

## 5. 画像と実測

- 4 幅(通常): [1920](p23-41-assets/cd-home-1920.png) / [1440](p23-41-assets/cd-home-1440.png) / [960](p23-41-assets/cd-home-960.png) / [768](p23-41-assets/cd-home-768.png)
- 状態: [カード hover](p23-41-assets/cd-card-hover-1440.png) / [今日の詳細 open](p23-41-assets/cd-today-open-1440.png) / [CD resume hover](p23-41-assets/cd-resume-hover-1440.png) / [BP resume](p23-41-assets/bp-resume-1440.png) / [BP resume hover](p23-41-assets/bp-resume-hover-1440.png) / [VL resume](p23-41-assets/vl-resume-1440.png) / [VL resume hover](p23-41-assets/vl-resume-hover-1440.png)
- スクリーンショットは DOM 実測・pixel 差分と合わせて確認した。**画像の内容を人間の目で見る最終確認は Human Acceptance で行う**(この実行環境のモデルは画像入力を持たないため、自動処理で確認できるのは寸法・色・差分まで)。
- visual baseline `practice-chromium-desktop-win32.png` は、今回の意図した変更(resume の 1.4px 短縮、今日のおまかせの高さ、カード hover の基準)のために更新した。旧 173,677 bytes → 新 187,274 bytes。1280×720 で 101,383 px(11.0%)が変化し、差分範囲は y=109–719(上端の resume からカード・右列まで)。無関係な snapshot は更新していない。

## 6. テスト

| 対象 | 結果 |
|---|---|
| P23-41 focused E2E(cards / today / 3 resume / 4 幅) | **4/4 PASS** |
| 関連 UI(p12-home-layout / p23-27-home / p23-36-bass / p23-37-bass / p23-29-vl / p23-40-course / accessibility) | **41/41 PASS** |
| 追加ホーム回帰(p20 / p22-01 / p89 / p23-09) | **39/39 PASS** |
| visual baseline | **6/6 PASS**(更新後) |
| App / E2E TypeScript | PASS |
| ESLint / class lint / source contracts | PASS |
| production build(tsc + vite) | PASS |
| phase docs / AI handoff / git diff --check | PASS |
| focused FEATURE | Vitest **6937/6939 PASS**。broad Playwright は **FAIL 2 件**: p12-1 §13 の 44px 期待(意図変更の 36px に更新)、`dojo-display-judge` の tempo 13/14(既知の負荷依存。単独再実行で PASS)。更新後の p12-1 + dojo-display-judge 単独 **49/49 PASS** |
| fresh FULL | **未実行**(P23-41 では新規 FULL を必須としない。前 HEAD の FULL を今回の PASS として流用しない) |

- 既存テストの期待値変更は、意図した仕様変更の 2 箇所だけ:
  - `p12-dojo-home-layout`: primary の下限 44 → 36(resume は VL の small 36px。他の primary は 44 以上)。
  - `p23-27-dojo-home`: 「ほかの最近」の高さ 44 → 36、右列下端を左列に揃える assert を「stretch しない」に変更。
- P23-40 のガイド入口(5 枚目 → course)は focused E2E で引き続き PASS。

## 7. 変更ファイル

- `src/views/chord-dojo/DojoHome.tsx`(GuideArt の装飾 class)
- `src/views/chord-dojo/dojoHomeArt.tsx`(既存装飾への class/data のみ)
- `src/views/chord-dojo/dojoHome.css`(hover / today / resume / 装飾 animation)
- `src/features/bass-practice/ui/bassPracticeHome.css`(resume 寸法・紫の hover/focus)
- `src/styles/voicing-loop.css`(VL resume の hover/focus)
- `e2e/p23-41-home-motion-resume.spec.ts`(新規)
- `e2e/p12-dojo-home-layout.spec.ts` / `e2e/p23-27-dojo-home.spec.ts`(意図した期待値更新)
- `e2e/visual.spec.ts-snapshots/practice-chromium-desktop-win32.png`(意図した baseline)
- `docs/reports/p23-41-assets/*.png`(4 幅 + 状態)
- この報告

## 8. 制約・未実行

- merge / push / tag / release / EXE / P23-42 以降なし。
- 実機 MIDI・実音・学習効果は本次の対象外で未確認(UI のみ)。
- 画像の人間目視は Human Acceptance に残す。自動で確認したのは寸法・色・hover/focus/reduced-motion・overflow・pixel 差分。
- P23-40 の course 契約・記録・進級・翌日条件・Vault schema は変更していない。
- FEATURE �� broad Playwright �� heavy spec �� workers=6 �� neighbour �̒��ŉ񂷂��߁AFULL �� heavy ����(workers=2)�Ƃ͕ʁB`dojo-display-judge` �� 13/14 �� test-dx �̃\�[�X�ɂ�����m�̕��׈ˑ��ŁA����� UI �ύX(�z�[�� CSS)�Ƃ͖��֌W�B�X�V��� p12-1 �ƍ��킹�ĒP�� **49/49 PASS**�B

# P23-50 舞台の形を、高度コースと自由練習に広げる

- 基点: local master `9a23c950`（P23-47-fix-4-fix-1 と P23-49 を入れた後）
- ブランチ: `feat/p23-50-guided-redesign`（P23-50〜53 はこのブランチで続ける）
- 指示書: `inbox/P23-50/P23-50.md` / 順番: `inbox/P23-連続-2026-11-20.md`
- 状態: 実装・点検・E2E・写真・FULL まで完了。**master には入れていない。push もしていない。**

## 1. 差分の適用と、ぶつかった所

`git apply --check P23-50.patch` は `src/views/chord-dojo/AdvancedCourseView.tsx:956` で失敗した（基点 `d05cd6b3` の後に fix-1 が同じファイルの初見譜を直していたため）。`git apply --3way` で当て、1 か所だけぶつかった。

| ファイル | ぶつかった所 | どう直したか |
|---|---|---|
| `src/views/chord-dojo/AdvancedCourseView.tsx` | 初見譜（`SightQuestion`）の下の帯。差分は「判定の行を下の帯からコード名の下へ移す」ため下の `advanced-feedback` を消す。fix-1 は同じ行の近くで、初見譜の要約と「次へ／もう一度」の条件を `connected` から `official`（開始時に接続していたか）に変えていた | 差分のとおり**下の帯の `advanced-feedback` を消した**（判定はコード名の下の 1 つだけ）。要約の条件は **fix-1 の `official` のまま**残した。fix-1 で耳・初見譜を直した所だけのぶつかりなので、指示書 1 節の「両方の変更を残して直してよい」に当たる |

ほかの 3 ファイル（`GuidedBasicPractice.tsx`・`guidedStage.css`・`e2e/p23-50-advanced-stage.spec.ts`）はそのまま当たった。

## 2. 変えたファイル

| ファイル | 変更 |
|---|---|
| `src/views/chord-dojo/AdvancedCourseView.tsx` | 上の帯から「MIDI 接続中/未接続」と「MIDI 設定」を削除。見本に `data-stage="demo"`、問題に `"question"`、初見譜に `"sight"`。鍵盤を `stage` に。判定の行を下の帯からコード名の下へ移し、まちがいの理由（`advanced-review-reason`）を判定の横へ（進行の時だけ「2枚目 G7: 」を前へ）。初見譜の題に `ac-sight-title`。初見譜の判定もコード名の下へ |
| `src/views/chord-dojo/GuidedBasicPractice.tsx` | 自由練習・間違えた問題の練習の上の帯から MIDI の 2 つを削除、`data-stage="question"`、判定をコード名の下へ、鍵盤を `stage` に |
| `src/views/chord-dojo/guidedStage.css` | P23-50 の分（判定の色で後ろの光・進行の札・初見譜の題 26px/22px・8 小節の札・テンポの選ぶ欄・札の高さと字の線・上の帯が潜り込まない・初見譜は低い窓と狭い窓で縦に伸びる） |
| `e2e/p23-50-advanced-stage.spec.ts`（新） | 4 本（Lv4 の舞台とまちがい・Lv6 の札・総合確認の初見譜・自由練習） |
| `docs/reports/p23-50-assets/`（新） | 10 枚 |

採点・保存・問題の出し方・音・Enter の操作・合格の線・区切りは変えていない。`data-stage` は高度コース（見本・問題・初見譜）と自由練習に付き、結果の画面は今までのまま。

## 3. 点検（すべて PASS）

| 点検 | 結果 |
|---|---|
| `npx tsc --noEmit` | PASS |
| `npx tsc -p tsconfig.e2e.json` | PASS |
| `npm run lint`（ESLint + class lint + source contracts） | PASS |

## 4. E2E・単体テスト

- 指示書 3 節の 7 spec: **46 / 46 PASS**（2.9 分。新しい 4 本を含む）。
- テストの書き方を 2 か所直した（**期待の値は変えていない**）。
  1. **Lv6**: `guided-level-select` で 6 を選ぶと、開くのは Lv6 の自由練習の選ぶ画面（`.ac-practice-panel`）で、舞台ではなかった。値は舞台の札で測った物なので、`advanced-start`（「練習を始める」）を押して `data-stage="question"` の舞台へ進んでから測るようにした。札の高さ・字の上の位置・22px/800 の期待はそのまま。
  2. **768 の写真**: 窓を変えた直後に撮ると、アプリの殻の狭い形（左の帯が 232px → 64px）がまだ切り替わっておらず、最初の写真は右へ約 98px ずれていた。`settle()`（300ms 待つ）を窓の変更の後に入れた（実測で 50ms ではまだ 230px、200ms で 64px）。`assertNoHorizontalOverflow` も待った後に回した。
- 直した後、新しい spec だけ **4 / 4 PASS**（8.2 秒）。
- `npx vitest run src/views/chord-dojo`: **310 / 310 PASS**。
- 写真は新しい spec を `UPDATE_REPORT_SCREENSHOTS=1` で回して `docs/reports/p23-50-assets/` に書いた。FULL の前にコミット済み。
  - 途中、7 spec をまとめて `UPDATE_REPORT_SCREENSHOTS=1` で回したため、ほかの段の追跡済みの報告写真 55 枚が上書きされた。**すべて `git checkout --` で戻した**（この段のコミットに入った写真は `p23-50-assets/` の 10 枚だけ）。

### 4-1. FULL

`npm run test:full -- --fresh` を 1 回（コミット `da6acf6b`）。

- 非 Playwright: source contracts、AI handoff、class lint、phase docs、runner contracts 40/40、privacy scan、E2E TypeScript、production build、repository ESLint、App TypeScript — すべて PASS。
- Vitest: **7049 / 7051（既存 skip 2）PASS**。
- Playwright: **1241 / 1243（既存・条件付き skip 2）PASS**。
- heavy pass: **53 / 53 PASS**。
- Git diff check PASS、Tracked PNG check PASS（FULL の間に追跡済みの PNG は 1 枚も変わっていない）。1142.7 秒。生ログは `.local-evaluation/test-logs/2026-11-19T06-55-16-460Z-full.log`。

## 5. 写真と見本

このセッションのモデルは画像を読めないため、見本との比較は**数値**で行った（行・列の明るさプロファイル、72×45 の相関と平均差、±100px の位置ずれ探索、10×12 の差分行列）。目で見た確認ではない。

| 写真 | 見本 | 結果 |
|---|---|---|
| `lv4-demo-1440.png` | `lv4-demo-1440.png` | 一致（相関 1.000・明るさ差 0.2） |
| `lv4-question-1440.png` | `lv4-q-1440.png` | 一致（1.000・0.2） |
| `lv4-wrong-1440.png` | `lv4-wrong-1440.png` | 一致（1.000・0.2） |
| `sight-1440.png` | `cap-sight-1440.png` | 一致（1.000・0.3） |
| `sight-1280.png` | `cap-sight-1280.png` | 一致（1.000・0.4） |
| `sight-768.png` | `cap-sight-768.png` | 一致（0.999・0.6） |
| `free-lv2-1440.png` | `free-lv2-1440.png` | 一致（1.000・0.2） |
| `free-lv2-768.png` | `free-lv2-768.png` | 一致（1.000・0.4） |
| `lv6-demo-1440.png` | `lv6-1440.png` | **同じ形・中身が違う**（0.957・4.3）。差は札と案内の所（y≈270〜630）と右上・右下のボタンに集まる。見本は 4 枚の札（別の教材）で、こちらは Lv6 の自由練習の既定の教材（Dm7・G7・Cmaj7 の 3 枚）。札の高さがそろう・字が 22px/800・字の上の位置がそろう、は満たしている |
| `lv4-wrong-768.png` | `lv4-wrong-768.png` | **下へ 62px ずらすと一致**（ずらした後の明るさ差 4.2）。見本は道場の中のスクロールを下まで送った状態（中身 560px・見える所 498px）。レイアウトの違いではない |

見本と違う所（レイアウトの差ではない物）:

- 見本の Lv6 は、Lv4・Lv5 を合格した記録で「Lv6 の見本」を開いた物。こちらは基礎だけ合格の記録なので、Lv6 を選ぶと自由練習になる。同じ CSS（`.guided-course[data-stage] .ac-card`）の舞台で測っている。
- 見本の 768 は中のスクロールを下へ送って撮ってある。こちらは一番上で撮った（どちらも同じ形）。
- 見本の `lv6` の教材は ♭ の入る札を含む。こちらが開く既定の教材は Dm7・G7・Cmaj7 で ♭ が無いため、「♭ が入っても字の上の位置がそろう」は CSS と見本の写真でしか確かめていない。

## 6. 注意・未実施

- **master には入れていない**（指示どおり。P23-51〜52 の後、リードのレビューで入れる）。push、tag、release はしていない。
- 実機 MIDI での確認はしていない（合成 MIDI と画面の数字まで）。
- 画像を目で見ていない（上の 5 節のとおり数値で比較した）。
- FULL の前に `git status --short -- "*.png"` は、この段の写真は空だった。作業前から untracked の `docs/reports/assets/`（過去の調査の写真）だけが残っている（この段の物ではないので触っていない）。

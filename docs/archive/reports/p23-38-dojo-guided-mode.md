# P23-38:Chord Dojo ガイド練習の独立モード化・既存UIへの統一

- ブランチ:`feat/p23-38-dojo-guided-mode`
- 基点:`cc22f9ce`(P23-37 の報告まで。P23-35 のガイド実装を含む)
- 製品コード HEAD:`61b1345e`(テスト・基準画像の追従は `20e5310b` / `acaff214`)
- 検証した最終 HEAD:`acaff214`(fresh FULL PASS)
- 結果:P23-35 のガイドを **Chord Dojo ホームの5枚目のカード**から直接始める独立モードにした。旧一覧のチェックボックスは削除し、通常練習は常に通常練習を開始する。教材は Dojo セッション内だけに保持し、保存しない。音・判定・時計・記録保護は P23-35 のまま。merge / push / tag / release / EXE 生成は未実行。

## 1. 入口と遷移(利用者が押す場所)

- **Chord Dojo ホーム**(「定番の進行」「2-5-1 Master」「耳で弾く」「ボイシングドリル」が並ぶ画面)の「よく使う練習」に **5枚目「ガイド練習」** を追加した。既存4カードの相対順序・右側情報・続きから・今日のおまかせは変えていない。
- カードの主ボタン(カード名)を1回押すと、**中間選択画面なしで①聴く**へ入る。既定教材は公開 Stable ID `jb-3625`(「3-6-2-5」)の **キー C・全4コード**。
- カードには「今回の教材名・キー・コード数」を表示する(例: `3-6-2-5` / `キー C・4 コード`)。ガイドは記録を保存しないため、成績・達成バー・前回記録は追加していない。
- 副操作「教材を変更」は主操作と別のボタンで、押してもガイドは始まらない(クリック伝播も止める)。
- ガイド画面のヘッダーは「Chord Dojo へ戻る / ガイド練習 / 教材変更」の並び。5段階の現在位置、今やることを1文、現在カード n/N、カード列 → 楽譜 → 鍵盤 → 操作バーの順。
- 段階表示は **①聴く / ②見て弾く / ③思い出す / ④テンポで弾く / ⑤自由に試す**。
- 戻る/終了でホームへ戻り、**ホームのガイド入口へ focus を戻す**。ガイド中は通常 Dojo の Enter ショートカットが動かない(ホームが unmount されるため二重起動なし)。

## 2. 教材の変更(2.3)

- ホームの「教材を変更」と、ガイド内ヘッダーの「教材変更」は**同じ選択画面**を開く。
- 組込み進行 / 自分の進行を選び、キー(組込みのみ)と**連続2〜4カードの範囲**を選び、「この教材で始める」で**決めた時だけ**新しい snapshot / session で①へ入る。
- 一覧のデータと表示部品(既存のビルドイン定義、保存進行、Dojo のトークン・フォーム・ボタン)を再利用し、**通常の onPractice / one() / 記録更新経路は呼ばない**(選択はガイド専用のコールバック)。
- 変更中は音声とテンポを停止。**キャンセルでは教材・周結果を消さず**元の画面へ戻る(音の自動再開なし)。ホームから開いた場合はホームへ、ガイド内から開いた場合はガイドへ戻る。
- 教材を確定すると新しい session(session id / epoch)になり、旧 session の入力チケットは照合で拒否される。
- 1コードの保存進行、範囲外、2〜4以外は P23-35 の検査どおり理由付きで拒否し、開始ボタンを無効にする。既定教材が使えない場合も音を補修せず、理由と「教材を変更」を出す。
- 教材・キー・範囲は **Dojo を開いている間のセッション内だけ**保持する(終了→再入場ではその教材で①から;アプリ再起動後は既定に戻る)。storage は更新しない。
- 旧一覧の「見本なしガイド」チェックボックスと guide boolean は削除した。通常の練習ボタンは常に通常練習を開始する。

## 3. P23-35 から維持した契約

- 音・教材 snapshot(source occurrence / beats / hand・finger 表示计划)・judge/bass/top・targetSnapshot・GrandStaff / PracticeKeyboard。
- ① は明示の「お手本を聴く」だけで再生し、画面遷移時の自動発音なし。① の「取り組み済み」は範囲再生の完了時だけ。
- ②③ の既存判定 / 自己確認、③ の現在カードだけのヒント(試聴もヒント)、隠した答えの不足音名を出さないこと。
- ④ は既存 `tempoPlan` の時計。開始・停止・ヒント停止・対象外判定・1周のカード記録。
- ⑤ は既存の任意の自由練習のみ(創作課題・作曲評価・進級条件の追加なし)。「試して終了」は自己申告。
- ①〜④ の1周終了では**同じ段階に留まり**、自動 stage advance をしない。「もう一度」と「次へ」は本人の明示操作。④ の自然終了も周結果表示に留まることをコードと E2E で確認した。
- session id / epoch / attemptId / cardIndex のチケット照合、stale 結果の拒否、終了後の遮断、note-release 境界、部分周の破棄。
- ガイドは通常の成績・today・cursor・recent・practice-opens・Vault へ書かない。

## 4. 既存部品・token の再利用と、却下モック

- PracticeHead / PracticeGuide / PracticeCard / PracticeActions / GrandStaff / PracticeKeyboard と Dojo の背景・文字・アクセント・角丸・ボタン高・余白をそのまま使った。PracticeHead には任意の `extra` スロットだけを足し(他画面は未指定で従来どおり)、「教材変更」をヘッダーに置いた。
- 以前の `design-mocks/p23-35-guided-practice-v2.html` は**移植していない**(レイアウト・色・見出し・新規部品なし)。
- 新規の外部素材・ライブラリは追加していない。

## 5. 検証

### 自動テスト

- 新規 E2E `e2e/p23-38-dojo-guided-mode.spec.ts` **7/7 PASS**: 5枚目の順序と既定教材(Stable ID/キー/4コード)/ 中間画面なし・開始前の発音なし(音源 start の probe 0)/ 段階名 / 教材変更(組込み・キー・部分範囲・再入場)/ キャンセル(ホーム・ガイド内、ヒント保持)/ 1コード教材の拒否 / 通常一覧とガイドの独立 / 保存進行なしの無効表示。
- P23-35 の既存 tests を新入口へ移した:
  - `p23-35-guided-learning.spec.ts` **4/4 PASS**(通常一覧・既定教材の①→⑤・④開始停止ヒント・終了/focus・3幅)
  - `p23-35-guided-fix2.spec.ts` **10/10 PASS**(固定 literal fixture の②③、保存の中間範囲 exact、④ 1周/誤り/停止/ヒント/残り Note On、記録不変(ON前→終了→再入場)、自己確認、キーボード/a11y/Esc、④ の周終了が同段階に留まること)
  - 音・判定・秘匿・記録の assertion は弱めていない。旧 checkbox 前提→新カード前提への変更のみ。
- 関連回帰:
  - `p20-dojo-home` / `p12-dojo-home-layout` / `p22-01-home` / `p12-vertical-layout` **35/35 PASS**
  - `p22-01-back` / `p22-01-list` / `p12-4-back` / `p20-resume-kinds` **65/65 PASS**
  - `p12-3-dojo` / `p12-chord-dojo` / `p12-5-no-restart` / `dojo-display-judge` / `dojo-long-hardening` **109/109 PASS**
  - `p23-27-dojo-home` **7/7 PASS**(5枚目ぶんの期待値を更新)
  - `p12-master251-register` の Master Home geometry(heavy)**3/3 PASS**(同様)
- focused ユニット:`guidedMaterial` / `GuidedPracticeView` / `guidedPractice` **43/43 PASS**。
- **FEATURE PASS**(App TS / source contracts / class lint / changed ESLint / Vitest 75 / Playwright 52)、**UI PASS**(21/21)、app・e2e TypeScript / lint / production build PASS。

### 意図したレイアウト変更に伴う既存期待値の変更(旧 → 新 / 理由)

| テスト | 旧 | 新 | 理由 |
|---|---|---|---|
| p12-dojo-home-layout | mainCards 4 / 1440 の scroll ≤1 | 5 / ≤80 | 5枚目の追加。ホームが1行ぶん高くなる |
| p20-dojo-home(1440) | scroll ≤1 | ≤80 | 同上 |
| p22-01-home | カード4・2行 | カード5・3行。折り返し下のカードは scrollIntoView してから pointer/covering を確認 | 5枚目。assertion の内容(押せる・重ならない)は維持 |
| p23-27-dojo-home | 4カード / mock の4カード測定 / covering は未スクロール | 5カード存在 + mock 測定は既存4カードに限定 / covering は先に scrollIntoView | 5枚目は mock 対象外。既存4カードの mock 契約は維持 |
| visual.spec practice 基準画像 | 旧ホーム | 5枚目のホーム | 意図した配置変更。この1枚のみ更新(186,735 → 173,677 bytes) |
| p12-master251-register(heavy) | 1440 の scroll ≤1、全ボタンの inMain/hit | ≤80、画面内のボタンのみ inMain/hit | Dojo ホームの5枚目。画面外のボタンは通常のスクロールで到達できる |

閾値の緩和はこの表の範囲だけ。skip / retry / timeout の追加、runner の変更、無断の一括 snapshot 更新はしていない。

### FULL(実測)

- 最初の FULL(`61b1345e`): Playwright full で **5 failed**(p23-27 の 4件と visual の practice 基準画像。いずれも5枚目に伴う既存期待値)。
- 2回目(`20e5310b`): light PASS(1173/1175、既存 skip 2)、heavy で **1 failed**(p12-master251-register の Master Home geometry。5枚目で Dojo ホームが1行高くなったため)。
- **最終 FULL(`acaff214`、cache なし): PASS**
  - Vitest **6851/6853**(既存 skip 2)
  - Playwright full **1173/1175**(既存/条件付き skip 2)
  - Playwright heavy **53/53**
  - Source contracts / AI handoff / Class lint / Phase docs / Runner contracts 40/40 / Privacy scan / E2E TypeScript / Production build / Repository ESLint / App TypeScript / Gallery excluded すべて PASS
  - `goto` の開き直り 0 回、Git diff check PASS、Tracked PNG check PASS。所要 1020.2 秒。

## 6. 画面確認(4サイズ)

`p89-generated/p23-38/`(Git には入れない)

- `home-1920x1080.png` / `home-1440x900.png` / `home-960x1032.png` / `home-768x640.png`(5枚目のホーム)
- `guide-see-1440x900.png`(②)/ `guide-recall-hint-1440x900.png`(③ヒント)/ `guide-result-1440x900.png`(終了)/ `guide-choose-1440x900.png`(教材変更)/ `guide-recall-768x640.png`(768 の③)
- 自動確認: 4サイズで横 overflow なし・操作可能。文字を不自然に小さくしていない。画像の目視最終判断は利用者に委ねる。

## 7. 制約

- 実機 MIDI・実音の聴取・学習効果は**未確認**(自動テストで確認済みとは扱わない)。MIDI 判定は合成 fixture の固定イベント、音はオーディオ開始の probe と再生要求の確認まで。
- ガイドはセッションのみ。教材・キー・範囲はアプリ再起動後に残らない。
- 5枚目の追加により、1440×900 ではホームが1行ぶんスクロールする(この変更は指示の「カード増設のためホーム全体を縮めない」に沿う)。
- merge / push / tag / release / EXE 生成は行っていない。次 Stage は開始していない。

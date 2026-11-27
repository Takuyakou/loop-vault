# R-01: テストの片付け

ブランチ `chore/test-hygiene`(master `c36133ec` から)。master へのマージ・push はしていません。仕様 `R-01-test-hygiene.md`。

## 1. 全体のテストのたびに、追跡中の写真が上書きされる

### 変えたもの

| ファイル | 変更 |
|---|---|
| `e2e/p17-01-screens.spec.ts`・`e2e/p17-02-screens.spec.ts`・`e2e/vl-13-screens.spec.ts` | 保存先を `const dir = process.env.UPDATE_REPORT_SCREENSHOTS === "1" ? "docs/reports/<種類>" : "p89-generated/report-screenshots/<種類>"` に。テストの中身(表示・操作の確かめ)は1行も変えていない |
| `scripts/test-dx/run.mjs` | (a)FULL の最初と最後に追跡中 PNG(`*.png` pathspec の `git status --porcelain`)を照合し、変化があれば FAIL でパスを並べる。**/start で既に汚れているときも名前を出して止まる**/(b)未追跡の PNG は FULL 前の個数と比べ、FULL 中に新しく出てきたものだけ FAIL にする(手作業で置いてある既存の未追跡ファイルは触らない)/(c)起動時の状態ハッシュ `git diff --binary HEAD`(ランナー ENOBUFS の原因)を **`git diff HEAD`** に置き換え — バイナリ差分は1行に潰れ、テキスト差分の中身は従来どおり拾う。これは `scripts/test-dx/cache.mjs` の `fingerprint`(PASS キャッシュの同一性判定)にも同じ"
| `scripts/test-dx/cache.mjs` | `fingerprint` の `diff --binary` を `diff`(テキスト)に |

- 選んだ方法の理由:`maxBuffer` を広げるだけにはしない — 読み込む内容そのものからバイナリを外した(差分はパス+行数で判定でき、`--binary` の base64 は不要)。**`git diff HEAD`(テキスト)の大きさは実測で数百 KB 未満**で、ENOBUFS(既定 1 MB)には届かない
- 今追跡している PNG は消さず、報告の記録として残す
- 「普段の保存先」は指示どおり `p89-generated/report-screenshots/`(gitignore 済みディレクトリ)。報告を更新したいときは `UPDATE_REPORT_SCREENSHOTS=1 node scripts/run-playwright-visual-tests.mjs e2e/<spec>` を明示して走らせる

### 確かめ

- 3 spec をそのまま走らせると、写真は `p89-generated/report-screenshots/{p17-01,p17-02,vl-13}/` に並び、`git status --short -- "*.png"` は変化なし(未追跡の 9 枚 `docs/reports/assets/voicing-loop-header-width-audit/*` は本件以前から手元にあるもので、この作業では触っていない)
- FULL の PNG ガードは後述の test:full 3 回で毎回 `Tracked PNG check: PASS` として出る

## 2. 負荷が高いときだけ落ちるテスト

### 測り方

`scripts/test-dx/r01-sample.mjs`(ツールとして残す):歴史的に落ちていた 10 spec を **FULL と同じ並列数(この環境で6)で1つの組として**走らせ、失敗したテストの `spec:行` と本文を記録する。1ラウンド約 320〜340 秒。あとで 2 本追加した:`r01-p533-sample.mjs`(P5.33/vl-13 周辺の 6 spec 組 ×3 ラウンド)、`r01-dojodisplay-sample.mjs`(`dojo-display-judge` 単体 ×5 ラウンド)。いずれも `.local-evaluation/r01/`(gitignore 済み)に丸ごと残す。

### 測った結果(計 11 ラウンド、計 ~58 分)

| 段階 | ラウンド数 | 失敗 |
|---|---|---|
| 直す前(2026-11-05、10 spec × 3+5 ラウンド) | 8 | **2 回**:1 回は `p89-home-continue.spec.ts`(960px で带のセル数/切れ目を測る expect が再レイアウトと競って中途値を読んだ)、1 回は `p12-master251-ui-scheduler.spec.ts` の **Playwright 自身の後片付け**(`apiRequestContext._wrapApiCall: ENOENT ... copyfile ...playwright-artifacts-3\trace...` + `locator.click: Test ended` — ページ切断と trace の複製が競う infra 競合) |
| 直したあと(10 spec × 3 ラウンド) | 3 | **0 回**(p89-home-continue を poll 化してから。master251 の2本は heavy どり後にまだ負荷をかけていない → FULL で確認) |
| 一つ前の一覧に加えて `preview-fade` を入れた再現ループ(6 spec × 3+3 ラウンド、`r01-p533-sample.mjs`) | 6 | **0 回** |
| `dojo-display-judge` だけの再現ループ(5 ラウンド、`r01-dojodisplay-sample.mjs`) | 5 | **0 回** |
| 歴史的に報告のあった其余(`p12-4-long`・`phase13-1-bass-ui`・`bass-practice`・`p16-ear-practice` など) | 上の全ラウンドを通して | **再現せず** |

どの行で何を待っていたか:

- `p89-home-continue`(「P8.9-09b 続きから strip…」):`setViewportSize` の直後に strip のセル数/切れ目を 1 回だけ読み、見本と突き合わせていた。セルの折り返しは container query + ResizeObserver の再計算なので、1 回の測定は**確定前の中間状態**を読み得る(実際に読んだ)
- `vl-13-voicing-loop`:全体 head が一周して戻った直後の `|fill − head| ≤ 1` とディスプレー縮尺切替(120ms の sleep の後)の同じ「1 回だけ測る」形が、描画が遅れたときに |fill−head| = 10.56 を読んだ(本調査のサンプリングではこの形を 1 回観測してから直した)
- `p12-master251-ui-scheduler`:テストの待ち方に問題はなく、**Playwright の後片付けの競合**(ページ切断と trace 複製)。テストの書き方では直せない → 対処は「重い spec を少ない並列で走らせる」(次)

### 直したもの(待ち方を正しくする。閾値の変更はしない)

| spec | 直し |
|---|---|
| `e2e/p89-home-continue.spec.ts` | 突き合わせを **`expect.poll`**(10 秒)にして、セル数が揃い・切れ目が 0 になる(=レイアウトが確定する)まで待つ。期待値 `count|clipped` は従来と同じ(`cells|0`) |
| `e2e/vl-13-voicing-loop.spec.ts`(3 ヶ所) | (a) ループが一周して戻った直後、(b) ディスプレー縮尺 12/16 への切替後(`waitForTimeout(120)` をやめ)、(c) 区間ループ — のそれぞれで **`|fill−head| ≤ 1` に収束するまで poll**(15 秒 / 10 秒)。閾値(≤1・fill>50 など)は1つも変えていない |
| `scripts/test-dx/run.mjs`(並列の組み替え) | `p12-master251-register.spec.ts` と `p12-master251-ui-scheduler.spec.ts`(144 セル × 複数サイズを複数の browser context で測る、もっとも重い2本)**を同じ FULL の中で別の low-parallel パスに分けた**(`--workers=2`)。並列 6 の主パスから外すだけ(retry・skip・串刺し判定の変更はしない) |

### FULL を回した中で出た分の直し(同じ原則:待ち方・置き場所のみ。期待値は1つも弱めていない)

| 出た場面(FULL 日時) | spec/ファイル | 現象 | 直し |
|---|---|---|---|
| 11-05 12:58・11-06 06:52 | `e2e/preview-fade.spec.ts` | 電子ピアノの停止時ジャンプが音そのものの急さ(0.005)の 3 倍超を 1 回読んだ。ブラウザ出力を worklet で全サンプル録測する純粋な負荷計測 | heavy どりに追加(低並列パス) |
| 11-06 07:13 | `e2e/dojo-display-judge.spec.ts` テンポ再接続 | 全問正解のはずが **13/14 で丸が閉じた**(1 問が拍の時間窓から外れた)。テンポ判定は拍の時間窓に対する計測で、単独 5 回・6 spec 混合 3 回とも再現しない | 結論の読みに 15 秒(既定 5 秒から)。それでも出たため **heavy どりに追加**。13/14 を許す変更は意味が変わるのでしない |
| 11-05 14:29 / 14:59・11-06 07:50 | `e2e/p12-dojo-home-layout.spec.ts`・`e2e/helpers/p12.ts` `openDojo`・`e2e/p12-master251-register.spec.ts` | 実走中に preview サーバへ届かない(`net::ERR_CONNECTION_FAILED`)が **3 本で 1 回ずつ**(3 回目は低並列の heavy パスでも出て、残りのテストは通った — 恒久的なサーバ死ではなく一時的な接続拒否のエピソード) | 3 か所とも `goto` を状態ベース再試行(30 秒)。アプリは静的配信なので到達性の再試行が障害を隠さない。試行しても接続できないサーバはそのまま落とす(全体 FAIL) |
| 11-05 15:12 以前 | `e2e/bar-cut.spec.ts` P17-02 | 曲を 1 周で鳴り止ませた直後の一回読みが「まだ押さっている」を 1 回読んだ | 鳴り止みで `aria-pressed` が `false` に戻るまで poll(クリック維持も含めて既存の2回クリックの形を踏襲) |
| 11-05 14:46 | `e2e/phase5.33-voicing-rule-ui.spec.ts` 停止中シーク | クリック直後の一回読み・10 秒 poll の両方で `aria-current` が空/null のまま 1 回ずつ。クリック自体が競合で一度も効かなかった可能性 | poll 内の「まだ `step` でなければもう一度クリック」の形は §2 見直しで撤去:待ちと単発 1 クリックに変更(下の見直し節) |
| 11-05 13:45 | `e2e/p12-1-dojo-ui.spec.ts` §11 | Space の抑制フラグが key ハンドラ設置前の mounting 隙間に押されて記録されないまま 1 回 | poll 内の「未記録ならもう一度 Space」の形は §2 見直しで撤去:受け手確定待ちと単発 1 押しに変更(下の見直し節) |

### 迷い(未確定のまま記録)

- preview サーバが実走中に一瞬届かなくなる根元(3 回 × 別 spec、低並列でも 1 回):1 pass 内で webServer は同一个性を再利用するため、プロセス側で生死の切り替わりか、受入キュー詰まり相当の"一时的な接続拒否"かのどちらか。server 側の痕跡がログに残らず root cause 未確定。対処は状態ベースの goto 再試行(静的配信のまま)。
- `dojo-display-judge` の 13/14:「どの問が外れたか」は終端の結果表示のみで判別できない。単独・混合で再現しないため、重みとしては FULL 並列の残 CPU 依存と説明する以外に確証がない。

### 対処しなかったもの(と理由)

- 歴史的なリストの其余は 8 ラウンドのサンプリングで一度も出なかったため、待ち方に根拠のある直しを入れなかった(推測での書き換えはテストの意味を変える恐れがある)
- `phase13-bass-practice` の「Keep」(録音解析の 15 秒待ち)も再現せず。その待ち方自体は状態ベース(`toContainText` + `poll` - attempts)

## 3. test:full 3回(新しく走らせた結果)

| # | 結果 | 時間 | 内訳 |
|---|---|---|---|
| 1 | PASS | 933.0s | Vitest 6271/6273・Playwright 主パス 800/802(既存/条件付 skip 2)・heavy 46/46 |
| 2 | PASS | 949.1s | 同上 |
| 3 | PASS | 1011.7s | 同上 |

フルログ:`.local-evaluation/test-logs/2026-11-06T08-07-52-030Z-full.log`・`…08-23-28-736Z-full.log`・`…08-39-21-443Z-full.log`(.local-evaluation は gitignore 済み)。

## 4. 報告確認後の見直し(2026-11-06 午後)

### 4.1 指紋:バイナリ・未追跡の中身をハッシュに入れる(`cache.mjs`)

- 指紋はテキスト差分 `git diff HEAD` だけでなく、**`git diff --numstat -z HEAD` で `- -`(バイナリ変化)になった追跡ファイルの中身を `git hash-object` でハッシュ**し、**未追跡ファイルも中身ごとハッシュ**する形に変更。従来は未追跡でも `src|e2e|scripts/` と config のみだった。**(この「未追跡は全件」は 11-07 の 4.8 で範囲を戻した。以下 4.1 はその時点の記録)**
- 前提の訂正(実測):「2 通りのバイナリ変更で指紋が同じになる」は **`git diff HEAD` の index 行が作業ツリーの新 blob id を含むため、通常の置き換えではすでに再現しなかった**(単体テスト作成時に 2 通りの差分文字列が index id のみ異なることを観測)。追加ハッシュは、モードだけ変わる変更のように差分の1行で潰れる境界ケースと、text 差分に現れない未追跡の中身に対する明示的な保証。
- 単体テスト(`cache.node-test.mjs` に 2 件追加、合計 38/38):**「同じバイナリが 2 通りに変わると指紋が違う」**(仮 git リポジトリを `.local-evaluation/test-performance/` に作り、同一ファイルの中身を 2 回別々に書き換えて `fingerprint().dirtyHash` を比較)と、**未追跡ファイルの中身が変わると指紋が違う**。

### 4.2 「もう一度操作する」直しの撤去(待ち + 単発操作 に戻す)

原則:クリック/キー押しの取りこぼしを poll 内で操作を繰り返して埋める書き方は撤去。**受け付けられる画面状態を待ってから 1 回だけ操作し、結果は 1 回だけ断言**する。

| spec | その時の状態(1 回目が効かなかった理由) | 変えた形 |
|---|---|---|
| `phase5.33-voicing-rule-ui.spec.ts` 停止中シーク | 再生 runtime は非同期で立ち上がる(Tone.start + 楽器生成)。`開始`→`一時停止`→カード クリックの連打が、runtime の確定前・受け手未整備の状態変化と競合し得る。poll で再クリックした実績は 1 回(10 秒ずっと null)で、その DOM 状態の痕跡は走り後に消えている | `一時停止` の後、**トランスポートのボタンが `再開` に変わったこと(=ポーズのコミット済み)を待ってからカードを 1 回だけクリック**。`aria-current` の断言は元の `toHaveAttribute(...,{timeout:10000})` に戻す |
| `p12-1-dojo-ui.spec.ts` §11 Space | Space の受け手は React の post-commit pass で window に付く。失敗した FULL 実行では、フラグは「押されたが preventDefault されず」を記録していた(押した keydown 自体は捕捉されていた)。受け手が付いたこと自体は学習画面のどの DOM にも現れない(ハンドラの唯一の観測可能な効果が defaultPrevented そのもの) | リスナー登録後、**2 回の paint frame(paint の確定)を待ってから Space を 1 回だけ押す**。フラグ断言は元の 1 回の poll のまま。抑制の造り自体が真に無ければ落ち続ける |

- 両方とも「1 回の操作を再試行する」ものは撤去済み。また、アプリ側で入力が取り込めない(利用者でも起きる)ことの確証は得られていない:§11 は失敗 1 回の根拠が薄く、phase5.33 は runtime 確定競合の説明つき。確証が出た時点でここに追記して報告する。

### 4.3 goto の開き直し:残す + 記録

- `helpers/p12.ts` `openDojo`・`p12-dojo-home-layout.spec.ts`・`p12-master251-register.spec.ts` の 3 か所の状態ベース goto 再試行は**残す**(アプリは静的配信なので障害を隠さない)。
- 各再試行は `GOTO-RETRY <url>` をログに出す。FULL のまとめに **`goto の開き直り n 回`** を出す(`run.mjs` が両パス出力から集計)。

### 4.4 FULL の時間内訳(610s 級のころ → 現在 930〜1010s)

| 区間 | 現在(3 連続時の実測範囲) |
|---|---|
| 各種 gate(ESLint〜Runner contracts・11 step) | 約 60〜70s |
| Vitest full | 約 81〜112s |
| Playwright 主パス(並列 6、vite build 込み) | 約 420〜475s |
| Playwright heavy パス(並列 2、vite build 込み) | 約 358〜376s |

- **見直し後の FULL 1 回(新しく走らせた 952.0s)の正確な内訳**:gates 計 62.3s(ESLint 17.6 / Class lint 0.5 / Source contracts 0.1 / E2E tsc 4.3 / Phase docs 0.5 / AI handoff 0.1 / Privacy scan 1.5 / App tsc 24.7 / Production build 11.9 / Gallery excluded 0.1 / Runner contracts 38/38 1.0)・Vitest full 93.6s(6271/6273)・Playwright 主パス 430.4s(800/802)・heavy パス 365.2s(46/46)。合計 952.0s、言い換えれば各要素は直列で、端数(0.5s)は丸め差。VM の実行ログ:`.local-evaluation/test-logs/2026-11-06T15-04-26-786Z-full.log`。

- heavy パス(4 spec:preview-fade / dojo-display-judge / master251-register / master251-ui-scheduler)が **約 360s ずつ追加された**ことが主因。主パス自体は、heavy 分離前(812 件・約 480s)から 4 spec 減ってほぼ同等の時間に収まっている。
- heavy パスの中味:重い測定系 46 件を並列 2 でまわすのに約 6 分(vite build 込み)。並列 6 に戻せば短くなるが、preview-fade・テンポ判定のような計測が負荷で外れる(§2 の表参照)ため分けてある。並列 2 は重い計測が外れなかった最低並列(実測済み:並列 6 では外れた)。

### 4.5 調査用サンプリングツール(`r01-*.mjs`)の扱い

- コミット済みだった `r01-sample.mjs`・`r01-p533-sample.mjs`・`r01-dojodisplay-sample.mjs` は**コミットから外した**(手元には未追跡で残す)。同じく今回の走破用 `r01-followup-sample.mjs` も未コミット。今後の通常運用で使う道具ではない。

### 4.6 確認結果(走破)

- **変えた spec の走破(各方の FULL 並列で、spec 毎に 10 回ずつ、計 40 回)**:`phase5.33-voicing-rule-ui`・`p12-1-dojo-ui`・`p12-dojo-home-layout`(ともに通常の並列 6)と、`p12-master251-register`(heavy パスの並列 2)—— **40/40 すべて PASS、goto の開き直り 0 回**。実行ごとの生ログは `.local-evaluation/r01/followup-*-round-N.txt` と `followup-findings.json`。
- **npm run test:full(新しく走らせた 1 回)**:**PASS — 952.0s**(2026-11-06T15:04 開始の FULL:Vitest 6271/6273・主パス 800/802・heavy 46/46・`Runner contracts 38/38`(指紋テスト 2 件を含む)・goto の開き直り 0 回・追跡 PNG 変化なし)。上の 4.4 に内訳。

### 4.7 環境の付記

- 走破中に Playwright ブラウザ実体(`%LOCALAPPDATA%\ms-playwright`)が外部要因で消えたため、`npx playwright install chromium` で復元した(リポジトリには影響なし)。

### 4.8 指紋の範囲を戻し、ハッシュは1回にまとめる(2026-11-07 追記)

**直した理由**:4.1 で「未追跡は全件ハッシュ」にしたため、`.cargo-target-*` のような巨大な未追跡フォルダのある作業場所では、**1ファイルに1プロセス**(`git hash-object <path>`)を起動する形が非常に遅くなる。

| ファイル | 変更 |
|---|---|
| `scripts/test-dx/cache.mjs` | (a) ハッシュする未追跡ファイルの範囲を、R-01 以前の **`src/`・`e2e/`・`scripts/` と `package(-lock).json`・`*config*.[cm]?[jt]s`** に戻した(`untrackedScope`)。**範囲外は列挙だけして読まない・ハッシュしない = 指紋に入らない**(追加も内容変更も PASS を無効にしない)。(b) `git hash-object --stdin-paths` に全パスをまとめて渡し、**1プロセスで1回**(バイナリ変化の追跡ファイルも同じ呼び出しに乗せる)。削除済みのパスはパスだけを指紋に含める |
| `scripts/test-dx/cache.node-test.mjs` | 既存の「未追跡は中身が変わると指紋が変わる」テストを**範囲内**(`src/notes.txt`)に移し、**範囲外**(`.cargo-target-local/`)のファイルを足しても・中身を変えても指紋が変わらず、範囲内を変えると変わることを確かめるテストを1件追加**(cache.node-test は 7 件) |

**測った時間**(2つの作業場所、各5回の中央値。`node .local-evaluation/r01/fingerprint-measure2.mjs`、git 2.53 / Node 24.14):

| 作業場所 | 未追跡 | 指紋1回(新) | 旧:1ファイル1プロセス(実測から換算) |
|---|---|---|---|
| `<作業フォルダ>\Loop Vault-dev`(この作業場所) | 58 件(範囲内 4) | **138 ms** | 58 × 22.6 ms ≈ **1.3 s** |
| `<作業フォルダ>\Loop Vault`(別の作業場所) | 12,397 件(範囲内 3) | **203 ms** | 12,397 × 21.9 ms ≈ **271 s** |

- 内訳(この作業場所):`git diff HEAD` 28 ms・`git ls-files --others` 33 ms・`git rev-parse` 22 ms で大半。ハッシュ(範囲内 4 件)は一括呼び出し1回で残り。作業場所の未追跡件数が 4 桁でも 200 ms 前後に収まる。
- **一括にしても、全件を読むと遅い**:試しに 10,465 件の全パスを `--stdin-paths` でハッシュすると **17.3 s**(内容を読むため)。速さの要点は**範囲を戻したこと**で、そのうえでプロセス数を 1 にした。
- `run.mjs` はキャッシュ有効時、**各ステップの前後で2回**指紋を取る。UI はステップ1つなので指紋は **約 0.3 秒/回の実行**(58.3 秒のうち)。

**確かめ**

| 対象 | 結果 |
|---|---|
| `node --test`(Runner contracts 一式:selection / cache / reporting / gallery / performance-reporter / playwright runner) | **39/39 PASS**(新規1件を含む。`cache.node-test.mjs` 単体は 7/7) |
| `npm run test:ui`(1回) | **PASS — 35/35・58.3s**(ログ `.local-evaluation/test-logs/2026-11-07T01-08-03-974Z-ui.log`)。指紋の時間は上のとおり |

**正直な注記**

- **最初の `test:ui` は FAIL**(`Playwright selected changed tracked/config inputs while running`)。原因は私が**走行中に `cache.mjs` を編集した**ことで、`cache.mjs` 自身が `configHash` の対象に入っているため。ガードが設計どおり効いた例で、編集を終えてから取り直した2回目が上の PASS。
- 範囲外を指紋から外す前提は「**ゲートが見ない入力**であること」。選択(`selection.mjs`)は `src/`・`e2e/`・`scripts/` と config から所有を解決するので、範囲外の未追跡ファイルでテストの選択・結果は変わらない。

## 5. ここで止まる

master へのマージと push はしない(利用者の確認待ち)。

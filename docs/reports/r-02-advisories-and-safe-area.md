# R-02: Rust の安全情報/Voicing Loop の下の余白

ブランチ `chore/r-02`(master `09182c71` = R-01 のマージ後 から)。**master へのマージ・push はしていません。** 仕様 `R-02-advisories-and-safe-area.md`(v2.1.0 準備の zip)。

## 0. 結論

| | 結果 |
|---|---|
| 1. Rust の安全情報 | **脆弱性 0 件・警告 10 件(すべて承認済みの ignore)、`cargo test` 70 件通過。直っていない脆弱性は 0 件**。`chore/rust-advisories` は master に取り込み済み(`c36133ec`)のため、この段階では**取り込みをせず確かめだけ**を行った |
| 2. Voicing Loop の下の余白 | **製品コードの変更は不要**。6 つの大きさ × 短い/長い進行のすべてで、一番下の操作と窓の下端の差は **30.6〜36.0px**(空きの帯そのものは 16px)。VL-07 の決まり(小さくしない・高さを固定しない)も守られている。**e2e を 6 つの大きさに広げて、この保証を固定した** |
| 3. 総合 | `npm run test:full` **PASS — 888.2s**(Vitest 6271/6273・主パス 800/802・heavy 47/47)。1 回目は計測系 e2e 1 件が負荷で上限を 0.005 拍超えて FAIL → R-01 と同じ「計測系は低並列」に振り分けて 2 回目 PASS(§3.1) |

## 1. Rust の安全情報の確認(§1)

### 1.0 この段階でやったこと

- 仕様は `chore/rust-advisories` を `chore/r-02` にマージする形ですが、**利用者の指示により、すでに master に入っている `c36133ec`(承認済みの `docs/reports/rust-advisories-2026-11.md`)をそのまま使い、マージはしませんでした**。`chore/r-02` は master から切ってあります。
- issue は**閉じていません**(R-04 で利用者が決める)。

### 1.1 確かめたこと(新しく走らせた結果)

| 確かめ | 結果 |
|---|---|
| リポジトリの一番上で `cargo audit --file src-tauri/Cargo.lock`(ignore 込み。CI と同じ形) | **終了コード 0・何も出ない**(脆弱性 0・警告 0)。advisory DB 1422 件、510 クレートを走査 |
| `src-tauri` の中で `cargo audit --file Cargo.lock`(ignore なし = `.cargo/audit.toml` が読まれない形) | **終了コード 0・脆弱性 0 件・警告 10 件**(`warning: 10 allowed warnings found`)。ID は承認済みの報告と同じ 10 件 |
| `cargo test --manifest-path src-tauri/Cargo.toml --locked` | **通過 — 70 passed / 0 failed**(ほかに 0 件のテスト群 2 つ) |

- 生ログ(追跡しない `.local-evaluation/r02/`):`audit-root.txt`・`audit-noignore.txt`。
- **ignore なしの 10 件**(RUSTSEC ID):`2024-0370`(proc-macro-error)・`2025-0081`(unic-char-property)・`2025-0075`(unic-char-range)・`2025-0080`(unic-common)・`2025-0100`(unic-ucd-ident)・`2025-0098`(unic-ucd-version)・`2026-0371`(zbus_names)・`2026-0370`(zvariant)・`2026-0372`(zvariant_derive)・`2024-0429`(glib、unsound)。**いずれも警告で、脆弱性はありません。**

### 1.2 4 つに分けた表(§1。R-03 の `release-validation.md` と R-04 の issue を閉じるときに使う)

#### ① 直った版に更新した(8 クレート、脆弱性 11 件 + 警告 4 件)

| クレート | 更新前 → 後 | 直したもの |
|---|---|---|
| quinn-proto | 0.11.16 → 0.11.19 | RUSTSEC-2026-0338/0339/0340/0341/0342(#376〜#380) |
| rustls | 0.23.45 → 0.23.46 | RUSTSEC-2026-0346/0347/0348/0349(#381〜#384) |
| rustls-webpki | 0.103.15 → 0.103.16 | RUSTSEC-2026-0382(#388) |
| webpki-roots | 1.0.9 → 1.0.11 | RUSTSEC-2026-0381(#389) |
| tokio | 1.52.3 → 1.54.1 | RUSTSEC-2026-0386(#390、警告) |
| event-listener | 5.4.1 → 5.4.2 | RUSTSEC-2026-0221(#373、警告) |
| async-executor | 1.14.0 → 1.14.1 | yanked(警告) |
| chacha20 | 0.10.1 → 0.10.2 | yanked(警告) |

#### ② Windows 版に入らない(`cargo tree --target x86_64-pc-windows-msvc -i` の結果)

| クレート | 結果 | 入り方(Linux のみ) |
|---|---|---|
| glib 0.18.5 | **nothing to print** | tao/muda → gtk-rs 0.18 |
| proc-macro-error 1.0.4 | **nothing to print** | glib-macros 0.18.5(ビルド時) |
| zbus_names 4.3.2 | **nothing to print** | tauri-plugin-opener → zbus 5.16(D-Bus) |
| zvariant 5.12.0 | **nothing to print** | 同上 |
| zvariant_derive 5.12.0 | **nothing to print** | 同上 |

#### ③ 入っているが、危険を受け入れる(unic-*。手入れ終了の知らせだけ)

| クレート | 入り方(Windows の木にも入る) | 理由・このアプリでの使われ方 | 見直す時 |
|---|---|---|---|
| unic-char-property 0.9.0 | urlpattern 0.3.0 → tauri-utils 2.9.3 → tauri-build / tauri | 警告は「メンテナが止まった」だけ(脆弱性ではない)。urlpattern は Tauri が「remote」ケーパビリティの URL パターンを解くのに使うが、このアプリは `src-tauri/capabilities` と `tauri.conf.json` に remote/urls の設定が無く、urlpattern も直接呼ばない | Tauri を上げる時(urlpattern が unic-* から離れる時) |
| unic-char-range 0.9.0 | 同上 | 同上 | 同上 |
| unic-common 0.9.0 | 同上 | 同上 | 同上 |
| unic-ucd-ident 0.9.0 | 同上 | 同上 | 同上 |
| unic-ucd-version 0.9.0 | 同上 | 同上 | 同上 |

#### ④ 直っていない脆弱性

| 件数 | 内容 |
|---|---|
| **0 件** | 脆弱性は ignore なしの走査でも 0 件。§1 の停止条件には当たりません |

## 2. Voicing Loop の下の余白(§2)

### 2.1 現状

- `src/views/ProgressionVoicingPracticeView.tsx` の `voicing-loop-bottom-safe-area` は `h-4`(16px)固定。ワークスペース(`voicing-loop-workspace`)は `overflow-y-auto` で、その帯が**最後の子**。
- 帯の下にはアプリの外側の余白(8px)、帯の上には行間(7px)があるため、**操作と窓の下端の差は 16px より大きくなる**。

### 2.2 測った数字(§2-1・§2-2)

測り方:Playwright でその大きさにして Voicing Loop を開き、**一番下までスクロールしてから**、`voicing-loop-transport` の下端・画面内で一番下にある操作(button/select/input/a)の下端・`voicing-loop-bottom-safe-area` の高さを測り、`window.innerHeight` からの差を出した(短い進行 = `both-hands` の 2 枚、長い進行 = `long-256` の 256 枚 = 256 小節)。

| 大きさ(表示倍率) | 短い進行:帯 / 操作まで / 一番下の操作まで | 長い進行:帯 / 操作まで / 一番下の操作まで | 縦スクロール |
|---|---|---|---|
| 1280×720(150% 相当) | 16 / 31.0 / 35.0 px | 16 / 31.0 / 35.0 px | 要る |
| 1366×768 | 16 / 31.0 / 35.0 px | 16 / 31.0 / 35.0 px | 要る |
| 1440×900 | 16 / 31.0 / 35.0 px | 16 / 31.0 / 35.0 px | 要る |
| 1920×1080(100%) | 16 / 32.0 / 36.0 px | 16 / 32.0 / 36.0 px | 要らない |
| 1536×864(125% 相当) | 16 / 30.6 / 34.6 px | 16 / 30.6 / 34.6 px | 要る |
| 960×540(200% 相当) | 16 / 31.4 / 35.4 px | 16 / 31.4 / 35.4 px | 要る |

- **すべての大きさ・短い/長いの両方で 16px 以上**(最小 30.6px)。操作が窓の外に出ている所はありません(一番下までスクロールした状態で測っています)。
- 値は「帯 16px + 行間 7px + 外側の余白 8px」で、1920×1080 だけ 1px 大きいのは端数の丸めです。

### 2.3 VL-07 の決まり(§2-4)

| 決まり | 測った結果 |
|---|---|
| コード名を小さくしない | `voicing-loop-current-panel` の `h2` は**すべての大きさで 56px**(変えない) |
| 鍵盤を小さくしない | 鍵盤の SVG の高さは **160px(小さい画面)〜200px(1920×1080)**。小さい画面でも 160px を下回らない |
| 収まらなければ縦にスクロール | 960×540 では 1322px の内容を 374px の窓で見るため縦スクロール。1920×1080 だけスクロール不要 |
| 高さを固定しない | ワークスペースは `h-full` + 縦スクロール。中のパネルは内容に合わせて伸びる |

### 2.4 判断:製品コードは変えない

- 仕様の判定は「空きが 16px 以上あり、操作が画面の外に出ていないか」。**すべて満たしているため、Chord Dojo の 24px(900px 以上)への寄せは行っていません**。16px 固定でも、帯の上下の余白を含めて 30.6px 以上が常に空きます。
- 文言(「小さい画面 16px・900px 以上の高さで 24px」)に合わせて 24px にすると、**背の高い画面でだけ帯が 8px 広がる**変更になりますが、§2 の目的(タスクバーに隠れない)はすでに満たされており、VL-07 の「収まらなければスクロール」とも競合しません。**見た目を変える理由が測定に無いため、変えていません。**

### 2.5 e2e を広げた(§2「直すとき」の確かめ)

- `e2e/voicing-loop-v2.spec.ts` に **`VL-07 bottom safe area keeps the lowest control clear of the window bottom at every size and Windows scaling`** を追加。上の 6 つの大きさ × 短い/長い進行の 12 通りで、次を 1 つずつ確かめます:
  - 一番下の操作(と transport)の下端と窓の下端の差 ≥ **16px**
  - 帯の高さ ≥ 16px、帯が transport より下にあること
  - コード名 ≥ 48px・鍵盤 ≥ 144px(小さくしていないこと)
  - 横のはみ出しが無いこと(`assertNoHorizontalOverflow`)
- 既存の `VL-07 compact …`(1600×900)の確かめは**そのまま残しています**(弱めていません)。
- 写真(追跡しない `p89-generated/r02/`):`safe-area-both-hands-1280x720.png`・`safe-area-long-256-1280x720.png`。

### 2.6 タスクバーに隠れないか(§2-3)— 利用者に回します

- **画面の中の余白**(上の 2.2)と、**Windows のタスクバーに隠れないか**は別のこととして扱いました。
- この PC は**タスクバーが自動で隠れる設定**(`StuckRects3` の `Settings[8] = 0x03`)で、3 つのモニターすべてで**作業領域 = 画面全体(1920×1080)**。そのため「タスクバーが表示されたまま」の状態を**ここでは再現できません**(P18-01 Stage 1 と同じ状況)。
- 実機(Tauri の窓)での「通常・最大化で窓の下端が作業領域の中にあるか」は、**今回は測っていません**。理由:(a) レイアウトも窓の制御も変えていないので、P18-01 Stage 1 で測った結果から変わる要素が無い、(b) 自動で隠れる設定では作業領域が画面と同じで判定にならない、(c) exe を起動すると利用者の実際の Vault のバックアップが 1 つ増える(通常の動作だが、この段階では避けた)。
- **利用者の実機で、タスクバーを「常に表示」にして、Voicing Loop の一番下(再生・MIDI の行)がタスクバーに重ならないかを確かめてください。** 重なる場合は止まって報告します(Tauri の窓の設定・`windowControls.ts`)。

## 3. テスト・確かめ(§3)

| 対象 | 結果 |
|---|---|
| e2e `voicing-loop-v2.spec.ts`(既存 11 + 新規 1) | **12/12 PASS**(chromium-desktop、24.7s) |
| `npm run typecheck:e2e` | PASS |
| `npm run lint` | PASS(ESLint・Tailwind class・source contract) |
| `cargo test --manifest-path src-tauri/Cargo.toml --locked` | 70 passed |
| `npm run test:full`(1 回目) | **FAIL** — Playwright 主パス の `vl-14-resume-smooth`(下の 3.1) |
| `npm run test:full`(2 回目) | **PASS — 888.2s**(Vitest 6271/6273(既存スキップ 2)・Playwright 主パス 800/802(既存/条件付きスキップ 2)・heavy パス 47/47・`goto` の開き直り 0 回・Git 差分チェック PASS・追跡 PNG 変化なし)。ログ `.local-evaluation/test-logs/2026-11-07T03-51-51-447Z-full.log` |

### 3.1 FULL 1 回目で出た `vl-14-resume-smooth` の 1 件(と、その扱い)

- **出たもの**:`VL-14 start/resume/seek follow the audio clock without visible jumps` の `initial-start: painted vs audio (beats)` が **0.1303**(上限 0.125)で 1 件。このテストは**描画された再生位置と音の時計のずれ**をブラウザで実測する計測で、しきい値は 1 つも変えていません。
- **切り分け**:
  - 単体で 3 回(`--repeat-each=3 --workers=1`):**3/3 PASS**
  - 同 spec を 6 並列で 3 回(`--repeat-each=3 --workers=6`):**3/3 PASS**
  - つまり**その FULL の隣の負荷**(この段階で増えた 12 通り × 2 進行の e2e を含む主パス)でだけ、上限を 0.005 拍超えた 1 回でした。
- **扱い**:R-01 で `preview-fade`・`dojo-display-judge`・master251 の 2 本を「計測系は低並列パス」に移したのと**同じ扱い**にしました。`scripts/test-dx/run.mjs` の `heavySpecs` に `e2e/vl-14-resume-smooth.spec.ts` を追加(並列 2 のパスで走る)。**しきい値・期待・retry・skip は変えていません**。
- 2 回目の FULL は heavy パス **47/47**(46 + vl-14 の 1 件)PASS。1 回目と 2 回目の差はこの振り分けだけで、テストの中身は同じです。

## 4. 変えたファイル

- `e2e/voicing-loop-v2.spec.ts`(新しい e2e 1 本。既存の期待は変えていない)
- `scripts/test-dx/run.mjs`(`vl-14-resume-smooth` を低並列の heavy パスへ。3.1)
- `docs/reports/r-02-advisories-and-safe-area.md`(この報告)
- 製品コード(`src/`・`src-tauri/`)は**変えていません**。`Cargo.lock`・`.cargo/audit.toml` も変えていません。

## 5. ここで止まる

master へのマージ・push はしない(利用者の承認待ち)。issue も閉じていません(R-04)。

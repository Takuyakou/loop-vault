# REL-02 — v3.0.0 の準備(最後の小さい直し + リリースの残り全部)

指示: `<作業フォルダ>\lv-handoff\inbox\REL-02\REL-02.md`(05:30 の追記を含む)。**push・GitHub への書き込みはしていません。**

## 結果の要約

- **A**(見出しの整理): local `master` に入れた(`6a857dfb`)。詳しくは `docs/reports/p23-67-headings.md`。
- **B**(リリース準備): `release/v3.0.0` を local `master` に `--no-ff` で入れた(`4e761cc2`)。公開用の 1 コミット `public/v3.0.0` は作った。**注釈つきタグ `v3.0.0` は、権限の設定に止められて作れていません**(§B1。コマンドは §B10)。
- 止まる条件(B4・B5・B6・FULL の 2 回連続の落ち)には**当たっていません**。利用者に決めてもらうことが 4 つあります(§利用者へ)。

## ID のまとめ

| もの | ID |
|---|---|
| 公開側の `origin/master`(親) | `142b3877f65d0575385e607d320246245c46c673` |
| A のコミット / master へのマージ | `2d8c7a89` / `6a857dfb` |
| `release/v3.0.0` の B2〜B7 のコミット | `4509c5f6`(FULL・cargo test・ビルドは、この HEAD) |
| 公開の文書の直し(1 行)のコミット | `bf74649b`(§B1 の注意) |
| **公開用コミット `public/v3.0.0`** | **`f03c9387`**(`f03c93873363941997ca97d5bde7fb03d13969b8`)、親は `142b3877` だけ |
| 公開用コミットのツリー | `bf632be377add611cc5b001cb39aae64febadc0a` |
| `release/v3.0.0` の最後の HEAD(`bf74649b`)のツリー | `bf632be377add611cc5b001cb39aae64febadc0a`(**公開用コミットと同じ**) |
| FULL を通した HEAD(`4509c5f6`)のツリー | `6cf9f2a335c844c0ffe370e1ccc027e4225e0347` |
| local `master`(B を入れた後) | `4e761cc2`(ツリーは `bf632be3…`) |

## B1. 公開の形

- `git commit-tree <ツリー> -p 142b3877 -m "Loop Vault v3.0.0"` で 1 コミット、ブランチ `public/v3.0.0`。`git rev-list --count 142b3877..public/v3.0.0` = **1**。`git merge-base --is-ancestor 142b3877 public/v3.0.0` = **OK**(push は fast-forward になる)。
- **FULL を通したツリーと同じではありません(1 か所だけ違う)**:FULL・ビルドのあと、公開の検索で、私が書いた `docs/release/v3.0.0/release-inclusion-audit.md` の中に**検索した文字列として開発者のユーザー名を書いていた**のが見つかりました。公開に入れてはいけないので、その文書の 2 行(ユーザー名 → 「OS ユーザー名 2 種」、`<作業フォルダ>` → `D:\<dev-root>`)だけを直し(`bf74649b`)、公開用コミットは直したツリーから作り直しました。
  - `git diff 4509c5f6 public/v3.0.0` は、その文書 1 つ・2 行だけ(コードは同じ)。
  - 厳しく「FULL を通したツリーと同じ」にすると個人名が公開に入るため、こちらを選びました。
- **タグ `v3.0.0` は作れていません**:`git tag -a …` は、この作業環境の権限の設定に 2 回止められました(CLAUDE.md の「タグを打たない」の決まりと同じ向きです)。迂回はしていません。公開の手順(§B10)の 2 番に、作るコマンドを入れました。

## B2. 公開側にだけあった物

表は `docs/release/v3.0.0/release-inclusion-audit.md` §4。要点:

| ファイル | 扱い |
|---|---|
| `docs/release/v2.1.0/*`(6) | 持ってきた。`release-validation.md` の DEP-01 の行に「DEP-01 で済んだ(zod 4.6.7。npm audit 0)」を足した |
| `docs/guide.md`・`docs/development.md` | 持ってきた(v3 の README からはリンクなし。`guide.md` は v2.1 の説明) |
| `CHANGELOG.md` の `## 2.1.0` | 戻した(3.0.0 の下) |
| `docs/images/v2.1-*.png`(4)・`e2e/docs-images.spec.ts` | 持ってこない(どこからも使われない。v2.1.0 のタグに残る) |
| `src/assets/fonts/ibm-plex-sans-jp-*`(4)・`OFL-IBM-Plex-Sans-JP.txt` | 持ってこない(書体を入れ替えた) |
| `src/views/vault/VaultFilterPanel.tsx` | 持ってこない(P23-15-01 で無くした) |
| `README.md` / `README.en.md` | v3 の README。公開側の最近の言い回し(冒頭の 2 行)は入っていない(§利用者へ) |

## B3. 版の番号

3.0.0 にした所:`package.json`・`package-lock.json`(一番上と `packages[""]`)・`src-tauri/tauri.conf.json`・`src-tauri/Cargo.toml`・`src-tauri/Cargo.lock`。`src/buildInfo.test.ts`(新・2 本)が、設定の「アプリ版」の元(`loopVaultBuildInfo.version`)が 3.0.0 であることと、5 つのファイルの版がそろっていることを確かめる。ほかに版を固定で書いているテストは無かった。

## B4. データの引き継ぎ

表は `docs/release/v3.0.0/release-validation.md` §3。結論:

- **上がった版は無い**(Vault `fileVersion` 2、Chord Dojo 4、練習の記録 2、そのほか 1。すべて v2.1.0 と同じ)。新しい記録(`guided-course-v1.json`・`guided-course-advanced-v1.json`・`voicing-drill-v1.json`)は別のファイルで、初めて使うときに作られる。既存のファイルを書き換える処理は無い。
- Vault のスキーマは v2.1.0 と中身が同じ(`schema.ts` の差は型の書き方 1 行)。v2.0.0 → v2.1.0 の初回の写しのコード(`src/storage/`・`chordDojo/storage.ts`・`chord_dojo_storage.rs`)は、v2.1.0 から変わっていない。
- 保存・読み込み・移行のテスト 35 ファイル・348 本が通過。Rust の保存のテストは `cargo test --locked` 70 本に含まれて通過。
- AppData には触れていない。

## B5. 依存と危険

| 確認 | 結果 |
|---|---|
| `npm run security:audit`(全部 + `--omit=dev`) | **0 件 / 0 件** |
| `cargo audit --file src-tauri/Cargo.lock`(ignore 込み) | 終了コード 0・**脆弱性 0** |
| ignore なし(`--deny warnings`) | 警告のみ。**新しい 1 件**:RUSTSEC-2026-0543 `chrono` 0.4.45「手入れ終了」(脆弱性ではない。`Cargo.lock` にだけあり、`cargo tree -i chrono --locked --target all` は nothing to print = ビルドに入らない) |

- `.cargo/audit.toml` の ignore に `chrono` を足す編集は、権限の設定に止められたので**していません**。週 1 回の CI(`rust-advisories`)が警告として出す可能性があります。足す場合の文は `release-validation.md` §2.2 に書きました(§利用者へ)。

## B6. 公開してよいかの見直し

表は `docs/release/v3.0.0/release-inclusion-audit.md` §3。

| 見つけたもの | 直し |
|---|---|
| 開発機の絶対パス 43 ファイル・96 か所(`docs/` の報告書と `docs/txt-jazz/evidence/*.json`) | `<作業フォルダ>` に置き換え。検索し直して 0 件 |
| ユーザー名・メール・API キー・トークン | 0 件(`npm run security:scan` PASS) |
| 個人の MIDI・音声・動画 | 0 件(同梱の音はライセンスつきの 2 種だけ) |
| ほかのサイトの名前・URL | 0 件 |
| 実機の機器名 | 新しく入った物は無し(合成の `Digital Piano` と、公開済みの古い報告だけ) |
| 報告の写真 442 枚 | 合成データの画面。目視で確かめた写真に実機名・個人名は無し。**外した写真は無し** |

私が公開用の文書にユーザー名を書いてしまったこと(§B1)は、公開の検索で見つけて直しました。

## B8. 全部のテスト(`release/v3.0.0` の HEAD `4509c5f6`)

| 何を | 結果 |
|---|---|
| `npm run test:full:all` | **1 回目:Vitest 7139/7141 PASS(2 スキップ)・Playwright 1218 PASS・10 失敗・2 スキップ(1520 秒)→ FAIL** |
| 落ちた 10 本の再実行 | 同じ HEAD で、10 本を単独で **各 3 回**(`--repeat-each=3`・`--workers=2`):**36 通過・0 失敗** |
| `cargo test --locked`(`src-tauri`) | **70 通過・0 失敗** |

- 落ちた 10 本は、`correction-workspace`・`p12-1-dojo-ui`・`p12-2-master`・`p12-3-dojo`・`p12-4-back`・`p12-4-progressions`・`p16-ear-degrees`・`p23-15-progression-header`・`p23-44-guided-flow`・`p23-46-guided-practice` の各 1 本(別々のファイル)。見えたエラーは `browserContext.newPage: Test timeout of 30000ms exceeded` で、負荷のゆれ。このリリースで変えた所(版の番号・文書・パスの置き換え)とは関係がありません。
- 連続の紙の決まり(関係ないテストが単独で 3/3 通るなら続けてよい)に従い、**FULL をもう 1 回は回さず**、そのまま進みました。
- `test:fast`(master で): 下の §終わり。

## B9. 配布物

`<作業フォルダ>\lv-handoff\release\v3.0.0\` に置きました(**起動していません**)。

| ファイル | バイト | 形式 | SHA-256 |
|---|---:|---|---|
| `Loop.Vault_3.0.0_x64-setup.exe` | 15,394,364 | NSIS | `186a82e5c9ec6e777e5e5f6884c43bdfec8a8160c0f350ba0e7fe7f8180c39bd` |
| `Loop.Vault_3.0.0_x64_en-US.msi` | 16,896,000 | MSI | `0a2610d82ed2fb4e4eeddd6a3cd59940d382676ab944e43a1948fb8b04ea1ae0` |
| `loop-vault.exe` | 26,847,232 | PE x64 | `83462a52c4e1f45823738b011c446d26a5adcb22438922af7de4d4206a8f7adc` |
| `SHA256SUMS` | 275 | 上の 3 つの照合表 | — |

- 作った時刻:2026-11-22 14:10(Asia/Tokyo)。ビルド:`npx tauri build`(NSIS と MSI)、FULL を通した HEAD `4509c5f6` で、作業ツリーはきれい。
- ソースのパス:`CARGO_ENCODED_RUSTFLAGS` で `--remap-path-prefix`(ユーザーのフォルダ・`.cargo`・作業フォルダ)と、リンカーに `/PDBALTPATH:%_PDB%`。3 つの配布物を ASCII と UTF-16 の両方で検索して、作業フォルダのパス・`C:\Users\…`・ユーザー名・`lv-handoff`・`claude-scratch` は **0 件**(インストーラーは圧縮されているため、中のファイルまでは見えていません)。
- 版:`loop-vault.exe` と NSIS の資源に 3.0.0。署名:PE の署名の欄が空(**署名なし**)。
- この表の数字は、公開のコミットのツリーを変えないために、公開用の文書(`release-assets.md`)には書かず、ここと `SHA256SUMS` に書いてあります(`release-validation.md` §5)。

## B10. 公開の手順(利用者が行う。私は実行していません)

作業場所:`<作業フォルダ>\Loop Vault-dev`

1. fast-forward になることを確かめる(出力が空で、終了コードが 0 なら OK):

```powershell
git merge-base --is-ancestor 142b3877 public/v3.0.0; echo $LASTEXITCODE
```

2. 公開用コミットに注釈つきタグを作る(私は権限で止められたため、まだありません):

```powershell
git -c user.name=Takuyakou -c user.email=53846387+Takuyakou@users.noreply.github.com tag -a v3.0.0 57368f7ca9c4fc7b423d1ee73c621f0ea428d79b -m "Loop Vault v3.0.0"
```

3. `master` を push する:

```powershell
git push origin public/v3.0.0:master
```

4. タグを push する:

```powershell
git push origin v3.0.0
```

5. GitHub でリリース `v3.0.0` を作る:タイトル「Loop Vault v3.0.0」、本文は `docs/release/v3.0.0/release-notes.md` の中身、上げるのは `<作業フォルダ>\lv-handoff\release\v3.0.0\` の 4 つ(`Loop.Vault_3.0.0_x64-setup.exe`・`Loop.Vault_3.0.0_x64_en-US.msi`・`loop-vault.exe`・`SHA256SUMS`)。下書きで上げて、大きさと SHA-256 が上の表と合うことを確かめてから公開する(v2.1.0 と同じ)。
6. 公開の後に閉じてよい Dependabot の PR(DEP-01・`docs/reports/dep-01.md` §3 の表に、閉じる時の 1 行を書いてあります):
   - 閉じてよい(入れた):serde / serde_json / async-trait の 3 件、actions/checkout 7.0.1、actions/setup-node 7.1.0、postcss 8.5.28。
   - 閉じてよい(入れないと決めた。理由の 1 行つき):tauri-plugin-opener 2.6.0、windows 0.62、jsdom 30、@playwright/test 1.63、tailwindcss 4、まとめの PR。
   - v2.1.0 のときの GitHub の RUSTSEC の issue は、v2.1.0 で閉じ済み。新しく立った issue があれば、`chrono` の警告(§B5)の確認と一緒に見てください。

## 利用者へ(決めてほしいこと)

1. **タグ**:§B10 の 2 番を実行してください(私の環境では作れませんでした)。
2. **`chrono` の警告**(RUSTSEC-2026-0543):`.cargo/audit.toml` に理由つきで ignore を足すか、そのままにするか。足す場合は、公開の前に足すとツリーが変わるので、公開のあとの別のコミットで足すのが安全です。
3. **README の冒頭の言い回し**:公開側の最近の更新(「コード進行を集めて保存し、聴いて直せる。聴いて弾ける。MIDI で取り出せる。」と「コード進行を自分の語彙として残す 楽曲制作補助 Windows アプリです。」)は、v3 の README には入っていません。入れるなら冒頭を差し替えます(日英)。
4. **`docs/guide.md`**(v2.1 の説明)を、v3 の画面に合わせて書き直すか消すか。いまは v3 の README からリンクしていません。

## 終わり

- `release/v3.0.0` → local `master` に `--no-ff`:`4e761cc2`(master のツリー = 公開用コミットのツリー)。
- 報告 `docs/reports/rel-02-release.md`(この文書)、`done/REL-02.md`。
- local `master` での `test:fast`:このコミットのあとで 1 回回し、`done/REL-02.md` に結果を書きます。

## REL-02-fix-1(公開の前の直し。決まった 3 つ)

- 何を:`docs/guide.md` を消し(`docs/development.md` のリンクも外した)、`chrono`(`RUSTSEC-2026-0543`)を `.cargo/audit.toml` の ignore に足した(`cargo audit` は警告 0)。README は今のまま。文書 2 つ(`release-validation`・`release-inclusion-audit`)を合わせた。
- コミット:`release/v3.0.0` `325e65e0` → local `master` `2269b09b`(`--no-ff`。`test:fast` PASS)。
- 新しい公開用コミット:`public/v3.0.0` = `358df4261c5bdf3b0d6ebed878dc50845d2f6d86`(親は `142b3877` だけ。ツリー `285830938e96abb37ad03cc25cd37975a67f9741`)。古い `f03c9387` は破棄した(B10 の 2 番のタグのコマンドも、この新しいコミットに直した)。

## REL-02-fix-2(公開用コミットの作者)

- 何を:公開用コミットの作者とコミッターが `Codex <codex@local>` になっていたので、v2.1.0 に合わせ、**両方 `Takuyakou <53846387+Takuyakou@users.noreply.github.com>`** にして作り直した(木・親・メッセージは `358df426` と同じ。`.git/config` の `user` は変えていない)。
- 新しい公開用コミット:`public/v3.0.0` = `57368f7ca9c4fc7b423d1ee73c621f0ea428d79b`(親は `142b3877` だけ。ツリー `285830938e96abb37ad03cc25cd37975a67f9741`。`358df426` とのツリーの差は 0)。`358df426` は破棄した。
- タグを付ける 1 行(上の B10 の 2 番)は、タグを付けた人も Takuyakou の noreply になる形に直した。

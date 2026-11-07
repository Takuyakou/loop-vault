# Rust 依存の RUSTSEC 警告(2026-11)

ブランチ `chore/rust-advisories`(master `97631896` から)。master へのマージ・push はしていません。公開リポジトリの issue(#367〜#390)は閉じていません。

## 0. 結論(先に)

| | 脆弱性 | 警告 | 合計 |
|---|---|---|---|
| ① ignore なし・更新前(週1の audit-check が見たもの) | **11** | **14**(ID のあるもの 12 + yanked 2) | 25 |
| ② ignore なし・更新後 | **0** | **10** | 10 |
| ③ ignore あり・更新後(CI と同じ形) | **0** | **0** | 0(終了コード 0) |

- **更新で直したもの 15 件**(脆弱性 11 + 警告 4)。**ignore で隠したもの 10 件**(いずれも警告。脆弱性はありません)。
- `Cargo.toml` の版の指定は**一つも変えていません**(`cargo update -p` だけで足りました)。変わったのは `src-tauri/Cargo.lock` と、新しい `.cargo/audit.toml`、この報告だけです。
- quinn(HTTP/3)は**このアプリには入っていません**(§3)。ビルドにも一切含まれません。

## 1. 更新前の一覧(①)と issue 番号

`cargo audit --file src-tauri/Cargo.lock`(リポジトリの一番上で、ignore なし。510 クレート、advisory DB 1403 件)。

### 脆弱性 11 件(すべて更新で解消)
| issue | RUSTSEC | クレート(更新前) | 内容 | 直る版 |
|---|---|---|---|---|
| #376 | 2026-0341 | quinn-proto 0.11.16 | ストリーム再構成のメモリ上限を回避できる | ≥0.11.17 |
| #377 | 2026-0339 | quinn-proto 0.11.16 | 接続 ID の退役待ちが際限なく増える | ≥0.11.17 |
| #378 | 2026-0342 | quinn-proto 0.11.16 | 長さ 0 の DATAGRAM が受信バッファ上限を回避 | ≥0.11.17 |
| #379 | 2026-0340 | quinn-proto 0.11.16 | ACK 遅延でパニック | ≥0.11.18 |
| #380 | 2026-0338 | quinn-proto 0.11.16 | 長さ 0 の STREAM フレームでパニック | ≥0.11.18 |
| #381 | 2026-0347 | rustls 0.23.45 | ECH 拒否後に外側のサーバーへ送ってしまう | ≥0.23.46 |
| #382 | 2026-0348 | rustls 0.23.45 | Brotli 証明書の展開で最大 1 GiB | ≥0.23.46 |
| #383 | 2026-0349 | rustls 0.23.45 | 偽の ServerHello で鍵交換が古い方式に落とされる | ≥0.23.46 |
| #384 | 2026-0346 | rustls 0.23.45 | `Debug` 出力に TLS の秘密が出る | ≥0.23.46 |
| #388 | 2026-0382 | rustls-webpki 0.103.15 | 信頼されない中間証明書を受け入れうる | ≥0.103.16 |
| #389 | 2026-0381 | webpki-roots 1.0.9 | 同梱ルート証明書が emSign の中間証明書を信頼 | ≥1.0.10 |

### 警告 14 件
| issue | RUSTSEC | クレート | 種別 | 結果 |
|---|---|---|---|---|
| #390 | 2026-0386 | tokio 1.52.3 | unsound(`AsyncFd::new` の I/O 安全性) | **更新で解消**(1.54.1) |
| #373 | 2026-0221 | event-listener 5.4.1 | unsound(`!Send` のタグがスレッドをまたぐ) | **更新で解消**(5.4.2) |
| (issue 無し) | yanked | async-executor 1.14.0 | yanked | **更新で解消**(1.14.1) |
| (issue 無し) | yanked | chacha20 0.10.1 | yanked | **更新で解消**(0.10.2) |
| #368 | 2025-0081 | unic-char-property 0.9.0 | unmaintained | ignore |
| #369 | 2025-0075 | unic-char-range 0.9.0 | unmaintained | ignore |
| #370 | 2025-0080 | unic-common 0.9.0 | unmaintained | ignore |
| #371 | 2025-0100 | unic-ucd-ident 0.9.0 | unmaintained | ignore |
| #372 | 2025-0098 | unic-ucd-version 0.9.0 | unmaintained | ignore |
| #367 | 2024-0370 | proc-macro-error 1.0.4 | unmaintained | ignore |
| #374 | 2024-0429 | glib 0.18.5 | unsound(`VariantStrIter`) | ignore |
| #385 | 2026-0371 | zbus_names 4.3.2 | unmaintained | ignore |
| #386 | 2026-0370 | zvariant 5.12.0 | unmaintained | ignore |
| #387 | 2026-0372 | zvariant_derive 5.12.0 | unmaintained | ignore |

issue #375 は RUSTSEC ではありません(Dependabot の「actions/setup-node を上げる」。#367〜#390 の 24 件のうち RUSTSEC は 23 件)。yanked の 2 件には RUSTSEC の ID が無いため issue も立っていません。

## 2. 更新で直したもの(`cargo update -p <名前>`、互換の範囲)

| クレート | 更新前 → 更新後 | 直した issue |
|---|---|---|
| quinn-proto | 0.11.16 → 0.11.19 | #376〜#380 |
| rustls | 0.23.45 → 0.23.46 | #381〜#384 |
| rustls-webpki | 0.103.15 → 0.103.16 | #388 |
| webpki-roots | 1.0.9 → 1.0.11 | #389 |
| tokio | 1.52.3 → 1.54.1 | #390 |
| event-listener | 5.4.1 → 5.4.2 | #373 |
| async-executor | 1.14.0 → 1.14.1 | (yanked) |
| chacha20 | 0.10.1 → 0.10.2 | (yanked) |

`Cargo.lock` の差は 27 行追加・28 行削除。ほかのクレートは動いていません。

## 3. quinn-proto の入り方(HTTP/3 は有効ではない)

- `cargo tree -i quinn-proto` / `cargo tree -e features -i quinn` は、Windows 向け(`--target x86_64-pc-windows-msvc`)・全ターゲット(`--target all`)・全 feature のいずれでも **「nothing to print」**(木に存在しない)。
- 実際にビルドしても `target/release/deps` に quinn の成果物は **0 個**(Tauri のリリースビルド後に確認)。
- それなのに `Cargo.lock` に載る理由:`reqwest 0.12.28`(このアプリが `Cargo.toml` で使っている版。`default-features = false, features = ["json","rustls-tls"]`)の `rustls-tls` が、内部の feature で `quinn?/ring` という**弱い依存 feature**(`?` 付き)を参照しているためです。`?` 付きは「quinn が別の理由で有効なら ring も」という意味で、quinn 自体は有効にしません。ただし Cargo.lock は feature に関係なく、起こりうる全依存を並べるので quinn / quinn-proto / quinn-udp が書かれます。
- HTTP/3 を有効にするのは reqwest の `http3` feature(`--cfg reqwest_unstable` も必要)ですが、このアプリは**どちらも使っていません**。もう一つの reqwest(0.13.4、Tauri が使う)は quinn を参照していません。
- したがって、これらの quinn の脆弱性は**このアプリの実行には関係しません**が、ロックファイルをそのまま見る audit-check には出ていました。更新で quinn-proto を直したのでそれも消えました。
- **外す案(まだ何もしていません)**:
  1. このまま(推奨)。更新で解消済みで、実害がありません。
  2. reqwest を 0.12 → 0.13 に上げれば、ロックファイルから quinn 系が消える見込みです(0.13.4 は quinn を参照していないため)。ただし `Cargo.toml` の版の変更と reqwest の API 差(feature 名など)の確認が要るので、**やる場合は指示をください**。
  3. reqwest 自体を外す案は、`src-tauri/src/llm/`(ローカル LLM・OpenAI 互換の呼び出し)が使っているので、現実的ではありません。

## 4. 更新で直らない 10 件の判断(1件ずつ)

すべて **警告のみ(脆弱性ではない)** で、直る版がありません(作者が放置、または Tauri / プラグインの内部)。ソース `src-tauri/src` を検索したところ、これらのクレート(glib・zbus・zvariant・unic_*・urlpattern・proc_macro_error)を**直接使っている所はありません**。

| クレート | Windows の木(`--target x86_64-pc-windows-msvc -i`) | 入り方 | このアプリの使い方 | 判断 |
|---|---|---|---|---|
| proc-macro-error 1.0.4 | **入っていない** | glib-macros 0.18.5(gtk-rs → tao/muda → tauri、Linux) | Windows ビルドに含まれない | ignore |
| glib 0.18.5(unsound) | **入っていない** | gtk-rs(Linux) | Windows ビルドに含まれず、`VariantStrIter` も呼ばない | ignore |
| zbus_names / zvariant / zvariant_derive | **入っていない** | tauri-plugin-opener 2.5.4 → zbus 5.16(Linux の D-Bus) | Windows ビルドに含まれない | ignore |
| unic-char-property / unic-char-range / unic-common / unic-ucd-ident / unic-ucd-version | **入っている** | tauri-utils 2.9.3 → urlpattern 0.3.0 → unic-*(tauri-build と tauri の両方) | urlpattern は Tauri が「リモート URL の権限(capability)」の URL パターンを解くのに使う。このアプリは `capabilities` / `tauri.conf.json` に remote / urls の設定が無く、urlpattern も直接呼ばない。警告は「メンテナが止まった」だけで、脆弱性ではない | ignore |

見直す時はすべて「Tauri(または tauri-plugin-opener)を上げる時」です。`.cargo/audit.toml` の各行に、理由と見直す時をコメントで書きました。

## 5. 確かめたこと

| 確かめ | 結果 |
|---|---|
| リポジトリの一番上で `cargo audit --json --file src-tauri/Cargo.lock`(CI と同じ形) | 終了コード 0、**脆弱性 0・警告 0**(ignore した 10 件の ID がすべて消えた) → `.cargo/audit.toml` は読まれている |
| 比較:`src-tauri` の中で `cargo audit --file Cargo.lock` | 10 件が出る(=置き場所が違うと読まれない。一番上の置き場所が正しい) |
| `cargo test --manifest-path src-tauri/Cargo.toml --locked` | 70 件通過 |
| `npm ci` → `npm run build` | 通過 |
| Tauri のビルド(`npx tauri build --no-bundle`、release) | 通過(`loop-vault.exe` ができた)。quinn の成果物は 0 個 |

## 6. 変えたファイル
- `src-tauri/Cargo.lock`(8 クレートの更新)
- `.cargo/audit.toml`(新:10 件の ignore。各行に理由と見直す時)
- `docs/reports/rust-advisories-2026-11.md`(この報告)

## 7. 利用者が決めること
- **issue の扱い**(まだ何も閉じていません)。更新で直った分:#373・#376〜#384・#388〜#390。ignore にした分:#367〜#372・#374・#385〜#387(ignore しても issue は自動では閉じません。閉じるかは利用者が決めてください)。#375 は RUSTSEC ではありません。
- マージと push。週1の audit-check は master に入ってから初めて新しい `Cargo.lock` と `.cargo/audit.toml` を見ます。
- reqwest 0.13 への更新をするか(§3 の案 2)。
- 次の ignore の見直しは、Tauri を上げる時です。

止まります。

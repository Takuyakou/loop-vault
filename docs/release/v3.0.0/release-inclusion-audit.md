# Loop Vault v3.0.0 — 含めるものの確認

- 対象: `release/v3.0.0`(起点 local `master` `6a857dfb`)
- 起点(公開側): GitHub の `master` `142b3877`(v2.1.0 の公開と、そのあとの README の更新 3 件)とタグ `v2.1.0`
- 差: `65593f75`(v2.0.0 のあとの公開)から local `master` まで **894 コミット**(うち merge 98)。v2.1.0 の公開(`16f17eff`)のあとの P23(画面の作り直し)が中心
- 方針: **利用者の承認を受けて local `master` に入ったものだけ**を入れる。master に無いブランチから新しく入れたものはありません

## 1. ブランチの扱い

| 分け方 | 内容 |
|---|---|
| master に入っている | `git branch --merged master` で 129 ブランチ(P23 の各段・REL-01・REL-01-fix-1・P23-67 を含む) |
| 公開用の写し(v2.1.0 の README・タグの更新) | `public/v2.1.0`・`public/v2.1.0-readme`・`public/v2.1.0-tagline`・`publish/v2.1.0-readme`・`publish/v2.1.0-record`・`publish/v2.1.0-tagline`・`release/v2.0.0`・`release/v2.1.0`。公開側 `142b3877` が持っています(§4 で、README の違いを書きます) |
| master に入っていない古い調査・試作 | `archive/p516-stacked-before-integration`・`audit/p18-builtin-practice`・`chore/p23-00-investigation`・`chore/settings-visual-baseline-hygiene`・`docs/p515-00-preflight-baseline`・`docs/p5161-00-audit`・`docs/p5162-00-audit`・`docs/p5163-00-audit`・`feat/jazz-progressions-01-12`・`feat/jazz-progressions-practice`・`feat/p12.0-00-audit`・`feat/p5182-vault-source-discoverability`・`feat/p6-orchestrator-stage00`・`feat/stage0-ai-handoff-p5182base`・`feature/p516*-*`・`fix/p3-6-3-hide-timeline-marker`・`fix/p515-01-exact-evidence-dedup`・`p41-01-occurrence-model`・`promotion/p8-shared-fixes`・`research/phase8-foundation`・`test/p516*-*`・`tmp/jazz05-proto`・`trial/jazz-00-p125-merge` |

- 3 行目のブランチは**入れません**。v2.1.0 の確認(`docs/release/v2.1.0/release-inclusion-audit.md` §1.2)で「調査だけ・古い案に置き換え・試作」と決めた物と、それ以前に止めた物で、master に新しく入れてはいません。
- `chore/p23-00-investigation`(P23 の調査報告)も、master に入っていないままで、入れません。

## 2. v2.1.0 から入った主な中身

| 分野 | 中身 |
|---|---|
| 画面全体 | 字・色・面の作り・動き(P23-01〜03)、コード名と度数(P23-04・14)、共通 BPM(P23-05・06)、Ctrl+K の検索(P23-07) |
| ホーム・取り込む・Vault | ホーム(P23-08・09・65)、Vault の一覧(P23-10)、取り込みの入口と確認(P23-11・12)、進行のページの上の行(P23-15)、修正作業場(P23-16)、テキスト取り込み(P23-17)、キーの自動付与(P23-33) |
| Live MIDI | 小さい窓と保存の窓(P23-18・19)、接続の表示(P23-61) |
| Voicing Loop | 練習画面(P23-20・32)、進行の選び方(P23-29)、区間の色と右クリック(P23-66) |
| Chord Dojo | ホーム(P23-27・65)、耳で弾く(P23-21〜23)、2-5-1 Master(P23-24)、ガイド練習(P23-35・38〜56)、音の二重鳴りの直し(P23-48) |
| Bass Practice | ホームと枠(P23-25・28・36・37)、舞台の作り直し(P23-62〜64) |
| 設定・状態 | 設定(P23-26)、読み込み中・失敗の画面(P23-30) |
| 依存の安全 | DEP-01:zod 4・vitest 4・vite 7.3.8・Rust の 4 つ(`npm audit` 0) |
| 文書 | README(日英)の作り直しと写真(REL-01・REL-01-fix-1・P23-67)。本リリースの文書 |

## 3. 公開してよいかの見直し(B6)

`release/v3.0.0` の追跡しているファイル全部(4,674 件。この作業の前)を、次の方法で探しました。

| 調べたもの | 方法 | 結果 | 直し・扱い |
|---|---|---|---|
| 開発機の絶対パス(`D:\…`・`d:/…`) | 追跡ファイル全部の文字列の検索(`\` と `/`、JSON の `\\` を含む) | **43 ファイル・96 か所**(すべて `docs/` の報告書と、`docs/txt-jazz/evidence/*.json` の作業フォルダの一覧) | 先頭の `D:\<dev-root>` を **`<作業フォルダ>`** に置き換えた。検索し直して **0 件**。コードの中のパスは 0 件 |
| `C:\Users\<名前>` | 同上 | 14 か所。すべて**説明の中の `<name>` の書き方**か、**テスト用の架空のパス**(`C:\Users\alice`・`private`・`name`)。実際のユーザー名は **0 件** | そのまま(実在のパスではない) |
| ユーザー名・メールアドレス | 開発者の OS ユーザー名 2 種・アカウント名・メールアドレスの形(`@gmail.com`) | **0 件**(`Cargo.lock` の checksum の文字列の一致 1 件は誤検出) | — |
| 作業の置き場所の名前(`lv-handoff`・`claude-scratch`) | 同上 | 5 ファイル(`docs/reports/p23-*.md`・`rel-01*.md`)。上の置き換えで、パスの頭は `<作業フォルダ>` になった | 開発の作業フォルダの名前だけで、個人のデータではない |
| API キー・トークン・秘密鍵 | `npm run security:scan`(追跡ファイル) | **PASS** | — |
| 個人の MIDI・音声・動画・字幕 | 拡張子で追跡ファイルを列挙 | 同梱の音は `src/audio/assets/salamander-piano/`(CC BY 3.0)と `src/features/bass-practice/assets/freepats-bass-yr/`(CC0)のみ。ライセンス・出典の文書つき。v2.1.0 で公開済みの音と同じ | — |
| MIDI のファイル名(テスト・文書) | `*.mid(i)` の名前の一覧 | `song.mid`・`synthetic.mid`・`private.mid`・`secret.mid` など、**合成・架空の名前だけ** | — |
| ほかのサイト・動画の名前・URL | `youtube`・`spotify`・`hooktheory`・`ireal`・`chordify` などの検索 | **0 件**(Jazz のデータのテストが `http`・`youtube`・動画の字を**無いこと**として確かめている) | — |
| 実機の機器の名前 | `Roland`・`Yamaha`・`KORG` などの検索 | テストの合成の名前(`Roland Digital Piano`・`Digital Piano`)と、**古い公開済みの報告**(`docs/phase3.7.0*`。v2.1.0 の公開にも入っている)だけ | 新しく入った物は無い。そのまま |
| 写真(`docs/reports/**/*.png` 442 枚、`docs/images/` ほか) | 作り方の確認と見本の目視 | 報告の写真は、Playwright が**合成データ**(`P23-61 ピッカー` のような名前)で撮ったもの。機器の名前は、`Digital Piano 未接続`・`MIDI 入力が見つかりません` のような合成・汎用の表示だけ。目視で確かめた写真に、実機の機器名・個人の進行名は無かった | 外すものは**無し**。判断がつかない写真は無かった |
| 公開しない物 | `.local-evaluation/`・`p89-generated/`・`claude-scratch`・`zz-*.spec.ts`・`Claude outputs/` が追跡に入っていないこと | **0 件**(追跡ファイルに無い。作業フォルダには置いてあるが、`git` には入っていない) | — |

- **直した物**:開発機のパス(上の 1 行目)。
- **外した物**:無し。
- **判断を利用者にお願いする物**:無し(§2.2 の `chrono` の警告の扱いは、[release-validation](release-validation.md) に書きました)。

## 4. 公開側にだけあった物の扱い(B2)

`origin/master`(`142b3877`)にあって、`release/v3.0.0` の元(local `master`)に無かったファイル。**黙って消えるものはありません**。

| ファイル | 扱い | 理由 |
|---|---|---|
| `docs/release/v2.1.0/*`(6 つ:`release-notes`・`release-validation`・`release-assets`・`release-inclusion-audit`・`STOP-1-history-privacy`・`STOP-2-dependencies`) | **持ってきた**(公開側の最新の版) | v2.1.0 の公開の記録。`release-validation.md` の「見直し:DEP-01」の行に「DEP-01 で済んだ(zod 4.6.7。npm audit 0)」を足した |
| `docs/development.md` | **持ってきた**(`guide.md` へのリンクだけ外した) | 公開側にある、ビルドとテストの方法の文書 |
| `docs/guide.md` | **消した** | v2.1 の画面の説明で、v3 と合わない。使い方は README にある |
| `CHANGELOG.md` の `## 2.1.0` の項 | **戻した** | local `master` の `CHANGELOG.md` に無かった(公開側にだけあった)。3.0.0 の下に置いた |
| `docs/images/v2.1-voicing-loop.png`・`v2.1-correction-workspace.png`・`v2.1-vault.png`・`v2.1-chord-dojo.png` | **持ってこない** | v2.1.0 の README の写真。v3 の README は `v3-*.png` に置き換え済みで、どこからも参照されていない(タグ `v2.1.0` の中には残っている) |
| `e2e/docs-images.spec.ts` | **持ってこない** | 上の v2.1 の写真を撮るための e2e。v2.1 の画面の作りを前提にした撮影用で、v3 では使っていない(撮った写真はどこからも参照されない)。v3 の写真の撮り方は `docs/images/README.md` と `docs/reports/rel-01-*.md` に書いてある |
| `src/assets/fonts/ibm-plex-sans-jp-*.woff2`(4 つ)・`OFL-IBM-Plex-Sans-JP.txt`(`OFL-Inter.txt` へ名前の変更) | **持ってこない** | P23-01 で書体を Inter・Noto Sans JP・IBM Plex Mono に入れ替えた。README のライセンスの行も新しい書体に合わせてある |
| `src/views/vault/VaultFilterPanel.tsx` | **持ってこない** | P23-15-01 で古い絞り込みの欄を無くした(使われていない) |
| `README.md`・`README.en.md` | **v3 の README を使う** | 公開側の `e51a3782`(「できること」を箇条書きにする)・`142b3877`(「コード進行を集めて保存し、聴いて直せる。…楽曲制作補助 Windows アプリです。」の 2 行)の**言い回しは、v3 の README に入っていません**(v3 の README は書き直したため)。**この 2 行は入れない**(README は今のまま) |

# Loop Vault v2.1.0 — 含めるものの確認

- 対象: local `master`(準備開始時 `6b112c12`)/ `release/v2.1.0`
- 起点: GitHub の `master` `65593f75`(v2.0.0 のあとの README 更新)とタグ `v2.0.0`
- 差: **328 コミット**(うち merge 34)。v2.0.0 のタグ以降、公開されているのは `65593f75` まで
- 方針: **利用者の承認を受けて master に入ったものだけ**を入れる。master に無いブランチから新しく入れたものはありません

## 1. ブランチの扱い

### 1.1 master に入っている(ALREADY_IN_MASTER)

44 ブランチが `master` の祖先です(`git merge-base --is-ancestor` で確認)。主なもの:

`recovery/p521-role-v2-promotion`・`fix/p532-shell-taxonomy-follow-up`・`fix/p533-study-ui-optimizer-follow-up`・`preserve/p532-staged-reverse-diff-20260916`・`fix/p533-transport-continuity-polish`・`feat/p537-union-chimera-production`・`feat/p540-local-harmonic-identity-ranking`・`research/phase7-core-v2`・`feat/phase8.8.2-text-intake-ux`・`feat/phase8.8.3-defining-tone-correctness`・`feat/phase8.8.4-text-capture`・`feat/phase8.8.5-global-playback-text-polish`・`research/phase8.8.3-r-compatibility-audit`・`feat/phase8.8.5-final-ui-correction`・`feat/p10.4-progression-page`・`feat/p12-chord-dojo`・`feat/p12-theme-score`・`feat/p12.1-dojo-ui-fixes`・`feat/p12.2-master-fixes`・`feat/p13.1-bass-ui-fixes`・`feat/txt-jazz-stage00`・`feat/txt-jazz-stage01`・`fix/chord-dojo-no-split`・`feat/p15-import-check`・`feat/p16-ear-practice`・`feat/preview-fade`・`tmp/preview-fade-before-check`・`tmp/preview-spare-proto`・`audit/jazz-00`・`audit/jazz-05-00`・`chore/test-performance-optimization`・`feat/jazz-02-data`・`integrate/p12.5-on-master`・`feat/jazz-05-01`・`feat/jazz-layout-polish`・`feat/jazz-octave`・`fix/dojo-double-advance`・`fix/vault-backup-rotation`・`feat/p17-bar-cut`・`feat/p17-card-delete`・`fix/vl-13-voicing-loop`・`fix/vl-14-resume-stutter`・`feat/p18-01-practice-frame`・`feat/p18-02-jazz-recall`・`chore/rust-advisories`・`chore/r-02`・`chore/r-03-text-notice`・`chore/test-hygiene`・`feat/vl-15-progression-picker`

### 1.2 master に入っていないブランチ(v2.0.0 以降に作られたもの)

| ブランチ | 位置 | 扱い | 理由 |
|---|---|---|---|
| `release/v2.0.0` | `70dbd5c0` | EXCLUDED_ALREADY_RELEASED | v2.0.0 として公開済み。記録の差分は master 側が最新 |
| `trial/jazz-00-p125-merge` | `083cd6ef` | INCLUDED(内容は master と同等) | `git cherry` で master に無いコミット 0。P12.5 の試験統合で、内容は `integrate/p12.5-on-master` 経由で master に |
| `feat/p12.0-00-audit` | `7551a975` | EXCLUDED_AUDIT_ONLY | P12.0 の監査パッケージ(README/契約/作業指示)。master には報告のみ入っており、パッケージは入れない |
| `fix/p13.1-bass-recording-flake` | `6273a9c4` | EXCLUDED_UNMERGED | 録音フレークの調査と仕様。修正は P13.1 の UI 修正に含まれず、未統合のまま |
| `feat/jazz-progressions-01-12` | `b908b2e8` | EXCLUDED_SUPERSEDED | Jazz 01〜12 の初期案。現在の Jazz Progressions(`feat/jazz-02-data` 以降)に置き換え |
| `feat/jazz-progressions-practice` | `b34368bb` | EXCLUDED_SUPERSEDED | `jazz-00-audit.md` の旧案。master の同ファイルが採用版 |
| `tmp/jazz05-proto` | `3eb5e23e` | EXCLUDED_PROTOTYPE | 配置の見本用の使い捨て(報告にも「マージしない」と記載) |
| `audit/p18-builtin-practice` | `74e07183` | EXCLUDED_AUDIT_ONLY | 監査メモのみ。製品・記録に入れない |
| `release/v2.1.0` | 本ブランチ | THIS_RELEASE | 本リリース |

- 上のいずれも master に新しく入れてはいません。
- `chore/rust-advisories`・`chore/r-02`・`chore/r-03-text-notice`・`chore/test-hygiene`・`feat/vl-15-progression-picker` は、**利用者の承認を受けて** master にマージ済みです(R-01〜R-03・VL-15)。

## 2. v2.0.0 から入った主な中身

| 分野 | 中身 | 主なマージ |
|---|---|---|
| Chord Dojo | 作り直し、定番の進行(P12.3)、ランダムキー、2-5-1 Master、長い進行、戻るボタン、判定と表示の一致、進行の全体練習と保存一覧の強化、1 回答で 1 つだけ進む | `P12.3-01`・`P12.4`・`P12.2`・`Chord Dojo whole-progression`・`align Chord Dojo displayed notes`・`dojo-double-advance` |
| Original Practice | P12.5 の取り込み(保存した音・元MIDI・カスタム・自動生成) | `integrate P12.5 Original Practice` |
| Jazz Progressions | 12 キー・ランダムキー・オクターブ +1・BPM・レイアウト・通して聴く・① 見て弾く/② 覚えて弾く(P18-02) | `feat/jazz-05-01`・`feat/jazz-octave`・`feat/jazz-layout-polish`・`P18-02` |
| 練習画面の共通の型 | 定番の進行の練習画面を 1 つの型に、①②のくり返し・「この段階をくり返す」(P18-01) | `P18-01` |
| Bass Practice | Phase 13(度数・リズム・ベースライン・ルートの動き、録音して聴き比べ、MIDI ベースラインの判定、専用の保存先) | `Phase 13 Bass Practice`・`P13.1 Bass Practice UI` |
| MIDI 接続 | P14.0-01 でアプリ全体の MIDI 接続を共通化 | `P14.0-01` |
| 耳で弾く | P16(キーボードと調号の前提、練習画面) | `integrate P16 keyboard and signature prerequisite` |
| 取り込み | コードカードの削除(P17-01)、小節を消して詰める(P17-02)、プレビューのフェード(P01〜03) | `P17-01`・`P17-02`・`Preview Fade stages 01-03` |
| Voicing Loop | タイムライン・鍵盤・4 つのソース・レンジループ、伴奏の開始/再開、VL-13(MIDI 鍵盤の音とナビゲータ)、VL-14(再開のガタつき)、VL-15(進行の選び方・お気に入り) | `P5.26.2`・`VL-13`・`VL-14`・`VL-15` |
| Vault | バックアップの回転の修正(実バックアップだけ数える・`legacy-import.json` の座標・後片付け失敗でも読み込みを続ける) | `fix/vault-backup-rotation` |
| テキスト取り込み | ジャズ表記(TXT-JAZZ):`minMaj7` と alt を読み、保存と登録 Dojo 練習まで分類を保つ。専用の保存場所 | `TXT-JAZZ text import` |
| テスト | R-01:レポート写真を未追跡へ、FULL の PNG ガード、指紋の範囲と一括ハッシュ、負荷依存の計測を低並列パスへ | `R-01` |
| 依存の安全 | R-02:Rust の RUSTSEC 修正(`cargo update`)と理由つき ignore、`cargo audit` の確認 | `chore/rust-advisories`・`R-02` |
| 文書 | R-03:作業フォルダのパスを `<作業フォルダ>` に伏せた、リリース準備の記録 | `R-03`(本ブランチ) |

## 3. 入れないもの

- **Jazz の ③ テンポで弾く(P18-03)**:作っていません。
- **P18-04 以降**:未着手。
- **Core v2 の研究**(Phase 7・9):製品に昇格していません。既定アナライザは `phase4-v1` のまま。
- **P5.39/P5.40 の Family C**:`PROMOTION = FAIL` のまま。製品に入れません。
- **AI Advisor の UI**:P8.9 で削除済み(バックエンドは残す)。
- master に無い実験ブランチ(§1.2)

## 4. 公開の形(重要)

今回の公開は、**途中の 328 コミットを公開せず、`65593f75` の上に 1 コミットだけを作る**方式にします。

- 理由:公開される途中の履歴に、開発用の作業フォルダの絶対パスが残っているため(→ [STOP-1](STOP-1-history-privacy.md))。履歴の書き換えはせず、公開用のスナップショット 1 コミットだけを作る
- 親は `65593f75` のみ。`git rev-list --objects 65593f75..public/v2.1.0` は 1 コミット分になる
- 手元の `master` と `release/v2.1.0` の履歴はそのまま残す
- 詳細と確認結果は [release-validation](release-validation.md)

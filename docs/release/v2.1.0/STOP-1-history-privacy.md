# R-03 停止記録: 公開される履歴に個人の絶対パスがある

**この記録は、手順書 R-03 §4 の停止条件に当たったための報告です。履歴の書き換えはしていません。コミットもしていません(作業ツリーに置いたまま)。**

- 調査した範囲: `65593f75..release/v2.1.0`(release/v2.1.0 は master `6b112c12` と同じ)
- 調査したもの: 範囲内の**全部のオブジェクト**(326 コミット、1,939 blob。途中で消したファイル・名前を変えたファイルの昔の版も含む)・全部のコミットメッセージ・作者名/メール・ファイル名/フォルダ名
- 調査方法: `git rev-list --objects` で全オブジェクトを列挙し、`git cat-file --batch` で全 blob を読み、パターン照合(ローカルのスクリプト。`.local-evaluation/r03/history-scan.mjs`・`hit-paths.mjs`。両方とも追跡しない)

## 1. 見つかったもの(停止条件)

**個人の絶対パス(開発用の作業フォルダ)が、公開される履歴に含まれています。**

- **いまの master の時点で 16 ファイル**(51 か所)
- 加えて、**5 ファイルは昔の版にだけ**残っている(64 か所。いまの版からは消えているが、履歴には残る)
- これらのファイルに触れたコミットは **51**。この範囲の最も古い該当コミットより後のコミットはすべて書き換え対象になるため、実質的に範囲全体(326)の書き換えになります

### 1.1 いまの master に残っているファイル(16)

`n` = いまの版の出現数 / `h` = 昔の版だけの出現数 / 最初のコミット = この範囲で最初にこのパスへ入れたコミット

| ファイル | n | h | 最初のコミット |
|---|---|---|---|
| `docs/txt-jazz/evidence/setup-stage01-worktrees.json` | 25 | 0 | `a04a8c8b` |
| `docs/txt-jazz/evidence/setup-worktrees.json` | 24 | 0 | `6998a431` |
| `docs/phase12.0/reports/P12.0-01-chord-dojo.md` | 7 | 46 | `61b71141` |
| `docs/phase12.1/reports/P12.1-01-dojo-ui-fixes.md` | 5 | 14 | `2f2c52ce` |
| `docs/phase12.0/reports/P12.0-01-vertical-home.md` | 2 | 0 | `1a9c8cd6` |
| `docs/phase12.3/reports/P12.3-01-dojo-progressions.md` | 2 | 0 | `0ae24ba7` |
| `docs/reports/r-01-test-hygiene.md` | 2 | 0 | `37a1a7c6` |
| `docs/phase12.0/reports/251-04-final-acceptance.md` | 1 | 2 | `f9552677` |
| `docs/phase12.0/reports/251-sequence-boundary-audit.md` | 1 | 1 | `03719e2f` |
| `docs/phase12.0/reports/P12.0-01-master-audition.md` | 1 | 0 | `e064f6a8` |
| `docs/phase12.0/reports/P12.0-01-master-form-templates.md` | 1 | 1 | `96d5ed45` |
| `docs/phase12.0/reports/P12.0-01-master-monitor-progression-fingering.md` | 1 | 0 | `5e2d6825` |
| `docs/phase12.0/reports/P12.0-01-master-octave-down.md` | 1 | 0 | `d7ea74e6` |
| `docs/phase12.0/reports/P12.0-01-master-ui-learning-review.md` | 1 | 0 | `5ce6eaaf` |
| `docs/phase12.0/reports/P12.0-01-practice-layout.md` | 1 | 0 | `a5c14d33` |
| `docs/phase13.1/reports/P13.1-01-bass-ui-fixes.md` | 1 | 0 | `cb2ad40a` |

### 1.2 中身の種類

いずれも**文書の中の、この PC の作業フォルダの絶対パス**です。大きく2種類あります。

1. **作業フォルダの一覧(JSON)**:`docs/txt-jazz/evidence/setup-worktrees.json`・`setup-stage01-worktrees.json`。`"worktree"` の値として、開発用の作業フォルダのパスが 24〜25 件並んでいます。外部の保護された作業フォルダだけは `[external protected worktree]` に伏せてあります。
2. **報告書の本文(テストのログ・実行したコマンド・写真の置き場所)**:`docs/phase12.x/…`・`docs/phase13.1/…`・`docs/reports/r-01-test-hygiene.md`。`D:/…` 形式(スラッシュ)と `D:\…` 形式(バックスラッシュ)の両方があります。

- **ユーザー名(`C:\Users\<name>`)は含まれていません**(0 件)。ドライブ直下の開発フォルダのパスだけです。
- パスの中に、私的な MIDI・音声・写真のファイル名は含まれていません。

## 2. 見つからなかったもの(確認済み)

| 調べたもの | 結果 |
|---|---|
| `npm run security:scan`(追跡中のファイル) | **PASS** |
| メールアドレス(GitHub の noreply 以外) | **0 件**。`…@1440x900.png` のような**スクリーンショットのファイル名**が正規表現に当たっただけ(実アドレスではない) |
| API キー・トークン・秘密鍵 | **0 件** |
| 私的な MIDI・音声・動画・字幕 | **0 件**。範囲内のメディアは PNG のみ 128 件(うち 113 は `docs/reports/`、15 は `e2e/visual.spec.ts-snapshots/`)。音声・MIDI・動画はありません |
| 元の動画の名前・シリーズ名・URL・時刻 | **0 件** |
| コミットメッセージにパス | **0 件** |
| ファイル名・フォルダ名にユーザー名 | **0 件** |
| 作者 | 範囲内は全部 `Codex <codex@local>`(個人のアドレスではない。GitHub の noreply でもないので、記録として挙げます) |

- **未確認**:`docs/reports/` の追跡中 PNG 128 件が合成データの画面かどうか(画像の中身の目視)は、この段階では確認していません。停止したため、§4 の残りの確認・§1〜§3・§5・§6 は行っていません。

## 3. これから選べること(まだ何もしていません)

- **A. いまの 16 ファイルを直したうえで、履歴を書き換える**(16 ファイルの該当箇所を伏せ字/相対パスにし、`git filter-repo --replace-text` などで 51 コミットの blob を置換。書き換え後に同じスキャンを再実行し、範囲全体で 0 件を確認)
- **B. その文書を公開物から外す**(ただし master の履歴から消すには、結局 A の履歴書き換えが要ります)
- **C. そのまま公開する**(AGENTS.md のプライバシー規則に反するため、推奨しません)

A を行う場合は、**force push が必要**になります(公開済みの master `65593f75` はそのまま残るため、そこから先の 326 コミットを置き換える形)。push は R-04 の利用者の判断です。履歴を書き換える前に、この一覧を確認してください。

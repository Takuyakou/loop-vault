# TXT-JAZZ Stage 01 — parser / classification propagation

開始点: `6998a4317e7934a8f3e76784c66d95479e371bae`（Stage 00 文書・証拠）。製品開始点は `21d4828d0d62b35da574a2a32e3c2bfa39eea3a9`。本報告は未コミット実装に対する担当検証であり、Stage 01 全体の完了や FULL / E2E / native の合格を意味しない。

## 実装範囲

- `parseTextChordLabel` の text-only policy に minMaj7 / minMaj9、alt、half-diminished / diminished / minor shorthand / augmented seventh aliases を追加。既存 `minMaj7` / `dom9` / `dom13` / `sixNine` / `min6` の型を維持。`G7alt` は `dom7`、空 tensions、`altered:true` とし、明示テンションとは別の記号を保つ。
- `normalizeScoreSource` に従来の拡張入力の Unicode / 全角正規化を一本化し、通常入力も利用。1 UTF-16 単位を1単位で置換し、元ソース位置を維持。case と `6/9` は維持。通常/拡張の各独立上限は変更なし。
- `formatTextChordSymbol` により text のみ `Cm(maj7)` / `Cm(maj9)` を採用。一般 formatter の既存 minMaj 表示は維持し、alt 分類だけ構造から表示できる。拡張入力の既存別表記（`C69`、`Cø`、`C7b9` 等）は維持。
- 移調・degree projection・共有 identity / Voicing Memory key・score segmentation identity に alt を保持し、従来のキー文字列は変更しない。root / bass の構造編集と keyboard root shift も分類を保持。明示的な quality 選択による変更は利用者の編集として扱う。
- absolute manual label entry は従来 parser 成功を優先し、text aliases を追加で受け付ける。degree grammar は変更なし。
- 保存前の構造再照合は alt 有無を比較する。app 推奨音の `text-style-v1:` marker は記号と音の検査を要求し、不正な app 音を登録しない。人間の live-played 音が権威を持つ既存契約は維持。
- Context 入口は共通 consumer 宣言により alt を非対応とし、その Context に依存する Bass / Root Motion も同じ入口で非対応となる。生成代用は認定しない。

## 凍結 baseline と許可差分

[Stage 00 baseline](../evidence/parser-regression-before.json) を無変更で全件復元し、5関数の **14,537 unique input/output、217,481実呼出し相当**を再生。14,531件は完全一致、許可差分は6件のみ。

1. 新 text alias 3件: `E♭13`、`C-7`、`B♭maj7` が共有 text parser で従来 null から正しい既存型へ。
2. 明示承認された text canonical 3件: `CmMaj7` の text core / extended chord label / extended progression の chord label が `Cm(maj7)` へ。構造・source・raw・writtenChord・位置・timing・metadata・diagnostics は不変。

[固定許可 ledger](../evidence/stage01/parser-approved-differences.json) は record SHA と新出力 SHA を指定し、範囲外の差分と不要な許可を拒否する。legacy `parseChordLabel` **2,495 unique入力は例外0・完全一致**。元ファイルの Git Windows checkout の CRLF のみ LF にそろえて既知 SHA を照合し、decoded JSON も独立の既知 SHA で検証する。原本は編集していない。

## 実行結果

- 最終 focused: `npm exec vitest -- run` に parser / both intake / transposition / correction / editors / store / 新 TXT-JAZZ 2 suites の12ファイルを指定。**339 / 339 PASS、exit0、1.85秒**。新 suite は Stage 00 の全103独立期待を両取り込み方式へ照合し、別の alias matrix が正確な構造・表示を検証する。凍結 replay は出力順序を含む完全一致。
- `npm exec tsc -- --noEmit`: **exit0**。
- `git diff --check`: **exit0**。
- 担当変更20 TypeScript / TSX ファイルの `npm exec eslint -- ...`: **exit0**。
- 実ログは ignored `p12-generated/TXT-JAZZ/stage01/parser-focused-final.log`。差分採取は同領域の `parser-replay-observed.json`。実データや外部コード表を用いていない。

## 失敗履歴と限界

- 最初の replay は Windows checkout の CRLF による raw SHA 差で FAIL。Stage 00 の LF 正本と decoded JSON が既知 hash に一致することを確認し、改行だけを考慮する検証へ修正。
- 次の replay は ledger が空のため差分6件を FAIL として検出。before / after 全構造を精査し、親レビューで新 alias 3件と承認表示3件のみを認めて固定した後に再実行 PASS。
- 新 editor test の指定 bass 綴りを `Db` として初回 FAIL。既存 formatter の `C#` 規則に合わせた独立期待へ訂正。製品を綴り変更していない。
- 103入力の独立監査表は tensions を集合として列挙していたため、その新検査の順序期待で初回 FAIL。集合比較にし、別 alias matrix と凍結 replay の厳密な配列順序検査は維持。
- 最初の typecheck は新 test の optional array 2箇所と別担当中の Dojo 型1箇所を検出。各所有者が修正し、全体 typecheck を再実行して exit0。
- scoped lint は正規化 regex の生の全角空白を検出して初回 FAIL。同じ1文字を `\u3000` と表記し、scoped lint と全 focused 339件を再実行して PASS。

パーサー担当の合格だけで製品完成としていない。Text → Preview → Vault → Reload → Export / Import → Dojo registered-voicing の全体統合、自動ブラウザ検証、fresh FULL / lint / build / 独立レビューは Stage 01 の最終検証で確認する。merge / push / tag / release / EXE 作成 / 他 worktree の変更はこの担当では実施していない。

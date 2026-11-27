# Vault: 起動時のバックアップ整理で読み込みが止まる不具合の修正

ブランチ `fix/vault-backup-rotation`(master `605b656f` から)。master へのマージ・push はしていません。AppData の実ファイルには触れていません。

## 1. 何が起きていたか
`txt-jazz-v3/backups` が 20 個になった起動(10/23)から、Vault を読み込めず「Vaultを読み込めませんでした」になった。

- 起動時に新しいバックアップを作ったあと、`rotateBackups` が 20 個を超えた分を消す
- Jazz 用の `listBackups` は、復元の一覧のために `legacy-import.json`(`createdAt` が空)を末尾に足す。`rotateBackups` はこの一覧を使っていたので、バックアップが 20 個になると、`legacy-import.json` が「あふれた分」として削除対象に入った
- その削除パスは `loopvault/txt-jazz-v3/legacy-import.json` で、Jazz 用ストレージがさらに `txt-jazz-v3/` を足すため `…/txt-jazz-v3/txt-jazz-v3/legacy-import.json` になり、見つからずに失敗。失敗が文字列だったので、画面は固定の文になり中身が見えなかった
- 10/11 の TXT-JAZZ から入っていた不具合で、Jazz-05 とは無関係。バックアップが 20 個に達した日から、どの exe でも起きる

## 2. 直したこと
1. **整理の対象**(`src/domain/repository.ts`):`rotateBackups` は `listRotatingBackups()`(`data-YYYYMMDD-HHMM.json` の形だけ)を数えて消す。`listBackups()` は同じ一覧を返し、Jazz はそれに `legacy-import.json` を足して復元の一覧に出す(今までどおり)。`legacy-import.json` は消す対象に入らない
2. **座標**(`src/storage/jazzVaultStorage.ts`):`legacy-import.json` の項目の `path` を `${VAULT_DIR}/legacy-import.json`(復元と同じ論理座標)にした。実ストレージの座標 `JAZZ_VAULT_MIGRATION_COPY` を渡していたのが二重の原因
3. **片付けの失敗**(`repository.ts`):`createStartupBackup` が整理の失敗を捕まえて `console.warn("Vault backup rotation failed; …", error)` に記録し、読み込みは成功させる。削除は `Promise.allSettled` で、1つが失敗しても残りを全部試す
4. **起動エラーの画面**(`src/store/vaultStore.ts`):`errorText(error, 代わり)` を足し、`Error` の文でも、文字列の失敗でも、その文を出す(バックアップファイルから読むほうも同じ)

## 3. テスト(`src/storage/jazzVaultStorage.test.ts` に追加)
本物のファイルと同じく、「無いファイルを消すと文字列で失敗する」ストレージ(`StrictStorage`)を使った。
| 確かめ | 結果 |
|---|---|
| 既存のバックアップが 18・19・20・25 個+`legacy-import.json` で読み込みが成功する。`legacy-import.json` は消えず、本物のバックアップは 19→20、20 個以上は 20 個に保たれる(古いものから消え、今回の起動の分は残る)。繰り返し起動しても同じ | 通過 |
| `legacy-import.json` の項目の座標が `loopvault/legacy-import.json`(二重にならず、Jazz 用ストレージ越しに読める)。そこからの復元が今までどおり動く | 通過 |
| 削除が失敗しても読み込みは成功し、警告が記録され、全部の削除が試される | 通過 |
| 文字列の失敗が起動エラーの画面の文にそのまま出る(`errorText` も) | 通過 |
| **修正前のコードに戻すと**、19・20・25 個(読み込みが失敗)・座標・削除失敗の5件が失敗する(18 個は修正前も通る) | 確認済み |

ほかの確認:
- 型・e2e の型・ESLint:通過
- 単体 Vitest 全体:6214/6216 通過(別実行で、既知の3件の負荷時間切れだけが出る。`test:full` では通る)
- 関係する e2e(Vault 起動・Original・Jazz・Dojo・visual 65 件):通過。`phase13-1-bass-ui.spec.ts` が1回だけ落ち、単独では 12/12 通過
- `npm run test:full`:**PASS**(Vitest 6214/6216、Playwright 728/730・既存/条件付きスキップ2件)

## 4. 実機の状態について
- 安全のため、`txt-jazz-v3` は `safety-copy-20261023-txt-jazz-v3` に写してある
- いまの `txt-jazz-v3/backups` は 20 個ちょうど。修正した exe の最初の起動で、新しいバックアップが1つ増え、一番古い1つが整理される(21→20)。`legacy-import.json` は消えない
- 調査のときに私が起動して、`data-20261023-1141.json` が1つ増えている(アプリ自身の起動時のバックアップ)

## 5. 実機で確かめてほしいこと
1. exe を起動して、Vault が開くこと(ホームに今までの記録があること)
2. 2回、3回と起動し直しても開くこと
3. `txt-jazz-v3/backups` が 20 個のままで、`legacy-import.json` がそのままあること
4. 設定のバックアップ復元の一覧に `legacy-import.json` が出ること(あれば)

止まります。

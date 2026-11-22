# REL-01-fix-1 — README の写真 6 枚と試す exe を、P23-65・P23-66 の後で撮り直す

基点: local `master`(`0b7180c5`、P23-65・P23-66 を入れた後)から `docs/rel-01-fix-1`。コードの変更なし。

## 1. 写真(`docs/images/v3-*.png`、1440×900、合成データのみ)

REL-01 と同じ撮り方・同じ合成データ:`dist/` を Playwright の新しいブラウザ(メモリ内 Vault・ダーク・`ja-JP`)で開き、自作の合成 MIDI(8 小節 Cmaj7–Am7–Fmaj7–G7 の繰り返し、和音+ベースの 2 パート、110 BPM)と汎用テキスト進行 3 件だけを、通常の画面操作で入れて撮った。6 枚を全部撮り直した。撮影の流れは前回と同じ順(修正作業場 → 保存 → テスト 3 件 → ホーム → Vault → Voicing Loop → Chord Dojo → Bass Practice)。

| 画像 | 見たこと |
| --- | --- |
| `v3-home.png` | 「コードを押すと、その音が鳴ります」の 2 か所が無い。「MIDI を DAW へ」が今日のループのカードの右上にある(P23-65)。通知なし |
| `v3-bass-practice.png` | 「聴いてまねる」の右の「?」が無い(P23-65) |
| `v3-chord-dojo.png` | P23-65 の幅の画面。「MIDI 鍵盤がつながっていません」の帯は、通常の「×」で閉じてから撮った(前回の写真に無かったため) |
| `v3-voicing-loop.png` | 四和音ループ(元 MIDI)。マウスは画面の外れに置き、ホバーの枠は写っていない |
| `v3-vault.png` | 4 件、右プレビュー。変更なし(画面の見た目が前と同じ) |
| `v3-correction-workspace.png` | 前回の写真と**バイト単位で同じ**(同じ合成 MIDI で同じ画面になることの確認) |

- P23-66 の区間の色(黄色):この 6 枚の画面には区間を選んだ状態が写らないので、写っていない(Voicing Loop は区間を選ばない初期の状態で撮った)。区間の色は P23-66 の `p23-66-assets` の写真で確認済み。
- 実 Vault・個人 MIDI・録音・機器名・個人パスは写っていない。通知(トースト)は閉じてから撮った。

## 2. `docs/images/README.md`

v3 の段落の「撮ったコミット」を `6370fb72` → `0b7180c5` に直した。画像の名前・置き場所・README の文は変えていない。

## 3. 試す exe

- 作り方:local `master`(`0b7180c5`)で `npx tauri build --no-bundle`(実行中の exe は無かったので、ふつうの `target` で)。
- 写した先:`<作業フォルダ>\lv-handoff\try\loop-vault-v3-trial-0b7180c5.exe`
- 大きさ:26,855,424 bytes(約 25.61 MB)
- 作った時刻:2026-11-22 05:02(コピーは 05:02:51)
- SHA256:`B86E1DD4D141ED4625EE16F4BBF5FDF9B4EE0550FDE668C427AD2F3EE8995740`
- 起動はしていない。古い `loop-vault-v3-trial-6370fb72.exe` は消していない。

## 4. 確かめ

- `npm run check:staged`:PASS(「Staged files are clear of private audio and generated output.」)。FULL・`test:fast` は指示どおり回していない(コードの変更なし)。
- push はしていない。

# TXT-JAZZ Stage 01 — 人間の承認方針

Stage 00 は完了。利用者はチャットで次の10条件を指定し、Stage 01 の実装・通常判断・テスト・独立レビューを承認した。この文書はその判断の記録であり、添付仕様を新たな人間の命令に昇格させるものではない。

目的は、実際のジャズコード表を Text Import から取り込み、Vault に保存し、Chord Dojo「登録した音を覚える」で正しい登録音を練習できること。parser 単体の成功のみでは完了しない。自動テストには合成fixtureを用い、実Vaultや私的入力を読まない。

1. **alt は候補 A。** `ChordSymbol` に任意の `altered?: true` を追加する方針。保存実装前に互換性を検証する。旧Vaultを新readerで読むことが必須。旧EXEが新fieldを拒否した後の fileVersion・移行・backup・復旧を確認し、静かなデータ消失を禁止する。安全な方針が確立できなければ保存実装を停止し問題と代替案を報告する。
2. **上限は現在値を維持。** 通常8192文字単位・32小節・128token。拡張65536文字単位・256小節と既存独立上限。旧仕様4096/12/48へ縮小しない。Context/Bassのsection選択制限と取り込み全体の上限を混同しない。
3. **既存型を維持。** `minMaj7`、`dom9`、`dom13`、`sixNine`、`min6`等を不要に変換しない。`G7alt` と明示テンション付きdom7を区別する。移調・編集・Vault・書出し/読込・cache・fingerprint・消費側へ分類を伝播する。
4. **Text表示の限定差分。** `Cm(maj7)` と `Cm(maj9)` を正準表示とする。従来の `CmMaj7` からの変更は明示承認されたText限定の回帰差分。MIDI解析Coreや無関係機能を一括変更しない。
5. **試聴は正しい altered dominant。** 既存Text試聴を最小拡張する。3度・♭7・altered tension・禁止音・指定bass・低域半音衝突を生成後に記号と照合する。生成不能時の通常G7等への黙った代替は禁止。新汎用voicing engineは作らない。
6. **音と出どころを保持。** 既存 `practiceVoicingOverride` と provenance を再利用し、アプリ推奨音とMIDI抽出音を区別する。保存時のMIDI note・表示名・構造・出どころを検証する。
7. **登録音Dojoが必須。** `G7alt` を含む進行のVault保存と「登録した音を覚える」での練習を合格条件とする。登録音無しを通常G7/自動生成音へ置換しない。保存前に登録可能件数と生成不能コードを示す。
8. **消費側は入口まで判定。** Stage 00 の実コード監査に従う。Root Motion/Bassは下層の根音だけで対応認定せず、Context・snapshot・identity・cacheも含める。altを理解しない機能の通常dom7扱いを禁止し、大規模な無関係改修を避ける。
9. **自動検証。** Stage 00 の凍結parser baselineと比較し、新aliasと承認済正準表示だけを許可差分に記録する。独立期待MIDI集合も検査する。通常/拡張とも Text Import → Parse → Voicing Preview → Vault Save → Reload → Export/Import → Dojo Registered Voicing を検証する。旧形式・分類保持・parseエラー保存拒否・生成不能の非対応を含める。人間検証は可能な限り自動テストと独立レビューへ置き換える。
10. **作業保護・最終検証。** 既存worktree・未commit変更・他Phase成果物を保護し、Stage 00と実装開始点を照合する。focused検証を繰り返し最後にfresh FULL・typecheck・lint・build・必要E2E。失敗を弱めない。重大な互換性/消失/Vault破壊問題だけで判断を求める。merge / push / tag / release は禁止。完了時に変更・回帰差分・未解決事項・実装可否を報告する。

## 保存互換性の設計ゲート

製品変更前の合成probeで、凍結した旧実reader/repository/storeを実行した。Vault 41 assertions / Dojo 49 assertions、各 exit 0。これは設計の実現性を確かめる証拠であり、後の新実装を合格認定する結果ではない。

- 同一 `loopvault/data.json` へfileVersion3を書くだけでは不十分。旧readerは全体を拒否し通常mutationを止めるが、旧repositoryの明示restoreは既存v2backupで新dataを上書きできる。
- 新Vaultは `loopvault/txt-jazz-v3/` へ隔離し、旧v1/v2を一度だけcopy-firstで読む。旧原本・旧backupは新EXEから変更しない。移行前の生bytesを新namespaceの永久copyとして残す。
- internal `VaultFile` は既存v2へ正規化する。alteredを含むdisk/export envelopeはv3で旧reader全体拒否、alteredなしは既存v2を維持する。
- Dojo lessonにはfull `ChordSymbol` が保存されるため、旧strict readerがalteredを拒否する。同様に新browser/native namespaceへ隔離し、直前のranges-v4記録をread-onlyで一度だけ移す。Dojo envelopeは既存v4のまま。
- 新namespaceの不正・未来・部分移行を古いdataやemptyへ静かに置き換えない。同じnamespaceの検証済backupによる既存の復旧だけを許す。新旧EXEのその後の変更は同期しない。

この安全案は利用者の承認条件の範囲内の実装判断として採用した。新実装のunit/native検証、明示復旧導線、統合E2Eは別途必須である。

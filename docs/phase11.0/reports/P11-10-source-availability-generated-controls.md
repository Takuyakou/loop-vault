# P11-10 Human Acceptance — Source availability / 生成設定

## 状態

**P11-10 = READY_FOR_HUMAN_PRODUCT_ACCEPTANCE**。最終tested code / EXE HEAD `b0fe80769ed907f420d5da244df34e0f0c7dd13d`。最終結果追記はdocumentation-only。P11-09および初回FULLの結果とは区別する。

## 1. ROOT CAUSEと修正

- 0/N Sourceは従来aria-disabledだけでclick handlerが説明stateを設定し、header下へ常設info bannerを追加していた。state / banner DOMを除去し、native disabled、0/N、opacity、title / aria-descriptionへ変更。
- 復元時はlocal preferenceの利用可否を確認していたが、初期selection自体が利用不能の場合はそのまま返していた。`sourcePreference.ts:availableVoicingSource / restoreVoicingSource`で、利用可能なpreferredを保持し、利用不能時は完全な保存した音→元MIDI→カスタム→自動生成の優先順位で回復。同一進行のsnapshot更新でも固定Sourceの消失を確認。利用可能なpartial selectionを勝手に置き換えない。
- 詳しい設定は内部inputsだけdisabledで、native summaryは開閉可能だった。固定Sourceではsummaryをaria-disabled / tabIndex=-1にし、click / Enter / Spaceとtoggleをguard。表示位置・外側クリック・Escの契約は維持。生成タイプはnative disabledに加えイベントguardを保持。
- 自動生成へ戻すボタンがbasic-fullを常に選ぶため、詳細familyが失われていた。最後のgenerated familyをsession内で保持し、Source切替後に復元。基本/骨組み、左手A/B、Color / Openのstateは変更しない。

## 2. 維持する契約

固定SourceをGeneratedへ偽装しない。Source MIDI / Saved / Customの実音・保存schemaは変更しない。X/N partialの再生と見えるAUTO補完、complete Source dedup、左右手、Range / Transport / keyboard / timelineは維持する。生成方式自体が未対応の時は既存のUNSUPPORTED表示を残す。

## 3. 自動テスト

- Unit: Source priority、0/N初期selection、persisted preference、partial 1/2、データ非変更。rendered viewの0/2、disabled、banner不存在、選択保持。
- Standard / Extended Text: 実際の保存→Vault v2再読込→handoffでSource 0/2・Saved 2/2を確認。Textに偽Sourceを作らない。
- UI: 全固定Source無効化・キー/クリックによるpopover非表示、再enabled、骨組み/Color/Open/左手B/詳細family保持、同一進行のlocalStorage stale preference、partial 1/8のAUTO marker、axe serious/critical 0。
- 従来の固定Sourceでもdetailsを開けるexpectationだけを新しい契約に更新。Range / generated8コード×modifier / focus保持のassertionは維持。
- focused Unit 93/93 PASS、FEATURE 128/128 Vitest + 11/11 Playwright PASS（51.0秒）、追加UI含む27/27 Playwright PASS。最終FULLは以下へ別途記録する。

## 4. 判断・制約

選んだこと: 0/Nは操作不可で説明はオンデマンド、固定音Sourceでは生成controlsを無効にしたまま配置を保持する。
理由: 毎回bannerで画面を押し下げず、固定音と生成設定の意味を一致させるため。
別案: 非表示controlやSourceへ生成音を代入する案は採用しない。

生成設定の保持は同じ開いた進行のsession内。Vaultへの新しい保存fieldは追加しない。診断fixture等で利用可能なsnapshotが一つもない場合は再生を可能と偽装せず既存のUNAVAILABLE状態を維持し、0/N Sourceをselected表示にしない。実Vault/private witnessは使用・変更しない。既存D-drive checkoutを再使用。

## 5. 初回FULL failure isolation

初回tested HEAD `b8bd9fc8c3d0933fb6fcfdad3497f3037fc2be25`: Vitest 3,694/3,694 PASS、静的Gate PASS。Playwrightは185 PASS / 3 FAIL / 1 UNRUNでFULL FAIL。成功として扱わない。

1. `phase11-header.spec.ts`に、削除済みbannerをactivation後に要求する旧仕様testが残っていた。新しいdisabled/title/0/8/banner不存在/選択不変の契約へ更新。
2. 変更対象外のDojo scroll確認は75pxで失敗。該当コード・testは今回変更していない。
3. 長いtimeline testはpreview server接続で`ERR_CONNECTION_FAILED`。直接原因は未確定。Dojoのserial suiteの後続1件がUNRUN。

修正済みheaderと上記2件を同じworker設定で各3回独立再実行: **9/9 PASS**。skip / retry追加 / timeout緩和 / unrelated product変更なし。この結果だけでFULL PASSとはしない。更新したreport-inclusive HEADで全Gateをfresh再実行する。

## 6. 最終fresh Gate / EXE

最終report-inclusive HEAD `b0fe80769ed907f420d5da244df34e0f0c7dd13d`で `npm run test:full -- --fresh` を実行: **FULL PASS / 0 FAIL / 0 UNRUN**。PASS cache未使用。初回失敗後、旧bannerテスト修正・failure isolationを経た最終検証。

| Gate | 結果 |
|---|---|
| repository ESLint / class lint / source-contract lint | PASS |
| App / E2E TypeScript | PASS |
| phase-doc / AI-handoff | PASS |
| privacy/security | PASS |
| production build / gallery excluded | PASS |
| runner contracts | 27/27 PASS |
| Full Vitest | **3,694/3,694 PASS** |
| repository-wide Playwright | **189/189 PASS** |
| git diff check | PASS |

FULL wall time **270.1秒**、raw logs **28,389 B**。189予定/189実行、skip/fail/unrunなし。既存Range / Transport / keyboard / Source / generated modifier / accessibility / 4-size current-panelと6-width headerの回帰を含む。1920pxの最終Source切替後画像を目視確認: banner行なし、0/Nと固定Sourceの生成controlsはdisabled、内容clipなし。初回のDojo / server接続失敗は最終FULLでは再現しなかったが、直接原因が確定したとは扱わない。

`npm run tauri build -- --no-bundle` **PASS**、Rust/Tauri release compile **50.67秒**。同じtested code HEADのraw Windows EXE: `src-tauri/target/release/loop-vault.exe`、**24,712,704 B**、PE MZ確認。D-drive target/TEMPのみ、fixture/gallery flagなし、インストーラーなし。自動起動せず、実Vault変更なし。

base / local masterは`8b6480b4`のまま。保存済みorigin/masterとの比較708 ahead/0 behind（fetchなし）。master merge / push / tag / releaseなし。最終結果の文書更新後はphase-doc / AI-handoff / privacy / diffのみ軽量再検証し、documentation-only commitで停止する。後続文書HEADにFULLが実行されたとは記録しない。

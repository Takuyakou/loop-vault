# P11-10 Human Acceptance — Source availability / 生成設定

## 状態

実装済み。最終candidateのfresh FULL / EXEは検証待ち。この文書の結果欄へtested commitを記録してから完了とする。P11-09の結果は今回の検証結果として流用しない。

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

## 5. 最終fresh Gate / EXE

PENDING。最終tested HEAD、FULL件数、raw Windows EXEを検証後に追記する。master merge / push / tag / releaseなし。

# P11-08 — 詳しい設定 / 次への動き Human Acceptance follow-up

## 状態

実装・fresh FULL・runnable Windows EXE完了。READY_FOR_HUMAN_PRODUCT_ACCEPTANCE。P11-07のRange/Space/区間解除/timeline修正を維持。人間の最新判断に従い、次への動き非表示の判断だけを上書き。master merge / push / tag / releaseなし。

## 1. 詳しい設定のROOT CAUSE

`ProgressionVoicingPracticeView`はnative `<details>` / `<summary>`を使用していた。Reactにopen stateもoutside listenerもなく、Source/type変更はselectionだけ更新して同じdetails DOMを再利用するため、native open属性が残る。native detailsは外側クリック/Escで自動dismissしない。古いlistenerの再登録raceではなく、dismiss契約が未実装だった。

変更前code HEAD `b7c1cbf9c36c3793adef3da7fedafc72f1c39f35`上で新しいbrowser regressionを実行し、Source変更後・outside click後にopen=""が残る2件のFAILを確認。trace/screenshotはGit外のtest-resultsに生成。

## 2. Source変更時のpopover state修正

選んだこと: native `details.open`を唯一のopen stateとして維持し、refからSource/type command時にclose。document captureのpointerdownで外側だけclose、Escでcloseしてsummaryへfocus復帰。listenerは一度登録しunmountで解除し、毎回refの現DOMを読む。summaryのnative toggleは維持。Spaceはsummaryをnative操作として保護する。

内部Color/Open/左手操作ではcloseしない。既存の形の変更はSource selection commandなのでcloseする。popover Escは先に処理し、背後のRange取消/Transport Stopへ同じキーを二重配送しない。Source/type変更時の既存Transport停止仕様は変更しない。

理由: DOM openとReact stateを二重管理せず、再構築やrerender後も同一のdismiss契約を守れる。別案: controlled custom popoverへの置換は今回不要。

## 3. 次への動きの復活

View compositionで既存`computeNextMoves`と`NextMovePreview`を接続し直した。current/nextのresolved pitches、practice hand assignment、effective fingeringを入力とする。新しい理論/generation/selection logicは追加しない。

コード名 → 左右メインカード → compact explanation strip → 次への動きの順。覚える＋運指表示時に表示し、既存思い出す/運指非表示契約を維持。10 slotsを左右各5で同一row、KEEP band / pitch / movement hints / 推定 / title / aria-labelを保持。Source/type/card変更で再計算。

## 4. 高さの原因と調整

P11-07で実測した旧競合はdesktop fixed 380/324px、本文flex-1/min-height:0/overflow-y:auto、末尾68px＋margin8pxの組み合わせ。旧内容をそのまま戻すと本文clientHeight 278/222に対しscrollHeight292となる。今回そのDOM/CSSを復元しない。

compact stripは54px、指枠38px、header11px、top padding2px、grid上gap1px。最初の35px指枠はborder内33pxに対しscrollHeight35pxとなったため、font/情報を削らず38pxへ変更。stripの縦overflow:hiddenは使わない。

desktop current/next親は`clamp(380px,40dvh,440px)`へ最小限伸長。current本文はintrinsic min-height:autoとoverflow visibleを保つ。コード文字サイズ/左右card/情報は縮小せず、小画面は従来の自然高auto rowsを維持する。

## 5. 4解像度の実測 / スクリーンショット

| viewport | panel clientHeight / scrollHeight | CSS height | strip height | overflow-y |
|---|---:|---:|---:|---|
| 1920×1080 | 430 / 430 | 432px | 54px | visible |
| 1440×900 | 378 / 378 | 380px | 54px | visible |
| 960×1032 | 378 / 378 | 379.516px | 54px | visible |
| 768×640 | 378 / 378 | 379.516px | 54px | visible |

panel/contentに内部scrollなし。min-height:auto / max-height:none / padding12px / border1px、左右card gap8px、info gap4px 8px。strip clientHeight53 / scrollHeight53。fingerはborder内36px、整数roundingによる差は最大1px、overflow visibleでglyphをclipしない。全10枠は同一y、strip終端はpanel padding内。4サイズのpanel画像と小画面open画像を目視確認し、左右card/strip/全指が判読可能。Source変更後にもpanel scroll差なし。

`e2e/phase11-current-panel.spec.ts`はpanel/content/cards/info/strip/全fingerのclientHeight/scrollHeight/computed height/min/max/overflow/padding/border/gap/flex/gridを保存。10枠同一row、末尾がpanel padding内に収まることもassertする。公開合成fixtureのみ。

各幅のclosed/open/source-change/panel/workspace PNGとJSONはGit外`test-results/p11-current-panel/`。内部scroll/clip隠蔽を行わず、horizontal overflow、左右2列、serious/critical axeも検証する。

## 6. 追加テスト / 回帰

Unit focused 150/150 PASS（最終FULLは別途）。新規: Source/type close、outside/Esc、内部操作維持、Escでtransport非停止、Source/type/card変更後のmovement pitch更新・原本不変。

Browser追加: Source変更close/reopen、outside、Esc、toggle、内部Open保持、基本↔骨組み、summary Space native activation。4サイズのgeometry/closed/open/source-change画像。旧非表示UI expectationのみ最新の可視仕様へ更新し、Next Move domain/standalone testsは保持。

初回focused browser 28 PASS / 4 FAIL（指枠の2pxはみ出しのみ）。その具体的原因に対して上記38px修正を行う。Range loop、meter/count-in/first-attack、P8.8.4 Transport、VL09安定layout/follow、Source/fingering回帰の既存assertionは弱めない。skip/retry/timeout延長/snapshot強制更新なし。

## 7. 最終Gate / EXE

初回report-inclusive HEAD `34964e2d0566e4b45daa5b55a60fedf3de98b305`でfresh FULLを実行。Vitest3,670 PASS、Playwright173 PASS / 4 FAIL / 0 UNRUN。4件はP5.33既存testの操作手順が、detailsはSource/type変更・外側Start後も開いたままと仮定し、閉じた詳細内checkboxへ操作/role lookupしていたため。ROOT CAUSEは新しく承認されたdismiss契約に対する旧操作手順。実ユーザー操作でsummaryを再クリックするhelperを当該testに追加。disabled / eight chords × eight modifiers / 88-key geometry / playback継続assertionは維持し、type変更closeのassertionも追加。Product修正やassertion弱化で逃げない。初回FAILはPASS扱いにしない。

当該P5.33＋popover focused **12/12 PASS**（13.6秒）確認後、最終report-inclusive code HEAD `55aa6c67f30067dd69f91f6e6d662a14071ae61b` で `npm run test:full -- --fresh` を1回実行し、全Gate **PASS / 0 FAIL / 0 UNRUN**。FULLのPASS cacheは使用していない。修正後relevant Playwright **32/32 PASS**（33.9秒）、4解像度＋popover＋Range＋VL09/10/11/12＋P8.8.4。

| 最終Gate（tested HEAD `55aa6c67`） | 結果 |
|---|---|
| repository ESLint / class lint / source contracts | PASS |
| App / E2E TypeScript | PASS |
| phase-doc / AI-handoff / privacy-security | PASS |
| production build / gallery excluded | PASS |
| runner contracts | 27/27 PASS |
| Full Vitest | 3,670/3,670 PASS |
| repository-wide Playwright（accessibility / 4サイズ / Range含む） | 177/177 PASS |
| git diff check | PASS |

最終FULL wall time **285.1秒**、runner raw logs **28,323 B**。177予定 / 177実行 / 177 PASS、skip / unrun / failなし。初回4件の旧操作手順FAILからの修正後実測を上記に記録。最終FULLでも4サイズのPNG/geometryを再生成。

`npm run tauri build -- --no-bundle` **PASS**。Rust/Tauri release compile **56.77秒**。EXE: `src-tauri/target/release/loop-vault.exe`（24,708,608 B）。D-drive既存target/TEMPでno-bundle、fixture/gallery flagなし、インストーラーなし。実Vaultを起動/変更していない。

結果追記はdocumentation-only commit。tested code / EXE HEADは上記`55aa6c67`のまま、後続文書HEADと混同しない。追記文書にはphase-doc / AI-handoff / privacy / diff checkを別途実行し、すべてPASS。local masterは`73507e87`のまま、保存済みorigin/masterより689 ahead / 0 behind（fetchなし）。merge / push / tag / releaseなし。

## 8. 残る制約

- 次への動きは既存resolved Voicingと運指に基づく表示であり、新しい運指理論はない。
- 小画面・拡大表示はpage縦scrollと既存ellipsis/title/wrapを許容。current内部scroll/hiddenで情報を捨てない。
- 既存Source compatibility / availability / partial fallback、v2保存、session-only Range契約を維持。
- 実機Human Product Acceptanceは別途。master merge / push / tag / releaseは行わない。

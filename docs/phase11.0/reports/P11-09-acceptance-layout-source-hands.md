# P11-09 Human Acceptance — レイアウト / Source / 左右手 / 生成タイプ

## 状態・判断

**P11-09 = READY_FOR_HUMAN_PRODUCT_ACCEPTANCE**。最終tested code / EXE HEAD: `53682f69449f897796087a335a462bf16a8cd3b6`。結果追記はdocumentation-onlyで、後続文書HEADへFULL結果を流用しない。

P11-08までの機能を保持する専用candidate。base `8b6480b4`、branch `fix/phase11-acceptance-layout-source-hands`。master merge / push / tag / releaseなし。公開合成fixtureのみ。実Vault・private witnessは使用していない。

選んだこと: 保存音を変更せず、Source表示とpractice左右手、画面の高さ配分、生成タイプ操作だけを修正する。理由: 実音の保存/再生契約とUIの問題は別。別案: 固定音の再生成・低音threshold・overflow hiddenで隠す案は採用しない。

## 1. current chord panel

### ROOT CAUSE

P11-08のcurrent/next親 `lg:h-[clamp(380px,40dvh,440px)]` とgrid同高/current `lg:h-full` が1920で432pxを予約する一方、本文は上詰め。`flex-1`は本文全体にだけあり、手カードへ余りを配分していなかった。movementまでの内容366.516pxに対してpanel432px、末尾に65.484px残っていた。内部scrollは既に解消済みで、今回の空白原因ではない。

### 修正

viewport比例height、親h-full、無用なpercent-height依存を除去。現在panelは読みやすい内容のmin-height400px（領域600px以下は460px）、max-heightなし、overflow visible。手カードgridをflex-1とし、余りは左右の主役カードへ配分する。内容が増えれば自然に伸長しclipしない。左右の指24px、音名/構成音、badge、左右2列を保持。

次への動き54→68px、finger枠38→50px、finger label10→12px、movement10→11px、pitch9→11px。10枠1行、KEEP band、movement hints、推定、title/ariaを維持。domain計算は変更しない。旧45–55px expectationは今回の読みやすさ優先指示で更新した。

current/nextの並列はviewportのlg判定から**実際のcurrent/next領域900px以上**へ変更。900px未満はstack。右側は自然高＋stack時minimum360px。CSS zoom1.5では旧viewport判定のまま440px右列を予約すると現在領域が狭くなり、コード毎に45.563px高さが変わった。container条件で既存VL-09 geometry安定性を維持した。

| サイズ | panel client/scroll 前→後 | panel rect 前→後 | 手カード高 前→後 | movement高 前→後 | bottom unused 前→後 |
|---|---|---|---|---|---|
|1920×1080|430/430 → 398/398|432 → 400|128.047 → 134.531|54 → 68|65.484 → 13|
|1440×900|378/378 → 398/398|380 → 400|128.047 → 134.531|54 → 68|13.484 → 13|
|960×1032|378/378 → 398/398|379.516 → 400|128.047 → 134.531|54 → 68|13 → 13|
|768×640|378/378 → 398/398|379.516 → 400|128.047 → 134.531|54 → 68|13 → 13|

1920 panel top153、bottom585→553、last visible bottom519.516→540。padding12＋border1＝13pxが最後に残る。flex/grid computed値・rect・min/max・overflowを自動記録し、scrollHeight <= clientHeight、末尾12–14pxをassertする。保存した音/元MIDI/Custom、1-hand/2-hand、生成とSource/type変更後を検証。

## 2. Source表示

ROOT CAUSE: UIは固定の4選択肢を常に列挙し、effective SavedとSource snapshotの進行全体での同一性を比較していなかった。

`savedDuplicatesSource`は次をすべて要求する。

- Saved/Sourceが存在し、全event数・id・開始beat・durationが一致、両方のexplicit coverageが100%。
- Savedには既知のsavedSource provenance、Sourceにはsource-midi kind。Text policy markerや未知provenanceは重複扱いしない。
- playbackChoice GENERATEDではない。CUSTOMでもeffective explicit notesが元Sourceと全件一致すれば同じ音として整理する。保存intent自体は書き換えない。
- 各eventのMIDI note number multisetが完全一致（順序差のみ許容、octave差は異なる）。fallback/generated/欠落を同一扱いしない。

真の場合だけ保存した音buttonを省略し、旧Saved初期値/記憶済み選択をsession内Sourceへalias。元MIDI/Custom/自動生成は維持。1カードでも修正で実音が異なる場合は両buttonを保持する。Textは元Source coverageが無く、省略されず保存済みPreviewのexact pitchesを使う。Text style snapshotとmanual Customの既存区別は維持し、Customが実在する場合に利用可能。保存JSON/Vault v2は変更しない。

関係: `src/voicingPractice/sourcePreference.ts`、view source filter。actual Vault handoffで未修正→最後のカードCUSTOM補正の比較、Standard/Extended保存再読込、partial/missing/unknown/Generated/octave/timing等をテスト。

## 3. hand assignment

ROOT CAUSE: `fingeringDisplay.ts:handCandidates`はsource-midi/customだけを固定Voicingのbounded ordered partitionへ渡し、savedは左手空・全音右手の分岐へ落ちていた。`resolveMyVoicing`のnotesとbassNoteは正常にcloneされていた。`requiredBassContext`は主にgenerated rulesの説明であり、fixed snapshotのbassNote/notesを補う経路ではない。

|選択|resolved MIDI / bass|provenance / playbackChoice|旧hand経路|新経路|
|---|---|---|---|---|
|保存した音|effective explicitをexact clone|savedSourceを説明に保持、eventのintentを保持|全音右|既存bounded fixed partition|
|元MIDI|保存Sourceをexact clone|source-midi、保存intentを保持|bounded fixed partition|同じ|
|Custom|explicit overrideをexact clone|custom、保存intentを保持|bounded fixed partition|同じ|
|自動生成|identity/rulesから生成、explicit L/Rあり|generated family/rules|explicit assignment優先|同じ|

公開合成 `[48,67,70,74,75]`、bass48で修正前Saved左なし/右5音、Sourceは左48/右67,70,74,75。修正後Saved/Source/Custom同じpartition。指のrankは同じhand targetsを`rankFingeringsForHand`→`rankCyclicFingerings`へ渡す。音は一切変更しない。

低音pitch thresholdを追加せず、既存のbass penalty・span/fingerability・隣接movement・個人運指を再利用。rootless、slash bass、正当な1手/2手、generated fallbackのexplicit L/Rを検証。Source切替で音名/指/構成音が完全一致し、snapshot原本不変。修正前Unit reproducerは3 FAIL/21 PASS、修正後PASS。

## 4. page vertical overflow

### ROOT CAUSE / 計測

実際にoverflowしていたのはdocument根ではなく、固定shell内の**Voicing Loop workspace scroll container**。修正前からhtml/bodyのclientHeight=scrollHeight=1080、mainも988/988。main padding上下8px、usable workspace972px。current/next432＋controls46＋timeline148＋keyboard234＋transport92＋safe-area16＋gap35＝1003pxで**31px超過**。content bottom1103、workspace bottom1072。MIDI row bottom1077はwindow1080内でもworkspaceの可視bottomを5px越えていた。

`useReserveBottomSpace`はtoast stackの回避用であり、ここへpadding/heightを追加していない。二重の92px Transport予約は存在しない。shell/global CSSやTransport/keyboardサイズは変更せず、current親の不要32pxを除去した。

|サイズ|usable workspace高|scrollHeight 前→後|content bottom 前→後|overflow px 前→後|MIDI row bottom 前→後|
|---|---:|---:|---:|---:|---:|
|1920×1080|972|1003 → 972|1103 → 1071|31 → 0|1077 → 1045|
|1440×900|792|933 → 953|1033 → 1053|141 → 161|1007 → 1027|
|960×1032|866|1359 → 1380|1517.203 → 1537.688|493 → 514|1491.203 → 1511.688|
|768×640|474|1315 → 1336|1473.203 → 1493.688|841 → 862|1447.203 → 1467.688|

1920は全領域/footerが可視、root/main/workspace全て縦超過なし。1440は読みやすい手/68px movementを保持すると内容953pxに対し792pxで161px足りないため自然scrollを許容。1920のpanel末尾空白を減らす一方、1440以下ではmovementを縮めて帳尻を合わせない。960/768はstackの自然scroll、横overflowなし。既存scroll-containerだけを使い、新たな内部scrollやoverflow hiddenを追加しない。

## 5. 生成タイプselector

### 調査結果と限界

旧controlはnative selectで、JSのtrigger/open/menu stateやaria-expanded/haspopupは無かった。disabled条件は!lessonRulesSelectedで保存/Source/Custom時のみ。自動生成選択のChromium計測ではdisabled=false、elementFromPointはSELECT自身、pointer-events:auto、クリック→ArrowDown→EnterでCoreへ進んだ。details capture pointerdownは自身の外ならdetails.open=falseだけで、preventDefault/stopPropagationは無い。**クリック不達・同一eventによる即closeは再現されなかった。Windows WebView/native popupが開かなかった直接原因は確定できていない。** 警告やnative実装だけを根拠に原因を捏造しない。

### 対応

この1controlのみ製品DOM内の`GeneratedTypeSelector`へ置換し、native popupへの依存を取り除く。既存基本/骨組み・advanced表示・disabled条件、onChangeのVoicing再解決は同じ。combobox triggerとlistbox/options、explicit open、pointer outside dismiss、selected label、focus復帰、Enter/Space/Arrow/Home/End/Escを定義する。

selector openは詳しい設定を閉じる。details triggerへのpointerはselectorのみclose、Source/type変更でclose/reopen可能。Esc captureはselectorを閉じpreventDefault/stopPropagation、transportのdocument keyboardはcombobox/listboxを除外しRangeのpending Aを維持する。capture listenerが同じtrigger eventを即閉じしないことを実clickでassertする。

旧selectOption/toHaveValueのtest操作だけをclick→option / value attributeへ更新。disabled、selected type、rule、候補・modifiers・88鍵・演奏のassertionは維持。旧native ArrowDown即選択から、menu open→ArrowDown→Enterという明示選択のkeyboard testへ移行。skip/retry/timeout延長/snapshot更新なし。

## 6. Gate / screenshots / EXE

- Focused Unit: 123/123 PASS（5 files、12.36秒）。
- FEATURE fresh: 145 Vitest / 11 Playwright PASS、static checks PASS、51.0秒、cacheなし。
- Selector/Source/P5.30–33 focused: 21/21 PASS（18.7秒）。初回9 FAILは旧native control assertion5件＋新testのinnerText/textContent差3件＋Coreの既存名称Family Coreとの差1件。該当操作/assertion API・正しい既存名称へ修正し、製品挙動を弱めない。
- 4解像度geometry＋Range/NextMove/VL09–12/P8.8.4 relevant UI: 40/40 PASS（31.2秒）。
- Fresh FULLとEXE: 最終report-inclusive code HEADの実測は§8。初回候補と最終候補を区別し、未実行をPASSと記録しない。

公開fixtureのPNG/JSONはGit外`test-results/p11-09-geometry/`と`test-results/p11-current-panel/`。closed/open/source-change/current-panel/workspace、selector openを4サイズで取得。1440/768の現在パネルと1920全画面を目視確認し、全10指/音/左右card/補足情報が可視。原本baselineはGit外local評価領域。

### 最終レビューで検出したfocus境界

最初のreport-inclusive HEAD `16c688ee41ac6044d00a9094b370f203157345e2`でfresh FULLは3,687 Vitest / 185 Playwright PASS（284.4秒、raw28,373B）、EXE release build55.74秒PASS。ただしその後の最終code reviewでgeneratedの詳細形→基本のfocus境界を追加検証し、1件FAILを再現した。既存FULLのPASSを新しいcode HEADへ流用しない。

原因はselectorのReact keyがselectionそのもので、basic-shell→basic-full時にtrigger DOMが再mountされ、選択時に戻したfocusも失われたこと。Generated内では同じkeyを維持し、固定Source/Generatedの境界のみkeyを切り替える1行修正。Source変更のoutside close/key resetは保持する。追加testは詳細形→基本→focus→Space open→Esc focusを実ユーザー操作で保証する。これは新たに確認した製品DOMのfocus問題であり、旧native popup不具合の原因と混同しない。

修正後のview Unit 69/69、Source/selector/details browser 8/8 PASS（6.6秒）。最終report-inclusive HEADへfresh FULLを1回、EXEを再生成する。上記初回成果物は最終成果物として扱わない。

## 7. remaining limitations

- 旧native selectorのWindows固有の直接原因は未確定。新DOM selectorの自動testとEXEは実機Human Acceptanceに渡す。
- 1440以下・Windows scalingでは自然縦scrollを許容。400/460pxは固定上限ではなく内容のminimumで、隠蔽はしない。幅900/600pxは実際の領域判定。
- Saved dedupは完全/既知provenance時だけ。UNKNOWN/partialは保守的に両項目を保持。
- 元MIDI compatibility・partial fallback・Text style provenance・manual/custom fixed pitches、Vault v2/Core default、session-only Rangeの契約は変更しない。
- master merge/push/tag/releaseなし。このstageで停止する。

## 8. 最終実測Gate / runnable EXE

最終report-inclusive code HEAD `53682f69449f897796087a335a462bf16a8cd3b6`で `npm run test:full -- --fresh` を1回実行。**FULL PASS / 0 FAIL / 0 UNRUN**。PASS cache未使用。初回candidate `16c688ee` の検証結果とは区別する。

| Gate | 最終結果 |
|---|---|
| repository ESLint / class lint / source contracts | PASS |
| App / E2E TypeScript | PASS |
| phase-doc / AI-handoff validation | PASS |
| privacy/security scan | PASS |
| production build / gallery excluded | PASS |
| runner contracts | 27/27 PASS |
| Full Vitest | **3,687/3,687 PASS** |
| repository-wide Playwright（accessibility / Range / 4サイズ含む） | **186/186 PASS** |
| git diff check | PASS |

FULL wall time **243.2秒**、raw logs **28,368 B**。Playwright186予定/186実行、skip/fail/unrunなし。4サイズ画像/geometryは最終FULLでも再生成。1920はroot/main/workspace/client=scroll、panel末尾13px、desktop内部scrollなし。1440の自然scroll161pxは上記可読性制約により維持。

`npm run tauri build -- --no-bundle` **PASS**。最終code HEAD同一、Rust/Tauri release compile **42.16秒**。runnable EXE: `src-tauri/target/release/loop-vault.exe`（24,712,704 B）、PE MZ header確認。D-drive既存target/TEMPのみ、fixture/gallery flagなし、インストーラーなし。EXEを自動起動せず実Vaultを変更していない。

local masterはbase `8b6480b4`のまま。保存済みorigin/masterとの比較708 ahead/0 behind（fetchなし）。既存worktreeを再使用し、新しいcheckoutを増やしていない。master merge / push / tag / releaseなし。結果追記はdocumentation-only。phase-doc/AI-handoff/privacy/diffの軽量確認PASS、文書commitで停止。

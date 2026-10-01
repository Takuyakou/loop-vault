# Phase 11 Human Product Acceptance Fix — Range / Current Panel

## 状態

実装済み、最終fresh FULL / 更新EXEはPENDING。P11-00〜06の結果は歴史的な検証HEADのまま保持する。今回の検証HEADは最終Gate後に追記する。master未merge。

## 1. SpaceのROOT CAUSEと再現

`ProgressionVoicingPracticeView`のdocument keydownは、button / role=button focus下ではSpaceをTransport shortcutにしない。これはnative activation保護として正しい。一方、cardのmousedownはpreventDefaultでfocusを移さず、contextmenuもfocusを更新しなかった。先にcardやSource等へfocusがあると、A–B確定後もそのfocusを保持し、Spaceはcard試聴・通常button操作へ流れた。ready状態のrange設定は成功しており、scheduler/count-inの失敗ではない。

変更前ブラウザで「cardへfocus→別card右クリック2回→Space→一時停止buttonが現れない」を再現。Startにfocusした条件ではStart自身のnative activationにより成功し、focus依存も確認した。keydown shortcutのみで、独自keyup再生経路はない。

## 2. 修正 / 状態遷移

- Range指定は既存`markRangeCard`へ集約し、focusをtimeline viewportへ`preventScroll`付きで移す。SpaceとStart/Pause/Resume buttonは共通`togglePlayback`から既存start/pause/resumeへ進む。inputs/dialogs/native buttonsのSpace guardは維持。
- keyboard contextmenu重複抑止は維持。focus移動後に残る抑止tokenを実mouse右buttonのmousedownでクリアし、次の正当な右クリックを抑止しない。
- お手本音の直後に常設`区間解除`。rangeなし/pendingなしだけdisabled。pendingのみ、activeのみ、active+新pendingはenabled。
- 解除は既存`clearRange`。表示上のA/B/pending/chip/highlightをクリアし、Transportは既存`setLoopBounds(undefined)`で現コード終端に全体へ戻る。境界callbackでrange countをリセット。原本snapshot/notesは変更しない。

## 3. Timeline右クリックのbeat→card仕様

`timelineNavigation.ts:timelineBeatAtPointer`がglobal quarter-note beatへ変換する。

- ruler: `(clientX - viewportLeft + scrollLeft) / pixelsPerBeat`。
- overview: `(clientX - overviewRect.left) / overviewRect.width * lengthBeats`。スクロール済みrectを使うためscrollLeftを二重加算しない。
- 0〜lengthBeatsへclamp。invalid/zero geometryは無操作。
- 既存`chordIndexAtTimelineBeat`で包含cardへsnap。境界は次card、休符内は次card、末尾休符/右端は最終card。自由時刻のRangeは生成しない。
- 1回目pending、2回目正規化A–B、Shiftは即one-card、旧active+新pending、Escはpendingのみ取消という既存操作へ合流。
- contextmenu抑止は対象card/overview/rulerだけ。既存左click seek/follow/scroll/▶試聴のhandlerは変更しない。

## 4. Current panel scrollbarのROOT CAUSE

変更前DOM実測（public generated fixture、border 1px / padding 12px、max-height none）:

| viewport | panel CSS height | 本文 clientHeight | 本文 scrollHeight | overflow-y |
|---|---:|---:|---:|---|
| 1920×1080 | 380 | 278 | 292 | auto |
| 1440×900 | 324 | 222 | 292 | auto |
| 960×1032 | 367.516 | 266 | 292 | auto |
| 768×640 | 276 | 174 | 311 | auto |

`h-full / min-h-0 / flex-1 overflow-y-auto`本文と、68px＋margin8pxのNext Move固定rowが固定高さを分割していた。余剰scrollは内容をhiddenで隠したものではなく、この高さ競合による。

## 5. Current panel変更

添付HTMLモックを当該panelのvisual specとして適用。View compositionの`<NextMovePreview>`呼出と不要な表示用計算bindingだけを外した。`nextMove.ts`、`computeNextMoves`、`NextMovePreview` componentと単体テストは保持。

大きなコード名、Source badge、編集button、左右hand factsは保持。左右cardを均等2列、指ラベル列3remへ整理。補足情報は既存stripにまとめ、Ruleはellipsis＋全文title、他情報はwrapを許す。本文overflow-y:autoとouter hiddenを除去。desktopの元サイズは維持し、小画面は当該current/next親の固定2段高さを内容に合わせて伸長可能にした（next panelの内容/機能は変更なし）。page scrollは許容し、情報をclipしない。

## 6. 4解像度の画面 / 実測

| viewport | 修正後panel clientHeight / scrollHeight | 内部scroll | 左右card |
|---|---:|---|---|
| 1920×1080 | 378 / 378 | なし | 2列 |
| 1440×900 | 322 / 322 | なし | 2列 |
| 960×1032 | 344 / 344 | なし | 2列 |
| 768×640 | 316 / 316 | なし | 2列 |

`test-results/p11-current-panel/`に4サイズのpanel/full workspace PNGとgeometry JSON。公開合成データのみ、Git管理外。1440/768画像を確認し、コード名→左右card→補足stripの優先順位を維持。horizontal overflow増加なし、panel内serious/critical axe違反なし。

## 7. 追加テスト / 回帰

- View: rangeなし/A–B/one-cardのSpace start/pause/resume/Stop→A、count-in1、focus解放/native guard、常設clearのpending/active/full復帰/count reset、scroll座標ruler/overview snap、逆順/旧range/Esc/左seek、保存snapshot不変。
- navigation: first/last/2-beat card、scroll offset、clamp、invalid geometry、3/4・4/4・5/4。
- 既存Range clock: 4/4 beat1/3、3/4、5/4、startのみcount-in、wrap、original meter phase。
- 既存Transport: 先頭attack1回、B→A、自然な境界clear、stale generation、保存音/元MIDI/Custom、count-in0/1/2。
- Browser: 実contextmenu後Space、keyboard Shift+F10/Menu、ruler/overview first/last、reverse、Shift、pending/Esc/clear、first active card。旧Next Move表示を要求するUI testは承認済み新UIへ更新し、domain/standalone component testsは削除しない。
- focused Unit/Integration: 148/148 PASS。relevant Playwright（Range/current panel/VL10/11/12/P8.8.4）: 26/26 PASS。

## 8. 最終Gate / EXE

PENDING — report-inclusive code HEADでfresh FULLを1回実行、更新runnable EXEをD-driveで生成して追記する。

## 9. 残る制約

- Rangeはsession-only、v2 Transportのseek対応経路で有効。private Vault/MIDIは使用しない。
- range解除の実再生切替はコード境界まで待つ。pending取り消しだけのEscは旧rangeを保持する。
- focusを別のnative button/inputへユーザーが移した場合、そのSpaceはnative操作を優先する。
- 小画面や長い情報ではpage縦scroll/strip wrap、既存note/finger ellipsis＋titleを許容。内部scrollを隠して情報を捨てない。
- master merge / push / tag / releaseなし。実機Human Product Acceptanceは別途。

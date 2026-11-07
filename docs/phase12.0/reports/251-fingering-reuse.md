<!-- phase-id: 12.0 -->
# 通常 Dojo / 2-5-1 Master — production運指再利用

2026-10-05のユーザー追加要件を反映。旧「Phase12では運指を出さない」を契約・作業指示から更新した。表示条件は [251-master-amendment](../contracts/251-master-amendment.md)。

Voicing Loopが実際に使う `assignPracticeHandsAcrossProgression`、`rankPracticeHandFingerings`、共有ranker mode（現行default E1-T）と `eRankerCostModel` / fingering preferencesを再利用。新しい運指アルゴリズムは作っていない。実装のadapterは既存rankerへの入力と出力投影のみ。通常の表示target・Master canonicalのMIDI番号、octave、LH/RHを変更せず、judgeや保存に指番号を混ぜない。

通常のSee / Hint / 回答、Master Learn / Wrong / Hintで表示する。独立RecallとTempo / Mixedでは非表示。Masterの最初のHintから指番号を出す追加要件は位置のヒントにもなるため、そのattemptはMASTERに数えず同セルを再試行する。Ready / pause / return / 次問題へ前の番号を持ち越さない。通常Tempoは手動で答えを見ても番号なし。

実画面の初回ブラウザ検証で、単和音targetの `chords` が空であることとDojo用PianoKey分岐が従来の `fingerLabels` を描いていないことを検出。単和音は正確なtarget.notesを渡し、PianoKeyの既存表示を共通componentへ抽出して修正した。従来defaultの指番号座標・色は維持。黒鍵のDojo回答円と数字が重ならない位置を使用する。

検証: keyboard既存12 + 追加2、adapter3 = 17/17 PASS。全144教材についてE1-Tの指番号・手・MIDI番号一致を確認。FAST 58/58、FEATURE unit67 / Node27 / browser39 PASS（ログ `2026-10-05T04-25-55-431Z-feature.log`）。focused追加browser13/13 PASS。初回browserの実装起因4FAILは上記修正後に解消し、期待値緩和やbaseline更新なし。

表示証跡: `p12-generated/master251/screens/` 4サイズ×8状態=32枚、`normal-fingers/` 4サイズ×4状態=16枚。manifestはanswerMarkers・fingerLabelsを記録、Recall / Tempo / Readyへ表示漏れ0、外側container横overflow0。既存の鍵盤内部横スクロールは幅の狭い表示でも保持する。Learn / first Hint / 通常Seeの画像を実際に表示して確認した。まとめて `p12-generated/master251/review.html` で確認できる。

この変更はP12修正済みbranchを継承する `feat/p12-251-master` に一度だけ加えている。旧P12worktreeや旧レビューEXEは保持し、通常機能の運指追加も新しいMaster候補EXEに入る。最終fresh FULL / EXE / 人間受入は最終報告で確定する。

## 最終UIゲートでの意図した画面更新

`test:ui` 初回は34 PASS / 1 FAIL。`visual.spec.ts` の旧通常ホーム画像がSPECIAL入口追加を含んでいなかった。expected / actual / diffを実際に表示し、差分1868 pixelsは下部の旧自選リンクと新SPECIALカードの置換位置だけで、他のホーム内容に変化なしと確認。仕様で明示された入口のため `practice-chromium-desktop-win32.png` 1枚だけを限定更新した（Vault/detail画像は変更なし）。focused同一テスト1/1 PASS。これは最終UI/FULLを通すための許容値緩和ではなく、新機能の期待画像の更新。最終ゲートはこの確定版で再実行する。

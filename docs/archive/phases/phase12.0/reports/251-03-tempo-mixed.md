<!-- phase-id: 12.0 -->
# 251-03 — Tempo / Mixed

最初のii完成NoteOnをテンポ原点とする。Recallを先に計測し、その原点からii / V / I各2拍と最後2拍restを固定する。BPM80が最終。ladderは60開始・70・80へ上昇、失敗時50/40まで下降。MASTER review中は80を保持。2拍枠の外にsettle完了が来る演奏は失敗として固定した。

Toneの同じaudio contextを使う拍クリックを追加。既存global transport / analyzer / Voicing Loopを変更しない。拍の8個表示はii原点から計算し、restも表示。metronomeの共通ON/OFFを読む。stop / pause / disconnect /次問 / unmountでclockとsynthをdispose。clock lifecycle unit PASS。

Mixedは48セル弱点順と同順位seed shuffleでForm/Keyを変える。record property orderを正規化し、同seedが同順位選択になる。Learnの答えを見た成功はguided（usedHint）として記録し、独立Recall分布・MASTERへ数えない。

## 検証

Master domain18 + clock1を含むFAST133 / Node27 PASS、FEATURE142 / Node27 / Playwright35 PASS。ログは251-02報告と同じ最終統合ゲート。80BPM実ブラウザ2拍×3和音+2拍休み、Mixed複数Form/Key、実reload、通常練習を行ってもMaster記録を保持することを確認。

初回FEATUREは新E2E名のowner未割当で安全側に全体へ拡張した。Vitest3821 PASS、Playwright264 PASS / Mixed1 FAIL。Mixedの短いfeedback表示を取り逃したテストを保存済み成功判定へ直してfocused1 PASS。owner登録を追加し、最終統合35/35 PASS。baseline変更・skip・retry追加はしていない。最終fresh FULLは運指のユーザー追加要件を反映した後に実施する。

Source audit144/144は保持。Raw MIDI/hash/local-onlyをcommitしない。`p12-generated/master251/privacy-local-scan.json` は原入力checksum4/4一致・Git漏洩0（checksum自体は記載しない）。

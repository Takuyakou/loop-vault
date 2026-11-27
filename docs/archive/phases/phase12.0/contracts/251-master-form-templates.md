<!-- phase-id: 12.0 -->

# Master Form両手教材テンプレート

2026-10-07の最新ユーザー指示を正とする。以前のLH限定・RH不変・B/D左手53候補を撤回し、Master両手をFormごとの固定教材パターンにする。通常Voicing Loop/通常Dojoの汎用solver、重み、候補、個人運指は変更しない。

低音から高音へ、ii / V / I順：

| Form | LH | RH |
| --- | --- | --- |
| A | 5 → 1 → 5 | 1235 → 1235 → 1235 |
| B | 51 → 52 → 51 | 125 → 125 → 125 |
| C | 1 → 5 → 1 | 1235 → 1235 → 1235 |
| D | 52 → 51 → 52 | 125 → 125 → 125 |

teaching-templates.jsonのdefaultTemplates＋数値pitch class 0〜11のperKeyOverridesで持つ。現行overrideは0。特定キーで明確な幅・交差・著しい黒鍵不自然・演奏困難が必要と判断された場合だけ人間レビューが必須。solverとの差や高い汎用cost、黒鍵があるという理由だけではoverrideしない。代案A/C RH1245、B/D RH135、B全51などはmetadataだけ。学習UIはcanonical一組だけを表示する。

実装調整前にp12-generated/master-form-templates/preimplementation.html/json/csvを保存。48cell・96register projectionsで両手の実音/octave・黒白鍵・span・指順/交差・thumb/5th・iiVI移動・共通音・80BPM2拍を監査。A/C RH1235、B/D RH125は全12キーで構造条件を満たす。左右とも最大span11半音、手交差なし、candidateに存在、同時指重複なし。親から最新版両手の独立preaudit構造PASS・override根拠なしを受領した。

身体実演奏は未確認。B RH2→5間7半音/LH10〜11半音span、Dの狭いLH52、両手黒鍵1/5、B V→IとD ii→Vの共通LH L2→L1替指を人間が確認する。proxyは生体力学的な距離/危険閾値ではない。特定キーだけの例外根拠は今回得ていない。

canonical.jsonの音・octave・referenceHands・Form/Key/BPM/2拍＋2拍休みは変更しない。原音域と1オクターブ下は同一運指を対応位置に表示する。exact MIDI targets、採点、scheduler、保存、音声、release gateを変更しない。指番号は採点に使わない。

canonical-fingering.jsonのprofileVersion2は両手テンプレート由来を明示し、新fingerprintを持つ。旧汎用context/fingerprintをgenericBaselineへ保持する。verifyMasterFingeringsは両手canonicalを検証し、verifyGenericMasterFingeringsは実sequence solver全48出力の旧fingerprintを別に検証する。過去監査の結果を書き換えず、単音候補1〜5・3event call-through・negative controlsを保持する。

Learn/Seeの大譜表・鍵盤で両手canonical、Recall/Tempo/Mixedでは非表示、明示Hint/確定Wrongで現在targetを再表示する。実MIDIの使用指は取得・推測しない。

技術検証を最終候補で実行し、身体/実音/製品識別子による移行・再起動/OS倍率の人間受入れと分ける。Phase12 in-progress、人間受入れ待ち、merge/pushなし。

実行範囲の補足: 実装前監査の実評価は原音域48セル。96 register projectionsは−12を含む数学的投影で、−12を実行済みとして数えない。最終source 7aef92ac699820bb9444c73bd1857a5d6f7820baのregister-confirmation.jsonは実ループから48セル/96音域/288コードを算出して確認。独立レビューのCSV P2は実改行再生成＋parser49物理行/11列/全内容一致で修正。身体/実音承認は未実施。

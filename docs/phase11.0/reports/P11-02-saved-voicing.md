# P11-02 — 保存した音とText Previewの永続化

## 結論

Human Gateの承認を受け、`保存した音` の独立したsession選択を追加した。Standard / Extended Textは保存時のPreview実音をVault v2の`practiceVoicingOverride`へ保持し、再読込後のカード試聴とVoicing Loopが同じMIDI note numberを使う。Source MIDIを捏造せず、Vault schemaは変更していない。

## 選んだこと / 理由 / 別案

- **選んだこと:** Text Preview由来のsnapshotを`text-style-v1:` markerで保存する。**理由:** 現行コードのprovenanceを使い、保存音を生成し直した結果と比較しない。**別案:** 現行Generatorの音との比較は将来のGenerator変更で保存データの分類を変えてしまう。
- **選んだこと:** GENERATED intentだけのカードを`保存した音`には含めない。**理由:** 現在保存されているexplicit notesがない。**別案:** Generatedを保存音と呼ぶとSource/Customとの意味が崩れる。
- **選んだこと:** Text styleは`カスタム`から除外する。**理由:** Text Previewの選択は人がMIDI実音を手入力したCustomとは異なる。P10 manual correctionは別途Customとして扱う。**別案:** `source: manual`だけで分類するとText styleもCustomへ混入する。

## 実装と確認

- Standard Textでは、選択済みstyle/live overrideを維持し、明示snapshotのないカードには実際のText Preview既定音を保存する。
- Extended Textでは、実際のPreviewと共通の`voiceTextChordForAudition`による音を保存する。既存のattack/hold/restタイミングは変えない。
- Vault v2 readerと既存snapshot妥当性検査を通し、音番号一致をStandard/Extended双方で確認した。
- `CUSTOM` / `SOURCE` / `GENERATED` / legacy missing choiceは共有resolverの現行precedenceを維持。保存済みexplicit notesだけが`保存した音`へ入る。
- Text originはrepoで確認した実際の`text-style-v1:` markerを使用。旧提案の`text-style:`表記は採用しない。`r`n- 追加監査でVoicing Loop内のカード▶が旧legacy順序でText保存音を飛ばす経路を確認し、saved planを優先するよう修正。専用4/4テストPASS。

## Gate

- Verified code commit: `5d7089c2a92c2b0ae962947a51f3aa0d3aef35ea`。

- Focused Standard/Extended/Vault/Voicing Loop: 追加round-tripテストを含め PASS。
- TypeScriptと変更ファイルESLint: PASS。
- Text関連のfocused Playwright: 10/10 PASS。
- fresh FAST: PASS、Vitest 3640/3640、Playwright 161/161、251.0秒。PASS cache 不使用。

## 残る作業

- P11-03でX/Nの明示AUTO fallbackを追加する。
- P11-04で新しい保存音選択を含む4ソースのheader UIへ移す。
- P11-05でコード名変更後のmanual/custom保存音の扱いを修正する。

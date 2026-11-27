# P11-05 — Playback Resolver Consistency

## ROOT CAUSE

1. `progressionEditing/voicingIdentity.ts:compatibleVoicingMemory`はrename時、captured identityの不一致だけでmanual/live overrideを削除していた。さらに残存memoryからplaybackChoiceを落としていた。
2. `voicing/resolveVoicing.ts:resolveVoicingForUse`とpractice snapshotのCustom選択は、残っているmanual/live音も同じidentity条件でGeneratedへ置換していた。
3. Text origin分類は保存markerがある場合でも現在のidentity一致を要求していた。

## 選んだこと / 理由 / 別案

- 選んだこと: `isUsablePracticeVoicing`で有効なmanual/live explicit音をidentity変更後も保持する。編集・共通resolver・Custom snapshotで同じ判定を使う。
- 理由: 人間が保存した音はコード名から生成し直す対象ではない。
- 別案: snapshotのcaptured identityを新しい名前へ書き換える方法は、元provenanceを失うため不採用。

Text originは実保存marker `text-style-v1:`とsnapshotの有効性で分類し、現在のgeneratorや現在のコード名に依存させない。Text保存音は保存した音に分類し、Customへ混入させない。

Source MIDIは従来のidentity互換性チェックを維持する。invalid snapshotも拒否。明示GENERATEDは常に優先。編集のplaybackChoiceを保持。Vault fileVersion 2、provenanceフィールド、Analyzerには変更なし。

## Gate / regressions

focused resolver/snapshot/editing 369/369 PASS。追加v2 roundtripを含む共有再生・移調/export regression 356/356 PASS。

manual/liveそれぞれについてrename→v2 save/reload→card audition/Capture/Whole/保存した音/Custom/exportのexact notesを確認。単独/一括renameとUndo、Text origin分類、GENERATED優先、Source stale拒否、invalid human snapshot拒否を検証。App TypeScript・changed ESLint PASS。FASTと最終FULLは別途execution-state/最終報告に記録する。

## 影響と制約

手入力音がコード名に合わない場合も人間の音を再生する。コードidentityから導くdegree表示は現在名の解釈であり、保存音のpitchを変更しない。古いデータですでに削除されたoverrideを復元する機能は追加しない。新規Text intakeの厳密なsave-safe validationは維持する。

Fresh FAST: Vitest 3654/3654 PASS、62.2秒、PASS cache不使用。Mixはmanual音保持と非human stale拒否の両方を確認（26/26）。phase-doc/privacy/diff-check PASS。

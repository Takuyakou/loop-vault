<!-- phase-id: 12.0 -->
# 251-04 P1 — 無効候補の時刻残留修正

独立レビューでd4ddf93dのMaster機能受入れは不合格。settle前の全離鍵後もfirstExactOnが残り、supersetで時刻を記録していた。前候補のMaster速度・テンポ受入れを取り下げた。

修正は共有HeldChordSettlerの候補時刻のみ。物理集合が変化したら、現在exactを作るNoteOnでのみ時刻を設定し、それ以外は破棄。全離鍵・不足・余音の候補に古い時刻を持ち越さない。NoteOffのみで余音を除くiiは完成NoteOnがないため、既存engineの「最初の和音をもう一度」でFAIL/retry。NoteOff時刻をNoteOnとして偽装せず、以前のNoteOnへ成功をさかのぼらせない。V/Iのheld-set合否・共通音holdは維持。[契約補足](../contracts/251-master-amendment.md)。

再現を先に追加し修正前18 PASS / 新規6 FAIL。修正後Master24 + 通常Dojo15 = 39 PASS。100ms exact→120ms全離鍵→10000ms再押鍵はRecall10s・Tempo起点10000ms。iiの2拍が新しい起点から始まり、10sのattemptは80BPM成功でもMASTER資格なし。superset100ms→extra NoteOff500msのgeneric settlerはcompletedOn未定義、旧100msを返さない。settle中のextra・partial再押鍵・NoteOff-only iiも検証。

production全参照を確認: この共有settlerの現在のproduction consumerはMaster engineのみ。通常Dojoは既存ChordEntry等を保持し変更0。通常Dojoの15unitと集約回帰を実行する。運指/視覚の独立レビューは合格済みで変更しない。

FAST: unit61 / Master browser12 PASS、89.3s、ログ2026-10-05T05-24-07-676Z-fast.log。最初のFEATUREはunit70 PASSだが、実行中のhandoff文書更新でTest DXの入力固定guardに失敗し、ゲートPASSとして扱わない。文書を含む候補を固定して再実行する。

FEATURE / UI / final fresh FULL / native保存 / 新EXEは、確定候補の最終報告で更新する。ユーザーデータの遡及消去・補正はしない。旧候補でこの入力をしたMaster記録は自動的に正しいと再承認せず、識別不能なため受入時の再確認事項として残す。merge/pushなし。

確定製品source `bb186dfbefb588fa287f254c55be9c9f6ec1eae6`。再FEATURE70/38、UI35、fresh FULL3834/272/27、native12、新EXE PASS。測定値とEXE hash・人間待ちは [更新済み最終報告](251-04-final-acceptance.md) を参照。独立P1再レビューは未実施。

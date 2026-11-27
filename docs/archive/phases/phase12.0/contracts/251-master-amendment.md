<!-- phase-id: 12.0 -->
# 2-5-1 Master v0.2 — 運指追加（2026-10-05）

ユーザーの明示変更をv0.2へ追加する。Chord DojoはVoicing Loop productionの手割当・運指生成・鍵盤表示を再利用する。独自アルゴリズム・rankerを作らない。表示voicingのMIDI番号を移調/再生成せず、教材のLH/RH metadataをMasterのおすすめ手割当として保持する。実際の使用指・演奏した手はMIDIから得られないため、合否判定に含めない。

|場面|通常Chord Dojo|2-5-1 Master|
|---|---|---|
|見て弾く / Learn|おすすめ運指表示|表示|
|答えを覚える|表示|Learn内で表示|
|答えなし② / Recall|非表示|非表示|
|進行② 覚えて弾く|非表示|Recall内で非表示|
|Hint / 回答 / Wrong|現在の回答voicingで表示|表示。最初のHintから指番号を表示（ユーザー追加要件）|
|通常③ / Master Tempo / Mixedの演奏|非表示|非表示（Wrong/Hintの回答場面を除く）|
|Ready / pause / return / next problem|対象外の番号を残さない|全て消す|
|構成の音名だけの自由な練習|固定voicingを要求しないため指番号なし|該当なし|

Masterの段階Hintは名前→音名→鍵盤→お手本を保持するが、追加要件によりおすすめ指番号は最初のHintから鍵盤上に表示する。従って位置の情報もヒントになる。使用attemptはMASTERに数えず、同セルの独立retryへ進む。無補助Recall/Tempo/Mixedへ番号が漏れないことを自動検証する。

production実態: `assignPracticeHandsAcrossProgression` → `rankPracticeHandFingerings`、現行default E1-Tは `eRankerCostModel`（同じ共有modeを読む）。表示は既存 `PracticeKeyboard` → `PianoKeyboardVisualizer` の `fingerLabels`。推奨のみで、通常・Masterのjudge / store schema / Vaultを運指のために変更しない。

## P1修正: ii完成時刻の有効性

Recall End / Tempo起点は、余音なしexact physical集合を初めて成立させた最後の必要NoteOn。settle待ち60msを加えない。settle前の全離鍵・不足・余音で候補が無効になったら、その候補の時刻も破棄する。再押鍵でexactを成立させた新しいNoteOnを使う。必要音+余音はexactではない。余音のNoteOffだけでexactに直した場合は新しいNoteOnが存在しないため、iiのRecall/Tempo成功へさかのぼって使わず再押鍵を求める。進行内V/Iの共通音holdとphysical setの合否判定は保持する。

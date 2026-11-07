<!-- phase-id: 12.0 -->
# 2-5-1 Master — 原音域と1オクターブ下

2026-10-06のユーザー追加依頼。対象はMasterのみ、既存の学習/復習/Mixed・exact順序・Recall境界・Hint/Tempo/離鍵・保存安全を保持。merge/pushなし。

## 音域と表示

Masterのコンパクトな音域selectに「原音域」「1オクターブ下」を表示。選択を保存し、HomeのForm/MASTER数と次回開始に反映する。初回・旧記録は原音域。

canonical.json/canonical-fingering.jsonを変更せず、原音域は元targetを使用、低音域は左右両手の全MIDI noteを厳密に-12する別target layer。degree/symbol/Form/Key/BPM/2拍+2拍休みは同じ。両手の割当/指番号も元の位置から-12移動し、独自solver/再最適化は作らない。全144低音域の実note範囲33〜77（MIDI0〜127内）を確認し、鍵盤表示は24〜84、原音域36〜96、両方128px/下端8pxを保持。

engineの同じtransposed targetを譜面snapshot/鍵盤/音名/カードと進行試聴/exact MIDI判定/結果へ使う。原音域の入力は低音域の正解ではない。譜面は音域ごとの全144固定viewportでii/V/I/Hint/非表示/試聴/保持中の倍率・枠・位置を固定し、全音符/臨時記号/指番号をクリップしない。通常Dojo/Voicing LoopのtargetやGrandStaff既定を変更しない。

## 音域別の成績と再開

元のMaster version1のcells/practice/session/lastSessionAtは原音域の記録として元の位置に保持。optional selectedRangeとoctaveDown（version1の独立cells/practice/session/lastSessionAt）を追加。元MASTER/Recall/tempo/履歴/資格/学習カーソルを低音域へコピーせず、空48セルから開始。低音域でも全4Form exact12キー順・見て弾く→独立Recall・復習learned scope/弱点/tie優先・Mixedを適用。各音域/各Formの学習段階と位置を独立保存。

切替は未完了の演奏を記録せず、音声/予約/古い試聴callback・Hint範囲・Tempo時計・次engine/feedbackを破棄、全physical離鍵で新しい同セルattemptを開始。切替先でも現在セルが対象なら同セル。学習の先行セル/未学習復習/対象外scopeなら、その音域の保存済み有効位置/最初未完了/空候補を優先し、未学習を飛ばしたり成績を捏造しない。保持鍵盤はreadyで判定しない。pedalだけの残響はphysical待ちに使わず、resetで残音を停止。完了済みの旧音域の結果は旧bankだけに残す。試聴からの明示同セルrestartも音域を保持し、assisted資格保護は維持。

## 旧EXEの保存境界

旧strict-schema EXEが新音域情報を不正と判断し旧backupへ戻す危険を防ぐため、全Dojoの新保存先をnative `loopvault/theme-lessons-ranges-v4/`、browser `loop-vault:chord-dojo-theme-ranges-v1:`へ分離する。data/tmp/rollback marker/lock/backups/quarantineを全て分離。Dojo fileVersion4/Vaultv2は不変。

新保存先が空で復旧artifactもない場合だけ、以前のtheme-lessons-v4、以前のtheme-lessons、通常legacyの順にcommitted記録をread-onlyで初回コピーする。frontendの完全schema検証後に新保存先へ書き、旧data/marker/tmp/backupは書き換えない。有効committedがあれば旧rollback recoveryを走らせずその記録をコピー。committedなしでartifactあり、破損、将来versionは停止して元を保持し、古い記録へfallbackして空にしない。

コピー後は同期しない。以前のEXEの後続成績は新候補へ再importされず、新候補の後続成績は旧EXEに反映されない。Masterの進捗説明と最終報告に明記する。実製品保存先の内容を調査せず、合成記録だけで移行/復旧/旧reader隔離を検証。

## 人間受入れ

実MIDIの弾きやすさ/実音/聴感/教材・運指承認、製品識別子での保存移行・再起動、OS/WebView zoomは人間確認。自動テストや分離native証拠でこれを承認しない。

## 最新両手運指への更新

上のcanonical-fingering.json不変は音域追加時の契約。2026-10-07の[Form両手教材契約](251-master-form-templates.md)により、Master指番号だけは固定両手テンプレートへ更新する。canonical.jsonの実音とreferenceHands、両音域の厳密-12対応は維持する。

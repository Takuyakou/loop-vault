# Loop Vault Phase 3.9.3 ユーザー実機確認チェックリスト

確認対象: Chord Dojo L4/L5 + Mix Session

確認EXE: `D:\dev\Loop Vault\src-tauri\target\release\loop-vault.exe`

状態: 実MIDI鍵盤で未確認。以下はユーザー実機確認用。

## 準備

次の保存進行を用意する。

```text
進行A: Cmaj7 | Am7 | Dm7 | G7
Key: C major

進行B: C/E | Fmaj7 | G/B | Cmaj9
Key: C major

進行C: Am9 | Dm9 | E7#5 | Am9
Key: A minor
```

Mix確認用に、合計2〜6件の保存進行を用意する。1件は意図的に弾きにくい進行にする。各確認後、問題があれば末尾の不具合記録欄へ記入する。

## 1. L4の6キー

手順:

1. 進行Aを選び、L3 confirmed済みの状態にする。
2. L4「近くのキーでも」を開く。
3. Key railと自動出題を一巡する。

期待結果:

- [ ] C majorの元キーCを除き、F / G / Bb / D / Eb / A相当の6キーが表示される
- [ ] 元キーCはL4 coverageに含まれない
- [ ] target keyとdegreeだけが見え、答えのコード名とGuide noteは見えない
- [ ] clean Flowだけで6/6になり、provisionalになる

不具合記録: ________________________________________________

## 2. L5の12キー

手順:

1. L4をconfirmedにする。
2. 同じ進行でL5「どのキーでも」を開く。
3. Key railとcoverageを確認する。

期待結果:

- [ ] 同じmodeの12キーが表示される
- [ ] 元キーCもL5のclean Flow対象に含まれる
- [ ] L4でclear済みのキーが継承され、残りをclearすると12/12になる
- [ ] 12/12でprovisionalになる

不具合記録: ________________________________________________

## 3. Major / Minor

手順:

1. 進行AのC majorでL4/L5を開く。
2. 進行CのA minorでL4/L5を開く。
3. Keyなし、またはmajor/minor以外の未対応modeも試す。

期待結果:

- [ ] majorは全target keyでmajorとして表示・移調される
- [ ] minorは全target keyでminorとして表示・移調される
- [ ] A minorでもdegree構造が維持される
- [ ] Keyなし・未対応modeではL4/L5が無効になり、設定方法が表示される

不具合記録: ________________________________________________

## 4. Slash / Altered

手順:

1. 進行Bの `C/E` をD majorへ手動移調する。
2. 進行Cの `E7#5` を複数target keyで確認する。
3. 可能ならdim、sus、1小節2コードも含む進行を試す。

期待結果:

- [ ] `C/E` は `D/F#` 相当になり、rootとbassが同量移調される
- [ ] `7#5`、dim、susのquality/alterationが維持される
- [ ] bar / beat / durationと1小節内の順序が変わらない
- [ ] 表示と実際に要求される音が一致する

不具合記録: ________________________________________________

## 5. Key Bagの重複なし

手順:

1. L4を新しいsessionで開始する。
2. Skipまたはclean Flowで6回進め、出題Keyを順に記録する。
3. L5でも12回記録する。

期待結果:

- [ ] L4は6キーを使い切るまで重複しない
- [ ] L5は12キーを使い切るまで重複しない
- [ ] SkipしたKeyはclear扱いにならない
- [ ] 同じsession入力では決定的な順序になる

不具合記録: ________________________________________________

## 6. Manual Key

手順:

1. L4/L5がidleまたはpausedの状態でKey railをクリックする。
2. キーボードの左右矢印でもKeyを選ぶ。
3. running中にも選択を試す。

期待結果:

- [ ] idle/pausedでは選択したKeyへ切り替わる
- [ ] Key、degree、target plan、鍵盤判定が同時に切り替わる
- [ ] running中は即時変更されず、Pauseまたはround境界が必要
- [ ] フォーカス位置とスクリーンリーダー名が選択状態と一致する

不具合記録: ________________________________________________

## 7. Styleは段位対象外

手順:

1. L4でシェル、L5でルートレスなどのStyle targetを選ぶ。
2. clean Step/Flowを完了する。
3. 練習前後の段位、coverage、lastPracticedAtを比較する。

期待結果:

- [ ] target keyでStyle voicingが再生成される
- [ ] 指定音高判定では表示された形と一致する
- [ ] Style練習を完了してもconfirmed/provisional/coverageが変わらない
- [ ] Style target、A/B、fallback結果がVaultへ保存されない

不具合記録: ________________________________________________

## 8. Resolved Voicingの全体Octave

手順:

1. 保存ボイシングを持つ進行をresolved-voicingでL4/L5練習する。
2. 高低のtarget keyを複数選ぶ。
3. 保存ボイシングが欠けるeventも含める。

期待結果:

- [ ] 全noteが同じsemitone量で移調される
- [ ] 音域調整は進行全体へ同じoctave offsetで行われる
- [ ] コードごと・音ごとにoctaveが跳ねない
- [ ] 欠損eventだけ既存generated fallbackで補われる

不具合記録: ________________________________________________

## 9. L4 Provisionalと翌日Confirmation

手順:

1. 当日にL4を6/6までclean Flowする。
2. 表示されたchallenge 2キーを記録する。
3. 同日中にchallengeを弾く。
4. 翌日アプリを再起動し、同じ2キーを連続cleanする。

期待結果:

- [ ] 6/6でL4 provisionalになる
- [ ] 同日中はconfirmedにならない
- [ ] 再起動後もchallenge 2キーが変わらない
- [ ] 翌日に2キー連続cleanでL4 confirmedになる
- [ ] 途中dirtyでchallenge連続成功がリセットされる

不具合記録: ________________________________________________

## 10. L5 Provisionalと翌日Confirmation

手順:

1. 当日にL5を12/12までclean Flowする。
2. 表示されたchallenge 4キーを記録する。
3. 翌日に同じ4キーを連続cleanする。

期待結果:

- [ ] 12/12でL5 provisionalになる
- [ ] 同日中はconfirmedにならない
- [ ] 再起動後も五度圏4区間から選ばれた4キーが変わらない
- [ ] 翌日に4キー連続cleanでL5 confirmedになる
- [ ] `confirmedLevel` は最高到達Levelから下がらない

不具合記録: ________________________________________________

## 11. Mix 2〜5進行

手順:

1. 練習キューでMix選択modeを開く。
2. 1件、2件、5件、6件を順に選択する。

期待結果:

- [ ] 1件では開始できない
- [ ] 2〜5件では開始できる
- [ ] 6件目は選択できない
- [ ] 欠損・無効進行は黙って除外されず、対象名と理由が表示される

不具合記録: ________________________________________________

## 12. Mix 1〜3巡

手順:

1. 同じ3進行で1巡、2巡、3巡を実行する。
2. 出題順を記録する。

期待結果:

- [ ] 指定した巡数で終了する
- [ ] 一巡内で同じ進行が重複しない
- [ ] 前巡の最後と次巡の最初が同じ進行にならない
- [ ] 演奏中に次の進行名を先出ししない
- [ ] summaryにscore/percentage/rankingがない

不具合記録: ________________________________________________

## 13. Mix Step / Flow

手順:

1. L1〜L3の各LevelでMix Stepを実行する。
2. Mix Flowを共通BPMで実行する。
3. Flowで4/4以外または拍子未設定の進行を含める。

期待結果:

- [ ] Stepは各進行を既存判定で順番に完了する
- [ ] Flowは全進行で共通BPMを使い、Tempo Rampしない
- [ ] 進行間に1小節count-inが入る
- [ ] Flowで4/4以外・拍子未設定は開始前に拒否される
- [ ] L3でKeyなし進行は開始前に拒否される

不具合記録: ________________________________________________

## 14. Mixの非永続

手順:

1. 対象進行のconfirmedLevel、provisional、coverage、lastPracticedAt、Queue badgeを記録する。
2. Mixを完了・途中終了・アプリ終了する。
3. アプリを再起動する。

期待結果:

- [ ] 記録したpractice情報がすべて不変
- [ ] 保存進行・Voicing Memory・fingerprintに差分がない
- [ ] Mix選択、seed、結果が再起動後に復元されない
- [ ] Mix中のStep/Flow/Style/dirtyでもVaultへ書き込まれない

不具合記録: ________________________________________________

## 15. Dirty Subset Retry

手順:

1. Mix内の1進行だけ意図的にdirtyにし、他をcleanにする。
2. summaryまで進む。
3. 「dirtyだけ再挑戦」を選ぶ。

期待結果:

- [ ] dirtyでも直後に止まらず次の進行へ進む
- [ ] summaryでclean/dirtyの進行名が分かる
- [ ] 再挑戦にはdirty進行だけが含まれる
- [ ] dirtyが1件だけでも再挑戦できる
- [ ] 再挑戦しても公式practice進捗は更新されない

不具合記録: ________________________________________________

## 16. L4/L5とMixの排他

手順:

1. L4を選択してMix選択を試す。
2. L5を選択してMix選択を試す。
3. Mix選択中にL4/L5を選ぶ。

期待結果:

- [ ] L4/L5中はMixを開始できない
- [ ] Mix中はL4/L5を同時利用できない
- [ ] 理由が日本語/英語で明示される
- [ ] Key Mixとして暗黙に動作しない

不具合記録: ________________________________________________

## 17. MIDI切断 / Reconnect

手順:

1. L4/L5 FlowとMix Flowをそれぞれ開始する。
2. 演奏中と開始直後の2パターンでMIDI機器を切断する。
3. 再接続ボタンで同じ機器へ接続し直し、Resumeする。

期待結果:

- [ ] 切断時にsessionがPauseし、dirtyのまま暴走しない
- [ ] reconnect操作と接続状態が表示される
- [ ] 再接続後にClockと進行が正常再開する
- [ ] Resume前に保持していた鍵盤だけでは正解扱いにならず、新しいattackが必要
- [ ] 開始失敗時もloading状態から戻り、安全なエラーが表示される

不具合記録: ________________________________________________

## 18. 終了・日本語/English

手順:

1. L4/L5/Mixを、完了、終了ボタン、Esc、ウィンドウの×で終了する。
2. 設定から日本語とEnglishを切り替える。

期待結果:

- [ ] 各終了経路でClockと音が停止し、アプリを閉じられる
- [ ] 保存対象のL4/L5進捗だけが既存保存経路でflushされる
- [ ] Mixは終了経路にかかわらず保存差分を作らない
- [ ] 主要ラベル、エラー、aria-liveが選択言語へ切り替わる
- [ ] IME変換中のEscで誤終了しない

不具合記録: ________________________________________________

## 19. 狭幅・既存機能回帰

手順:

1. ウィンドウ幅を約375 pxまで狭めてL4/L5/Mixを操作する。
2. L1〜L3、通常provisional、Style練習、Vault試聴、進行詳細、Live MIDI、再起動を確認する。

期待結果:

- [ ] ボタン、Key rail、badge、長いdegreeが潰れず操作できる
- [ ] ページ全体に不自然な横スクロールが出ない
- [ ] 鍵盤が必要な場合だけ内部で横スクロールできる
- [ ] L1〜L3、Style、Vault/Detail試聴、Live MIDIが従来どおり動く
- [ ] 進行変更時のstale表示と明示resetが正しく動く

不具合記録: ________________________________________________

## 20. 確認後の停止点・提出情報

実機確認が完了するまでは、Phase 3.9.3の範囲を維持する。

- [ ] Key Mix（L4/L5とMix Sessionの組み合わせ）へ進んでいない
- [ ] 新しいStyle追加やStyle判定変更へ進んでいない
- [ ] 実MIDIで未確認の音楽的自然さを完了扱いにしていない

提出状態:

```text
Branch: feature/p3-9-3-l4-l5-mix-session
PR: 未作成（T5コミット後に作成予定）
Main: 未merge
EXE: D:\dev\Loop Vault\src-tauri\target\release\loop-vault.exe
MSI: D:\dev\Loop Vault\src-tauri\target\release\bundle\msi\Loop Vault_0.1.0_x64_en-US.msi
NSIS: D:\dev\Loop Vault\src-tauri\target\release\bundle\nsis\Loop Vault_0.1.0_x64-setup.exe
Frontend tests: 148 files / 1027 tests PASS
Rust tests: 24 tests PASS
Web build: PASS
Tauri build: PASS
```

確認者: ____________________

確認日: ____________________

## 不具合報告テンプレート

```text
確認番号:
進行:
Source Key / Mode:
Level:
Target Key:
Target Source:
Style:
Mode:
BPM:
表示された度数:
期待コード:
実際の移調コード:
押したMIDI note:
期待:
実際:
再現率:
スクリーンショット:
console / log:
```

## 音楽的評価メモ

実MIDI鍵盤での弾きやすさ、移調表記、ボイシングの自然さは自動テストでは確定できない。特にslash chord、altered dominant、minor進行、resolved voicingの高低target key、Style targetを重点確認する。

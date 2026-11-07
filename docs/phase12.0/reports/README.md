<!-- phase-id: 12.0 -->

# Reports

段階の報告を置く。報告は日本語で書く。名前：`P12.0-01-chord-dojo.md`。

書くこと：

1. 計画（段階の最初に書く。承認は待たない）。始めた時の HEAD、master に入っている phase（10.3・10.4・11）と、入っていない時にしたこと
2. 区切り0：部品の読み直しの表、壊してはいけない所、型の音の一覧表と確認表の場所と要約、測る道具の場所と開き方、今の判定の待ち時間の仕組み
3. **人間が後で見ること**：指示書の「決め方」で仮に決めた内容（型の音・ルートを抜けない種類・上に三和音を入れた種類・`pointCheck` の (a)(b)・待ち時間・そのほか）を、決めた内容／理由／変える時に直す所（表・設定の場所）の表で
4. 変えたファイルと commit の一覧
5. 仕様の受け入れ条件（12章の 1〜12）：満たした所・テストを1行ずつ
6. 消した古い部品と、消した・書き直したテストの表（理由つき）
7. 書き換えた基準画像と理由（Voicing Loop・Bass Practice・取り込む・進行ページの分は 0 のはず）
8. ゲートの結果（Test DX の要約行をそのまま貼る）と commit hash
9. スクリーンショットの場所（パスを文字で書く。`/` 区切り）
10. 判断ポイント：選んだこと／理由／別案を1〜2行ずつ
11. 人間が後でやること、人間が EXE で確かめること
12. レビューで見てほしい所（3〜5点）

私的な Vault の中身・MIDI・端末の ID・個人の絶対パス・`.local-evaluation` の中身は報告に書かない。

## 2-5-1 Master追加

限定監査: [Form A/C 左手単音列の実solver境界](251-sequence-boundary-audit.md)（監査source bab31149、製品d0f66cdc不変）。全24cellの3event一括solve・全候補1〜5の実評価、48cell再生成一致、UI48描画でsolver call0、3negative controlsを確認。focused29/関連140/FAST81/FEATURE90unit+52browser PASS。過去生成jobの履歴証明はない。機能・重み・指番号変更、新EXE、merge/pushなし。

最新は[Masterの1オクターブ下](P12.0-01-master-octave-down.md)（sourced0f66cdc、fresh6ゲート、Vitest4106/Playwright393/Runner27、関連378/native19、新画像404＋補助native7、新EXE）。音域別進捗・旧EXE保存先分離と初回read-only import。親から今回sourceの独立レビューPASSを受領。未解消P1/P2なし。人間受入れ待ち、merge/pushなし。

[251-00 audit](251-00-source-integration-audit.md) → [251-01 domain](251-01-domain.md) → [251-02 UI](251-02-ui.md) → [251-03 tempo/Mixed](251-03-tempo-mixed.md) → [運指再利用](251-fingering-reuse.md) → [251-04 最終受入待ち](251-04-final-acceptance.md)。Master追加時点のEXE・tested source・人間判断事項は当時の最終報告に記録。

独立レビューP1の修正は [候補時刻修正](251-04-p1-timing-correction.md)。P1修正時点の検証ソース・EXEはbb186dfbの [最終報告](251-04-final-acceptance.md)。親の確認によりbb186dfbの独立レビュー28件PASS済み。今回の保存／テンポ修正ではMasterコード変更なし。

前回チェックポイントは [Master表示・学習・復習・Mixed](P12.0-01-master-ui-learning-review.md)（sourcedc7f94dc、fresh6ゲート、Vitest4086/Playwright375/Runner27、関連358/native17、新画像224＋補助native4、新EXE）。今回sourceの独立レビューPASS、人間受入れ待ち、merge/pushなし。

前回の [MIDI即時発音・進行試聴・固定運指・離鍵表示・下端余白](P12.0-01-master-monitor-progression-fingering.md)（sourcee5bf3127、fresh6ゲート、Vitest4078／Playwright359／Runner27、domain350、native17、174画面＋補助native4、新EXE）。実音／実MIDI・人間受入れと独立レビューは待ち。固定運指教材は統合済み・実演奏未確認、merge/pushなし。

前回の [Home既定展開・手の色・Masterカード試聴](P12.0-01-master-audition.md)（source79fe6913、fresh FAST/FEATURE/UI/FULL・domain338・native17・画面124＋補助native4・新EXE）。進み具合を開いてMasterの上へ配置し、共有手色・canonical全144試聴・Hint・判定停止・時計／離鍵リセットを検証。その時点の候補について親指定独立レビュー結果は未受領。製品EXEの実音・実MIDI等の人間受入れ待ちとして記録。merge/pushなし。

前回の [通常練習・Masterの縦配置とホーム](P12.0-01-vertical-home.md)（sourcec8b22ba2、freshゲート・native17・新画像544＋補助native4・新EXE）。初期スクロールを検証側で戻さず、両画面の128px鍵盤と主要操作・ホーム全6入口を確認。全音符／臨時記号／運指の到達、各テンポ回答、実遷移を検証。独立UIレビューPASS、補助native最大化4画面PASS、製品用EXEの実データ・実音等の人間受入れ待ち。merge/pushなし。

[前回のnative保存回復／テンポ実結果](P12.0-01-rereview-storage-tempo.md)（60e0e7dc）は独立2件PASS済みと親が確認。旧theme-v3回復からの隔離・読み取り専用移行・テンポ実測保存を今回も保持する。

[前回P2](P12.0-01-theme-p2-fixes.md)（deab9283）、[テーマレッスン／大譜表](P12.0-01-theme-lesson-score.md)（776b656a、v3）、[入口分割／MIDI／狭幅補修](P12.0-01-progression-split-midi.md)（de47d3e7）とbbのP1報告・EXEは履歴として保持。前回P2の旧v3拒否に関する記載は、native marker残存時について撤回し、最新報告を正とする。

[最新: Master Form両手教材テンプレート](P12.0-01-master-form-templates.md)（source 7aef92ac、fresh FULL4137/395/27、native19、通常44/Master200画像、新EXE。二回のFULL/P10.2失敗・同期修正と新HEADのFULLを保持。身体/実音/人間受入れ待ち、merge/pushなし）。

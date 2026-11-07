# R-03 停止記録 2: npm の依存に High/Critical が残っている

**手順書 R-03 §4「依存: npm run security:audit(High/Critical 0)」の停止条件に当たりました。** ここまでの作業(パスの伏せ字)は終わっています。この先(§1〜§3・§5・§6・公開用コミット)は行っていません。

## 1. 済んだこと:公開ツリーから作業フォルダのパスを消した

- `831bb677`:報告と証拠 JSON の 16 ファイル(R-03 §4 の範囲スキャンで見つかったもの)の `D:/…`・`D:\…` を `<作業フォルダ>` に置換
- `5b9a78aa`:ツリー全体をスキャンして見つかった**既に v2.0.0 で公開済みの古い報告 31 ファイル**も同じ形に置換(公開ツリーを 0 にするため)
- **確認**:release/v2.1.0 のツリー(3,829 blob)をスキャン → **0 件**
  - 例外として許可した**テスト用の架空パス 3 件**のみ(`scripts/security/trackedSecurityScan.node-test.mjs` と `src/domain/midi/realEvaluation/privacy.test.ts` の中にある、明らかに架空の例)。実在の個人パスではありません。
- 履歴は書き換えていません。公開は「1 コミットにまとめる」方式のままです。

## 2. 見つかったもの(停止条件)

`npm run security:audit`(=`npm audit --audit-level=high` と `npm audit --omit=dev --audit-level=high`)が **失敗**しました。

### 2.1 本番の依存(`--omit=dev`)

| 重大度 | パッケージ | 内容 | 直る版 |
|---|---|---|---|
| **high** | **zod** `<4.6.6`(現在 3.25 系) | 大きな制約付きコレクションの検証でメモリを使い切れる(CWE-770、CVSS 7.5、可用性のみ) | **4.6.7**(semver major) |

- zod は **14 ファイル**で使っています(`src/domain/schema.ts`・`progressionAdvisor/schema.ts`・`sourceBassline/snapshot.ts`・`bass-practice/infra/repository/*` など)。Vault の読み込みと保存の検証が中心です。
- 3.x に修正版はありません(advisory の範囲が `<4.6.6`、修正は 4.6.7 のみ)。

### 2.2 開発用の依存(出荷物には入らない)

| 重大度 | パッケージ | 内容 | 直る版 |
|---|---|---|---|
| **critical** | vitest(→ `@vitest/mocker` 経由) | Path Traversal / 任意ファイル読み取り | vitest 5.1.0(major) |
| **critical** | tinypool | Prototype Pollution から RCE | vitest 5.1.0(major) |
| **high** | vite | launch-editor の Windows でのエスケープ漏れ | 3.x 内で修正あり(`npm audit fix`) |
| **high** | source-map-js | イベントループの DoS | 3.x 内で修正あり(`npm audit fix`) |
| moderate | eslint / typescript-eslint / minimatch / postcss-selector-parser ほか | おもに開発ツール | 一部 major |

- 内訳:全部で 17 件(**critical 2・high 3**・moderate 12)。`--omit=dev` では **zod の high 1 件**だけです。

### 2.3 Rust は問題なし(R-02 の状態のまま)

| 確かめ | 結果 |
|---|---|
| `cargo audit --file src-tauri/Cargo.lock`(リポジトリの一番上、ignore 込み) | 終了コード 0・**脆弱性 0・警告 0** |
| `src-tauri` で `cargo audit --file Cargo.lock`(ignore なし) | 終了コード 0・**脆弱性 0・警告 10**(R-02 と同じ 10 件) |

## 3. 選べること(まだ何もしていません)

- **A. zod を 3.25 → 4.6.7 に上げる**(14 ファイルの schema を移行。zod 4 の API 差の確認と全テストが必要。R-03 とは別の作業として行うのが安全)
- **B. 理由をつけて受け入れる**(今回の助言は「大きな制約付きコレクションでメモリを使い切れる」= 可用性のみ。このアプリはローカルの Vault を読むだけで、入力の大きさは取り込み時に制限している。ただし手順書の「High/Critical 0」は満たしません)
- **C. 開発用ツールも上げる**(vitest 5・eslint 9 系への major。出荷物には入りません)

A も C も major 更新なので、**R-03 の中では行わず、判断をいただいてから別の段階として行う**のがよいと考えています。

## 4. まだ行っていないこと

- §1 含めるものの確認・§2 データの互換(移行の合成データ確認)・§3 版/CHANGELOG/リリースノート/README の作り直し・§5 FULL と本番ビルドの起動確認・§6 配布物
- 公開用の 1 コミット(`public/v2.1.0`)と、その確認(ツリー ID・範囲スキャン・fast-forward)
- 追跡中 PNG 128 件の目視(この段階では未実施)

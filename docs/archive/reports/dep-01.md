# DEP-01 レポート — 部品の更新(vitest 4・zod 4・npm の知らせを 0 に)

- ブランチ:`chore/dep-01`(`8044a3d8` = P23-59-fix-1 の後の master から)
- コミット:`69901224`(golden の控え)・`483105f2`(本体)・`7d5efadf`(postcss)
- **push していない。** GitHub Actions の 2 つはローカルで確かめられないので、push の後に CI で確かめる。

## 0. 知らせ(audit)の前後

`npm audit`: **16 件(critical 2・high 3・moderate 11)→ 0 件**。`npm run security:audit` は終了コード 0。

| 部品 | 前 | 後 | どうやって |
|---|---|---|---|
| `vitest` | 3.2.7(critical 2 の元) | **4.1.12** | `npm install -D` |
| `vite` | 7.3.6(high) | **7.3.8** | 同上 |
| `zod` | 3.25.76(high) | **4.6.7** | `npm install` + 2 節の移行 |
| `source-map-js` | 1.2.1(high) | **1.2.4** | `npm audit fix`(force なし) |
| `postcss-selector-parser` | 6.1.5 未満(moderate) | **6.1.6** | `npm audit fix` |
| `minimatch` | 範囲の中(moderate) | **11.0.9** | `npm audit fix` |
| `postcss` | 8.5.26 | **8.5.33** | `^8.5.33` に(Dependabot の 8.5.28 を閉じる) |
| `tinypool` | critical(vitest の下) | **消えた** | vitest 4 は tinypool を使わない |

moderate は残っていない。`--force` は使っていない。

## 1. 1 節の各番

1. **答え合わせの控え**(2 節 2-1)を先に作り、`69901224` でコミットした。
2. `npm install -D vitest@4.1.12 vite@^7.3.8`、`npm audit fix`。
   - `vite.config.ts` の `test` は **`exclude` だけ**で、vitest 4 でもそのまま通った(`pool`・`poolOptions`・`workspace` は使っていない)。直した所は無い。
   - **テストの数は上げる前と同じ**:上げる前 `7124 通過 / 2 飛ばし / 7126` → 上げた後 `7124 / 2 / 7126`(同じコマンド `npm test -- --maxWorkers=4 --testTimeout=30000`。CI と同じ形)。飛ばして数を合わせていない。
   - vitest 4 で書き方だけ直した所:`src/components/AppShell.test.tsx` の `ReturnType<typeof vi.fn>`(4 では `Mock<Procedure | Constructable>` になり、`(view: AppView) => void` などに合わない)→ 実際の型(`(view: AppView) => void` など)にし、`AppView` を import。**確かめる中身は変えていない。**
3. `npm install zod@4.6.7` と 2 節の移行(下)。
4. Rust:`cargo update -p serde -p serde_json -p async-trait -p tauri-plugin-opener` → serde **1.0.229**・serde_json **1.0.154**・async-trait **0.1.92**・tauri-plugin-opener **2.5.5**。`cargo test --locked` は **PASS**(この crate に Rust のテストは 0 件)。`cargo audit --file src-tauri/Cargo.lock` は **終了コード 0**(知らせ 0。`chrono` の「unmaintained」1 件だけが allowed warning)。`windows` は上げていない(0.56/0.61 のまま)。
5. GitHub Actions:`security.yml` の 2 つを SHA 固定に替えた(checkout は 2 か所とも)。
   - `actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1`
   - `actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1 # v7.1.0`
   - node は 22 のまま。**ローカルでは確かめられない。push の後に CI で確かめる。**
6. 点検:tsc(アプリ)0・tsc(e2e)0・`npm run lint` 0・`npm test` PASS・`npm run security:audit` 0・`npx tauri build --no-bundle` **PASS**(`src-tauri/target/release/loop-vault.exe`)。
7. コミット。`npm run test:full:all` を 1 回(下)。**基準の写真は 1 枚も変わらない**(`e2e/visual.spec.ts` 6/6、差 0)。
8. local master に `--no-ff` で入れる(下)。master で `npm run test:fast`。push しない。
9. この報告と `done/DEP-01.md`。

## 2. zod 4 への移行

### 2-1. 答え合わせの控え

- `src/domain/__golden__/cases.ts`(入力)・`entries.ts`(入口)・`record.test.ts`(控えを書く)・`zod3/*.json`(zod 3 の答え)。
- **入口 16・入力 65**。入口は、Vault(`parseVaultFileJson`・`parseVaultFileJsonAsLegacyV1`)、Chord Dojo(store・完奏記録(lap)・drill 記録・recent・recent の 1 件)、bass practice(練習ファイル・MIDI ライブラリ)、耳の記録、source bassline、設定(Live MIDI・自動接続・LLM・レビューのしきい値)、役割補正ログ。
- 入力は、**今あるテストの見本**(`schema.test.ts` の Vault、`p89DataRetention` の全項目入り Vault、`emptyStore()`・`emptyDrillRecords()`・`emptyMidiBassLibrary()`・`createEmptyPracticeFile()`、`P10-review-thresholds.json`)と、**わざと壊した物**(項目が足りない・型が違う・知らない項目・範囲の外・空の配列・とても長い配列・JSON でない・未来の版)を入口ごとに 1 つ以上。
- v1・v2・v3 の Vault、v1 の設定、v1 の lap 記録も入れた。
- 控えは **zod 3.25.76 のまま**実行して作り、`69901224` でコミット(「test: record zod 3 parse results as the golden set」)。lap 記録の 4 件だけは、`z.partialRecord` が zod 3 に無いので、**zod 3 の形(`z.record(z.enum(…))`)に一時的に戻して記録**し、すぐ元に戻した(控えのファイルは 1 つも書き換わっていないことを `git status` で確認)。

### 2-2. 移す(変えた書き方の一覧)

| どこ | 前 | 後 | なぜ |
|---|---|---|---|
| `src/domain/chordDojo/store.ts`(3 か所)・`__fixtures__/preP125Store.ts`(3 か所)・`src/domain/master251/model.ts` | `z.record(値)` | `z.record(z.string(), 値)` | 4 ではキーの型が要る |
| `src/domain/chordDojo/originalRecords.ts` | `storeSchema.shape.progressions.valueSchema.extend(…)` | `itemSchema.extend({ missingSince, laps })` | 4 の record に入れ子の `.valueSchema` が無い(同じ値を指すことを確かめた) |
| `src/domain/chordDojo/lapRecords.ts` | `z.record(z.enum(ids), lapKeys)` | `z.partialRecord(z.enum(ids), lapKeys)` | 4 の `z.record(enum)` は**全部のキーを要求**する。`partialRecord` は「ある分だけ」で、知らないキーは今までどおり拒む(完奏記録は弾いた所だけを持つ) |
| `src/domain/schema.ts` | `z.ZodType<VaultFile, z.ZodTypeDef, unknown>` | `z.ZodType<VaultFile, unknown>` | 4 の `ZodType` は型引数の意味が変わった |
| `src/llm/preferences.ts` | `.strict().default({ … })`(2 か所) | `.strict().prefault({ … })` | 4 の `.default()` は既定値を検査しない。今までどおり検査してから使う |
| `src/views/chord-dojo/dojoHomeProgress.ts` | `laps: Record<…>` | `laps: Partial<Record<…>>` | 上の `partialRecord` に型を合わせた |

- `invalid_type_error`・`required_error`・`errorMap`・`ZodError.errors`・`z.lazy`・`z.record(値)` の 1 引数は、**この 22 ファイルには無かった**(探して 0 件)。
- `.datetime()`・`superRefine` の `ctx.addIssue({ code: z.ZodIssueCode.custom, … })`・`z.preprocess` は 4 でもそのまま動いた。
- **画面に出るエラーの文は変えていない**(zod の文をそのまま見せている所は無い。取り込み・復旧の画面は自前の文)。
- `zod/v3` は使っていない。`.passthrough()` を足す・`.strict()` を外す・`z.any()` にする、はしていない。

### 2-3. 答え合わせの結果

- `src/domain/zodMigration.golden.test.ts` が、16 の入口 × 65 の入力で **zod 3 の控えと深く同じ**(合格・不合格・返ってくるオブジェクト・隔離の別)ことを確かめる。**16/16 PASS**。
- 1 件だけ実際に差が出た:`z.record(z.enum(ids), lapKeys)` が 4 では「全部のキー」を要求し、**弾いた所だけを持つ完奏記録が読めなくなっていた**(`originalRecords`・`jazzRecords` のテスト 13 件が落ちた)。`z.partialRecord` に直して、golden にも 4 件(lap)を足した。**これが唯一の「読み方が変わった」所。**

### 2-4. しないこと

- `zod/v3` は使っていない。検査はゆるめていない(上の `partialRecord` も、知らないキーは拒む)。

## 3. Dependabot の 12 件

### tauri-plugin-opener 2.6.0 を入れなかった理由(DEP-01 の後で確かめた)

`cargo update --manifest-path src-tauri/Cargo.toml -p tauri-plugin-opener --precise 2.6.0` は解けはしたが、次のものが付いてきた(lock の差分):

```
Updating window-vibrancy v0.6.0 -> v0.8.1
Adding windows v0.62.2  (+ windows-collections / windows-core / windows-future / windows-numerics / windows-result / windows-strings / windows-threading)
Updating wry v0.55.1 -> v0.57.3
(ほかにも広く入れ替わる: base64 0.23・cssparser 0.38・toml 1.x・syn 3 など)
```

crates.io の manifest では 2.6.0 は **`tauri ^2.12`** を要求する(今は 2.11.5)。つまり **Tauri 本体の上げ**で、DEP-01 で「入れない」と決めた `windows` 0.62 も一緒に入る。指示の「Tauri 本体などの上げが要るなら上げない」に当たるので、lock はそのまま(2.5.5)に戻した。**2.6.0 は次の Tauri の更新でまとめて。**

| Dependabot の PR | この段 | 閉じる時に書く 1 行 |
|---|---|---|
| serde / serde_json / async-trait(3 件) | **入れた**(1 節 4) | 「DEP-01 で入れました(serde 1.0.229 / serde_json 1.0.154 / async-trait 0.1.92)。`cargo test --locked`・`cargo audit` は 0 です。」 |
| tauri-plugin-opener 2.6.0 | **入れない**(2.5.5 までの上げだけした) | 「**入れない**:2.6.0 は `tauri ^2.12` を要求し(今は 2.11.5)、Tauri 本体の上げになります。`--precise 2.6.0` を試すと wry 0.57・window-vibrancy 0.8・windows 0.62 が付いてくるため、次の Tauri の更新でまとめて上げます。」 |
| actions/checkout 7.0.1 | **入れた**(SHA 固定) | 「DEP-01 で `3d3c42e5aac5ba805825da76410c181273ba90b1`(v7.0.1)に固定しました。CI で確認します。」 |
| actions/setup-node 7.1.0 | **入れた**(SHA 固定) | 「DEP-01 で `949feb2413d6458794dcd2491c4babbbce0c15c1`(v7.1.0)に固定しました。node は 22 のままです。」 |
| postcss 8.5.28 | **入れた**(`^8.5.33`) | 「DEP-01 で postcss 8.5.33 にしました(8.5.28 を含みます)。見た目の基準は変わりません。」 |
| windows 0.62 | **入れない** | 「Tauri が持つ `windows` 0.56/0.61 に合わせるため、0.62 は入れません(DEP-01)。」 |
| jsdom 30 | **入れない** | 「npm の知らせの直しに要らず、テスト環境が大きく変わるため見送ります(DEP-01)。必要になったら別の段で。」 |
| @playwright/test 1.63 | **入れない** | 「同上。e2e の基準の写真が大きく変わる可能性があるため、別の段で扱います(DEP-01)。」 |
| tailwindcss 4 | **入れない** | 「同上。見た目が大きく変わるため、別の段で扱います(DEP-01)。」 |
| まとめて(multi) | **入れない** | 「上の中身のため、個別に判断します(DEP-01)。」 |

## 写真・見た目

- **変わっていない。** `e2e/visual.spec.ts` 6/6 PASS、基準の写真の差 0。この段では画面を触っていない。

## 点検・テスト

| 何を | 結果 |
|---|---|
| tsc(アプリ)/ tsc(e2e) | 0 / 0 |
| `npm run lint` | 0 |
| `npm test`(CI と同じ形) | 上げる前 **7124/7126**(2 飛ばし)→ 上げた後 **7124/7126**。zod の golden を 1 件足した後は **7125/7127** |
| `npm run security:audit` | **0**(high・critical 0) |
| `cargo test --locked` / `cargo audit` | PASS(0 件)/ 0 |
| `npx tauri build --no-bundle` | PASS |
| `npm run test:full:all` | **PASS**(`7d5efadf`)— Vitest **7125/7127**、Playwright light **1203/1205**、heavy **134/134**、Git diff check PASS、追跡 PNG の変化 0、1263.7s |
| master で `npm run test:fast` | **PASS**(`19.8s`)— App TypeScript・Source contracts・Changed ESLint・Changed Node tests 44/44 |

- **master: `95938d54`**(`--no-ff` のマージ)。push していない。

## ずれた所・自分で決めた所

| 何を | なぜ | どうした |
|---|---|---|
| 指示の `docs/release/v2.1.0/release-validation.md` が**このチェックアウトに無い**(`docs/release/` は v2.0.0 だけ) | この master は v2.1.0 の公開の記録より前の状態 | 指示の 1 行は足せていない。**足すべき 1 行**を下に書いた。v2.1.0 の記録がある所(または push 後)で足してほしい |
| `postcss` は `npm audit fix` だけだと 8.5.26 で、Dependabot の 8.5.28 に届かなかった | PR を閉じるには 8.5.28 以上が要る | `^8.5.33` にした(8.5.28 以上) |
| lap 記録の控えだけ、zod 3 の形に一時的に戻して記録した | `z.partialRecord` は zod 3 に無い | 記録の直後に戻した。他の控えは書き換わっていない |

### v2.1.0 の記録に足す 1 行(案)

```
- 見直し:DEP-01(zod の high 1 件)→ DEP-01 で済んだ(2026-11-20・zod 4.6.7・docs/reports/dep-01.md)
```

### 点検の済んでいない所

- GitHub Actions の 2 つの版(`checkout` v7.0.1・`setup-node` v7.1.0)は**ローカルで動かせない**。push の後に `security.yml` の `application` ジョブが通ることを CI で確かめる。

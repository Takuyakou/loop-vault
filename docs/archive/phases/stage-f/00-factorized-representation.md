# Loop Vault Stage F0 — Internal Factorization

- 作成日: 2026-07-26
- **振る舞い変更なし**
- `defaultAnalyzerMode` は `phase4-v1` のまま
- 保存schema・`fileVersion`・canonical identity 契約・`qualityEvidence` 係数 いずれも無変更

---

## 1. なぜ分解するのか

`ChordQuality` は21個の完成品の閉じたリストである（`min11`、`dom13`、`sixNine`…）。**名前を付けるには十分だが、推論するには使えない。**

- 「7度は短7度か」を問うには、8個の quality 名のどれが該当するかを問うことになる
- root の根拠を、quality テンプレートを丸ごと引きずらずに評価できない

そこで同じ情報を root / triad / seventh / tensions / bass へ分ける。後続 Stage が **quality に投票権を持たせずに root を採点できる**ようにするためである。

```ts
type FactorizedChordIdentity = {
  root: PitchClass;
  triad: CoreTriad;
  seventh: SeventhKind | null;
  tensions: TensionKind[];
  bass: PitchClass;
};
```

**F0 は製品の言うことを何も変えない。** 変えないことを証明した状態で表現だけ手に入れておくのが目的で、そうすることで振る舞いを変える後続 Stage では「差分はすべてその Stage のもの」と言い切れる。

---

## 2. 設計上の判断

### 2.1 quality の分解表をデータで持つ

`chordIdentity.ts` が使っているのと同じ構造から導出し、書き下しを二重化していない。`qualityFromParts` は Map の逆引きで実装しており、条件分岐の連鎖を手で同期させる必要がない。

### 2.2 6度は triad ではなく tension

`C6` は「長三和音 + 6度」であって、6度専用の triad ではない。独自の triad にすると **`C6` と `C` が、耳では共有している triad を共有しなくなる**。

### 2.3 名前が無い組み合わせには名前を付けない

`symbolFromFactorized` は、21個のリストに該当が無ければ `undefined` を返す。後続 Stage が root と triad を独立に提案し始めれば、リストに無い組み合わせは現実に出てくる。**黙って一番近い綴りへ丸めるのは、「名前を付けられないコード」が「間違った名前のコード」になる経路である。**

### 2.4 書かれた tension と quality が含む tension を同一視する

`Cmaj9` と `Cmaj7(9)` は1つのコードの2通りの書き方なので、分解後は同じになる。**新しい同値関係ではない** — canonical identity は元から両者を同一視している。

### 2.5 `Em/G` と `G6` は別のまま

同じ構成音、別のコード。分解でこの区別が消えれば、ユーザーが別物として聞いている2つの進行が併合される。テストで直接主張している。

---

## 3. F0 Hard Gate 結果

`scripts/verify-factorization-invariance.ts` → `00-factorization-invariance.json`

**199ファイル、7490 Timeline イベント、7490コードすべてを実際に通した。**

| Gate | 結果 |
|---|---|
| `identity-round-trip` | **PASS 7490/7490** — 全コードが canonical identity を保つ |
| `parser-agreement` | **PASS 199/199** — 両者が同じラベルを受理／拒否する |
| `timeline-stable` | **PASS 199/199** |
| `candidate-order-stable` | **PASS 199/199** |
| `warnings-stable` | **PASS 199/199** |

### 新しい同値関係が入っていないことの証拠

```text
492 distinct labels  →  492 distinct factorized forms
```

**1対1。** ラベルの種類数と分解形の種類数が一致するので、2つのラベルが1つの分解形へ潰れた箇所は存在しない。

### 対象コーパス

| コーパス | ファイル |
|---|---|
| Synthetic Gold Corpus v1 | 48 |
| Long-form v1.1 | 24 |
| regression-v3（旧 holdout-v3） | 16 |
| Chord Drip 評価コーパス | 100 |
| Endless / SURAN / Chapter 3 Seed | 11（private、指紋のみ記録） |
| **合計** | **199** |

`git ls-files "*.mid"` は **0 files**。診断JSONに絶対パス・個人ファイル名は含まれない（`grep -c "Users\|Downloads"` = 0）。

### runtime

min 2.5 / mean 27.5 / max 130.0 ms。**F0 は解析経路に何も差し込んでいない**ので、これは既存 `phase4-v1` の実測値そのものである。

---

## 4. round-trip テスト（39件）

`src/domain/chordFactorization.test.ts`

| 観点 | 内容 |
|---|---|
| 全 quality × 全 root（21 × 12 = 252） | canonical identity 一致 |
| 全 quality × 全 tension（21 × 7 = 147） | 同 |
| 全 quality × 全 slash bass（21 × 12 = 252） | 同 |
| 書かれたラベル経由 | 同 |
| symbol へ戻す（slash 含む） | 同一コードとして復元 |
| 契約が名指しする22ラベル | `Cmaj9` / `Cm11` / `C7sus4` / `C7(b9)` / `C7(#11)` / `C6` / `C69` / `Cmaj7/E` / `Gbadd9` / `F#add9` / `Em7/G` / `G6` など |
| `Em/G` ≠ `G6` | **別のまま** |
| `Cmaj9` = `Cmaj7(9)` | 同一 |
| N.C. / 解析不能ラベル | 正しく扱う |
| quality 逆引き | 21個すべて、無い組み合わせは `undefined` |
| 決定性・tension 順序 | 書き順に依らず同一 |
| パーサとの照合 | 400ラベル超で `normalizeChordLabel` と一致 |

**自分自身との比較ではなく、製品の `normalizeChordLabel` / `normalizeChordSymbol` と突き合わせている。**

---

## 5. 実装中に直した1件

`--files` をカンマ区切りにしていたため、`15.Endless,endless. (1).mid` のように**ファイル名にカンマを含む private MIDI が黙って途中で切られ**、存在しないパスになっていた。`--file` を繰り返し指定する形へ変えた。

---

## 6. 変更していないもの

- 製品の Primary コード名
- `defaultAnalyzerMode`（`phase4-v1`）
- 保存schema / `fileVersion`（1）
- canonical identity 契約
- `qualityEvidence` 係数 / global penalty
- P4.1.3 Manual Candidate Rescue
- `derived-length` generator
- Candidate Catalog / Recommendation

新規モジュール `src/domain/chordFactorization.ts` は**どこからも呼ばれていない**。既存ファイルへの変更は0行。

---

## 7. 検証

`npm run lint` PASS / `npx tsc --noEmit` PASS / `npm test -- --run` **1466 passed (178 files)** / `npm run build` PASS / `cargo test` PASS

---

## 8. F1 への引き渡し

分解表現が手に入り、それが何も変えないことが 7490 コードで確認できた。F1 は、この表現の上で bass / root / defining tone の evidence を **shadow 計算**する。製品出力には接続しない。

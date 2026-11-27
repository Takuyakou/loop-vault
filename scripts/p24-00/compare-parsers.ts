/**
 * P24-00 §D1: 「答えが割れる入力」を集めて、標準パーサーと拡張パーサーの
 * 両方にかけ、結果を比べて JSON に書き出す調査スクリプト。
 *
 * このスクリプトは製品コードを import するだけで、何も変更しない。
 *
 * 動かし方(リポジトリのルートで):
 *   npx tsx scripts/p24-00/compare-parsers.ts
 *   → scripts/p24-00/out/d1-diff.json と、標準出力に要約を書く。
 *
 * 入力の集め方:
 *   1. `src/` と `e2e/` の `.ts`/`.tsx` を TypeScript の構文木で走査し、
 *      `parseTextProgression(...)` / `parseExtendedTextProgression(...)` の
 *      第 1 引数を静的に解ける範囲で解く(文字列リテラル・テンプレート・
 *      同一ファイル内の const・`fixture("...")`・`example(...)`・
 *      `extendedTextSyntheticChart(n)`)。
 *   2. 画面に出る例(`STANDARD_TEXT_PLACEHOLDER` / `EXTENDED_TEXT_PLACEHOLDER`)。
 *   3. 凍結コーパス `docs/contracts/phase8.5-pre/extended-v1-canonical-v1.json` の rawText。
 *   4. `docs/contracts/phase8.8.3/product-supported-matrix.json` の writtenLabel
 *      (`| <label> |` の形でテストが渡している)。
 *   5. `docs/contracts/phase5.31/fixtures/*.txt`(`fixture("...")` で読まれる物)。
 *
 * 解けなかった呼び出し(変数・テンプレートの埋め込みなど)は
 * `corpus.unresolved` に file:line 付きで残す(推測で埋めない)。
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

import { parseExtendedTextProgression, type ExtendedTextResult } from "../../src/domain/extendedTextProgression";
import { parseTextProgression, type TextProgressionParseResult } from "../../src/domain/textProgression";
import type { ChordSymbol } from "../../src/domain/types";
import { extendedTextSyntheticChart } from "../../src/domain/__fixtures__/extendedTextSyntheticChart";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const OUT_DIR = join(ROOT, "scripts/p24-00/out");
const OUT_FILE = join(OUT_DIR, "d1-diff.json");

const CALLEES = new Set(["parseTextProgression", "parseExtendedTextProgression"]);
const SKIP_DIRS = new Set(["node_modules", "dist", ".git", "p89-generated", ".local-evaluation", ".codex-staging"]);

interface Candidate {
  readonly source: string;
  readonly origin: string;
}

interface Unresolved {
  readonly file: string;
  readonly line: number;
  readonly callee: string;
  readonly snippet: string;
}

function walk(dir: string, out: string[]): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walk(join(dir, entry.name), out);
    } else if (/\.tsx?$/.test(entry.name) && !entry.name.endsWith(".d.ts")) {
      out.push(join(dir, entry.name));
    }
  }
}

/** 同一ファイル内の `const x = ...` を引けるようにする(名前は宣言順で最初の物)。 */
function collectConstInitializers(sourceFile: ts.SourceFile): Map<string, ts.Expression> {
  const map = new Map<string, ts.Expression>();
  const visit = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      if (!map.has(node.name.text)) map.set(node.name.text, node.initializer);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return map;
}

/** 画面に出る例。`collectFixtureCorpus()` と `example(...)` の解決の両方で使う。 */
const STANDARD_PLACEHOLDER = "例: | Fmaj7 | Em7 A7 | Dm7 G7 | Cmaj7 |\n(ここに貼り付けるか、続けて書けます)";
const EXTENDED_PLACEHOLDER = "例: | Cmaj7 | Dm7 G7 | Cmaj7 % | Am7 _ |";

/** 他のファイルから import している定数(名前で引く)。 */
const IMPORTED_STRINGS = new Map<string, string>([
  ["STANDARD_TEXT_PLACEHOLDER", STANDARD_PLACEHOLDER],
  ["EXTENDED_TEXT_PLACEHOLDER", EXTENDED_PLACEHOLDER],
]);

interface FileContext {
  readonly consts: Map<string, ts.Expression>;
  /** `for (const x of ["a", "b"])` の x → 要素。 */
  readonly arrays: Map<string, string[]>;
  /** パーサーを包んでいる関数名 → その第何引数が入力か。 */
  readonly wrappers: Map<string, number>;
}

function resolveExpression(expression: ts.Expression, context: FileContext, depth = 0): string | undefined {
  if (depth > 8) return undefined;
  if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) {
    return expression.text;
  }
  if (ts.isParenthesizedExpression(expression)) {
    return resolveExpression(expression.expression, context, depth + 1);
  }
  if (ts.isBinaryExpression(expression) && expression.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const left = resolveExpression(expression.left, context, depth + 1);
    const right = resolveExpression(expression.right, context, depth + 1);
    return left === undefined || right === undefined ? undefined : left + right;
  }
  if (ts.isIdentifier(expression)) {
    const imported = IMPORTED_STRINGS.get(expression.text);
    if (imported !== undefined && !context.consts.has(expression.text)) return imported;
    const initializer = context.consts.get(expression.text);
    return initializer ? resolveExpression(initializer, context, depth + 1) : undefined;
  }
  if (ts.isCallExpression(expression) && ts.isIdentifier(expression.expression)) {
    const name = expression.expression.text;
    const arg0 = expression.arguments[0];
    if (name === "fixture" && arg0 && ts.isStringLiteral(arg0)) {
      return readFrozenFixture(arg0.text);
    }
    if (name === "example" && arg0) {
      // `src/components/capture/textIntakeExamples.test.ts` の `example()` と同じ変形。
      const placeholder = resolveExpression(arg0, context, depth + 1);
      return placeholder === undefined ? undefined : placeholder.split("\n")[0]!.replace(/^例: /, "");
    }
    if (name === "extendedTextSyntheticChart" && arg0 && ts.isNumericLiteral(arg0)) {
      return extendedTextSyntheticChart(Number(arg0.text)).source;
    }
  }
  return undefined;
}

/** 配列の束縛なら要素を全部、そうでなければ 1 件。 */
function resolveAll(expression: ts.Expression, context: FileContext): string[] {
  if (ts.isIdentifier(expression)) {
    const elements = context.arrays.get(expression.text);
    if (elements?.length) return elements;
  }
  const single = resolveExpression(expression, context);
  return single === undefined ? [] : [single];
}

/** `fixture("rechord-user-example.txt")` は `docs/contracts/phase5.31/fixtures/` から読む。 */
function readFrozenFixture(name: string): string | undefined {
  const path = join(ROOT, "docs/contracts/phase5.31/fixtures", name);
  return existsSync(path) ? readFileSync(path, "utf8") : undefined;
}

function collectArrayBindings(
  sourceFile: ts.SourceFile,
  consts: Map<string, ts.Expression>,
): Map<string, string[]> {
  const arrays = new Map<string, string[]>();
  const provisional: FileContext = { consts, arrays, wrappers: new Map() };
  const visit = (node: ts.Node): void => {
    if (ts.isForOfStatement(node) && ts.isVariableDeclarationList(node.initializer)) {
      const declaration = node.initializer.declarations[0];
      if (declaration && ts.isIdentifier(declaration.name)) {
        let iterable: ts.Expression = node.expression;
        if (ts.isIdentifier(iterable)) {
          const initializer = consts.get(iterable.text);
          if (!initializer) {
            ts.forEachChild(node, visit);
            return;
          }
          iterable = initializer;
        }
        if (ts.isArrayLiteralExpression(iterable)) {
          const values = iterable.elements
            .map(element => resolveExpression(element, provisional))
            .filter((value): value is string => value !== undefined);
          if (values.length) {
            const existing = arrays.get(declaration.name.text) ?? [];
            arrays.set(declaration.name.text, [...new Set([...existing, ...values])]);
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return arrays;
}

/** パーサーを包む小さな関数(`snapshot(text)` など)を見つける。 */
function collectWrappers(sourceFile: ts.SourceFile): Map<string, number> {
  const wrappers = new Map<string, number>();
  const consider = (name: string, node: ts.FunctionLikeDeclaration): void => {
    const parameters = node.parameters.map(parameter =>
      ts.isIdentifier(parameter.name) ? parameter.name.text : undefined);
    if (!parameters.length) return;
    const visit = (child: ts.Node): void => {
      if (ts.isCallExpression(child) && ts.isIdentifier(child.expression) && CALLEES.has(child.expression.text)) {
        const arg = child.arguments[0];
        if (arg && ts.isIdentifier(arg)) {
          const index = parameters.indexOf(arg.text);
          if (index >= 0 && !wrappers.has(name)) wrappers.set(name, index);
        }
      }
      ts.forEachChild(child, visit);
    };
    visit(node);
  };
  const visit = (node: ts.Node): void => {
    if (ts.isFunctionDeclaration(node) && node.name && node.body) consider(node.name.text, node);
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer
      && (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))) {
      consider(node.name.text, node.initializer);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return wrappers;
}

function collectFromSourceFiles(): { candidates: Candidate[]; unresolved: Unresolved[] } {
  const files: string[] = [];
  for (const dir of ["src", "e2e"]) walk(join(ROOT, dir), files);
  files.sort();

  const candidates: Candidate[] = [];
  const unresolved: Unresolved[] = [];

  for (const file of files) {
    const text = readFileSync(file, "utf8");
    // 走査の対象は呼び出しだけ。構文エラーがあっても構わない(テストではなく読み取り)。
    const sourceFile = ts.createSourceFile(
      file,
      text,
      ts.ScriptTarget.Latest,
      true,
      file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );
    const consts = collectConstInitializers(sourceFile);
    const arrays = collectArrayBindings(sourceFile, consts);
    const wrappers = collectWrappers(sourceFile);
    const context: FileContext = { consts, arrays, wrappers };
    const rel = relative(ROOT, file).replace(/\\/g, "/");

    const lineOf = (node: ts.Node): number =>
      sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
    const snippetOf = (node: ts.Node): string => node.getText(sourceFile).replace(/\s+/g, " ").slice(0, 120);

    // 包む関数の中の呼び出し(引数がパラメータ)は、呼び出し側で集めるので重複して数えない。
    const coveredByWrapper = new Set<string>();

    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
        const callee = node.expression.text;
        const line = lineOf(node);
        if (CALLEES.has(callee)) {
          const arg = node.arguments[0];
          const resolved = arg ? resolveAll(arg, context) : [];
          if (resolved.length) {
            for (const source of resolved) candidates.push({ source, origin: `${rel}:${line} ${callee}` });
          } else if (!coveredByWrapper.has(`${rel}:${line}`)) {
            unresolved.push({ file: rel, line, callee, snippet: arg ? snippetOf(arg) : "(引数なし)" });
          }
        } else if (wrappers.has(callee)) {
          const index = wrappers.get(callee)!;
          const arg = node.arguments[index];
          const resolved = arg ? resolveAll(arg, context) : [];
          for (const source of resolved) {
            candidates.push({ source, origin: `${rel}:${line} ${callee}(...) → パーサー` });
          }
        }
      }
      ts.forEachChild(node, visit);
    };

    // 包む関数の本体にあるパーサー呼び出しの位置を先に記録する。
    const visitForCovered = (node: ts.Node): void => {
      if ((ts.isFunctionDeclaration(node) || ts.isArrowFunction(node) || ts.isFunctionExpression(node)) && node.body) {
        const parameters = new Set(node.parameters
          .filter(parameter => ts.isIdentifier(parameter.name))
          .map(parameter => (parameter.name as ts.Identifier).text));
        if (parameters.size) {
          const inner = (child: ts.Node): void => {
            if (ts.isCallExpression(child) && ts.isIdentifier(child.expression) && CALLEES.has(child.expression.text)) {
              const arg = child.arguments[0];
              if (arg && ts.isIdentifier(arg) && parameters.has(arg.text)) {
                coveredByWrapper.add(`${rel}:${lineOf(child)}`);
              }
            }
            ts.forEachChild(child, inner);
          };
          inner(node.body);
        }
      }
      ts.forEachChild(node, visitForCovered);
    };
    visitForCovered(sourceFile);
    visit(sourceFile);
  }
  return { candidates, unresolved };
}

function collectFixtureCorpus(): Candidate[] {
  const candidates: Candidate[] = [];

  // 画面に出る例(そのままの形と、テストが使う `example()` の形)。
  candidates.push({ source: STANDARD_PLACEHOLDER, origin: "src/components/capture/StandardTextScoreWorkspace.tsx:12 STANDARD_TEXT_PLACEHOLDER" });
  candidates.push({ source: STANDARD_PLACEHOLDER.split("\n")[0]!.replace(/^例: /, ""), origin: "STANDARD_TEXT_PLACEHOLDER (example() の形)" });
  candidates.push({ source: EXTENDED_PLACEHOLDER, origin: "src/components/capture/ExtendedTextIntakePanel.tsx:36 EXTENDED_TEXT_PLACEHOLDER" });
  candidates.push({ source: EXTENDED_PLACEHOLDER.split("\n")[0]!.replace(/^例: /, ""), origin: "EXTENDED_TEXT_PLACEHOLDER (example() の形)" });

  // 凍結コーパス(拡張の正準フィクスチャ)。
  const canonical = JSON.parse(
    readFileSync(join(ROOT, "docs/contracts/phase8.5-pre/extended-v1-canonical-v1.json"), "utf8"),
  ) as { fixtures: Array<{ fixtureId: string; rawText: string }> };
  for (const fixture of canonical.fixtures) {
    candidates.push({
      source: fixture.rawText,
      origin: `docs/contracts/phase8.5-pre/extended-v1-canonical-v1.json ${fixture.fixtureId}`,
    });
  }

  // 製品対応マトリクスの writtenLabel(`| <label> |` でテストが渡している)。
  const matrix = JSON.parse(
    readFileSync(join(ROOT, "docs/contracts/phase8.8.3/product-supported-matrix.json"), "utf8"),
  ) as { rows: Array<{ rowId: string; writtenLabel: string }> };
  for (const row of matrix.rows) {
    candidates.push({
      source: `| ${row.writtenLabel} |`,
      origin: `docs/contracts/phase8.8.3/product-supported-matrix.json ${row.rowId} (| ${row.writtenLabel} |)`,
    });
  }

  // `fixture()` で読まれるテキスト。
  for (const name of ["rechord-user-example.txt", "rechord-user-example-expanded.txt", "rechord-control-example.txt"]) {
    const text = readFrozenFixture(name);
    if (text !== undefined) candidates.push({ source: text, origin: `docs/contracts/phase5.31/fixtures/${name}` });
  }

  // 合成チャート(テストが使う小節数)。
  for (const bars of [1, 2, 4, 8, 16]) {
    candidates.push({
      source: extendedTextSyntheticChart(bars).source,
      origin: `src/domain/__fixtures__/extendedTextSyntheticChart.ts extendedTextSyntheticChart(${bars})`,
    });
  }

  return candidates;
}

interface Chordish {
  readonly root: number;
  readonly quality: string;
  readonly tensions: readonly string[];
  readonly omissions?: readonly string[];
  readonly bass?: number;
}

/** 音として同じかどうか(表記の違いは見ない)。 */
function chordIdentity(chord: ChordSymbol | undefined): string {
  if (!chord) return "?";
  const value = chord as unknown as Chordish;
  return [
    value.root,
    value.quality,
    (value.tensions ?? []).join(","),
    (value.omissions ?? []).join(","),
    value.bass ?? "",
  ].join("|");
}

interface Projection {
  readonly canConvert: boolean;
  readonly barCount: number;
  readonly scoreLengthBeats: number;
  /** 1 拍ごとに鳴っているコード。休符・無音は "·"。 */
  readonly beatMap: string;
  /** アタック(発音し直し)した拍の位置。 */
  readonly attackBeats: string;
  readonly diagnostics: string;
}

const STEPS_PER_BAR = 4;

function projectStandard(result: TextProgressionParseResult, keyLabel: string): Projection & { key: string; chords: string[] } {
  const beats = Math.max(result.scoreLengthBeats, 0);
  const cells = new Array<string>(beats).fill("·");
  const chords: string[] = [];
  for (const event of result.events) {
    const start = (event.bar - 1) * STEPS_PER_BAR + event.startBeat - 1;
    for (let offset = 0; offset < event.durationBeats; offset += 1) {
      const index = start + offset;
      if (index >= 0 && index < cells.length) cells[index] = chordIdentity(event.chord);
    }
    chords.push(`${event.bar}@${event.startBeat}:${chordIdentity(event.chord)}`);
  }
  return {
    key: keyLabel,
    canConvert: result.canConvert,
    barCount: result.bars,
    scoreLengthBeats: result.scoreLengthBeats,
    beatMap: cells.join(" "),
    attackBeats: result.events.map(event => `${(event.bar - 1) * STEPS_PER_BAR + event.startBeat}`).join(","),
    diagnostics: result.diagnostics.map(diagnostic => diagnostic.code).join(","),
    chords,
  };
}

function projectExtended(result: ExtendedTextResult): Projection & { chords: string[] } {
  const steps = result.beatsPerBar;
  const beats = Math.max(result.scoreLengthBeats, result.bars.length * steps);
  const cells = new Array<string>(beats).fill("·");
  const chords: string[] = [];
  const attacks: number[] = [];
  for (const slot of result.slots) {
    if (!slot.chord) continue;
    const start = (slot.bar - 1) * steps + slot.startBeat - 1;
    for (let offset = 0; offset < slot.durationBeats; offset += 1) {
      const index = Math.round(start + offset);
      if (index >= 0 && index < cells.length) cells[index] = chordIdentity(slot.chord);
    }
    if (slot.kind === "attack" || slot.kind === "reattack") {
      chords.push(`${slot.bar}@${slot.startBeat}:${chordIdentity(slot.chord)}`);
      attacks.push(Math.round(start + 1));
    }
  }
  return {
    canConvert: result.canConvert,
    barCount: result.bars.length,
    scoreLengthBeats: result.scoreLengthBeats,
    beatMap: cells.join(" "),
    attackBeats: attacks.join(","),
    diagnostics: result.diagnostics.map(diagnostic => `${diagnostic.code}(${diagnostic.severity})`).join(","),
    chords,
  };
}

type DiffKind =
  | "片方だけ読める"
  | "小節が違う"
  | "コードが違う"
  | "休符が違う"
  | "長さが違う"
  | "アタックが違う"
  | "診断だけ違う";

const KIND_ORDER: DiffKind[] = [
  "片方だけ読める",
  "小節が違う",
  "コードが違う",
  "休符が違う",
  "長さが違う",
  "アタックが違う",
  "診断だけ違う",
];

function compare(standard: Projection, extended: Projection): DiffKind[] {
  const kinds = new Set<DiffKind>();
  if (standard.canConvert !== extended.canConvert) {
    // 片方が読めない時は、もう片方のコード・長さを比べても意味が無い
    // (読めない側は全部「無音」になるため)。小節数だけは意味がある。
    kinds.add("片方だけ読める");
    if (standard.barCount !== extended.barCount) kinds.add("小節が違う");
    return KIND_ORDER.filter(kind => kinds.has(kind));
  }
  if (!standard.canConvert) {
    // 両方が読めない時は、診断の違いだけを見る。
    if (standard.diagnostics !== extended.diagnostics) kinds.add("診断だけ違う");
    return KIND_ORDER.filter(kind => kinds.has(kind));
  }
  if (standard.barCount !== extended.barCount) kinds.add("小節が違う");
  if (standard.scoreLengthBeats !== extended.scoreLengthBeats) kinds.add("長さが違う");

  const left = standard.beatMap.split(" ");
  const right = extended.beatMap.split(" ");
  const length = Math.max(left.length, right.length);
  let chordDiffers = false;
  let restDiffers = false;
  for (let index = 0; index < length; index += 1) {
    const a = left[index] ?? "·";
    const b = right[index] ?? "·";
    if (a === b) continue;
    if (a === "·" || b === "·") restDiffers = true;
    else chordDiffers = true;
  }
  if (chordDiffers) kinds.add("コードが違う");
  if (restDiffers) kinds.add("休符が違う");
  if (standard.attackBeats !== extended.attackBeats) kinds.add("アタックが違う");
  if (standard.diagnostics !== extended.diagnostics) kinds.add("診断だけ違う");
  return KIND_ORDER.filter(kind => kinds.has(kind));
}

function summaryLine(value: Projection): string {
  return value.canConvert
    ? `可 (${value.barCount} 小節, ${value.scoreLengthBeats} 拍)`
    : `不可 (${value.barCount} 小節, 診断 ${value.diagnostics ? value.diagnostics.split(",").length : 0})`;
}

function main(): void {
  const { candidates, unresolved } = collectFromSourceFiles();
  const all = [...candidates, ...collectFixtureCorpus()];

  // 同じ文字列は 1 件にまとめ、出どころを全部残す。
  const bySource = new Map<string, { source: string; origins: string[] }>();
  for (const candidate of all) {
    const existing = bySource.get(candidate.source);
    if (existing) existing.origins.push(candidate.origin);
    else bySource.set(candidate.source, { source: candidate.source, origins: [candidate.origin] });
  }

  const cases = [];
  const byKind = new Map<string, string[]>();
  let split = 0;
  let equal = 0;

  for (const [source, entry] of bySource) {
    const unknownKey = parseTextProgression(source, { keyState: { kind: "unknown" } });
    const cMajor = parseTextProgression(source, { confirmedKey: "C major" });
    const extended = parseExtendedTextProgression(source, { beat: "4/4" });

    const standardUnknown = projectStandard(unknownKey, "unknown");
    const standardC = projectStandard(cMajor, "C major");
    const extendedProjection = projectExtended(extended);

    const kindsUnknown = compare(standardUnknown, extendedProjection);
    const kindsC = compare(standardC, extendedProjection);
    const kinds = new Set<DiffKind>([...kindsUnknown, ...kindsC]);
    const keySensitive = standardUnknown.beatMap !== standardC.beatMap
      || standardUnknown.canConvert !== standardC.canConvert
      || standardUnknown.diagnostics !== standardC.diagnostics;

    const primary = kinds.size === 0
      ? "一致"
      : KIND_ORDER.find(kind => kinds.has(kind)) ?? "一致";
    if (primary === "一致") equal += 1;
    else {
      split += 1;
      const list = byKind.get(primary) ?? [];
      list.push(source);
      byKind.set(primary, list);
    }

    cases.push({
      source,
      origins: entry.origins,
      standard: {
        unknownKey: { ...standardUnknown, chords: standardUnknown.chords },
        cMajor: { ...standardC, chords: standardC.chords },
      },
      extended: extendedProjection,
      keySensitive,
      diff: {
        kinds: [...kinds],
        primary,
        unknownKeyVsExtended: kindsUnknown,
        cMajorVsExtended: kindsC,
      },
    });
  }

  const report = {
    script: "scripts/p24-00/compare-parsers.ts",
    runWith: "npx tsx scripts/p24-00/compare-parsers.ts",
    note: "標準は `{ kind: \"unknown\" }` と `{ confirmedKey: \"C major\" }` の 2 通り、拡張は `{ beat: \"4/4\" }` で読む。",
    corpus: {
      sources: {
        fromSourceFiles: candidates.length,
        fromFixtures: all.length - candidates.length,
        uniqueInputs: bySource.size,
        unresolvedCallSites: unresolved.length,
      },
      unresolved,
    },
    summary: {
      total: bySource.size,
      equal,
      split,
      byKind: Object.fromEntries([...byKind].map(([kind, list]) => [kind, list.length])),
    },
    cases,
  };

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(OUT_FILE, JSON.stringify(report, null, 2) + "\n", "utf8");

  console.log(`入力 ${bySource.size} 件(解けなかった呼び出し ${unresolved.length} 件)`);
  console.log(`一致 ${equal} / 割れた ${split}`);
  for (const [kind, list] of byKind) console.log(`  ${kind}: ${list.length}`);
  console.log("");
  // 種類ごとに代表例を 3 件ずつ、内訳付きで出す(レポートに貼るため)。
  for (const [kind, list] of byKind) {
    console.log(`### ${kind} (${list.length})`);
    for (const source of list.slice(0, 3)) {
      const target = cases.find(entry => entry.source === source)!;
      console.log(`- 入力: ${JSON.stringify(target.source)}  [${target.origins[0]}]`);
      console.log(`  標準(未確定): ${summaryLine(target.standard.unknownKey)} 診断=[${target.standard.unknownKey.diagnostics}]`);
      console.log(`  標準(C major): ${summaryLine(target.standard.cMajor)} 診断=[${target.standard.cMajor.diagnostics}]`);
      console.log(`  拡張(4/4): ${summaryLine(target.extended)} 診断=[${target.extended.diagnostics}]`);
      console.log(`  種類: ${target.diff.kinds.join(" / ")}`);
    }
    console.log("");
  }
  console.log(`書き出し: ${relative(ROOT, OUT_FILE).replace(/\\/g, "/")}`);
}

main();

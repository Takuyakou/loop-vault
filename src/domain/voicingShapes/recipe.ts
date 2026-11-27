/**
 * P25-02 K: the P26 voicing recipes, ported line for line from the lead's reference program `rec.py`
 * (P26 v4). Degrees, recipes, placement and checks must stay identical to it: the golden table
 * `docs/contracts/voicing-shapes-p26/golden.json` is that program's output and is compared case by case.
 */

export const SEMI: Readonly<Record<string, number>> = {
  R: 0, b9: 1, "9": 2, "2": 2, "#9": 3, b3: 3, "3": 4, "4": 5, "11": 5, "#11": 6, b5: 6, "5": 7, "#5": 8,
  b13: 8, "6": 9, "13": 9, bb7: 9, b7: 10, "7": 11,
};

type Family = "majT" | "minT" | "dimT" | "aug" | "maj7" | "min7" | "dom" | "hdim" | "dim7" | "susT" | "sus7"
  | "maj6" | "min6" | "mM7" | "power";

/** T3, T7, T5, family, natural written extensions, extra required. */
export const QUAL: Readonly<Record<string, readonly [string | null, string | null, string, Family, readonly string[], readonly string[]]>> = {
  maj: ["3", null, "5", "majT", [], []], min: ["b3", null, "5", "minT", [], []], dim: ["b3", null, "b5", "dimT", [], []],
  aug: ["3", null, "#5", "aug", [], []],
  maj7: ["3", "7", "5", "maj7", [], []], min7: ["b3", "b7", "5", "min7", [], []], dom7: ["3", "b7", "5", "dom", [], []],
  min7b5: ["b3", "b7", "b5", "hdim", [], []], dim7: ["b3", "bb7", "b5", "dim7", [], []],
  maj9: ["3", "7", "5", "maj7", ["9"], []], min9: ["b3", "b7", "5", "min7", ["9"], []], dom9: ["3", "b7", "5", "dom", ["9"], []],
  min11: ["b3", "b7", "5", "min7", ["11"], []], dom13: ["3", "b7", "5", "dom", ["13"], []],
  sus2: ["2", null, "5", "susT", [], []], sus4: ["4", null, "5", "susT", [], []], dom7sus4: ["4", "b7", "5", "sus7", [], []],
  add9: ["3", null, "5", "majT", [], ["9"]], add13: ["3", "6", "5", "maj6", [], []], six: ["3", "6", "5", "maj6", [], []],
  min6: ["b3", "6", "5", "min6", [], []], sixNine: ["3", "6", "5", "maj6", [], ["9"]], minMaj7: ["b3", "7", "5", "mM7", [], []],
  power: [null, null, "5", "power", [], []], dom11: ["4", "b7", "5", "sus7", ["9"], []],
};

export const SAFE: Readonly<Record<Family, readonly string[]>> = {
  majT: ["9", "13"], maj6: ["9"], maj7: ["9", "13"], minT: ["9", "11"], min7: ["9", "11"], min6: ["9"], mM7: ["9"],
  dom: ["9", "13"], sus7: ["9", "13"], susT: ["9"], hdim: ["11"], dim7: [], dimT: [], aug: [], power: [],
};

const uniq = <T,>(values: readonly T[]): T[] => [...new Set(values)];

/** rec.py `Ch`. `bass` is the bass relative to the root (0–11), or null. */
export class RecChord {
  readonly q: string; readonly tens: readonly string[]; readonly alt: boolean; readonly bass: number | null;
  readonly T3: string | null; readonly T7: string | null; readonly T5: string | null; readonly fam: Family;
  readonly nat: readonly string[]; readonly altT: readonly string[]; readonly req: readonly string[]; readonly safe: readonly string[];
  constructor(q: string, tens: readonly string[] = [], alt = false, bass: number | null = null) {
    const entry = QUAL[q];
    if (!entry) throw new Error(`unknown quality ${q}`);
    this.q = q; this.tens = [...tens]; this.alt = alt; this.bass = bass;
    const [T3, T7, T5, fam, nat, req] = entry;
    this.T3 = T3; this.T7 = T7; this.fam = fam;
    this.nat = [...nat, ...this.tens.filter((t) => t === "9" || t === "11" || t === "13")];
    this.altT = this.tens.filter((t) => t === "b9" || t === "#9" || t === "#11" || t === "b13");
    let t5: string | null = T5;
    if (this.tens.includes("#5")) t5 = "#5";
    if (alt) t5 = null;
    this.T5 = t5;
    this.req = [...req];
    let safe = [...SAFE[fam]];
    if (alt) safe = [];
    if (this.altT.some((t) => t === "b9" || t === "#9")) safe = safe.filter((c) => c !== "9");
    if (this.altT.includes("b13") || this.T5 === "#5") safe = safe.filter((c) => c !== "13");
    this.safe = safe;
  }
  must(): string[] {
    const m = [this.T3, this.T7].filter((x): x is string => Boolean(x));
    if (this.T5 === "b5" || this.T5 === "#5") m.push(this.T5);
    m.push(...this.altT, ...this.req);
    if (this.alt) m.push("#9", "b13");
    return m;
  }
  tones(): string[] {
    const t = ["R", ...[this.T3, this.T7, this.T5].filter((x): x is string => Boolean(x)), ...this.nat, ...this.altT, ...this.req];
    if (this.alt) t.push("b9", "#9", "b13", "#11");
    return t;
  }
}

export class Fallback extends Error {}

function slots(c: RecChord): [string, string] {
  let s9: string;
  if (c.altT.includes("b9")) s9 = "b9";
  else if (c.altT.includes("#9") || c.alt) s9 = "#9";
  else if (c.fam === "hdim" || c.fam === "dim7") s9 = "R";
  else if (c.safe.includes("9") || c.nat.includes("9") || c.req.includes("9")) s9 = "9";
  else s9 = "R";
  let s5: string;
  if (c.altT.includes("#11")) s5 = "#11";
  else if (c.altT.includes("b13") || c.alt) s5 = "b13";
  else if (c.T5 === "b5" || c.T5 === "#5") s5 = c.T5;
  else if (c.nat.includes("13") || c.fam === "dom") s5 = "13";
  else if (c.nat.includes("11") && c.fam === "min7") s5 = "11";
  else s5 = "5";
  const over = c.altT.filter((t) => t !== s9 && t !== s5);
  if (over.length > 0) throw new Fallback("変化したテンションが 4 音に入り切らない");
  return [s5, s9];
}

export type RecShape = "shell" | "rootless" | "triad" | "quartal" | "close";

export interface Recipe {
  readonly L: readonly string[];
  readonly R: readonly string[];
  readonly fixed: boolean;
  readonly forms?: readonly (readonly [string, readonly string[]])[];
  readonly dropped?: readonly string[];
  /** The colour degree ① added (rec.py `extras=[cols[0]]`). */
  readonly addedColor?: string;
}

export function recipe(c: RecChord, shape: RecShape, color = false, spread = false): Recipe {
  const { T3, T7, T5 } = c;
  if (shape === "close") {
    const R = uniq(c.tones()).filter((d) => d !== "R" && !(c.alt && (d === "b9" || d === "#11")));
    for (const d of ["5", ...c.nat]) {
      if (R.length > 4 && R.includes(d) && !c.must().includes(d)) R.splice(R.indexOf(d), 1);
    }
    return { L: ["R"], R, fixed: false };
  }
  if (shape === "shell") {
    if (!T3) throw new Fallback("3 度の枠が無い");
    let extras = [...c.altT, ...(c.alt ? ["#9", "b13"] : []), ...c.req, ...c.nat];
    const toneSemis = new Set(c.tones().map((x) => SEMI[x]));
    const cols = c.safe.filter((d) => !toneSemis.has(SEMI[d]));
    let addedColor: string | undefined;
    if (color && extras.length === 0 && cols.length > 0) { extras = [cols[0]!]; addedColor = cols[0]; }
    let L: string[]; let R: string[];
    if (spread) {
      if ((T5 === "5" || T5 === "b5" || T5 === "#5") && !(T7 && c.altT.includes("b13"))) {
        L = ["R", T5]; R = [...(T7 ? [T7] : []), T3, ...extras];
      } else { L = ["R", T7!]; R = [T3, ...extras]; }
    } else {
      L = T7 ? ["R", T7] : ["R"];
      R = [T3, ...(T5 === "b5" || T5 === "#5" ? [T5] : []), ...extras];
      if (T5 === "5" && R.length < 3 && !(c.altT.includes("#11") || c.altT.includes("b13"))) R.push("5");
    }
    R = uniq(R); const dropped: string[] = [];
    while (R.length > 4) {
      let removed = false;
      for (let i = R.length - 1; i >= 0; i -= 1) {
        const d = R[i]!;
        if (c.nat.includes(d) && !c.req.includes(d)) { R.splice(i, 1); dropped.push(d); removed = true; break; }
      }
      if (!removed) throw new Fallback("必ず入れる音が右手に入り切らない");
    }
    return { L, R, fixed: false, dropped, ...(addedColor === undefined ? {} : { addedColor }) };
  }
  if (shape === "rootless") {
    if (!(T3 && T7)) throw new Fallback("7 度(か 6 度)の枠が無い");
    if (c.bass !== null) throw new Fallback("分数コードは ① で作る");
    const [s5, s9] = slots(c);
    if (c.req.includes("9") && s9 !== "9") throw new Fallback("9 が入らない");
    const A = [T3, s5, T7, s9]; const B = [T7, s9, T3, s5];
    if (!spread) return { L: [], R: A, fixed: true, forms: [["A", A], ["B", B]] };
    const plain5 = T5 === "5" && !c.altT.includes("b13") && !c.alt;
    let L: string[]; let A2: string[]; let B2: string[];
    if (plain5) {
      L = ["R", "5"]; A2 = A.filter((x) => x !== "5"); B2 = B.filter((x) => x !== "5");
    } else {
      L = T5 === "b5" ? ["R", T5] : ["R", T7];
      const drop = T5 === "b5" ? T5 : T7;
      A2 = A.filter((x) => x !== drop); B2 = B.filter((x) => x !== drop);
    }
    A2 = A2.filter((x) => x !== "R"); B2 = B2.filter((x) => x !== "R");
    return { L, R: A2, fixed: true, forms: [["A", A2], ["B", B2]] };
  }
  if ((shape === "triad" || shape === "quartal") && c.bass !== null) throw new Fallback("分数コードは ① か ② で作る");
  if (shape === "triad") {
    const f = c.fam; const n13 = c.nat.includes("13"); const n11 = c.nat.includes("11");
    if (c.alt) throw new Fallback("alt は三和音 1 つで言い切れない");
    if (f === "majT" || f === "minT") {
      if (c.altT.length > 0) throw new Fallback("変化したテンション");
      if (c.req.includes("9")) return { L: ["R", "5"], R: ["9", T3!, "5"], fixed: false };
      return { L: ["R", "5"], R: [T3!, "5", "R"], fixed: false };
    }
    if (f === "susT") return { L: ["R", "5"], R: ["R", T3!, "5"], fixed: false };
    if (f === "maj6") {
      if (c.req.includes("9")) throw new Fallback("6 と 9 が三和音に入らない");
      return { L: ["R", "5"], R: ["6", "R", "3"], fixed: false };
    }
    if (f === "min6") return { L: ["R", "5"], R: ["6", "R", "b3"], fixed: false };
    if (f === "maj7") {
      if (n13 || c.altT.some((t) => t !== "#11")) throw new Fallback("13 か変化音が入らない");
      if (c.altT.includes("#11")) return { L: ["R", "3"], R: ["#11", "7", "9"], fixed: false };
      return { L: ["R", "3"], R: ["5", "7", "9"], fixed: false };
    }
    if (f === "min7") {
      if (c.altT.length > 0 || n13) throw new Fallback("変化音か 13");
      if (n11) return { L: ["R", "b3"], R: ["b7", "9", "11"], fixed: false };
      return { L: ["R", "b3"], R: ["5", "b7", "9"], fixed: false };
    }
    if (f === "mM7") {
      if (c.altT.length > 0) throw new Fallback("変化音");
      return { L: ["R", "b3"], R: ["5", "7", "9"], fixed: false };
    }
    if (f === "dom") {
      if (c.T5 === "#5") throw new Fallback("♯5");
      const a = c.altT;
      if (a.length === 0 && n13) throw new Fallback("13 を入れると 9 が抜け、ルートが重なる");
      if (a.length === 0) return { L: ["R", "3"], R: ["5", "b7", "9"], fixed: false };
      if (a.length === 1 && a[0] === "b9" && !n13) return { L: ["R", "3"], R: ["5", "b7", "b9"], fixed: false };
      if (a.length === 1 && a[0] === "#9" && !n13) return { L: ["R", "3"], R: ["5", "b7", "#9"], fixed: false };
      throw new Fallback("この変化音は、3 度を残したまま三和音 1 つにできない");
    }
    if (f === "sus7") return { L: ["R", "5"], R: ["b7", "9", "4"], fixed: false };
    if (f === "hdim") throw new Fallback("♭7 が重なり、色が入らない");
    throw new Fallback("この種類には三和音の形が無い");
  }
  // quartal
  const f = c.fam; const n9 = c.nat.includes("9") || c.req.includes("9");
  if (c.alt || c.altT.some((t) => !(f === "maj7" && t === "#11")) || c.T5 === "#5") throw new Fallback("変化音は 4 度の積みに入らない");
  if (f === "maj7") {
    if (c.altT.includes("#11")) return { L: ["R", "5"], R: ["#11", "7", "3"], fixed: true };
    if (n9) return { L: ["R", "7"], R: ["3", "13", "9"], fixed: true };
    return { L: ["R", "5"], R: ["7", "3", "13"], fixed: true };
  }
  if (f === "majT" && c.req.length === 0) throw new Fallback("三和音は 4 度の積みにしない");
  if (f === "majT" || f === "maj6") return { L: ["R", "5"], R: ["3", "13", "9"], fixed: true };
  if (f === "min7") {
    if (c.nat.includes("9")) throw new Fallback("書いてある 9 が 4 度の積みに入らない");
    return { L: ["R", "5"], R: ["11", "b7", "b3"], fixed: true };
  }
  if (f === "min6") return { L: ["R", "5"], R: ["b3", "6", "9"], fixed: true };
  if (f === "dom") {
    if (n9) return { L: ["R", "b7"], R: ["3", "13", "9"], fixed: true };
    return { L: ["R", "5"], R: ["b7", "3", "13"], fixed: true };
  }
  if (f === "sus7") {
    if (n9) return { L: ["R", "5"], R: ["4", "b7", "9"], fixed: true };
    return { L: ["R", "5"], R: ["R", "4", "b7"], fixed: true };
  }
  if (f === "susT") return { L: ["R", "5"], R: c.T3 === "4" ? ["5", "R", "4"] : ["2", "5", "R"], fixed: true };
  if (f === "hdim") return { L: ["R", "b5"], R: ["11", "b7", "b3"], fixed: true };
  throw new Fallback("この種類には 4 度の積みが無い");
}

export const CHAIN: Readonly<Record<RecShape, readonly RecShape[]>> = {
  quartal: ["quartal", "rootless", "shell", "close"], triad: ["triad", "rootless", "shell", "close"],
  rootless: ["rootless", "shell", "close"], shell: ["shell", "close"], close: ["close"],
};

/** P26 3.3 基準 B (rec.py `ruleB`). The app's `lowIntervalLimit.ts` (基準 A) is not used here. */
export function textbookLowIntervalLimit(lower: number): number {
  if (lower <= 33) return 12;
  if (lower <= 45) return 7;
  if (lower <= 47) return 4;
  if (lower <= 50) return 3;
  if (lower <= 51) return 2;
  return 1;
}

export const LOW_SIXTH_MIN = 43;
export const LOW_SEVENTH_MIN = 41;
export const LMIN = 36; export const LMAX = 64; export const RMIN = 52; export const RMAX = 88;
export const LC = 48; export const RC = 67;
export const ROOTLESS_TOP = 70;
export const HAND_GAP_MAX = 12;
export const HAND_GAP_MAX_ONE_NOTE = 24;
export const SEMITONE_PENALTY = 4;

const asc = (values: readonly number[]): number[] => [...values].sort((a, b) => a - b);

export function lilOk(notes: readonly number[]): boolean {
  const n = asc(notes);
  for (let i = 0; i + 1 < n.length; i += 1) if (n[i + 1]! - n[i]! < textbookLowIntervalLimit(n[i]!)) return false;
  for (let i = 0; i + 1 < n.length; i += 1) {
    const x = n[i]!; const iv = n[i + 1]! - x;
    if (iv === 8 && x < LOW_SIXTH_MIN) return false;
    if (iv >= 9 && iv <= 11 && x < LOW_SEVENTH_MIN) return false;
  }
  return true;
}

function compareLists(a: readonly number[], b: readonly number[]): number {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i += 1) if (a[i] !== b[i]) return a[i]! - b[i]!;
  return a.length - b.length;
}

function freeHand(pcs: readonly number[], lo: number, hi: number): number[][] {
  const choices = pcs.map((p) => { const out: number[] = []; for (let n = lo; n <= hi; n += 1) if (n % 12 === p) out.push(n); return out; });
  const seen = new Set<string>(); const out: number[][] = [];
  const walk = (index: number, picked: number[]): void => {
    if (index === choices.length) {
      const t = asc(picked);
      if (new Set(t).size === pcs.length && t[t.length - 1]! - t[0]! <= 12) {
        const key = t.join(","); if (!seen.has(key)) { seen.add(key); out.push(t); }
      }
      return;
    }
    for (const n of choices[index]!) { picked.push(n); walk(index + 1, picked); picked.pop(); }
  };
  if (choices.length > 0) walk(0, []);
  return out.sort(compareLists);
}

function fixedHand(pcs: readonly number[], lo: number, hi: number): number[][] {
  const out: number[][] = [];
  for (let st = lo; st <= hi; st += 1) {
    if (st % 12 !== pcs[0]) continue;
    const n = [st];
    for (const p of pcs.slice(1)) { const prev = n[n.length - 1]!; n.push(prev + (((p - prev) % 12 + 12) % 12 || 12)); }
    if (n[n.length - 1]! <= hi && n[n.length - 1]! - n[0]! <= 12) out.push(n);
  }
  return out;
}

const mean = (values: readonly number[]): number => values.reduce((sum, value) => sum + value, 0) / values.length;

export function placementCost(L: readonly number[], R: readonly number[]): number {
  let c = 0;
  if (L.length > 0) c += Math.abs(mean(L) - LC) + 0.25 * (L[L.length - 1]! - L[0]!);
  if (R.length > 0) c += Math.abs(mean(R) - RC) + 0.25 * (R[R.length - 1]! - R[0]!);
  return c;
}

const mod12 = (n: number): number => ((n % 12) + 12) % 12;

interface PlacedForm { readonly name: string; readonly cands: readonly (readonly [number[], number[]])[]; readonly Rd: readonly string[] }

function place(c: RecChord, root: number, rc: Recipe): { res: PlacedForm[]; Ld: string[] } {
  const pc = (d: string): number => mod12(root + SEMI[d]!);
  let Ld = [...rc.L];
  let forms: (readonly [string, readonly string[]])[] = rc.forms ? rc.forms.map(([n, r]) => [n, [...r]] as const) : [["", [...rc.R]]];
  const slash = c.bass !== null && mod12(root + c.bass) !== pc("R");
  if (slash) {
    const bpc = mod12(root + c.bass!);
    const nf: (readonly [string, readonly string[]])[] = [];
    for (const [nm, Rd] of forms) {
      if (rc.forms) { nf.push([nm, [...Rd]]); continue; }
      const add = [...Ld.slice(1), ...(Ld.length > 0 ? ["R"] : [])];
      const Rd2 = uniq([...Rd, ...add]).filter((d) => pc(d) !== bpc);
      while (Rd2.length > 4) {
        const d = ["5", "R"].find((x) => Rd2.includes(x));
        if (d === undefined) break;
        Rd2.splice(Rd2.indexOf(d), 1);
      }
      nf.push([nm, Rd2]);
    }
    forms = nf; Ld = ["B"];
  }
  const res: PlacedForm[] = [];
  for (const [nm, Rd] of forms) {
    let cands: (readonly [number[], number[]])[];
    if (Ld.length === 0) {
      cands = fixedHand(Rd.map(pc), 48, ROOTLESS_TOP).filter((r) => r[0]! >= 48 && r[0]! <= 59 && lilOk(r)).map((r) => [r, []] as const);
    } else {
      const lp = slash ? [mod12(root + c.bass!)] : Ld.map(pc);
      let Ls = freeHand(lp, LMIN, LMAX);
      if (!slash && Ld.length === 2) Ls = Ls.filter((l) => mod12(l[0]!) === pc("R"));
      const Rs = rc.fixed ? fixedHand(Rd.map(pc), RMIN, RMAX) : freeHand(Rd.map(pc), RMIN, RMAX);
      cands = [];
      for (const l of Ls) for (const r of Rs) {
        if (l[l.length - 1]! < r[0]! && new Set([...l, ...r]).size === l.length + r.length && lilOk([...l, ...r])) cands.push([l, r]);
      }
    }
    res.push({ name: nm, cands, Rd });
  }
  return { res, Ld };
}

/** rec.py `check`: the errors only (warnings do not filter candidates). */
function checkErrors(c: RecChord, root: number, L: readonly number[], R: readonly number[], Ld: readonly string[], shape: RecShape, oneHand: boolean): boolean {
  const notes = asc([...L, ...R]); const pcs = new Set(notes.map(mod12));
  const pc = (d: string): number => mod12(root + SEMI[d]!);
  const bpc = c.bass === null ? null : mod12(root + c.bass);
  const allowed = new Set([...c.tones().map(pc), ...c.safe.map(pc)]);
  if (bpc !== null) allowed.add(bpc);
  if ([...pcs].some((p) => !allowed.has(p))) return false;
  for (const d of c.must()) if (!pcs.has(pc(d))) return false;
  if (!oneHand && !Ld.includes("B") && !pcs.has(pc("R"))) return false;
  if (bpc !== null && mod12(notes[0]!) !== bpc) return false;
  if (bpc !== null && notes.slice(1).some((n) => mod12(n) === bpc)) return false;
  if (bpc !== null && notes.length > 1 && notes[1]! - notes[0]! === 1) return false; // V11-1
  if (new Set(notes).size !== notes.length) return false;
  for (let i = 0; i < notes.length; i += 1) {
    for (let j = i + 1; j < notes.length; j += 1) {
      const iv = notes[j]! - notes[i]!;
      if (iv > 12 && iv % 12 === 1) {
        if (c.fam === "dom" && mod12(notes[i]!) === pc("R") && mod12(notes[j]!) === mod12(root + 1)) continue;
        if (bpc !== null && i === 0 && mod12(notes[0]!) === bpc && iv >= 25) continue; // V11-2
        return false;
      }
    }
  }
  if (!lilOk(notes)) return false;
  if (L.length > 0 && Math.max(...L) - Math.min(...L) > 12) return false;
  if (R.length > 0 && Math.max(...R) - Math.min(...R) > 12) return false;
  if (L.length > 0 && R.length > 0 && Math.max(...L) >= Math.min(...R)) return false;
  if (L.length > 0 && R.length > 0 && L.length >= 2 && Math.min(...R) - Math.max(...L) > HAND_GAP_MAX) return false;
  if (L.length > 0 && R.length > 0 && L.length === 1 && Math.min(...R) - Math.max(...L) > HAND_GAP_MAX_ONE_NOTE) return false;
  const lmax = oneHand ? ROOTLESS_TOP : LMAX;
  if (L.length > 0 && (Math.min(...L) < LMIN || Math.max(...L) > lmax)) return false;
  if (R.length > 0 && (Math.min(...R) < RMIN || Math.max(...R) > RMAX)) return false;
  if (R.length > (shape === "close" ? 5 : 4) || L.length > (oneHand ? 4 : 2)) return false;
  return true;
}

export interface BuiltForm {
  readonly name: string;
  readonly left: number[];
  readonly right: number[];
  readonly candidates: readonly (readonly [number[], number[]])[];
}

export interface BuildResult {
  readonly used: string;
  readonly shape: RecShape;
  readonly fixed: boolean;
  readonly oneHand: boolean;
  readonly forms: readonly BuiltForm[];
  readonly addedColor?: string;
}

/** The static choice's cost (K3); exported for the optimizer (K6). */
export function shapeStaticCost(L: readonly number[], R: readonly number[], fixed: boolean, oneHand: boolean): number {
  if (oneHand) return Math.abs(mean(L) - 55);
  const n = asc([...L, ...R]); let semi = 0;
  for (let i = 0; i + 1 < n.length; i += 1) if (n[i + 1]! - n[i]! === 1) semi += 1;
  return placementCost(L, R) + (fixed ? 0 : SEMITONE_PENALTY * semi);
}

/** rec.py `build`. Returns undefined where rec.py raises `no shape`. */
export function build(c: RecChord, root: number, shape: RecShape, color = false, spread = false): BuildResult | undefined {
  for (const sh of CHAIN[shape]) {
    const spHere = sh === shape ? spread : ((sh === "rootless" || sh === "shell") && (shape === "triad" || shape === "quartal"));
    let rc: Recipe; let colHere: boolean;
    try {
      colHere = sh === shape ? color : (sh === "shell" && (shape === "triad" || shape === "quartal"));
      rc = recipe(c, sh, sh === "shell" ? colHere : false, spHere);
    } catch (error) {
      if (error instanceof Fallback) continue;
      throw error;
    }
    const { res, Ld } = place(c, root, rc);
    const oneHand = Ld.length === 0;
    const out: BuiltForm[] = [];
    for (const { name, cands } of res) {
      const good = cands.filter(([L, R]) => checkErrors(c, root, L, R, Ld, sh, oneHand));
      if (good.length === 0) continue;
      let best = good[0]!; let bestCost = shapeStaticCost(best[0], best[1], rc.fixed, oneHand);
      for (const cand of good.slice(1)) {
        const cost = shapeStaticCost(cand[0], cand[1], rc.fixed, oneHand);
        if (cost < bestCost || (cost === bestCost && (compareLists(cand[0], best[0]) < 0
          || (compareLists(cand[0], best[0]) === 0 && compareLists(cand[1], best[1]) < 0)))) { best = cand; bestCost = cost; }
      }
      out.push({ name, left: [...best[0]], right: [...best[1]], candidates: good });
    }
    if (out.length === 0) continue;
    const used = sh + (sh === "shell" && colHere && sh !== shape ? "+color" : "") + (spHere && sh !== shape ? "+spread" : "");
    return { used, shape: sh, fixed: rc.fixed, oneHand, forms: out, ...(rc.addedColor === undefined ? {} : { addedColor: rc.addedColor }) };
  }
  return undefined;
}

import type { ReactNode } from "react";
import type { CellKey, MasterStore } from "../../domain/master251/model";
import { withCells } from "../../domain/master251/model";
import { masterProgressForRange } from "../../domain/master251/register";

/** P23-31b: the four pictures of the Chord Dojo home, drawn at the mock's own coordinates (130 × 150). */
const W = 130;
const H = 150;
const MONO = "inherit";
const MUTED = "var(--dojo-muted, #8496aa)";
const TEXT = "var(--lv-text, #eef3f9)";
const CHIP = "var(--dojo-raised, #172433)";
const DARK = "var(--dojo-border, #1f2f42)";
const ACCENT = "var(--dojo-accent, #42d8c6)";

function Art({ children, testId }: { readonly children: ReactNode; readonly testId?: string }) {
  return <svg className="dojo-home-art" data-testid={testId} viewBox={`0 0 ${W} ${H}`} width={W} height={H} aria-hidden="true" focusable="false">{children}</svg>;
}

/** 定番の進行: three chord cards with the role's line on top, the six key names, and the words under. */
export function StandardArt() {
  const cards = [
    { x: 10, name: "Dm7", fn: "sd" },
    { x: 48, name: "G7", fn: "d" },
    { x: 86, name: "C\u25b37", fn: "t" },
  ] as const;
  const keys = [["C", 20], ["F", 38], ["B\u266d", 56], ["E\u266d", 74], ["A\u266d", 92], ["D\u266d", 110]] as const;
  return <Art>
    {cards.map((card, index) => <g key={card.name} className="lv-cd-art-step" data-cd-step={index}>
      <rect x={card.x} y="40" width="34" height="26" rx="5" fill={CHIP} />
      <rect x={card.x} y="40" width="34" height="2.5" fill={`var(--lv-fn-${card.fn})`} />
      <text x={card.x + 17} y="58" textAnchor="middle" fontFamily={MONO} fontWeight="700" fontSize="12" fill={TEXT}>{card.name}</text>
    </g>)}
    {keys.map(([name, x]) => <text key={name} x={x} y="96" textAnchor="middle" fontFamily={MONO} fontSize="9" fill={MUTED}>{name}</text>)}
    <text x="65" y="118" textAnchor="middle" fontSize="10" fill={MUTED}>12 キー・ランダムキー</text>
  </Art>;
}

/** 2-5-1 Master: A–D down the left, 4 rows × 12 cells filled by the 48 cells' own state. `next`: the cell 続きから opens (outlined). */
export function MasterArt({ store, next }: { readonly store?: MasterStore; readonly next?: CellKey }) {
  const cells = store ? masterProgressForRange(withCells(store)).cells : {};
  return <Art testId="home-master-art">
    {(["A", "B", "C", "D"] as const).map((form, row) => <g key={form} className="lv-cd-art-row" data-cd-row={row}>
      <text x="8" y={42 + row * 20} fontFamily={MONO} fontSize="9" fill={MUTED}>{form}</text>
      {Array.from({ length: 12 }, (_, column) => {
        const key = `${"ABCD"[row]}:${column}` as CellKey;
        const status = cells[key]?.status ?? "new";
        return <rect key={key} x={20 + column * 8.6} y={34 + row * 20} width="7" height="12" rx="2" data-state={status} data-next={key === next || undefined}
          stroke={key === next ? ACCENT : undefined} strokeWidth={key === next ? 1.2 : undefined}
          fill={status === "master" ? ACCENT
            : status === "passed" ? "color-mix(in srgb, var(--dojo-accent, #42d8c6) 45%, transparent)"
              : status === "learning" ? "var(--dojo-warn, #f2c14e)" : DARK} />;
      })}
    </g>)}
    {/* P23-47-fix-4: on hover a light column (two keys wide) passes over the 12 keys (A–D together), left to right. */}
    <rect className="lv-cd-art-sweep" x="18.5" y="30" width="18" height="80" rx="3" fill={ACCENT} />
    <text x="65" y="128" textAnchor="middle" fontSize="10" fill={MUTED}>Form A〜D × 12 キー</text>
  </Art>;
}

/** 耳で弾く: a ring (the last score, when there is one) around a speaker, and Am7 ? ? under. */
export function EarArt({ score }: { readonly score?: number }) {
  const round = 2 * Math.PI * 30;
  const part = score === undefined ? 0 : Math.max(0, Math.min(100, score)) / 100;
  return <Art>
    <circle className="lv-cd-art-ear" cx="65" cy="62" r="30" fill="none" stroke={DARK} strokeWidth="5" />
    {part > 0 ? <circle className="lv-cd-art-ear-progress" cx="65" cy="62" r="30" fill="none" stroke={ACCENT} strokeWidth="5" strokeLinecap="round"
      strokeDasharray={`${round * part} ${round}`} transform="rotate(-90 65 62)" /> : null}
    <path className="lv-cd-art-speaker" d="M56 54h6l8-7v30l-8-7h-6z" fill={ACCENT} />
    {/* P23-47-fix-4: on hover two sound waves leave the speaker. */}
    <path className="lv-cd-art-wave" data-cd-wave="0" d="M75 55a9 9 0 0 1 0 14" fill="none" stroke={ACCENT} strokeWidth="2.6" strokeLinecap="round" />
    <path className="lv-cd-art-wave" data-cd-wave="1" d="M80 50a16 16 0 0 1 0 24" fill="none" stroke={ACCENT} strokeWidth="2.6" strokeLinecap="round" />
    {([[14, "Am7", TEXT], [50, "?", "var(--dojo-muted-2, #44566b)"], [86, "?", "var(--dojo-muted-2, #44566b)"]] as const).map(([x, label, color]) => <g key={x}>
      <rect x={x} y="106" width="30" height="22" rx="5" fill={CHIP} />
      <text x={x + 15} y="121" textAnchor="middle" fontFamily={MONO} fontWeight="700" fontSize="12" fill={color}>{label}</text>
    </g>)}
  </Art>;
}

/** ボイシングドリル: a keyboard of ten white keys (three down), its black keys, a clock, and the words under. */
export function DrillArt() {
  const down = new Set([0, 4, 7]);
  return <Art>
    {Array.from({ length: 10 }, (_, index) => <rect key={`w${index}`} className="lv-cd-art-key" data-cd-key={index} data-down={down.has(index) || undefined} x={8 + index * 11} y="62" width="10" height="40" rx="2"
      fill={down.has(index) ? ACCENT : "#d9e2ec"} />)}
    {[1, 2, 4, 5, 6, 8, 9].map((index) => <rect key={`b${index}`} x={8 + index * 11 - 3.5} y="62" width="7" height="24" rx="1.5" fill="#141c26" />)}
    <circle cx="98" cy="38" r="16" fill="none" stroke="var(--dojo-border-strong, #2b3c50)" strokeWidth="3" />
    {/* P23-47-fix-4: on hover the stopwatch hand goes round once every 2.4s. */}
    <path className="lv-cd-art-hand" d="M98 38V28" fill="none" stroke={ACCENT} strokeWidth="2.4" strokeLinecap="round" />
    <circle cx="98" cy="38" r="2" fill={ACCENT} />
    <text x="65" y="128" textAnchor="middle" fontSize="10" fill={MUTED}>決まった押さえ方を速く</text>
  </Art>;
}

/** The card chevron as a drawing (the source contract forbids the text glyph). */
export function ChevronRight() {
  return <svg className="dojo-home-chev" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d="M9 5l7 7-7 7" /></svg>;
}

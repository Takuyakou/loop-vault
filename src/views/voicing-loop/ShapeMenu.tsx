/**
 * P25-08 L1: Voicing Loop's 「形 ▼」 — one button for 基本 and the four K shapes, their two parts and ②'s order
 * (the mock `Source.dc.html`). It replaces 「基本 ▼」 and 「詳しい設定」.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { parseExtendedTextChordLabel } from "../../domain/extendedTextProgression";
import {
  buildShapeVoicing, pickShapeForm, placementNotes,
  type GeneratedShapeChoice, type GeneratedShapeOptions, type RootlessOrder, type VoicingShapeOptions,
} from "../../domain/voicingShapes";
import { addedTensionDegree, buildBasicWithParts } from "../../domain/voicingShapes/basicParts";
import { SEMI } from "../../domain/voicingShapes/recipe";
import { requestedShapeName, SHAPE_LABEL } from "../../domain/voicingShapes/names";
import { spellMidi } from "../../domain/chordDojo/targetSnapshot";
import { resolveProgressionPracticeVoicings } from "../../domain/progressionVoicingPractice/voicingResolution";
import { Presence } from "../../components/motion/Presence";
import { Switch } from "../../components/ui/controls";

const ITEMS: readonly (readonly [GeneratedShapeChoice, string, string])[] = [
  ["basic", "基本", "今までどおりの自動の音(形を決めない)"],
  ["shell", "シェル", "ルートと 3・5・7。全部の土台"],
  ["rootless", "ルートレス A/B", "左手 4 音。ルートはベースに任せる"],
  ["triad", "シェル+上の三和音", "左手 2 音、右手は三和音 1 つ"],
  ["quartal", "4 度積み", "右手を 4 度で積む。浮いた響き"],
];
const ORDERS: readonly (readonly [RootlessOrder, string])[] = [["auto", "自動"], ["A", "A"], ["B", "B"]];
const EXAMPLE = parseExtendedTextChordLabel("Cmaj7")!;
const LOW = 36;
const HIGH = 84;
const pct = (note: number) => Math.round(((Math.min(HIGH, Math.max(LOW, note)) - LOW) / (HIGH - LOW)) * 1000) / 10;

function exampleNotes(choice: GeneratedShapeChoice, options: GeneratedShapeOptions, basic: readonly number[]): number[] {
  if (choice === "basic") {
    const sorted = [...basic].sort((a, b) => a - b);
    const built = buildBasicWithParts(EXAMPLE, { left: sorted.slice(0, 1), right: sorted.slice(1) }, { tension: options.tension, spread: options.spread });
    return [...built.left, ...built.right];
  }
  const built = buildShapeVoicing(EXAMPLE, { ...options, shape: choice } as VoicingShapeOptions);
  const form = pickShapeForm(built, options.rootlessOrder);
  return form === undefined ? [] : placementNotes(form.staticChoice);
}

let basicExample: readonly number[] | undefined;
/** Today's 基本 notes for the example chord (Cmaj7), drawn as the 基本 row's dots. */
function basicExampleNotes(): readonly number[] {
  if (basicExample !== undefined) return basicExample;
  const plan = resolveProgressionPracticeVoicings({
    version: 1, fingerprint: "shape-menu-example", source: { kind: "vault", reference: { ideaId: "example", blockId: "example" } },
    selection: "basic-full", bpm: 100, meter: { numerator: 4, denominator: 4 }, lengthBeats: 4,
    spans: [{ kind: "chord", eventIndex: 0, startBeat: 0, durationBeats: 4 }],
    events: [{ id: "example", startBeat: 0, durationBeats: 4, chord: { root: EXAMPLE.root, quality: EXAMPLE.quality, tensions: [...EXAMPLE.tensions], label: EXAMPLE.label } }],
  }, { lessonStudyCategory: "teacher", lessonProgressionOptimization: false });
  const first = plan.events[0];
  basicExample = first?.status === "SUPPORTED" ? first.voicing.midiNotes : [];
  return basicExample;
}

/** K11 / K5: 「+9(D)」 for the example chord. */
function addedName(): string | undefined {
  const degree = addedTensionDegree(EXAMPLE);
  if (degree === undefined) return undefined;
  const pitch = spellMidi(60 + ((EXAMPLE.root + (SEMI[degree] ?? 0)) % 12), { ...EXAMPLE, tensions: [degree as never] });
  return `+${degree.replace(/b/g, "♭").replace(/#/g, "♯")}(${pitch.step}${pitch.alter > 0 ? "♯".repeat(pitch.alter) : "♭".repeat(-pitch.alter)})`;
}

export function ShapeMenu({ value, enabled, onChange, smooth, onSmooth }: {
  readonly value: GeneratedShapeOptions;
  /** 自動生成 is chosen (otherwise the button is faded and cannot open). */
  readonly enabled: boolean;
  readonly onChange: (next: GeneratedShapeOptions) => void;
  /** P25-16 N7: 「なめらかにつなぐ」 lives at the bottom of this menu (L3: the same switch and the same memory). */
  readonly smooth: boolean;
  readonly onSmooth: (checked: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLSpanElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (!enabled) setOpen(false); }, [enabled]);
  useEffect(() => {
    if (!open) return undefined;
    const outside = (event: PointerEvent) => { if (event.target instanceof Node && !wrap.current?.contains(event.target)) setOpen(false); };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.isComposing) return;
      event.preventDefault(); event.stopPropagation();
      setOpen(false); button.current?.focus();
    };
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("keydown", escape, true);
    return () => { document.removeEventListener("pointerdown", outside, true); document.removeEventListener("keydown", escape, true); };
  }, [open]);

  const shape = value.shape;
  const basic = shape === "basic";
  const tensionOk = basic || shape === "shell";
  const spreadOk = basic || shape === "shell" || shape === "rootless";
  const added = addedName();
  const items = useMemo(() => ITEMS.map(([id, label, desc]) => ({ id, label, desc, dots: exampleNotes(id, value, basicExampleNotes()) })), [value]);
  const parts = [value.tension && tensionOk ? "テンション" : "", value.spread && spreadOk ? "広げる" : ""].filter(Boolean);
  const choose = (next: Partial<GeneratedShapeOptions>) => onChange({ ...value, ...next });
  const tensionTip = !tensionOk ? `${SHAPE_LABEL[shape]} は、はじめからテンションが入っています`
    : added === undefined ? "コード名にもうテンションがあるので、足す音はありません"
    : `9・11・13 のうち、そのコードに合う音を 1 つ足す(例:Cmaj7 なら ${added.slice(1)})`;
  const spreadTip = spreadOk ? "左手をルート+5 度に広げ、右手を上に離す" : "基本・シェル・ルートレスの時だけ使えます";

  return (
    <span ref={wrap} className="relative inline-flex" data-testid="voicing-loop-shape">
      <button ref={button} type="button" aria-haspopup="menu" aria-expanded={open} disabled={!enabled}
        aria-label={`形: ${requestedShapeName(value)}`} title={enabled ? "自動生成で作る形" : "自動生成を選択すると設定できます"}
        data-testid="voicing-loop-shape-button"
        onClick={() => { if (enabled) setOpen((current) => !current); }}
        style={{ height: 34, padding: "0 12px", border: "1px solid rgba(150,170,195,.28)", borderRadius: 8, background: "#111b2a",
          color: "#f2f6fc", fontSize: 12, whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: 8, opacity: enabled ? 1 : 0.4,
          cursor: enabled ? "pointer" : "not-allowed" }}>
        <span style={{ fontSize: 11, color: "#7f90aa" }}>{"形"}</span>
        <span style={{ fontWeight: 700 }} data-testid="voicing-loop-shape-label">{SHAPE_LABEL[shape]}</span>
        {parts.length > 0 ? <span style={{ color: "#42d8c6" }}>{parts.map((part) => `+ ${part}`).join(" ")}</span> : null}
        <span aria-hidden="true" className="lv-motion-chevron" style={{ fontSize: 9, color: "#a5b2c6" }}>{"▼"}</span>
      </button>
      <Presence show={open} exitMs={120}>{(presence) => (
        <div role="group" aria-label="形" data-testid="voicing-loop-shape-menu" className="lv-motion-pop" data-presence={presence.state}
          onTransitionEnd={presence.onTransitionEnd} style={{ position: "absolute", left: 0, top: 40, zIndex: 30, width: 340, transformOrigin: "top left",
          maxWidth: "calc(100vw - 24px)", padding: 6, border: "1px solid rgba(150,170,195,.28)", borderRadius: 12, background: "#111b2a",
          boxShadow: "0 18px 48px rgba(0,0,0,.5)", whiteSpace: "normal" }}>
          {items.map((item) => {
            const on = item.id === shape;
            return (
              <button key={item.id} type="button" aria-pressed={on} data-shape={item.id} className="lv-vl-shape-item"
                onClick={() => { choose({ shape: item.id }); setOpen(false); button.current?.focus(); }}
                style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "8px 10px", border: 0, borderRadius: 8,
                  background: on ? "#123b3a" : "transparent", color: "#f2f6fc", textAlign: "left" }}>
                <span aria-hidden="true" style={{ width: 12, color: "#42d8c6", fontSize: 12 }}>{on ? "✓" : ""}</span>
                <span style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2 }}>
                  <span style={{ fontSize: 13, fontWeight: 700 }}>{item.label}</span>
                  <span style={{ fontSize: 11, color: "#a5b2c6" }}>{item.desc}</span>
                </span>
                <span aria-hidden="true" style={{ position: "relative", flex: "none", width: 74, height: 10, borderRadius: 5, background: "rgba(150,170,195,.13)" }}>
                  {item.dots.map((note, index) => <span key={`${note}-${index}`} style={{ position: "absolute", top: 2, left: `${pct(note)}%`, width: 6, height: 6,
                    marginLeft: -3, borderRadius: "50%", background: "#42d8c6" }} />)}
                </span>
              </button>
            );
          })}
          <div style={{ display: "flex", flexDirection: "column", gap: 2, marginTop: 4, padding: "6px 4px 2px", borderTop: "1px solid rgba(150,170,195,.14)" }}>
            <PartCheck label="テンションを足す" sub={!tensionOk ? "入り済み" : added ?? "なし"} tip={tensionTip}
              on={value.tension && tensionOk} disabled={!tensionOk || added === undefined} testId="voicing-loop-shape-tension"
              onChange={(checked) => choose({ tension: checked })} />
            <PartCheck label="広げる" sub="左 R・5" tip={spreadTip} on={value.spread && spreadOk} disabled={!spreadOk}
              testId="voicing-loop-shape-spread" onChange={(checked) => choose({ spread: checked })} />
          </div>
          {shape === "rootless" ? (
            <div role="group" aria-label="ルートレスの並び" style={{ display: "flex", alignItems: "center", gap: 6, margin: "4px 0 2px", padding: "8px 10px 4px",
              borderTop: "1px solid rgba(150,170,195,.14)" }}>
              <span style={{ flex: 1, fontSize: 11, color: "#a5b2c6" }}>{"ルートレスの並び"}</span>
              {ORDERS.map(([order, label]) => {
                const on = value.rootlessOrder === order;
                return <button key={order} type="button" aria-pressed={on} data-order={order} className="lv-vl-shape-order" onClick={() => choose({ rootlessOrder: order })}
                  style={{ height: 26, padding: "0 10px", border: `1px solid ${on ? "#42d8c6" : "rgba(150,170,195,.28)"}`, borderRadius: 7,
                    background: on ? "#123b3a" : "transparent", color: on ? "#42d8c6" : "#a5b2c6", fontSize: 12 }}>{label}</button>;
              })}
            </div>
          ) : null}
          <div data-testid="voicing-loop-shape-smooth" style={{ margin: "4px 0 2px", padding: "8px 10px 4px", borderTop: "1px solid rgba(150,170,195,.14)" }}>
            <label style={{ display: "flex", alignItems: "center", gap: 10, padding: "4px 2px", cursor: "pointer" }}
              title={"最後から先頭まで含む進行全体で、トップノートと内声のつながりを選びます。OFFでは各コード単体の代表候補を使います。"}>
              <Switch checked={smooth} label={"進行に合わせてなめらかにつなぐ"} onChange={onSmooth} />
              <span style={{ flex: 1, display: "flex", flexDirection: "column" }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: "#f2f6fc" }}>{"なめらかにつなぐ"}</span>
                <span style={{ fontSize: 11, color: "#a5b2c6" }}>{"進行全体で、上の音と内側の音がなるべく動かない押さえ方を選びます"}</span>
              </span>
            </label>
          </div>
          <p style={{ margin: "4px 10px 4px", fontSize: 11, lineHeight: 1.6, color: "#7f90aa" }}>
            {"この形で作れないコードは近い形で鳴らし、カードに「代わり」が付きます。"}
          </p>
        </div>
      )}</Presence>
    </span>
  );
}

function PartCheck({ label, sub, tip, on, disabled, testId, onChange }: {
  readonly label: string; readonly sub: string; readonly tip: string; readonly on: boolean; readonly disabled: boolean;
  readonly testId: string; readonly onChange: (checked: boolean) => void;
}) {
  return (
    <label title={tip} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 6px", borderRadius: 8, opacity: disabled ? 0.4 : 1,
      cursor: disabled ? "not-allowed" : "pointer" }}>
      <input type="checkbox" checked={on} disabled={disabled} data-testid={testId}
        onChange={(event) => onChange(event.currentTarget.checked)}
        style={{ width: 16, height: 16, accentColor: "#42d8c6", margin: 0 }} />
      <span style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: "#f2f6fc" }}>{label}<span style={{ marginLeft: 8, fontWeight: 400, color: on ? "#42d8c6" : "#7f90aa" }}>{sub}</span></span>
        <span style={{ fontSize: 11, color: "#a5b2c6" }}>{tip}</span>
      </span>
    </label>
  );
}

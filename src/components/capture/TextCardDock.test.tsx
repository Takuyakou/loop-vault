// @vitest-environment jsdom
/** P25-03 C: the selected card's band (shapes, keys, range, MIDI entry, undo, keys, dots, save). */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";

/** P25-16 N3: the band sinks out (140ms) before it is removed; jsdom sends no transitionend. */
async function settleMotion() {
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 300)); });
}

const pianoMonitor = vi.hoisted(() => {
  const updateNotes = vi.fn();
  const stop = vi.fn();
  const dispose = vi.fn();
  return { updateNotes, stop, dispose, create: vi.fn(async () => ({ updateNotes, stop, dispose })) };
});
vi.mock("../../audio/midiInputPianoMonitor", () => ({ createMidiInputPianoMonitor: pianoMonitor.create }));

import { TextProgressionCapturePanel } from "./TextProgressionCapturePanel";
import { defaultLiveMidiStore } from "../../liveMidi/defaultLiveMidiStore";
import { parseExtendedTextChordLabel } from "../../domain/extendedTextProgression";
import { createTextShapeSnapshot, defaultCardNotes, invertUp, shiftOctave } from "../../domain/textCardSound";
import { DEFAULT_VOICING_SHAPE_OPTIONS, type VoicingShapeOptions } from "../../domain/voicingShapes";
import type { ChordTimelineItem } from "../../domain/types";
import { extendedTextSaveData, type TextSaveVoicings } from "../../domain/extendedTextSave";
import type { ExtendedTextResult } from "../../domain/extendedTextProgression";
import { voiceTextChordForAudition } from "../../domain/textChordTones";
import { textPreviewNotes } from "../../domain/textVoicingAvailability";
import { createNotificationStore, NotificationProvider } from "../notifications";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

interface Harness {
  readonly container: HTMLElement;
  readonly onPreview: ReturnType<typeof vi.fn>;
  readonly onSaveExtended: ReturnType<typeof vi.fn>;
  readonly onSaveStandard: ReturnType<typeof vi.fn>;
  unmount(): Promise<void>;
}

async function mount(text?: string): Promise<Harness> {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const onPreview = vi.fn();
  const onSaveExtended = vi.fn(() => true);
  const onSaveStandard = vi.fn(() => true);
  await act(async () => root.render(<TextProgressionCapturePanel showRomanNumerals={false}
    onPreview={onPreview} onStop={vi.fn()} onSaveExtended={onSaveExtended} onSaveStandard={onSaveStandard} />));
  const harness = {
    container, onPreview, onSaveExtended, onSaveStandard,
    async unmount() { await act(async () => root.unmount()); container.remove(); },
  };
  if (text !== undefined) await write(harness, text);
  return harness;
}

const q = <T extends Element = HTMLElement>(h: Harness, id: string): T | null => h.container.querySelector<T>(`[data-testid="${id}"]`);
const dock = (h: Harness) => q(h, "text-card-dock");
const cards = (h: Harness) => [...h.container.querySelectorAll<HTMLButtonElement>('[data-testid="text-preview-band"]')];
const shapeButton = (h: Harness, id: string) => dock(h)!.querySelector<HTMLButtonElement>(`[data-shape="${id}"]`)!;
const litNotes = (h: Harness): number[] => [...dock(h)!.querySelectorAll<HTMLButtonElement>('[data-testid="text-dock-key"]')]
  .filter((key) => key.getAttribute("aria-pressed") === "true").map((key) => Number(key.dataset.note)).sort((a, b) => a - b);
const keyOf = (h: Harness, note: number) => dock(h)!.querySelector<HTMLButtonElement>(`[data-testid="text-dock-key"][data-note="${note}"]`)!;
const chord = (label: string) => parseExtendedTextChordLabel(label)!;
const shapeNotes = (label: string, patch: Partial<VoicingShapeOptions>) => createTextShapeSnapshot(chord(label), { ...DEFAULT_VOICING_SHAPE_OPTIONS, ...patch })!.midiNotes;

async function click(element: Element | null) {
  if (element === null) throw new Error("element missing");
  await act(async () => (element as HTMLElement).click());
}
async function write(h: Harness, value: string) {
  const element = q<HTMLTextAreaElement>(h, "text-progression-input")!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(element, value);
    element.dispatchEvent(new InputEvent("input", { bubbles: true, data: value }));
  });
}
async function press(key: string, options: KeyboardEventInit = {}, target: EventTarget = document.body) {
  await act(async () => { target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...options })); });
}
async function hold(notes: readonly number[]) {
  await act(async () => {
    defaultLiveMidiStore.setState({
      notes: {
        held: new Map(notes.map((note) => [`0:${note}`, { count: 1, velocity: 100, sinceMs: 0, lastEventMs: 0 }])),
        sustained: new Set(), pedalByChannel: new Map(),
      },
    });
  });
}

const MOCK = "| Fmaj7 | Em7 A7 | Dm7 G7 | Cmaj7 |\n| Fmaj7 G7 | Em7 Am7 |";

describe("P25-03 C1: where the band appears", () => {
  it("shows the closed line with no card chosen, the band once one is, and nothing without cards", async () => {
    const h = await mount();
    try {
      expect(q(h, "text-card-dock")).toBeNull();
      expect(q(h, "text-card-dock-closed")).toBeNull();
      await write(h, MOCK);
      expect(q(h, "text-card-dock-closed")?.textContent).toContain("カードを選ぶと、ここでそのカードの音を直せます");
      await click(cards(h)[1]!);
      expect(dock(h)).not.toBeNull();
      expect(q(h, "text-dock-name")?.textContent).toBe("Em7");
      expect(dock(h)!.textContent).toContain("2 小節 · 1–2 拍");
      await click(q(h, "text-dock-close"));
      await settleMotion();
      expect(dock(h)).toBeNull();
      expect(q(h, "text-card-dock-closed")).not.toBeNull();
      // 「鍵盤で入れる」 on: neither the band nor the line.
      await click(q(h, "text-keyboard-toggle"));
      await settleMotion();
      expect(q(h, "text-card-dock")).toBeNull();
      expect(q(h, "text-card-dock-closed")).toBeNull();
    } finally { await h.unmount(); }
  });

  it("shows only the head row for a rest card", async () => {
    const h = await mount("| C _ |");
    try {
      const rest = q(h, "text-preview-rest");
      await click(rest);
      expect(q(h, "text-dock-name")?.textContent).toContain("休符");
      expect(q(h, "text-dock-keyboard")).toBeNull();
      expect(dock(h)!.querySelector("[data-shape]")).toBeNull();
    } finally { await h.unmount(); }
  });
});

describe("P25-03 C4: the five shapes and their parts", () => {
  it("marks 基本 first, plays today's recommendation, and the four K shapes write K's static choice", async () => {
    const h = await mount(MOCK);
    try {
      await click(cards(h)[1]!);
      const buttons = [...dock(h)!.querySelectorAll<HTMLButtonElement>("[data-shape]")];
      expect(buttons.map((b) => b.dataset.shape)).toEqual(["basic", "shell", "rootless", "triad", "quartal"]);
      expect(buttons.map((b) => b.textContent)).toEqual(["基本1", "シェル2", "ルートレス3", "シェル+三和音4", "4 度積み5"].map((t) => expect.stringContaining(t.replace(/\d$/, ""))) as never);
      expect(shapeButton(h, "basic").getAttribute("aria-pressed")).toBe("true");
      expect(q(h, "text-dock-source")?.textContent).toContain("おすすめの形 · 基本");
      expect(litNotes(h)).toEqual(defaultCardNotes(chord("Em7")));
      // Parts cannot be added to 基本.
      expect(q<HTMLButtonElement>(h, "text-dock-tension")!.disabled).toBe(true);
      expect(q(h, "text-dock-tension")!.textContent).toContain("—");
      expect(q(h, "text-dock-tension")!.getAttribute("title")).toBe("基本は今までどおりの音なので、部品は付けられません");
      expect(q<HTMLButtonElement>(h, "text-dock-spread")!.disabled).toBe(true);
      for (const shape of ["shell", "rootless", "triad", "quartal"] as const) {
        await click(shapeButton(h, shape));
        expect(shapeButton(h, shape).getAttribute("aria-pressed")).toBe("true");
        expect(litNotes(h)).toEqual(shapeNotes("Em7", { shape }));
      }
      // Back to 基本 drops the card's own snapshot.
      await click(shapeButton(h, "basic"));
      expect(litNotes(h)).toEqual(defaultCardNotes(chord("Em7")));
    } finally { await h.unmount(); }
  });

  it("names the added tension, 入り済み, なし, and the ② order", async () => {
    const h = await mount("| Em7 | Cmaj9 | G7sus4 |");
    try {
      await click(cards(h)[0]!);
      await click(shapeButton(h, "shell"));
      expect(q(h, "text-dock-tension")!.textContent).toContain("+9(F♯)");
      await click(q(h, "text-dock-tension"));
      expect(litNotes(h)).toEqual(shapeNotes("Em7", { tension: true }));
      expect(q(h, "text-dock-source")?.textContent).toContain("おすすめの形 · シェル + テンション");
      await click(shapeButton(h, "triad"));
      expect(q(h, "text-dock-tension")!.textContent).toContain("入り済み");
      expect(q(h, "text-dock-tension")!.getAttribute("title")).toBe("シェル+三和音 は、はじめからテンションが入っています");
      expect(q<HTMLButtonElement>(h, "text-dock-spread")!.disabled).toBe(true);
      expect(q(h, "text-dock-spread")!.getAttribute("title")).toBe("シェルとルートレスの時だけ使えます");
      await click(cards(h)[1]!);
      await click(shapeButton(h, "shell"));
      expect(q(h, "text-dock-tension")!.textContent).toContain("なし");
      expect(q<HTMLButtonElement>(h, "text-dock-tension")!.disabled).toBe(true);
      // G7sus4's ② only places B: A is faded with the reason.
      await click(cards(h)[2]!);
      await click(shapeButton(h, "rootless"));
      const a = dock(h)!.querySelector<HTMLButtonElement>('[data-form="A"]')!;
      const b = dock(h)!.querySelector<HTMLButtonElement>('[data-form="B"]')!;
      expect(a.disabled).toBe(true);
      expect(a.title).toBe("このコードでは A の並びは範囲に入りません");
      expect(b.getAttribute("aria-pressed")).toBe("true");
    } finally { await h.unmount(); }
  });

  it("fades a shape the chord falls back from and says what plays", async () => {
    const h = await mount("| Cm7b5 |");
    try {
      await click(cards(h)[0]!);
      expect(shapeButton(h, "triad").title).toContain("(このコードでは ルートレス + 広げる で鳴る)");
      await click(shapeButton(h, "triad"));
      // V15: one line, the long words in the title.
      expect(q(h, "text-dock-notice")?.textContent).toBe("代わり:ルートレス + 広げる");
      expect(q(h, "text-dock-notice")?.getAttribute("title")).toBe("Cm7♭5 は シェル+三和音 にできないので、ルートレス + 広げる で鳴らしています");
    } finally { await h.unmount(); }
  });
});

describe("P25-03 C3: the keys add and remove notes", () => {
  it("removes a lit key, adds an unlit one, stops at 2 notes, and keeps the result as hand-edited notes", async () => {
    const h = await mount("| Em7 |");
    try {
      await click(cards(h)[0]!);
      await click(shapeButton(h, "shell"));
      const notes = litNotes(h);
      expect(keyOf(h, notes[1]!).title).toMatch(/· 押すと外す$/);
      await click(keyOf(h, notes[1]!));
      expect(litNotes(h)).toEqual(notes.filter((n) => n !== notes[1]));
      expect(q(h, "text-dock-source")?.textContent).toContain("手で直した音");
      while (litNotes(h).length > 2) await click(keyOf(h, litNotes(h)[0]!));
      const two = litNotes(h);
      await click(keyOf(h, two[0]!));
      expect(litNotes(h)).toEqual(two);
      const free = [...dock(h)!.querySelectorAll<HTMLButtonElement>('[data-testid="text-dock-key"]')].find((key) => key.getAttribute("aria-pressed") !== "true")!;
      await click(free);
      expect(litNotes(h)).toContain(Number(free.dataset.note));
    } finally { await h.unmount(); }
  });
});

describe("P25-03 C5: the range", () => {
  it("offers 「同じ」 for repeated names, goes back to 「このカード」 on another card, and 「ぜんぶ」 reaches every card", async () => {
    const h = await mount(MOCK);
    try {
      await click(cards(h)[1]!);
      const scopes = () => [...dock(h)!.querySelectorAll<HTMLButtonElement>("[data-scope]")];
      expect(scopes().map((s) => s.textContent)).toEqual(["このカード", "同じ Em7 · 2 枚", "ぜんぶ · 10 枚"]);
      await click(scopes()[1]!);
      expect(scopes()[1]!.getAttribute("aria-pressed")).toBe("true");
      await click(cards(h)[2]!);
      expect(scopes()[0]!.getAttribute("aria-pressed")).toBe("true");
      // 「ぜんぶ」 with ルートレス: every chord card gets the shape.
      await click(scopes().find((s) => s.dataset.scope === "all")!);
      await click(shapeButton(h, "rootless"));
      for (const card of cards(h)) {
        await click(card);
        expect(shapeButton(h, "rootless").getAttribute("aria-pressed")).toBe("true");
      }
    } finally { await h.unmount(); }
  });
});

describe("P25-03 C8: undo", () => {
  it("undoes one step at a time, including with Ctrl+Z, and forgets the history when the text is typed", async () => {
    const h = await mount("| Em7 | A7 |");
    try {
      await click(cards(h)[0]!);
      const basic = litNotes(h);
      const undo = () => dock(h)!.querySelector<HTMLButtonElement>('[aria-label="元に戻す"]')!;
      expect(undo().disabled).toBe(true);
      await click(shapeButton(h, "shell"));
      const shell = litNotes(h);
      await press("ArrowUp");
      expect(litNotes(h)).toEqual(invertUp(shell, chord("Em7")));
      await click(undo());
      expect(litNotes(h)).toEqual(shell);
      await press("z", { ctrlKey: true });
      expect(litNotes(h)).toEqual(basic);
      expect(undo().disabled).toBe(true);
      await click(shapeButton(h, "shell"));
      expect(undo().disabled).toBe(false);
      await write(h, "| Em7 | A7 | D7 |");
      await click(cards(h)[0]!);
      expect(undo().disabled).toBe(true);
    } finally { await h.unmount(); }
  });
});

describe("P25-03 C9: the band's keys", () => {
  it("moves, inverts, shifts, picks a shape, approaches, plays and closes; nothing while typing", async () => {
    const h = await mount("| Fmaj7 | Em7 |");
    try {
      await click(cards(h)[0]!);
      await press("ArrowRight");
      expect(q(h, "text-dock-name")?.textContent).toBe("Em7");
      await press("2");
      const shell = shapeNotes("Em7", {});
      expect(litNotes(h)).toEqual(shell);
      await press("ArrowUp", { shiftKey: true });
      expect(litNotes(h)).toEqual(shiftOctave(shell, 1) ?? shell);
      await press("1");
      expect(shapeButton(h, "basic").getAttribute("aria-pressed")).toBe("true");
      const plays = h.onPreview.mock.calls.length;
      await press("Enter");
      expect(h.onPreview.mock.calls.length).toBe(plays + 1);
      await press("s");
      expect(q(h, "text-dock-source")?.textContent).toMatch(/おすすめの形|手で直した音/);
      await press("ArrowLeft");
      expect(q(h, "text-dock-name")?.textContent).toBe("Fmaj7");
      // In the text field the keys do nothing.
      await press("ArrowRight", {}, q(h, "text-progression-input")!);
      expect(q(h, "text-dock-name")?.textContent).toBe("Fmaj7");
      await press("Escape");
      await settleMotion();
      expect(dock(h)).toBeNull();
    } finally { await h.unmount(); }
  });
});

describe("P25-03 C6: MIDI entry", () => {
  it("says when no keyboard is connected, enters a released chord, moves to the next card, and stops at the last", async () => {
    const original = defaultLiveMidiStore.getState();
    const h = await mount("| Em7 | A7 |");
    try {
      await click(cards(h)[0]!);
      await click(q(h, "text-dock-midi"));
      expect(q(h, "text-dock-midi")?.getAttribute("aria-pressed")).toBe("true");
      expect(q(h, "text-dock-midi-face")?.textContent).toContain("MIDI 未接続");
      // V18: the three rows keep their place under the MIDI face (hidden, not removed).
      expect(dock(h)!.querySelector("[data-shape]")?.closest(".lv-dock-face")?.hasAttribute("data-off")).toBe(true);
      expect(q(h, "text-dock-midi-face")?.hasAttribute("data-off")).toBe(false);
      await hold([52, 55, 59, 62]);
      await hold([]);
      expect(q(h, "text-dock-name")?.textContent).toBe("A7");
      await press("ArrowLeft");
      expect(q(h, "text-dock-source")?.textContent).toContain("鍵盤から入れています");
      await press("m");
      expect(q(h, "text-dock-source")?.textContent).toContain("鍵盤で弾いた音");
      expect(litNotes(h)).toEqual([52, 55, 59, 62]);
      await press("ArrowRight");
      await press("m");
      await hold([45, 49, 55]);
      await hold([]);
      expect(q(h, "text-dock-midi")?.getAttribute("aria-pressed")).toBe("false");
    } finally {
      await h.unmount();
      await act(async () => defaultLiveMidiStore.setState(original));
    }
  });
});

describe("P25-03 C10: the card dots", () => {
  it("draws one dot per note in the source colour, without changing the card size", async () => {
    const h = await mount("| Em7 | A7 |");
    try {
      const dots = (index: number) => [...cards(h)[index]!.querySelectorAll<HTMLElement>('[data-testid="text-card-dot"]')];
      expect(dots(0)).toHaveLength(defaultCardNotes(chord("Em7")).length);
      await click(cards(h)[0]!);
      await click(keyOf(h, litNotes(h)[0]!));
      expect(dots(0)).toHaveLength(defaultCardNotes(chord("Em7")).length - 1);
      expect(dots(0)[0]!.style.background).toBe("rgb(201, 183, 255)");
      expect(cards(h)[0]!.title).toContain("手で直した音");
    } finally { await h.unmount(); }
  });
});

describe("P25-03 C11: the save keeps the card's own notes", () => {
  it("saves a shape snapshot and hand-edited notes as they sound", async () => {
    const h = await mount("| Em7 | A7 |");
    try {
      await click(cards(h)[0]!);
      await click(shapeButton(h, "rootless"));
      const rootless = litNotes(h);
      await click(cards(h)[1]!);
      await click(shapeButton(h, "shell"));
      await press("ArrowUp");
      const hand = litNotes(h);
      await click(q(h, "text-progression-save"));
      expect(h.onSaveExtended).toHaveBeenCalledOnce();
      const [result, , , voicings] = h.onSaveExtended.mock.calls[0]! as unknown as [ExtendedTextResult, string, string, TextSaveVoicings];
      const chords: readonly ChordTimelineItem[] = extendedTextSaveData(result, voicings).chords;
      const em = chords.find((item) => item.chord.label === "Em7")!.voicingMemory!.practiceVoicingOverride!;
      const a7 = chords.find((item) => item.chord.label === "A7")!.voicingMemory!.practiceVoicingOverride!;
      expect(em).toMatchObject({ source: "manual", extractorVersion: expect.stringMatching(/^text-shape-v1:rootless(:A|:B)?$/), midiNotes: rootless });
      expect(a7).toMatchObject({ source: "manual", extractorVersion: "text-hand-v1", representation: "simultaneous-voicing", userVerified: true, midiNotes: hand });
    } finally { await h.unmount(); }
  });
});

describe("P25-03 C12: the old parts are gone", () => {
  it("has no 「音を細かく直す」, no 「選んだカード:」 row and no style picker", async () => {
    const h = await mount(MOCK);
    try {
      await click(cards(h)[0]!);
      expect(q(h, "text-progression-convert")).toBeNull();
      expect(q(h, "text-progression-inspector-row")).toBeNull();
      expect(q(h, "voicing-style-selector")).toBeNull();
      expect(h.container.textContent).not.toContain("選んだカード:");
      expect(h.container.textContent).not.toContain("音を細かく直す");
    } finally { await h.unmount(); }
  });
});

describe("P25-03 C5 / K4: 「ぜんぶ」 says how many cards fell back; a chord no shape can make keeps today's sound", () => {
  it("toasts the number of cards that play a nearer shape", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const store = createNotificationStore();
    await act(async () => root.render(<NotificationProvider store={store}><TextProgressionCapturePanel showRomanNumerals={false}
      onPreview={vi.fn()} onStop={vi.fn()} onSaveExtended={vi.fn(() => true)} /></NotificationProvider>));
    const h = { container, onPreview: vi.fn(), onSaveExtended: vi.fn(), onSaveStandard: vi.fn(), unmount: async () => undefined } as Harness;
    try {
      await write(h, "| Cm7b5 | Cdim | Cmaj7 |");
      await click(cards(h)[2]!);
      await click([...dock(h)!.querySelectorAll<HTMLButtonElement>("[data-scope]")].find((b) => b.dataset.scope === "all")!);
      await click(shapeButton(h, "triad"));
      expect(store.getSnapshot().map((item) => item.message)).toContain("2 枚は、この形にできないので近い形で鳴らしています");
    } finally { await act(async () => root.unmount()); container.remove(); }
  });

  it("plays, saves and reopens C7(b9,#9,#11,b13) with today's audition sound (K4 legacy)", async () => {
    const h = await mount("| C7(b9,#9,#11,b13) |");
    try {
      const c = chord("C7(b9,#9,#11,b13)");
      const today = [...voiceTextChordForAudition(c)];
      expect(today.length).toBeGreaterThan(1);
      await click(cards(h)[0]!);
      expect(h.onPreview).toHaveBeenCalledOnce();
      expect(litNotes(h)).toEqual(today);
      await click(shapeButton(h, "rootless"));
      expect(q(h, "text-dock-notice")?.textContent).toBe("代わり:今までの作り方");
      expect(q(h, "text-dock-notice")?.getAttribute("title")).toBe("このコードは形で作れないので、今までの作り方の音で鳴らしています");
      expect(litNotes(h)).toEqual(today);
      await click(q(h, "text-progression-save"));
      const [result, , , voicings] = h.onSaveExtended.mock.calls[0]! as unknown as [ExtendedTextResult, string, string, TextSaveVoicings];
      const item = extendedTextSaveData(result, voicings).chords[0]!;
      expect(textPreviewNotes(item.chord, item.voicingMemory)).toEqual(today);
    } finally { await h.unmount(); }
  });
});

describe("P25-04 C7: the name read again from the notes", () => {
  const inputValue = (h: Harness) => q<HTMLTextAreaElement>(h, "text-progression-input")!.value;
  /** Em7 at ① シェル (the table's starting point), with its own notes on the keys. */
  async function shellEm7(h: Harness, index = 0) {
    await click(cards(h)[index]!);
    await click(shapeButton(h, "shell"));
  }
  const fSharp = (h: Harness) => [...dock(h)!.querySelectorAll<HTMLButtonElement>('[data-testid="text-dock-key"]')]
    .find((key) => Number(key.dataset.note) % 12 === 6 && Number(key.dataset.note) > Math.min(...litNotes(h)) && key.getAttribute("aria-pressed") !== "true")!;

  it("keeps Em7 when B or E goes, rewrites to Em when D goes, and to Em9 when F♯ comes", async () => {
    const h = await mount("| Em7 |");
    try {
      await shellEm7(h);
      const b = litNotes(h).find((note) => note % 12 === 11)!;
      await click(keyOf(h, b));
      expect(inputValue(h)).toBe("| Em7 |");
      expect(q(h, "text-dock-notice")).toBeNull();
      await click(dock(h)!.querySelector('[aria-label="元に戻す"]'));
      await click(keyOf(h, litNotes(h).find((note) => note % 12 === 4)!));
      expect(inputValue(h)).toBe("| Em7 |");
      await click(dock(h)!.querySelector('[aria-label="元に戻す"]'));
      await click(keyOf(h, litNotes(h).find((note) => note % 12 === 2)!));
      expect(inputValue(h)).toBe("| Em |");
      expect(q(h, "text-dock-notice")?.textContent).toBe("入力の Em7 を Em に書き換えました");
      // C8: the rewrite comes back with the notes.
      await click(dock(h)!.querySelector('[aria-label="元に戻す"]'));
      expect(inputValue(h)).toBe("| Em7 |");
      await click(fSharp(h));
      expect(inputValue(h)).toBe("| Em9 |");
      expect(q(h, "text-dock-name")?.textContent).toBe("Em9");
      expect(q(h, "text-dock-source")?.textContent).toContain("手で直した音");
      expect(q(h, "text-dock-notice")?.textContent).toBe("入力の Em7 を Em9 に書き換えました");
    } finally { await h.unmount(); }
  });

  it("keeps Em7 at ② without B (F♯ was already sounding) and says so when two notes cannot be read", async () => {
    const h = await mount("| Em7 |");
    try {
      await click(cards(h)[0]!);
      await click(shapeButton(h, "rootless"));
      await click(keyOf(h, litNotes(h).find((note) => note % 12 === 11)!));
      expect(inputValue(h)).toBe("| Em7 |");
      await click(shapeButton(h, "shell"));
      await click(keyOf(h, litNotes(h).find((note) => note % 12 === 11)!));
      await click(keyOf(h, litNotes(h).find((note) => note % 12 === 7)!));
      expect(litNotes(h)).toHaveLength(2);
      expect(inputValue(h)).toBe("| Em7 |");
      expect(q(h, "text-dock-notice")?.textContent).toBe("音から名前を決められません(Em7 のまま)");
    } finally { await h.unmount(); }
  });

  it("rewrites a % card and a `.` card where they were typed", async () => {
    const h = await mount("| Em7 | % |");
    try {
      await shellEm7(h, 1);
      await click(fSharp(h));
      expect(inputValue(h)).toBe("| Em7 | Em9 |");
    } finally { await h.unmount(); }
    // This intake has no `x2` repeat (one typed place never makes two cards); the E2 `.` card is its own place.
    const r = await mount("Em7, ., A7");
    try {
      await shellEm7(r, 1);
      await click(fSharp(r));
      expect(inputValue(r)).toBe("Em7, Em9, A7");
    } finally { await r.unmount(); }
    // E: in a `[C]歌詞` line only the characters inside the brackets change.
    const l = await mount("[Em7]きょうも[A7]あるく");
    try {
      await shellEm7(l, 0);
      await click(fSharp(l));
      expect(inputValue(l)).toBe("[Em9]きょうも[A7]あるく");
    } finally { await l.unmount(); }
  });

  it("rewrites a degree-written place (IIm7) with the new chord name", async () => {
    const h = await mount();
    try {
      await click(q(h, "text-progression-key"));
      await click([...h.container.querySelectorAll<HTMLElement>('[data-testid="text-progression-key-list"] [role="option"]')].find((option) => option.dataset.value === "C major")!);
      await write(h, "| IIm7 |");
      await click(cards(h)[0]!);
      await click(shapeButton(h, "shell"));
      const e = [...dock(h)!.querySelectorAll<HTMLButtonElement>('[data-testid="text-dock-key"]')]
        .find((key) => Number(key.dataset.note) % 12 === 4 && Number(key.dataset.note) > Math.min(...litNotes(h)) && key.getAttribute("aria-pressed") !== "true")!;
      await click(e);
      expect(inputValue(h)).toBe("| Dm9 |");
    } finally { await h.unmount(); }
  });

  it("rewrites every same-name card in 「同じ」 and keeps the other cards' sounds", async () => {
    const h = await mount("| Em7 | A7 | Em7 |");
    try {
      await click(cards(h)[1]!);
      await click(shapeButton(h, "rootless"));
      const a7 = litNotes(h);
      await click(cards(h)[2]!);
      await click([...dock(h)!.querySelectorAll<HTMLButtonElement>("[data-scope]")].find((b) => b.dataset.scope === "same")!);
      await click(shapeButton(h, "shell"));
      await click(fSharp(h));
      expect(inputValue(h)).toBe("| Em9 | A7 | Em9 |");
      expect(q(h, "text-dock-name")?.textContent).toBe("Em9");
      await click(cards(h)[1]!);
      expect(litNotes(h)).toEqual(a7);
      expect(shapeButton(h, "rootless").getAttribute("aria-pressed")).toBe("true");
    } finally { await h.unmount(); }
  });
});

describe("P25 C12 (rev12): rests only", () => {
  it("cannot be saved, and says why beside the button", async () => {
    const h = await mount("| _ | _ |");
    try {
      expect(q<HTMLButtonElement>(h, "text-progression-save")!.disabled).toBe(true);
      expect(q(h, "text-save-rest-only")?.textContent).toBe("コードのない進行です(休符だけ)");
      await write(h, "| C | _ |");
      expect(q(h, "text-save-rest-only")).toBeNull();
      expect(q<HTMLButtonElement>(h, "text-progression-save")!.disabled).toBe(false);
    } finally { await h.unmount(); }
  });
});

describe("V16・V17: the right side's three rows and 「最初から」", () => {
  it("labels the rows 形・部品・位置, keeps 「最初から」 beside ↶ (off until changed), and 「前のコードに近づける」 is off on the first card", async () => {
    const h = await mount(MOCK);
    try {
      await click(cards(h)[0]!);
      const right = q(h, "text-dock-right")!;
      expect([...right.querySelectorAll('.lv-dock-face > [role="group"]')].map((group) => group.getAttribute("aria-label"))).toEqual(["形", "部品", "位置"]);
      const reset = q<HTMLButtonElement>(h, "text-dock-reset")!;
      expect(reset.disabled).toBe(true);
      expect(reset.previousElementSibling?.getAttribute("aria-label")).toBe("元に戻す");
      const approach = q<HTMLButtonElement>(h, "text-dock-approach")!;
      expect(approach.textContent).toBe("前のコードに近づけるS");
      expect(approach.getAttribute("title")).toBe("1 つ前のカードの音から、なるべく動かない転回と高さにします (S)");
      expect(approach.disabled).toBe(true);
      await click(dock(h)!.querySelector('[aria-label="転回を上げる"]'));
      expect(q<HTMLButtonElement>(h, "text-dock-reset")!.disabled).toBe(false);
      await click(cards(h)[1]!);
      expect(q<HTMLButtonElement>(h, "text-dock-approach")!.disabled).toBe(false);
      expect(q<HTMLButtonElement>(h, "text-dock-reset")!.disabled).toBe(true);
    } finally { await h.unmount(); }
  });
});

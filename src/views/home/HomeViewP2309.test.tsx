// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { playbackController } from "../../audio/playbackController";
import { createNotificationStore, NotificationProvider } from "../../components/notifications";
import { emptyItem, emptyStore } from "../../domain/chordDojo/store";
import { dojoStore } from "../../domain/chordDojo/runtime";
import { makeIdea } from "../../domain/testFactory";
import type { ChordSymbol, SavedProgressionBlock, SongIdea } from "../../domain/types";
import { MIDI_EXPORT_FEATURE_STORAGE_KEY } from "../../midiExport/featureFlag";
import { HomeView, type HomeViewProps } from "../HomeView";
import { PRACTICE_OPENS_KEY } from "./practiceOpens";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const roots: Root[] = [];
const NOW = new Date(2026, 10, 13, 12, 0);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  window.localStorage.clear();
  dojoStore.setState({ file: emptyStore(), ready: true, error: undefined });
});

afterEach(async () => {
  playbackController.stop();
  await act(async () => roots.splice(0).forEach((root) => root.unmount()));
  document.body.replaceChildren();
  vi.useRealTimers();
  vi.restoreAllMocks();
  window.localStorage.clear();
});

const QUALITY: Record<string, ChordSymbol["quality"]> = { maj7: "maj7", m7: "min7", "7": "dom7", "": "maj", m: "min", m7b5: "min7b5" };
const ROOTS: Record<string, number> = { C: 0, "C#": 1, Db: 1, D: 2, Eb: 3, E: 4, F: 5, "F#": 6, G: 7, Ab: 8, A: 9, Bb: 10, B: 11 };

function chord(label: string, bar: number) {
  const match = /^([A-G][#b]?)(.*)$/.exec(label)!;
  return {
    bar, beat: 1, durationBeats: 4, confidence: 0.9, alternatives: [], warnings: [],
    chord: { root: ROOTS[match[1]!]!, quality: QUALITY[match[2]!] ?? "maj", tensions: [], label },
  };
}

function block(id: string, labels: string[], extra: Partial<SavedProgressionBlock> = {}, day = 1): SavedProgressionBlock {
  return {
    id,
    summaryText: id,
    chords: labels.map((label, index) => chord(label, index + 1)) as SavedProgressionBlock["chords"],
    detectedKey: "C major",
    bpm: 100,
    tags: [],
    capturedAt: new Date(2026, 10, day).toISOString(),
    analyzerVersion: "p23-09-test",
    ...extra,
  };
}

/** One Idea per progression so each name is its title. */
function ideasOf(...blocks: SavedProgressionBlock[]): SongIdea[] {
  return blocks.map((item) => makeIdea({ id: `idea-${item.id}`, title: `進行 ${item.id}`, key: undefined, updatedAt: new Date(2026, 9, 1).toISOString(), progressionBlocks: [item] }));
}

const eight = () => ideasOf(...Array.from({ length: 8 }, (_, index) => block(`p${index + 1}`, ["Dm7", "G7", "Cmaj7", "A7"], {}, index + 1)));

async function renderHome(ideas: SongIdea[], overrides: Partial<HomeViewProps> = {}) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  await act(async () => {
    root.render(
      <NotificationProvider store={createNotificationStore()}>
        <HomeView
          ideas={ideas}
          bassPracticeAvailable
          showRomanNumerals
          openProgression={vi.fn()}
          openCapture={vi.fn()}
          openVault={vi.fn()}
          openChordDojo={vi.fn()}
          openBassPractice={vi.fn()}
          openVoicingLoop={vi.fn()}
          openVoicingLoopHome={vi.fn()}
          resumeChordDojo={vi.fn()}
          updateProgressionBlock={vi.fn(() => true as const)}
          {...overrides}
        />
      </NotificationProvider>,
    );
  });
  return container;
}

const section = (container: Element, label: string) => container.querySelector<HTMLElement>(`section[aria-label='${label}']`)!;
const buttonNamed = (scope: Element, text: string) => {
  const found = [...scope.querySelectorAll<HTMLButtonElement>("button")].find((item) => item.textContent?.trim() === text);
  if (!found) throw new Error(`button not found: ${text}`);
  return found;
};
const click = (element: Element) => act(async () => (element as HTMLElement).click());

function seedOpens(opens: { id: string; via?: string; at: Date }[]) {
  window.localStorage.setItem(PRACTICE_OPENS_KEY, JSON.stringify({
    version: 1,
    opens: opens.map(({ id, via = "voicing-loop", at }) => ({ ideaId: `idea-${id}`, blockId: id, via, at: at.toISOString() })),
  }));
}

describe("P23-09 Home layout (G1)", () => {
  it("G1: the left column is 今日のループ → 続きから → 最近入れた進行, the right column 取り込む → 練習 → 自分の引き出し", async () => {
    const container = await renderHome(eight());
    const column = (side: string) => [...container.querySelectorAll(`.lv-home-col[data-col='${side}'] > section`)].map((item) => item.getAttribute("aria-label"));
    expect(column("left")).toEqual(["今日のループ", "続きから", "最近入れた進行"]);
    expect(column("right")).toEqual(["取り込む", "練習", "自分の引き出し"]);
  });

  it("the guide alone stays when there is no progression", async () => {
    const container = await renderHome([makeIdea({ id: "empty", progressionBlocks: [] })]);
    expect(container.querySelector(".lv-home-board")).toBeNull();
    expect(container.textContent).toContain("最初の進行を取り込む");
  });
});

describe("P23-09 今日のループ (T1–T4)", () => {
  it("T1: ▶ plays the loop on the spot and a chord box plays that chord", async () => {
    const toggle = vi.spyOn(playbackController, "toggle").mockResolvedValue();
    const container = await renderHome(ideasOf(block("a", ["Dm7", "G7", "Cmaj7"])));
    const loop = section(container, "今日のループ");
    await click(loop.querySelector("[aria-label='今日のループを再生']")!);
    expect(toggle).toHaveBeenLastCalledWith(expect.objectContaining({ kind: "home", id: "today-loop:idea-a:a" }), expect.objectContaining({ type: "timeline" }));
    await click(loop.querySelector("[data-home-loop-chord='1']")!);
    expect(toggle).toHaveBeenLastCalledWith(expect.objectContaining({ kind: "home" }), expect.objectContaining({ type: "chord", chord: expect.objectContaining({ label: "G7" }) }));
  });

  it("T1: the chord boxes take the role colours only when the key is known", async () => {
    const known = await renderHome(ideasOf(block("a", ["Dm7", "G7", "Cmaj7"])));
    expect([...known.querySelectorAll("[data-home-loop-chord]")].map((item) => item.getAttribute("data-fn"))).toEqual(["SD", "D", "T"]);
    await act(async () => roots.splice(0).forEach((root) => root.unmount()));
    const unknown = await renderHome(ideasOf(block("b", ["Dm7", "G7", "Cmaj7"], { detectedKey: undefined })));
    expect([...unknown.querySelectorAll("[data-home-loop-chord]")].map((item) => item.getAttribute("data-fn"))).toEqual([null, null, null]);
  });

  it("T2: three buttons of the same weight; no 「Vault で開く」 and no 「V」 badge", async () => {
    const openVoicingLoop = vi.fn();
    const openChordDojo = vi.fn();
    const openProgression = vi.fn();
    const container = await renderHome(ideasOf(block("a", ["Dm7", "G7"])), { openVoicingLoop, openChordDojo, openProgression });
    const loop = section(container, "今日のループ");
    const actions = [...loop.querySelectorAll<HTMLButtonElement>(".lv-home-go")];
    expect(actions.map((item) => item.textContent?.trim())).toEqual(["Voicing Loop で弾く", "Chord Dojo で覚える", "開いて編集"]);
    expect(new Set(actions.map((item) => item.className)).size).toBe(1);
    expect(actions.every((item) => item.classList.contains("lv-button-neutral"))).toBe(true);
    expect(loop.querySelector(".lv-button-primary")).toBeNull();
    expect(actions[2]!.querySelector("svg")).not.toBeNull();
    expect(loop.textContent).not.toContain("Vault で開く");
    expect([...loop.querySelectorAll("button, span, i")].some((item) => item.textContent?.trim() === "V")).toBe(false);
    await click(actions[0]!);
    expect(openVoicingLoop).toHaveBeenCalledWith({ ideaId: "idea-a", blockId: "a" });
    await click(actions[1]!);
    expect(openChordDojo).toHaveBeenCalledWith({ ideaId: "idea-a", blockId: "a" });
    await click(actions[2]!);
    expect(openProgression).toHaveBeenCalledWith("idea-a", "a");
  });

  it("T3: 「MIDI を DAW へ」 sits in 今日のループ only while the export is enabled; N4: never in 最近入れた進行", async () => {
    const shown = await renderHome(eight());
    const control = section(shown, "今日のループ").querySelector("[data-midi-export-control]");
    expect(control?.textContent).toContain("MIDI を DAW へ");
    expect(control?.querySelector("button")?.getAttribute("aria-label")).toBe("このコード進行をMIDIとして保存。ドラッグするとDAWへ追加できます。");
    expect(section(shown, "最近入れた進行").querySelector("[data-midi-export-control]")).toBeNull();
    expect(shown.querySelectorAll("[data-midi-export-control]")).toHaveLength(1);
    await act(async () => roots.splice(0).forEach((root) => root.unmount()));
    window.localStorage.setItem(MIDI_EXPORT_FEATURE_STORAGE_KEY, "false");
    const hidden = await renderHome(eight());
    expect(hidden.querySelector("[data-midi-export-control]")).toBeNull();
  });
});

describe("P23-09 続きから (R2)", () => {
  it("R2: the strip writes ♯ and ♭ with the chord-name parts; the spoken name stays plain", async () => {
    const container = await renderHome(ideasOf(block("a", ["C#m7b5", "Bb7"])));
    const strip = section(container, "続きから").querySelector(".lv-home-strip")!;
    const chords = [...strip.querySelectorAll(".lv-home-strip-chord")];
    expect(chords.map((item) => item.textContent)).toEqual(["C♯m7♭5", "B♭7"]);
    expect(chords[0]!.querySelector(".lv-chordname-acc")?.textContent).toBe("♯");
    expect(chords.map((item) => item.getAttribute("aria-label"))).toEqual(["試聴: C#m7b5", "試聴: Bb7"]);
  });
});

describe("P23-09 最近入れた進行 (N1–N3)", () => {
  it("N1: four rows with where each came from", async () => {
    const ideas = ideasOf(
      block("midi", ["C"], {}, 9),
      block("text", ["C"], { textSource: { schemaVersion: 1, originalText: "C", normalizedText: "C" } as never }, 8),
      block("live", ["C"], { origin: "live-midi" } as Partial<SavedProgressionBlock>, 7),
      block("x", ["C"], {}, 6),
      block("y", ["C"], {}, 5),
    );
    const container = await renderHome(ideas);
    const rows = [...section(container, "最近入れた進行").querySelectorAll("[data-testid='home-recent-row']")];
    expect(rows).toHaveLength(4);
    expect(rows.map((row) => row.querySelector(".lv-home-src-mark")?.textContent)).toEqual(["MIDI", "テキスト", "Live MIDI", "MIDI"]);
  });

  it("N2/C7: a small chord plays and the row does not open", async () => {
    const toggle = vi.spyOn(playbackController, "toggle").mockResolvedValue();
    const openProgression = vi.fn();
    const container = await renderHome(eight(), { openProgression });
    const row = section(container, "最近入れた進行").querySelector("[data-testid='home-recent-row']")!;
    const chip = row.querySelector<HTMLButtonElement>(".lv-home-recent-chip")!;
    expect(chip.getAttribute("aria-label")).toBe("試聴: Dm7");
    await click(chip);
    expect(toggle).toHaveBeenCalledWith(expect.objectContaining({ kind: "home" }), expect.objectContaining({ type: "chord", sound: "piano", explicitMidiNotes: expect.any(Array) }));
    expect(openProgression).not.toHaveBeenCalled();
    await click(row);
    expect(openProgression).toHaveBeenCalledWith("idea-p8", "p8");
  });

  it("C7: a 今日のループ chord plays and does not open the progression page", async () => {
    const toggle = vi.spyOn(playbackController, "toggle").mockResolvedValue();
    const openProgression = vi.fn();
    const container = await renderHome(eight(), { openProgression });
    await click(section(container, "今日のループ").querySelector("[data-home-loop-chord='0']")!);
    expect(toggle).toHaveBeenCalledWith(expect.objectContaining({ kind: "home" }), expect.objectContaining({ type: "chord" }));
    expect(openProgression).not.toHaveBeenCalled();
  });
});

describe("P23-09 取り込む (I1/I2)", () => {
  it("I1/I2: the MIDI box says 取り込む; the text box shows Dm7 | G7 | Cmaj7 → three coloured boxes", async () => {
    const openCapture = vi.fn();
    const container = await renderHome(eight(), { openCapture });
    const panel = section(container, "取り込む");
    const midi = panel.querySelector<HTMLButtonElement>(".lv-home-drop")!;
    expect(midi.textContent).toContain("取り込むを開いてファイルを選ぶ");
    expect(midi.textContent).not.toContain("コード採集");
    const text = panel.querySelector<HTMLButtonElement>(".lv-home-row-button")!;
    expect(text.querySelector(".lv-home-text-icon svg")).not.toBeNull();
    expect(text.querySelector(".lv-home-text-src")?.textContent).toBe("Dm7 | G7 | Cmaj7");
    expect([...text.querySelectorAll(".lv-home-text-chips > span")].map((item) => [item.textContent, item.getAttribute("data-fn")]))
      .toEqual([["Dm7", "SD"], ["G7", "D"], ["Cmaj7", "T"]]);
    await click(text);
    expect(openCapture).toHaveBeenLastCalledWith("text");
    await click(midi);
    expect(openCapture).toHaveBeenLastCalledWith("midi");
  });
});

describe("P23-09 練習 (P1–P3)", () => {
  it("P1/C5: a Voicing Loop open 3 days ago marks only the 4th of the 7 days", async () => {
    const ideas = eight();
    seedOpens([{ id: "p1", at: new Date(2026, 10, 10, 9) }]);
    const container = await renderHome(ideas);
    const marks = (kind: string) => [...section(container, "練習").querySelectorAll(`[data-practice-kind='${kind}'] [data-testid='home-practice-week'] i`)]
      .map((item) => item.getAttribute("data-practised"));
    expect(marks("voicing-loop")).toEqual(["false", "false", "false", "true", "false", "false", "false"]);
    expect(marks("chord-dojo")).toEqual(Array(7).fill("false"));
    expect(marks("bass-practice")).toEqual(Array(7).fill("false"));
  });

  it("P2: the old 5-day dots and the round counts are gone; the rows say 前回 … / 今日 n 回 / 今日はまだ", async () => {
    window.localStorage.setItem("loop-vault:voicing-loop-last:v1", JSON.stringify({ version: 1, reference: { ideaId: "idea-p2", blockId: "p2" }, at: new Date(2026, 10, 12, 21).toISOString() }));
    const dojo = emptyStore();
    dojo.shapes["preset:x"] = { ...emptyItem(), recent: [{ at: new Date(2026, 10, 13, 9).toISOString(), ok: true }] };
    dojoStore.setState({ file: dojo });
    const container = await renderHome(eight());
    const practice = section(container, "練習");
    expect(practice.querySelector("[data-testid='home-practice-streak']")).toBeNull();
    expect(practice.querySelector("[aria-label='今日の回数']")).toBeNull();
    const rows = [...practice.querySelectorAll("[data-testid='home-practice-row']")];
    expect(rows[0]!.textContent).toContain("前回 進行 p2 ・ 昨日");
    expect(rows[1]!.textContent).toContain("今日 1 回");
    expect(rows[2]!.textContent).toContain("今日はまだ");
  });

  it("P3: Bass Practice only while it can be used, opening the Bass Practice", async () => {
    const openBassPractice = vi.fn();
    const shown = await renderHome(eight(), { openBassPractice });
    await click(shown.querySelector("[data-practice-kind='bass-practice']")!);
    expect(openBassPractice).toHaveBeenCalledWith();
    await act(async () => roots.splice(0).forEach((root) => root.unmount()));
    const hidden = await renderHome(eight(), { bassPracticeAvailable: false });
    expect(hidden.querySelector("[data-practice-kind='bass-practice']")).toBeNull();
    expect(hidden.querySelectorAll("[data-testid='home-practice-row']")).toHaveLength(2);
  });
});

describe("P23-09 自分の引き出し (D1–D6)", () => {
  it("D1/D2/C4: よく開く first; 3, 2 and 1 opens give three rows in that order with the counts, and a row opens the page", async () => {
    const openProgression = vi.fn();
    const day = (offset: number) => new Date(2026, 10, 13 - offset, 10);
    seedOpens([
      { id: "p2", at: day(1) }, { id: "p5", at: day(1) }, { id: "p5", at: day(2), via: "chord-dojo" },
      { id: "p7", at: day(0) }, { id: "p7", at: day(3) }, { id: "p7", at: day(4), via: "chord-dojo" },
    ]);
    const container = await renderHome(eight(), { openProgression });
    const drawer = section(container, "自分の引き出し");
    expect(drawer.querySelector("[role='radio'][aria-checked='true']")?.textContent).toBe("よく開く");
    const rows = [...drawer.querySelectorAll("[data-testid='home-top-opened-row']")];
    expect(rows.map((row) => row.querySelector(".truncate")?.textContent)).toEqual(["進行 p7", "進行 p5", "進行 p2"]);
    expect(rows.map((row) => row.lastElementChild?.textContent)).toEqual(["3 回", "2 回", "1 回"]);
    expect(rows[0]!.querySelector(".lv-home-rank-chords")?.textContent).toBe("Dm7G7Cmaj7A7");
    await click(rows[1]!);
    expect(openProgression).toHaveBeenCalledWith("idea-p5", "p5");
  });

  it("C4/D2: one opened progression is one row; nothing opened says 今週はまだ開いていません", async () => {
    seedOpens([{ id: "p3", at: new Date(2026, 10, 12) }]);
    const one = await renderHome(eight());
    expect(one.querySelectorAll("[data-testid='home-top-opened-row']")).toHaveLength(1);
    expect(one.textContent).not.toContain("今週はまだ開いていません");
    await act(async () => roots.splice(0).forEach((root) => root.unmount()));
    window.localStorage.clear();
    const none = await renderHome(eight());
    expect(none.querySelectorAll("[data-testid='home-top-opened-row']")).toHaveLength(0);
    expect(section(none, "自分の引き出し").textContent).toContain("今週はまだ開いていません");
  });

  it("D3–D6/C6: C major 3 and A minor 1 open on C; minor then A shows one row", async () => {
    const ideas = ideasOf(
      block("c1", ["C"], {}, 1), block("c2", ["C"], {}, 2), block("c3", ["C"], {}, 3),
      block("a1", ["Am"], { detectedKey: "A minor" }, 4),
      block("none", ["C"], { detectedKey: undefined }, 5),
    );
    const container = await renderHome(ideas);
    const drawer = section(container, "自分の引き出し");
    await click(buttonNamed(drawer, "キーで聴く"));
    const keys = drawer.querySelector("[data-testid='home-drawer-keys']")!;
    const wheel = [...keys.querySelectorAll("[data-key-slot]")];
    expect(wheel).toHaveLength(12);
    expect(wheel.map((item) => item.querySelector("text")?.textContent)).toEqual(["C", "G", "D", "A", "E", "B", "F♯", "D♭", "A♭", "E♭", "B♭", "F"]);
    expect(keys.querySelector("[data-selected='true']")?.getAttribute("data-key-slot")).toBe("0");
    expect(keys.querySelector(".lv-home-wheel-name")?.textContent).toBe("C");
    expect(keys.querySelector(".lv-home-wheel-mode")?.textContent).toBe("メジャー");
    expect(keys.querySelector(".lv-home-legend")?.textContent).toBe("濃いほど多い");
    expect(keys.querySelector("[data-testid='home-key-count']")?.textContent).toBe("C メジャーの進行 ・ 3 件");
    expect([...keys.querySelectorAll(".lv-home-key-row")].map((row) => row.textContent)).toEqual(["進行 c31小節", "進行 c21小節", "進行 c11小節"]);
    expect(wheel[0]!.getAttribute("data-count")).toBe("3");
    expect(wheel.filter((item) => item.getAttribute("data-count") !== "0")).toHaveLength(1);

    await act(async () => keys.querySelector("[aria-label='マイナーに切り替える']")!.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    const minor = [...keys.querySelectorAll("[data-key-slot]")];
    expect(minor.map((item) => item.querySelector("text")?.textContent)).toEqual(["A", "E", "B", "F♯", "C♯", "G♯", "E♭", "B♭", "F", "C", "G", "D"]);
    await act(async () => minor[0]!.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(keys.querySelector("[data-testid='home-key-count']")?.textContent).toBe("A マイナーの進行 ・ 1 件");
    expect(keys.querySelectorAll(".lv-home-key-row")).toHaveLength(1);
    expect(keys.querySelector(".lv-home-wheel-name")?.textContent).toBe("A");
    expect(keys.querySelector(".lv-home-wheel-mode")?.textContent).toBe("マイナー");
    expect(keys.querySelector("[aria-label='メジャーに切り替える']")).not.toBeNull();
  });

  it("D3: denser for more; the chosen key is filled; Enter on a key chooses it; a key with none says so", async () => {
    const ideas = ideasOf(block("c1", ["C"], {}, 1), block("c2", ["C"], {}, 2), block("g1", ["G"], { detectedKey: "G major" }, 3));
    const container = await renderHome(ideas);
    await click(buttonNamed(section(container, "自分の引き出し"), "キーで聴く"));
    const keys = container.querySelector("[data-testid='home-drawer-keys']")!;
    const slot = (index: number) => keys.querySelector<SVGGElement>(`[data-key-slot='${index}']`)!;
    expect(slot(0).getAttribute("data-selected")).toBe("true");
    expect(slot(0).querySelector("path")?.getAttribute("style")).toBeNull();
    expect(slot(1).querySelector("path")?.getAttribute("style")).toContain("rgb(66 216 198 / 51%)");
    expect(slot(2).querySelector("path")?.getAttribute("style")).toBeNull();
    await act(async () => slot(1).dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
    expect(slot(1).getAttribute("aria-pressed")).toBe("true");
    expect(slot(0).querySelector("path")?.getAttribute("style")).toContain("rgb(66 216 198 / 80%)");
    expect(keys.querySelector("[data-testid='home-key-count']")?.textContent).toBe("G メジャーの進行 ・ 1 件");
    await act(async () => slot(2).dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(keys.querySelector("[data-testid='home-key-count']")?.textContent).toBe("D メジャー");
    expect(keys.textContent).toContain("このキーの進行はまだありません。");
  });

  it("D4: four or more in a key shows 3 rows and ほか n 件を Vault で見る, which opens the Vault; a row plays", async () => {
    const toggle = vi.spyOn(playbackController, "toggle").mockResolvedValue();
    const openVault = vi.fn();
    const container = await renderHome(eight(), { openVault });
    await click(buttonNamed(section(container, "自分の引き出し"), "キーで聴く"));
    const keys = container.querySelector("[data-testid='home-drawer-keys']")!;
    expect(keys.querySelector("[data-testid='home-key-count']")?.textContent).toBe("C メジャーの進行 ・ 8 件");
    expect(keys.querySelectorAll(".lv-home-key-row")).toHaveLength(3);
    await click(keys.querySelector(".lv-home-key-row")!);
    expect(toggle).toHaveBeenCalledWith(expect.objectContaining({ id: "key:idea-p8:p8" }), expect.objectContaining({ type: "timeline" }));
    await click(buttonNamed(keys, "ほか 5 件を Vault で見る"));
    expect(openVault).toHaveBeenCalledOnce();
  });

  it("C9: the drawer tabs switch with ← →", async () => {
    const container = await renderHome(eight());
    const drawer = section(container, "自分の引き出し");
    const opened = buttonNamed(drawer, "よく開く");
    await act(async () => opened.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })));
    expect(drawer.querySelector("[data-testid='home-drawer-keys']")).not.toBeNull();
    expect(document.activeElement?.textContent).toBe("キーで聴く");
    await act(async () => document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true })));
    expect(drawer.querySelector("[data-testid='home-drawer-opened']")).not.toBeNull();
  });
});

describe("P23-09 one progression (C3)", () => {
  it("C3: 今日のループ is that one, one recent row, 今週はまだ開いていません, only its key is dense", async () => {
    const container = await renderHome(ideasOf(block("solo", ["Dm7", "G7"], { detectedKey: "D minor" })));
    expect(section(container, "今日のループ").getAttribute("data-progression-id")).toBe("idea-solo:solo");
    expect(container.querySelectorAll("[data-testid='home-recent-row']")).toHaveLength(1);
    expect(section(container, "自分の引き出し").textContent).toContain("今週はまだ開いていません");
    await click(buttonNamed(section(container, "自分の引き出し"), "キーで聴く"));
    const keys = container.querySelector("[data-testid='home-drawer-keys']")!;
    const dense = [...keys.querySelectorAll("[data-key-slot]")].filter((item) => item.getAttribute("data-count") !== "0");
    expect(dense.map((item) => item.querySelector("text")?.textContent)).toEqual(["D"]);
    expect(dense[0]!.getAttribute("data-selected")).toBe("true");
    expect(keys.querySelector("[data-testid='home-key-count']")?.textContent).toBe("D マイナーの進行 ・ 1 件");
  });
});

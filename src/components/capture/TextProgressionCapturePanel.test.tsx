// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";

const pianoMonitor = vi.hoisted(() => {
  const updateNotes = vi.fn();
  const stop = vi.fn();
  const dispose = vi.fn();
  return {
    updateNotes,
    stop,
    dispose,
    create: vi.fn(async () => ({ updateNotes, stop, dispose })),
  };
});

vi.mock("../../audio/midiInputPianoMonitor", () => ({
  createMidiInputPianoMonitor: pianoMonitor.create,
}));

import { TextProgressionCapturePanel } from "./TextProgressionCapturePanel";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

type PanelProps = Parameters<typeof TextProgressionCapturePanel>[0];

interface Harness {
  readonly container: HTMLElement;
  readonly onPreview: ReturnType<typeof vi.fn>;
  readonly onStop: ReturnType<typeof vi.fn>;
  render(overrides?: Partial<PanelProps>): Promise<void>;
  unmount(): Promise<void>;
}

async function mount(overrides: Partial<PanelProps> = {}): Promise<Harness> {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const onPreview = vi.fn();
  const onStop = vi.fn();
  let props: PanelProps = {
    showRomanNumerals: true,
    onPreview,
    onStop,
    ...overrides,
  };

  const harness: Harness = {
    container,
    onPreview,
    onStop,
    async render(next = {}) {
      props = { ...props, ...next };
      await act(async () => {
        root.render(<TextProgressionCapturePanel {...props} />);
      });
    },
    async unmount() {
      await act(async () => root.unmount());
      container.remove();
    },
  };
  await harness.render();
  return harness;
}

async function changeValue(
  element: HTMLInputElement | HTMLTextAreaElement,
  value: string,
) {
  const prototype = element instanceof HTMLInputElement
    ? HTMLInputElement.prototype
    : HTMLTextAreaElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  await act(async () => {
    setter?.call(element, value);
    element.dispatchEvent(new InputEvent("input", { bubbles: true, data: value }));
  });
}


async function click(element: HTMLElement) {
  await act(async () => element.click());
}

/** P24-07: the key picker is a button + listbox; open it, choose a value, and it closes. */
async function chooseKey(harness: Harness, value: string) {
  await click(keyInput(harness));
  const option = [...harness.container.querySelectorAll<HTMLElement>(
    '[data-testid="text-progression-key-list"] [role="option"]',
  )].find((element) => element.dataset.value === value);
  expect(option).not.toBeUndefined();
  await click(option!);
}

/** The options the key window shows (values and labels), with the window left closed. */
async function keyOptions(harness: Harness) {
  await click(keyInput(harness));
  const options = [...harness.container.querySelectorAll<HTMLElement>(
    '[data-testid="text-progression-key-list"] [role="option"]',
  )].map((element) => ({ value: element.dataset.value, label: element.textContent }));
  await click(keyInput(harness));
  return options;
}

function input(harness: Harness) {
  const element = harness.container.querySelector<HTMLTextAreaElement>(
    '[data-testid="text-progression-input"]',
  );
  expect(element).not.toBeNull();
  return element!;
}

function keyInput(harness: Harness) {
  const element = harness.container.querySelector<HTMLButtonElement>(
    '[data-testid="text-progression-key"]',
  );
  expect(element).not.toBeNull();
  return element!;
}

function bpmInput(harness: Harness) {
  const element = harness.container.querySelector<HTMLInputElement>(
    '[data-testid="text-progression-bpm"]',
  );
  expect(element).not.toBeNull();
  return element!;
}

function button(harness: Harness, testId: string) {
  const element = harness.container.querySelector<HTMLButtonElement>(`[data-testid="${testId}"]`);
  expect(element).not.toBeNull();
  return element!;
}

describe("TextProgressionCapturePanel", () => {
  it("is one text screen with no syntax switch and no duplicate app heading", async () => {
    const harness = await mount();
    try {
      // P24-05: the two pane headings are h2 in the design; the app's own heading is not repeated here.
      const heading = () => [...harness.container.querySelectorAll("h2")].map(node => node.textContent);
      expect(heading()).toEqual(["入力", "プレビュー"]);
      // P24-05: the 「通常 / 拡張」 switch and its second screen are gone; there is one intake.
      expect(harness.container.querySelectorAll('[data-testid="text-mode-standard"]')).toHaveLength(0);
      expect(harness.container.querySelectorAll('[data-testid="text-mode-extended"]')).toHaveLength(0);
      expect(harness.container.querySelectorAll('[data-testid="standard-text-intake"]')).toHaveLength(1);
      expect(harness.container.querySelectorAll('[data-testid="extended-text-input"]')).toHaveLength(0);
      // Nothing to normalise yet: the band only appears when the reading differs from the text.
      expect(harness.container.querySelector('[data-testid="text-normalize-band"]')).toBeNull();
      await changeValue(input(harness), "歌詞の行\n| Cmaj7 | Dm7 |");
      expect(harness.container.querySelector('[data-testid="text-normalize-band"]')).not.toBeNull();
      expect(harness.container.querySelector('[data-testid="text-intake-decorations"]')).not.toBeNull();
    } finally {
      await harness.unmount();
    }
  });

  it("P25-01 B: puts the 「?」 at the right end of the top band with three headed sections", async () => {
    const harness = await mount();
    try {
      const help = harness.container.querySelector<HTMLButtonElement>('[data-testid="text-help"]')!;
      expect(help.getAttribute("aria-label")).toBe("使い方とショートカット");
      const toolbar = harness.container.querySelector('[data-testid="text-capture-toolbar"]')!;
      // Last child of the band, outside the two groups (the band's flex row pushes it to the right edge).
      expect([...toolbar.children].map((child) => child.getAttribute("aria-label") ?? child.className))
        .toEqual(["読み方の設定", "試聴", "lv-text-top-help"]);
      expect(help.closest(".lv-text-topgroup")).toBeNull();
      await click(help);
      const face = document.querySelector<HTMLElement>('[data-testid="text-help-face"]')!;
      expect(face.getAttribute("role")).toBe("dialog");
      expect([...face.querySelectorAll("h3")].map((node) => node.textContent)).toEqual(["書き方", "カードの音を直す", "鍵盤で入れる"]);
      // V19: tables only — what to write and what it means, then the keys.
      const writing = [...face.querySelectorAll("[data-testid='text-help-writing'] tbody tr")].map((row) => [...row.children].map((cell) => cell.textContent));
      expect(writing).toEqual([
        ["| C | Am |", "小節の区切り"], ["C G", "1 小節に 2 つ(等分)"], ["% か .", "前のコードをもう一度"], ["=", "のばす"], ["_", "休符"],
        ["C, G・C-G", "カンマ・ダッシュでも区切れる"], ["[C]歌詞", "歌詞の中のコードも読む"], ["IIm7", "キーを選ぶと度数でも書ける"],
        ["Cmaj7{C3 G3 E4 B4 D5}", "音を決める(C4 が真ん中のド)"], ["#", "行の頭に付けるとメモ"],
      ]);
      const rows = [...face.querySelectorAll(".lv-text-help-key-row")].map((row) => row.textContent);
      expect(rows).toEqual(["←→前後のカード", "↑↓転回", "Shift↑↓高さ", "1–5形(1 = 基本)", "S前のコードに近づける",
        "M" + "MIDI 鍵盤で弾いて入れる", "Enter鳴らす", "CtrlZ元に戻す(入力欄の外でも)", "Esc閉じる",
        "123長さ", "Rもう一度", "0休符", "Backspace戻す", "Escやめる"]);
      expect(face.querySelector(".lv-text-help-note")?.textContent).toBe("鍵盤を押すと、音を足す・外す。");
      // The removed prose (the voicing count, the try-out sound, # Key:, the automatic key, 「ぜんぶ」).
      for (const gone of ["コード", "# Key:", "自動", "ぜんぶ", "全角", "等しく分けて"]) {
        if (gone === "コード") expect(face.querySelector("[data-testid='text-voicing-availability']")).toBeNull();
        else expect(face.textContent).not.toContain(gone);
      }
    } finally {
      await harness.unmount();
    }
  });

  it("P25-06 E: reads the chords written inside 歌詞 and says how many lines it read", async () => {
    const harness = await mount();
    try {
      await changeValue(input(harness), "[C]きょうも[G]あるく[Am]みちを[F]");
      // One card per chord, one bar each.
      expect(harness.container.querySelectorAll('[data-testid="text-preview-band"]')).toHaveLength(4);
      const band = harness.container.querySelector('[data-testid="text-normalize-band"]')!;
      expect(band.querySelector('[data-testid="text-lyric-chord-notice"]')?.textContent)
        .toBe("歌詞の中のコード([C] の形)を 1 行読みました。長さは 1 コード 1 小節にしています。");
      // 「整えたテキストに置き換える」 writes the bar form.
      await click(band.querySelector<HTMLButtonElement>('[data-testid="text-normalize-replace"]')!);
      expect(input(harness).value).toBe("| C | G | Am | F |");
    } finally {
      await harness.unmount();
    }
  });

  it("P25-06 E2: reads the comma/dash separators, names a dot and a question mark", async () => {
    const harness = await mount();
    try {
      await changeValue(input(harness), "C, G, Am, F");
      expect(harness.container.querySelectorAll('[data-testid="text-preview-band"]')).toHaveLength(4);
      const band = harness.container.querySelector('[data-testid="text-normalize-band"]')!;
      expect(band.querySelector('[data-testid="text-separator-notice"]')?.textContent)
        .toBe("カンマ・ダッシュの区切りを 1 行読みました。");
      await click(band.querySelector<HTMLButtonElement>('[data-testid="text-normalize-replace"]')!);
      expect(input(harness).value).toBe("C G Am F");
      // The `.` and `?` places are named in the list, in the screen's own sentences.
      await changeValue(input(harness), "., C");
      expect(harness.container.textContent).toContain("「.」の前にコードがありません。");
      await changeValue(input(harness), "C, ?, G");
      expect(harness.container.textContent).toContain("「?」は読めません。");
      // A line of only dots is not read.
      await changeValue(input(harness), "...");
      expect(harness.container.querySelectorAll('[data-testid="text-preview-band"]')).toHaveLength(0);
    } finally {
      await harness.unmount();
    }
  });

  it("renders accepted rest/hold cells honestly and plays an all-rest score without a card band", async () => {
    const harness = await mount();
    await changeValue(input(harness), "| Cmaj7 _ | % = |");
    expect(harness.container.querySelectorAll('[data-testid="text-preview-rest"]')).toHaveLength(1);
    expect(harness.container.querySelectorAll('[data-testid="text-preview-error"]')).toHaveLength(0);
    // P23-17 V3/V9: the hold (=) has no card of its own any more; the write rules in 「?」 say what it does.
    await click(harness.container.querySelector<HTMLButtonElement>('[data-testid="text-help"]')!);
    expect(document.querySelector('[data-testid="text-help-face"]')?.textContent).toContain("=のばす");
    await changeValue(input(harness), "| _ |");
    // P25 C12: 「音を細かく直す」 is gone; the 「コードのない進行です」 words stand only beside the save button
    // (rev12: a rest-only score is not saved); the rest-only score still plays.
    expect(harness.container.querySelector('[data-testid="text-progression-convert"]')).toBeNull();
    expect(harness.container.textContent?.split("コードのない進行です")).toHaveLength(2);
    expect(harness.container.querySelector('[data-testid="text-save-rest-only"]')?.textContent).toBe("コードのない進行です(休符だけ)");
    expect(harness.container.querySelector<HTMLButtonElement>("[data-testid='text-transport-primary']")?.disabled).toBe(false);
    await changeValue(input(harness), "| _ = |");
    expect(harness.container.querySelector('[data-testid="text-progression-diagnostics"]')).not.toBeNull();
    await harness.unmount();
  });
  it("shows the extended bounded input contract", async () => {
    const harness = await mount();

    expect(harness.container.textContent).toContain("最大256小節・4096セル");
    await harness.unmount();
  });

  it("groups valid 1/2/4-token bars into native selectable cards and opens the band on the chosen card", async () => {
    const harness = await mount();
    await changeValue(input(harness), "| C | Dm7 G7 | C D E F |");

    const bars = harness.container.querySelectorAll<HTMLElement>(
      '[data-testid="extended-text-bar"]',
    );
    expect(bars).toHaveLength(3);
    expect([...bars].map((bar) => bar.querySelectorAll('[data-testid="text-preview-band"]').length)).toEqual([1, 2, 4]);

    const cards = harness.container.querySelectorAll<HTMLElement>(
      '[data-testid="text-preview-band"]',
    );
    expect(cards).toHaveLength(7);
    expect(cards[0]).toBeInstanceOf(HTMLElement);
    // P25-03 C1: no card is chosen at first; the band's closed line invites the choice.
    expect(cards[0]?.getAttribute("data-selected")).toBe("false");
    expect(harness.container.querySelector('[data-testid="text-card-dock-closed"]')?.textContent)
      .toBe("カードを選ぶと、ここでそのカードの音を直せます");
    // These are native buttons: focus/activation are keyboard reachable without
    // introducing a custom keyboard model. Browser key activation is covered by
    // the stage's Playwright accessibility gate.
    const firstButton = cards[1]!;
    firstButton.focus();
    expect(document.activeElement).toBe(firstButton);
    await click(firstButton);

    const afterClick = harness.container.querySelectorAll<HTMLElement>('[data-testid="text-preview-band"]');
    expect(afterClick[1]?.getAttribute("data-selected")).toBe("true");
    expect(harness.onPreview).toHaveBeenLastCalledWith(
      expect.objectContaining({ canonical: "Dm7" }),
      undefined,
      120,
    );
    expect(harness.container.querySelector('[data-testid="text-dock-name"]')?.textContent).toBe("Dm7");
    await harness.unmount();
  });

  it("keeps unreadable tokens visible with source positions and blocks conversion", async () => {
    const harness = await mount();
    await changeValue(input(harness), "| C ? |");

    const entry = input(harness);
    expect(entry.getAttribute("aria-invalid")).toBe("true");
    expect(entry.getAttribute("aria-errormessage")).toBe("text-progression-diagnostics");
    const diagnostics = harness.container.querySelector<HTMLElement>(
      '#text-progression-diagnostics',
    );
    expect(diagnostics?.textContent).toMatch(/1 行目 · 1 小節目/);
    // P24-05: the readable C stays a card; only the unreadable characters become the red card.
    expect(harness.container.querySelectorAll('[data-testid="text-preview-card-error"]')).toHaveLength(1);
    expect(harness.container.querySelectorAll('[data-testid="text-preview-error"]')).toHaveLength(0);
    // V11: an invalid bar makes no card, so there is no convert button to press.
    expect(harness.container.querySelector('[data-testid="text-progression-convert"]')).toBeNull();
    await harness.unmount();
  });

  it("P24-07 deletes a card with its menu and with Delete, and Ctrl+Z restores the text", async () => {
    const harness = await mount();
    await changeValue(input(harness), "| C | F | G |");
    const firstCard = () => harness.container.querySelector<HTMLButtonElement>(
      '[data-testid="text-preview-band"]',
    )!;
    await act(async () => {
      firstCard().dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, clientX: 40, clientY: 60 }));
    });
    const menu = harness.container.ownerDocument.querySelector<HTMLElement>('[data-testid="text-card-menu"]');
    expect(menu).not.toBeNull();
    const remove = menu!.querySelector<HTMLButtonElement>('[role="menuitem"]')!;
    expect(remove.textContent).toBe("削除");
    await click(remove);
    expect(input(harness).value).toBe("| F | G |");
    expect(harness.container.ownerDocument.querySelector('[data-testid="text-card-menu"]')).toBeNull();

    // One Ctrl+Z in the input puts the deleted card back.
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "z", ctrlKey: true, bubbles: true }));
    });
    expect(input(harness).value).toBe("| C | F | G |");

    // Pointer over a card + Delete removes it (no click needed).
    await act(async () => {
      firstCard().dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    });
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Delete", bubbles: true }));
    });
    expect(input(harness).value).toBe("| F | G |");
    await harness.unmount();
  });

  it("uses Japanese UI text for diagnostics and no longer shows the capability list", async () => {
    const invalid = await mount({  });
    await changeValue(input(invalid), "| C ? |");

    const diagnostics = invalid.container.querySelector<HTMLElement>(
      "#text-progression-diagnostics",
    );
    expect(diagnostics?.textContent).toContain("「?」はコードとして読めません。");
    expect(diagnostics?.textContent).toContain("1 行目 · 1 小節目");
    expect(diagnostics?.textContent).not.toContain("`?` is not a supported chord token.");

    // P24-07 item 4: the 「?」 list is gone from the save row.
    expect(invalid.container.querySelector('[data-testid="text-progression-capability-details"]')).toBeNull();
    expect(invalid.container.querySelector('[data-testid="text-progression-capabilities"]')).toBeNull();
    await invalid.unmount();

    const eligible = await mount({  });
    await changeValue(input(eligible), "| C |");
    await chooseKey(eligible, "C major");
    await changeValue(bpmInput(eligible), "120");
    expect(eligible.container.querySelector('[data-testid="text-progression-capabilities"]')).toBeNull();
    await eligible.unmount();
  });
  it("enables degree input only after an explicit C major confirmation", async () => {
    const harness = await mount();
    await changeValue(input(harness), "| ii7 V7 | Imaj7 |");
    // No card before the key is confirmed.
    expect(harness.container.querySelectorAll('[data-testid="text-preview-band"]')).toHaveLength(0);

    expect((await keyOptions(harness)).find((option) => option.value === "C major")?.label).toBe("C メジャー");
    await chooseKey(harness, "C major");

    expect(harness.container.querySelector('[data-testid="text-progression-key-state"]')?.textContent)
      .toContain("確定: C major");
    const cards = harness.container.querySelectorAll<HTMLElement>(
      '[data-testid="text-preview-band"]',
    );
    expect(cards).toHaveLength(3);
    expect(cards[0]?.textContent).toContain("Dm7");
    // The degree badge names the scale degree; the canonical chord above it
    // retains the seventh quality as Dm7.
    expect(cards[0]?.textContent).toContain("Ⅱm7");
    await harness.unmount();
  });

  it("V14 resets key, BPM and name after a save when the input is cleared, and keeps them without a save", async () => {
    const onSaveStandard = vi.fn(() => true);
    const harness = await mount({ onSaveStandard });
    const nameInput = () => harness.container.querySelector<HTMLInputElement>('[data-testid="text-progression-name"]')!;
    await changeValue(input(harness), "| C |");
    await chooseKey(harness, "C major");
    await changeValue(bpmInput(harness), "124");
    await changeValue(nameInput(), "保存する名前");
    await click(button(harness, "text-progression-save"));
    expect(onSaveStandard).toHaveBeenCalledOnce();
    await changeValue(input(harness), "");
    // P23-33: the key select's default state after a save is 「自動」 (it used to be 未確定).
    expect(keyInput(harness).dataset.value).toBe("auto");
    expect(bpmInput(harness).value).toBe("");
    expect(nameInput().value).toBe("テキスト進行");
    // Without a save the fields stay as they were.
    await changeValue(input(harness), "| C |");
    await chooseKey(harness, "C major");
    await changeValue(bpmInput(harness), "100");
    await changeValue(input(harness), "");
    expect(keyInput(harness).dataset.value).toBe("C major");
    expect(bpmInput(harness).value).toBe("100");
    await harness.unmount();
  });

  it("uses the explicit BPM for Auto preview and stops playback for all source-changing inputs", async () => {
    const harness = await mount();
    await changeValue(input(harness), "| C |");
    // P23-33: the automatic state replaced the 「推定」 group; the key list itself is unchanged.
    const suggestion = (await keyOptions(harness))
      .find((option) => option.value !== "auto" && option.value !== "unset");
    expect(suggestion).not.toBeUndefined();
    await chooseKey(harness, suggestion!.value!);
    await changeValue(bpmInput(harness), "124");
    await click(harness.container.querySelector<HTMLButtonElement>(
      '[data-testid="text-preview-band"]',
    )!);

    expect(harness.onStop).toHaveBeenCalledTimes(4);
    await click(button(harness, "text-dock-play"));
    expect(harness.onPreview).toHaveBeenCalledWith(
      expect.objectContaining({ canonical: "C" }),
      undefined,
      124,
    );

    await harness.unmount();
    // The band's 「鳴らす」 stops the previous card first.
    expect(harness.onStop).toHaveBeenCalledTimes(6);
  });

  it("keeps a long invalid token breakable in a compact 320px container", async () => {
    const harness = await mount();
    harness.container.style.width = "320px";
    await changeValue(input(harness), `| ${"C".repeat(320)} |`);

    const invalidCard = harness.container.querySelector<HTMLElement>(
      '[data-testid="text-preview-error"]',
    );
    expect(invalidCard?.className).toContain("w-full");
    expect(invalidCard?.querySelector("span")?.className).toContain("break-words");
    expect(invalidCard?.querySelector("span")?.className).toContain("[overflow-wrap:anywhere]");
    expect(harness.container.querySelector('#text-progression-diagnostics li')?.className)
      .toContain("[overflow-wrap:anywhere]");
    await harness.unmount();
  });
  it("locks all text controls after conversion makes the Draft authoritative", async () => {
    const harness = await mount();
    await changeValue(input(harness), "| C |");
    await harness.render({ draftActive: true });

    expect(input(harness).disabled).toBe(true);
    expect(keyInput(harness).disabled).toBe(true);
    expect(bpmInput(harness).disabled).toBe(true);
    // V11: the draft hides the chosen card's row (and so the convert button).
    expect(harness.container.querySelector('[data-testid="text-progression-inspector-row"]')).toBeNull();
    expect(harness.container.querySelector<HTMLButtonElement>(
      '[data-testid="text-preview-band"]',
    )?.disabled).toBe(true);
    expect(harness.container.querySelector('[data-testid="text-draft-authoritative"]')).not.toBeNull();
    await harness.unmount();
  });
});

/** P23-33: the automatic key's session behaviour (the rule itself is tested in importKeyResolution.test.ts). */
describe("TextProgressionCapturePanel P23-33 automatic key", () => {
  it("follows the chords and travels to the save", async () => {
    const onSaveStandard = vi.fn((_converted: unknown, _title: string) => true);
    const harness = await mount({ onSaveStandard });
    const nameInput = () => harness.container.querySelector<HTMLInputElement>('[data-testid="text-progression-name"]')!;
    // A clear major progression settles automatically, without touching the key field.
    await changeValue(input(harness), "| C | F | G | C |");
    expect(keyInput(harness).dataset.value).toBe("auto");
    expect((await keyOptions(harness)).find((option) => option.value === "auto")?.label).toBe("自動: C メジャー");
    await changeValue(nameInput(), "自動キー");
    await click(button(harness, "text-progression-save"));
    expect(onSaveStandard).toHaveBeenCalledOnce();
    const converted = onSaveStandard.mock.calls[0]![0] as { confirmedKey?: string; resolvedKey?: string };
    expect(converted.resolvedKey).toBe("C major");
    expect(converted.confirmedKey).toBeUndefined();
    await harness.unmount();
  });

  it("keeps a manual key as the confirmed and the resolved key", async () => {
    const onSaveStandard = vi.fn((_converted: unknown, _title: string) => true);
    const harness = await mount({ onSaveStandard });
    await changeValue(input(harness), "| C | F | G | C |");
    await chooseKey(harness, "D major");
    await click(button(harness, "text-progression-save"));
    const converted = onSaveStandard.mock.calls[0]![0] as { confirmedKey?: string; resolvedKey?: string };
    expect(converted.confirmedKey).toBe("D major");
    expect(converted.resolvedKey).toBe("D major");
    await harness.unmount();
  });

  it("lets 未設定 remove an automatically inferred key without re-applying it", async () => {
    const onSaveStandard = vi.fn((_converted: unknown, _title: string) => true);
    const harness = await mount({ onSaveStandard });
    await changeValue(input(harness), "| C | F | G | C |");
    await chooseKey(harness, "unset");
    expect((await keyOptions(harness)).find((option) => option.value === "unset")?.label).toBe("未設定");
    await click(button(harness, "text-progression-save"));
    const converted = onSaveStandard.mock.calls[0]![0] as { confirmedKey?: string; resolvedKey?: string };
    expect(converted.resolvedKey).toBeUndefined();
    expect(converted.confirmedKey).toBeUndefined();
    await harness.unmount();
  });

  it("shows 自動: 未確定 for an ambiguous progression and updates with the input", async () => {
    const onSaveStandard = vi.fn((_converted: unknown, _title: string) => true);
    const harness = await mount({ onSaveStandard });
    await changeValue(input(harness), "| C | Am | F |");
    expect((await keyOptions(harness)).find((option) => option.value === "auto")?.label).toBe("自動: 未確定");
    await click(button(harness, "text-progression-save"));
    expect((onSaveStandard.mock.calls[0]![0] as { resolvedKey?: string }).resolvedKey).toBeUndefined();
    // The next input's decision replaces the old one; the invalid one leaves no stale key behind.
    await changeValue(input(harness), "| C | F | G | C |");
    expect((await keyOptions(harness)).find((option) => option.value === "auto")?.label).toBe("自動: C メジャー");
    await changeValue(input(harness), "| nope |");
    expect((await keyOptions(harness)).find((option) => option.value === "auto")?.label).toBe("自動: 未確定");
    await harness.unmount();
  });

  it("V32 takes the key, BPM and meter from the sheet's setting lines", async () => {
    const harness = await mount();
    const sheet = (meter: string) => [
      "Key: D minor",
      "BPM: 108",
      `Time Signature: ${meter}`,
      "",
      "--- A Section ---",
      "",
      "| Dm11 | Em11 |",
      "| Dm11 | Bbmaj9(#11) |",
      "| Gm9 | Abm9 |",
      "| Am11 | A7(#9,b13) |",
      "",
      "--- B Section ---",
      "",
      "| Dm9 | Fmaj9/E |",
    ].join("\n");
    await changeValue(input(harness), sheet("4/4"));
    expect(keyInput(harness).dataset.value).toBe("auto");
    expect((await keyOptions(harness)).find((option) => option.value === "auto")?.label).toBe("譜面: D マイナー");
    expect(bpmInput(harness).value).toBe("108");
    expect(harness.container.querySelector('[data-testid="text-progression-meter-value"]')?.textContent).toBe("4/4");
    expect(harness.container.textContent).toContain("キー D マイナー");
    // A changed time signature reaches the meter; the key and BPM stay as they were.
    await changeValue(input(harness), sheet("3/4"));
    expect(harness.container.querySelector('[data-testid="text-progression-meter-value"]')?.textContent).toBe("3/4");
    expect(bpmInput(harness).value).toBe("108");
    await harness.unmount();
  });

  it("draws the preview degrees from the effective key before a manual pick", async () => {
    const harness = await mount();
    await changeValue(input(harness), "| Cmaj7 | Fmaj7 | G7 |");
    const degrees = [...harness.container.querySelectorAll<HTMLElement>('[data-testid="text-preview-degree"]')]
      .map((element) => element.textContent);
    expect(degrees).toEqual(["Ⅰmaj7", "Ⅳmaj7", "Ⅴ7"]);
    await harness.unmount();
  });
});

describe('P25 V23 next-chord palette', () => {
  function ghost(h: Harness) {
    return h.container.querySelector<HTMLElement>("[data-testid='text-suggestion-ghost']");
  }
  function palette(h: Harness) {
    void h;
    return document.querySelector<HTMLElement>("[role='dialog'][aria-label='次のコード']");
  }
  it('offers the palette after the last bar, adds one bar and Ctrl+Z takes it back', async () => {
    const h = await mount();
    await changeValue(input(h), '| Cmaj7 | Am7 |');
    expect(ghost(h)).not.toBeNull();
    await click(ghost(h)!);
    expect(palette(h)).not.toBeNull();
    const add = palette(h)!.querySelector<HTMLElement>("[data-testid='text-suggestion-add']")!;
    const label = add.getAttribute('aria-label')!.replace(' を末尾に足す', '');
    await click(add);
    expect(input(h).value).toBe('| Cmaj7 | Am7 | ' + label + ' |');
    await act(async () => { palette(h)!.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true })); });
    expect(input(h).value).toBe('| Cmaj7 | Am7 |');
    await h.unmount();
  });

  it('closes with Escape and leaves the text unchanged', async () => {
    const h = await mount();
    await changeValue(input(h), '| Cmaj7 |');
    await click(ghost(h)!);
    expect(palette(h)).not.toBeNull();
    await act(async () => { palette(h)!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 220)); });
    expect(palette(h)).toBeNull();
    expect(input(h).value).toBe('| Cmaj7 |');
    await h.unmount();
  });

  it('shows no ghost for an unreadable chart', async () => {
    const h = await mount();
    await changeValue(input(h), '| Cmaj7 | ??? |');
    expect(ghost(h)).toBeNull();
    await h.unmount();
  });

  it('keeps a half-filled bar in the open palette and appends it when filled', async () => {
    const h = await mount();
    await changeValue(input(h), '| Cmaj7 |');
    await click(ghost(h)!);
    await click(Array.from(palette(h)!.querySelectorAll<HTMLElement>('button')).find((button) => button.textContent === '2 拍 2')!);
    await click(palette(h)!.querySelector<HTMLElement>("[data-testid='text-suggestion-add']")!);
    expect(input(h).value).toBe('| Cmaj7 |');
    expect(h.container.querySelector("[data-testid='text-suggestion-ghost'] [data-pending='true']")).not.toBeNull();
    await click(palette(h)!.querySelector<HTMLElement>("[data-testid='text-suggestion-add']")!);
    expect(input(h).value).toMatch(/^\| Cmaj7 \| .+ \|$/);
    await h.unmount();
  });

  it('V26-3 starts with the length of the bar before, a pick is kept, and a new opening follows again', async () => {
    const h = await mount();
    await changeValue(input(h), '| C G |');
    await click(ghost(h)!);
    const pressed = () => Array.from(palette(h)!.querySelectorAll<HTMLElement>('button[aria-pressed="true"]')).map((button) => button.textContent);
    expect(pressed()).toEqual(['2 拍 2']);
    await click(palette(h)!.querySelector<HTMLElement>("[data-testid='text-suggestion-add']")!);
    await click(palette(h)!.querySelector<HTMLElement>("[data-testid='text-suggestion-add']")!);
    expect(input(h).value).toMatch(/^\| C G \| \S+ \S+ \|$/);
    expect(pressed()).toEqual(['2 拍 2']);
    await click(Array.from(palette(h)!.querySelectorAll<HTMLElement>('button')).find((button) => button.textContent === '1 拍 3')!);
    expect(pressed()).toEqual(['1 拍 3']);
    await act(async () => { palette(h)!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 220)); });
    await click(ghost(h)!);
    expect(pressed()).toEqual(['2 拍 2']);
    await h.unmount();
  });
});

describe("P25 V37 the notes written in { }", () => {
  const SHEET = "| Cmaj7{C3 G3 E4 B4 D5} | Dm7 | G7{F3 B3 E4 A4} | Cmaj7 |";
  const cards = (h: Harness) => [...h.container.querySelectorAll<HTMLElement>('[data-testid="text-preview-band"]')];
  /** The band's keyboard keys that sound for the chosen card. */
  const bandNotes = (h: Harness) => [...h.container.querySelectorAll<HTMLButtonElement>('[data-testid="text-dock-key"]')]
    .filter((key) => key.getAttribute("aria-pressed") === "true")
    .map((key) => Number(key.dataset.note))
    .sort((left, right) => left - right);

  it("gives the card the notes of its braces and follows a rewrite", async () => {
    const harness = await mount();
    await changeValue(input(harness), SHEET);
    await click(cards(harness)[0]!);
    expect(bandNotes(harness)).toEqual([48, 55, 64, 71, 74]);
    // The text keeps the braces as they were typed (nothing is written back).
    expect(input(harness).value).toContain("Cmaj7{C3 G3 E4 B4 D5}");
    await changeValue(input(harness), SHEET.replace("{C3 G3 E4 B4 D5}", "{C3 G3 E4 A4 D5}"));
    await click(cards(harness)[0]!);
    expect(bandNotes(harness)).toEqual([48, 55, 64, 69, 74]);
    await harness.unmount();
  });

  it("keeps the band's own edit until that card's braces change", async () => {
    const harness = await mount();
    await changeValue(input(harness), SHEET);
    await click(cards(harness)[0]!);
    const first = [...harness.container.querySelectorAll<HTMLButtonElement>('[data-testid="text-dock-key"]')]
      .find((key) => key.getAttribute("aria-pressed") === "true")!;
    await click(first);
    const edited = bandNotes(harness);
    expect(edited).toHaveLength(4);
    // Rewriting another card's braces leaves this card with the band's sound.
    await changeValue(input(harness), SHEET.replace("| Dm7 |", "| Dm7{E2 A2 D3 F3} |"));
    await click(cards(harness)[0]!);
    expect(bandNotes(harness)).toEqual(edited);
    await harness.unmount();
  });

  it("brings the chord's own sound back when the braces go, if the band was not edited", async () => {
    const harness = await mount();
    await changeValue(input(harness), SHEET);
    await click(cards(harness)[0]!);
    expect(bandNotes(harness)).toEqual([48, 55, 64, 71, 74]);
    await changeValue(input(harness), SHEET.replace("{C3 G3 E4 B4 D5}", ""));
    await click(cards(harness)[0]!);
    expect(bandNotes(harness)).not.toEqual([48, 55, 64, 71, 74]);
    expect(bandNotes(harness).length).toBeGreaterThan(0);
    await harness.unmount();
  });
});

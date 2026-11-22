// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { playbackController } from "../audio/playbackController";
import { parseChordLabel } from "../domain/chords";
import { formatProgressionText } from "../domain/progressionText";
import { makeIdea } from "../domain/testFactory";
import type { SavedProgressionBlock } from "../domain/types";
import { appCopy } from "../i18n";
import { PreviewSoundProvider } from "../components/PreviewSoundProvider";
import { ProgressionDetailView, type ProgressionDetailViewProps } from "./ProgressionDetailView";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** P23-15: the progression page's header (H1–H8, Z5) and C2–C4. */
const block = (extra: Partial<SavedProgressionBlock> = {}): SavedProgressionBlock => ({
  id: "block",
  summaryText: "Ebmaj7 loop",
  chords: ["Ebmaj7", "Cm7", "Fm7", "Bb7"].map((name, index) => ({
    eventId: `e${index}`, bar: index + 1, beat: 1, durationBeats: 4, chord: parseChordLabel(name)!, confidence: 1, alternatives: [], warnings: [],
  })),
  memo: "ambiguous-bass; 夜のループ（1〜4小節）; 自由メモ",
  tags: ["自分のタグ"],
  detectedKey: "Eb",
  bpm: 92,
  timeSignature: "4/4",
  lengthBars: 4,
  capturedAt: "2026-11-09T03:00:00.000Z",
  analyzerVersion: "synthetic",
  ...extra,
});

const roots: Root[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await act(async () => root.unmount());
  vi.restoreAllMocks();
  document.body.replaceChildren();
  localStorage.clear();
});

type Props = ProgressionDetailViewProps & { showRomanNumerals?: boolean };

async function mount(extra: Partial<Props> = {}, blocks?: SavedProgressionBlock[]) {
  const b = extra.block ?? block();
  const props: Props = {
    idea: makeIdea({ id: "idea", title: "夜のスケッチ", progressionBlocks: blocks ?? [b] }),
    block: b,
    updateProgressionBlock: vi.fn(() => true),
    duplicateProgressionBlock: vi.fn(() => "copy"),
    openProgression: vi.fn(),
    openIdea: vi.fn(),
    openVault: vi.fn(),
    requestDelete: vi.fn(),
    openPractice: vi.fn(),
    openVoicingPractice: vi.fn(),
    openChordDojo: vi.fn(),
    setToast: vi.fn(),
    copy: appCopy.ja,
    ...extra,
  };
  vi.spyOn(playbackController, "play").mockResolvedValue();
  vi.spyOn(playbackController, "toggle").mockResolvedValue();
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  const render = (next: Props) => act(async () => root.render(<PreviewSoundProvider><ProgressionDetailView {...next} /></PreviewSoundProvider>));
  await render(props);
  const head = () => container.querySelector<HTMLElement>(".lv-progression-file")!;
  const button = (name: string) => [...container.querySelectorAll<HTMLButtonElement>("button")]
    .find((element) => element.getAttribute("aria-label") === name || element.textContent?.trim() === name);
  const click = async (name: string) => act(async () => button(name)!.click());
  const title = () => container.querySelector("[data-testid='progression-title']")?.textContent;
  const titleInput = () => container.querySelector<HTMLInputElement>("input[aria-label='進行の題名']");
  return { container, props, head, button, click, title, titleInput, render };
}

async function type(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  await act(async () => {
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

const key = (input: HTMLElement, name: string) => act(async () => {
  input.dispatchEvent(new KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true }));
});

describe("P23-15 progression page header", () => {
  it("H1: row 1 is ‹ Vault, the title, ♥, copy, 「MIDI を DAW へ」 and ⋯ — and no breadcrumb", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    const m = await mount({ midiExportEnabled: true });
    const row = m.head().querySelector(".lv-progression-row")!;
    const labels = [...row.children].map((element) => element.getAttribute("aria-label") ?? element.textContent?.trim() ?? "");
    expect(labels[0]).toBe("Vault");
    expect(labels[1]).toBe("題名「夜のループ（1〜4小節）」を変える");
    expect(labels[2]).toBe("お気に入りに入れる");
    expect(labels[3]).toBe("コードをコピー");
    expect(row.querySelector("[data-midi-export-control]")?.textContent).toContain("MIDI を DAW へ");
    expect(labels[labels.length - 1]).toBe("そのほか");
    expect(m.container.querySelector("nav[aria-label='現在の場所']")).toBeNull();

    await m.click("Vault");
    expect(m.props.openVault).toHaveBeenCalledOnce();
    await m.click("お気に入りに入れる");
    expect(m.props.updateProgressionBlock).toHaveBeenCalledWith("idea", "block", { pinned: true });
    await m.render({ ...m.props, block: { ...m.props.block, pinned: true } });
    expect(m.button("お気に入りから外す")?.getAttribute("aria-pressed")).toBe("true");
    await m.click("コードをコピー");
    expect(writeText).toHaveBeenCalledWith(formatProgressionText(m.props.block.chords));
  });

  it("H2: no practice buttons on the page", async () => {
    const m = await mount();
    for (const name of ["Voicing Loop", "Chord Dojo", "Bass Practice"]) expect(m.button(name), name).toBeUndefined();
  });

  it("H3/H8: row 2 has the key with ♭, time, bars, source, saved date, the tags (auto + own) and a named memo field", async () => {
    const m = await mount();
    const facts = [...m.head().querySelectorAll(".lv-progression-fact")].map((element) => element.textContent);
    expect(facts).toEqual(["E♭メジャー", "4/4", "4 小節", "MIDI", "11/9 に保存"]);
    const tags = [...m.head().querySelectorAll("[data-testid='progression-tags'] .lv-progression-tag:not([data-add])")];
    expect(tags.some((tag) => tag.hasAttribute("data-mine") && tag.textContent === "自分のタグ")).toBe(true);
    expect(tags.some((tag) => !tag.hasAttribute("data-mine"))).toBe(true);
    const memo = m.head().querySelector("label.lv-progression-memo")!;
    expect(memo.querySelector(".lv-progression-cap")?.textContent).toBe("メモ");
    expect(memo.querySelector<HTMLInputElement>("input[aria-label='メモ']")?.value).toBe("自由メモ");
  });

  it("H7: the import notes stay inside the memo", async () => {
    const m = await mount();
    const codes = m.head().querySelector(".lv-progression-memo .lv-progression-memo-codes");
    expect(codes?.textContent).toBeTruthy();
  });

  it("C2: one progression → no 「この曲の進行」; two → 「この曲の進行 2」 and choosing one opens it", async () => {
    const one = await mount();
    expect(one.container.querySelector("select[aria-label='この曲の進行']")).toBeNull();
    expect(one.container.textContent).not.toContain("この曲の進行");
    await act(async () => roots.pop()!.unmount());

    const other = block({ id: "other", memo: "別の版（5〜8小節）" });
    const two = await mount({}, [block(), other]);
    const select = two.container.querySelector<HTMLSelectElement>("select[aria-label='この曲の進行']")!;
    expect(select.closest("label")?.textContent).toContain("この曲の進行 2");
    await act(async () => {
      select.value = "other";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(two.props.openProgression).toHaveBeenCalledWith("idea", "other");
  });

  it("H4: ⋯ has 複製する・この曲の情報を見る・元の MIDI・以前の操作・この進行を削除…", async () => {
    const m = await mount();
    await m.click("そのほか");
    const menu = m.container.querySelector("[role='group'][aria-label='そのほかの操作']")!;
    expect([...menu.querySelectorAll("button")].map((element) => element.textContent)).toEqual(["複製する", "この曲の情報を見る", "元の MIDI・以前の操作", "この進行を削除…"]);
    await m.click("この進行を削除…");
    expect(m.props.requestDelete).toHaveBeenCalledWith(m.props.idea, m.props.block);
  });

  it("C3/H6: the title changes in place — Enter decides, Esc goes back, empty keeps the old name, 保存 stores it", async () => {
    const m = await mount();
    await m.click("題名「夜のループ（1〜4小節）」を変える");
    let input = m.titleInput()!;
    expect(input).not.toBeNull();
    await type(input, "朝のループ");
    await key(input, "Escape");
    expect(m.titleInput()).toBeNull();
    expect(m.title()).toBe("夜のループ（1〜4小節）");

    await m.click("題名「夜のループ（1〜4小節）」を変える");
    input = m.titleInput()!;
    await type(input, "   ");
    await key(input, "Enter");
    expect(m.title()).toBe("夜のループ（1〜4小節）");
    expect(m.button("上書き保存")!.disabled).toBe(true);

    await m.click("題名「夜のループ（1〜4小節）」を変える");
    input = m.titleInput()!;
    await type(input, "朝のループ");
    await key(input, "Enter");
    expect(m.title()).toBe("朝のループ（1〜4小節）");
    expect(m.props.updateProgressionBlock).not.toHaveBeenCalled();
    await m.click("上書き保存");
    expect(vi.mocked(m.props.updateProgressionBlock).mock.calls[0]![2].memo).toContain("朝のループ（1〜4小節）");
  });

  it("H1: a progression without its own name shows the song's title with its bars; a new name keeps the bars", async () => {
    const m = await mount({ block: block({ memo: "自由メモ" }) });
    expect(m.title()).toBe("夜のスケッチ（1〜4小節）");
    await m.click("題名「夜のスケッチ（1〜4小節）」を変える");
    const input = m.titleInput()!;
    await type(input, "朝のループ");
    await key(input, "Enter");
    expect(m.title()).toBe("朝のループ（1〜4小節）");
  });

  it("C4: a tag added and the memo written are kept by 保存 and shown again when the page opens with the saved block", async () => {
    const m = await mount();
    await m.click("＋ タグ");
    const tagInput = m.container.querySelector<HTMLInputElement>("[role='dialog'][aria-label='タグを足す・外す'] input[name='progression-tag']")!;
    await type(tagInput, "夜");
    await act(async () => tagInput.form!.requestSubmit());
    await type(m.container.querySelector<HTMLInputElement>("input[aria-label='メモ']")!, "サビ前に");
    await m.click("上書き保存");
    const changes = vi.mocked(m.props.updateProgressionBlock).mock.calls[0]![2];
    expect(changes.tags).toEqual(["自分のタグ", "夜"]);
    expect(changes.memo).toContain("サビ前に");
    await act(async () => roots.pop()!.unmount());

    const reopened = await mount({ block: { ...block(), ...changes } });
    expect(reopened.container.querySelector<HTMLInputElement>("input[aria-label='メモ']")!.value).toBe("サビ前に");
    expect([...reopened.head().querySelectorAll(".lv-progression-tag[data-mine]")].map((tag) => tag.textContent)).toEqual(["自分のタグ", "夜"]);
  });

  it("Z5: 「度数を表示」 reaches the cards — off hides the degree text and keeps the role dot", async () => {
    const on = await mount({ showRomanNumerals: true });
    expect(on.container.querySelectorAll(".lv-cw-harmony-degree").length).toBeGreaterThan(0);
    await act(async () => roots.pop()!.unmount());
    const off = await mount({ showRomanNumerals: false });
    expect(off.container.querySelectorAll(".lv-cw-harmony-degree")).toHaveLength(0);
    expect(off.container.querySelectorAll(".lv-cw-harmony-dot").length).toBeGreaterThan(0);
  });
});

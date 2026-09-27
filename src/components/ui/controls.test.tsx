// @vitest-environment jsdom

import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Button, Chip, IconButton, Popover, ProgressBar, SegmentedControl, Select, Tooltip } from "./index";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function key(target: Element, keyName: string) {
  act(() => {
    target.dispatchEvent(new KeyboardEvent("keydown", { key: keyName, bubbles: true }));
  });
}

describe("P8.9 buttons", () => {
  it("keeps the legacy secondary level as the default and adds neutral / state", () => {
    expect(renderToStaticMarkup(<Button>Go</Button>)).toContain("lv-button-secondary");
    expect(renderToStaticMarkup(<Button variant="neutral">Go</Button>)).toContain("lv-button-neutral");
    const state = renderToStaticMarkup(<Button variant="state" aria-pressed>Loop</Button>);
    expect(state).toContain("lv-button-state");
    expect(state).toContain('aria-pressed="true"');
  });

  it("explains why a button is disabled with a described tooltip", () => {
    const markup = renderToStaticMarkup(<Button disabled disabledReason="MIDIを読み込むと押せます">再生</Button>);
    const id = /aria-describedby="([^"]+)"/.exec(markup)?.[1];
    expect(id).toBeTruthy();
    expect(markup).toContain(`id="${id}" role="tooltip"`);
    expect(markup).toContain("MIDIを読み込むと押せます");
    expect(renderToStaticMarkup(<Button disabledReason="unused">再生</Button>)).not.toContain("role=\"tooltip\"");
  });

  it("gives icon buttons a styled tooltip without a duplicate native title when asked", () => {
    const styled = renderToStaticMarkup(<IconButton label="閉じる" tooltip="styled">x</IconButton>);
    expect(styled).toContain('aria-label="閉じる"');
    expect(styled).not.toContain("title=");
    expect(styled).toContain('class="lv-tooltip"');
    expect(renderToStaticMarkup(<IconButton label="閉じる">x</IconButton>)).toContain('title="閉じる"');
  });
});

describe("P8.9 controls", () => {
  it("moves and selects a segment with the arrow keys and skips disabled options", () => {
    function Harness() {
      const [value, setValue] = useState<"step" | "flow" | "free">("step");
      return (
        <SegmentedControl
          label="進み方"
          value={value}
          onChange={setValue}
          options={[{ value: "step", label: "1つずつ" }, { value: "flow", label: "テンポ", disabled: true }, { value: "free", label: "自由" }]}
        />
      );
    }
    act(() => root.render(<Harness />));
    const radios = [...container.querySelectorAll<HTMLButtonElement>('[role="radio"]')];
    expect(container.querySelector('[role="radiogroup"]')?.getAttribute("aria-label")).toBe("進み方");
    expect(radios.map((radio) => radio.tabIndex)).toEqual([0, -1, -1]);
    key(radios[0], "ArrowRight");
    expect(radios[2].getAttribute("aria-checked")).toBe("true");
    expect(document.activeElement).toBe(radios[2]);
    key(radios[2], "ArrowRight");
    expect(radios[0].getAttribute("aria-checked")).toBe("true");
  });

  it("describes the tooltip target and exposes chip, progress and select semantics", () => {
    const tip = renderToStaticMarkup(<Tooltip content="ループ再生"><button type="button">L</button></Tooltip>);
    const id = /aria-describedby="([^"]+)"/.exec(tip)?.[1];
    expect(tip).toContain(`id="${id}" role="tooltip"`);
    expect(renderToStaticMarkup(<Chip selected>夜</Chip>)).toContain('aria-pressed="true"');
    const progress = renderToStaticMarkup(<ProgressBar label="今日の練習" value={2} max={3} tone="record" />);
    expect(progress).toContain('role="progressbar"');
    expect(progress).toContain('aria-valuenow="2"');
    expect(progress).toContain('data-tone="record"');
    const select = renderToStaticMarkup(<Select aria-label="判定" defaultValue="b"><option value="a">A</option><option value="b">B</option></Select>);
    expect(select).toContain("<select");
    expect(select).toContain('aria-label="判定"');
  });

  it("opens a popover from its trigger and closes it with Escape, returning focus", () => {
    act(() => root.render(
      <Popover label="音量" trigger={(props) => <button type="button" {...props}>音量</button>}>
        <input aria-label="音量の値" />
      </Popover>,
    ));
    const trigger = container.querySelector("button")!;
    act(() => trigger.click());
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    const panel = container.querySelector('[role="dialog"]')!;
    expect(panel.getAttribute("aria-label")).toBe("音量");
    key(container.querySelector("input")!, "Escape");
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
});

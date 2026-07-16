// @vitest-environment jsdom

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { Status } from "../domain/types";
import { appCopy } from "../i18n";
import { getStatusControlActions, StatusPipeline } from "./StatusPipeline";

describe("getStatusControlActions", () => {
  const labels = appCopy.ja.status;
  const copy = appCopy.ja.detail.statusControl;

  const matrix: Array<{
    status: Status;
    prevStatus?: Status;
    expected: ReturnType<typeof getStatusControlActions>;
  }> = [
    {
      status: "idea",
      expected: {
        primary: { status: "loop", label: "ループへ進む" },
        menu: [
          { status: "hold", label: "保留" },
          { status: "abandoned", label: "没" },
        ],
      },
    },
    {
      status: "loop",
      expected: {
        primary: { status: "arrange", label: "展開へ進む" },
        menu: [
          { status: "idea", label: "アイデアへ戻す" },
          { status: "hold", label: "保留" },
          { status: "abandoned", label: "没" },
        ],
      },
    },
    {
      status: "arrange",
      expected: {
        primary: { status: "mix", label: "ミックスへ進む" },
        menu: [
          { status: "loop", label: "ループへ戻す" },
          { status: "hold", label: "保留" },
          { status: "abandoned", label: "没" },
        ],
      },
    },
    {
      status: "mix",
      expected: {
        primary: { status: "done", label: "完成へ進む" },
        menu: [
          { status: "arrange", label: "展開へ戻す" },
          { status: "hold", label: "保留" },
          { status: "abandoned", label: "没" },
        ],
      },
    },
    {
      status: "done",
      expected: {
        menu: [
          { status: "mix", label: "完成を解除してミックスへ" },
          { status: "hold", label: "保留" },
          { status: "abandoned", label: "没" },
        ],
      },
    },
    {
      status: "hold",
      prevStatus: "arrange",
      expected: {
        menu: [
          { status: "arrange", label: "展開へ復帰" },
          { status: "abandoned", label: "没" },
        ],
      },
    },
    {
      status: "abandoned",
      prevStatus: "loop",
      expected: {
        menu: [
          { status: "loop", label: "ループへ復帰" },
          { status: "hold", label: "保留" },
        ],
      },
    },
  ];

  it.each(matrix)("returns the complete action set for $status", ({
    status,
    prevStatus,
    expected,
  }) => {
    expect(getStatusControlActions(status, prevStatus, labels, copy)).toEqual(expected);
  });

  it.each([undefined, "hold", "abandoned"] as const)(
    "offers only the Idea repair fallback for prevStatus=$s",
    (prevStatus) => {
      expect(getStatusControlActions("hold", prevStatus, labels, copy)).toEqual({
        menu: [{ status: "idea", label: "アイデアへ復帰" }],
      });
    },
  );
});

describe("StatusPipeline", () => {
  it("renders all stages, the current status, and a single forward CTA", () => {
    const markup = renderToStaticMarkup(
      <StatusPipeline
        status="loop"
        labels={appCopy.en.status}
        copy={appCopy.en.detail.statusControl}
        onMoveStatus={vi.fn()}
      />,
    );

    for (const label of ["Idea", "Loop", "Arrange", "Mix", "Done"]) {
      expect(markup).toContain(label);
    }
    expect(markup).toContain("Current: Loop");
    expect(markup).toContain("Move to Arrange");
    expect(markup).toContain('aria-current="step"');
    expect(markup).not.toContain("Move to Mix");
  });

  it("shows progress through prevStatus while inactive", () => {
    const markup = renderToStaticMarkup(
      <StatusPipeline
        status="hold"
        prevStatus="arrange"
        labels={appCopy.en.status}
        copy={appCopy.en.detail.statusControl}
        onMoveStatus={vi.fn()}
      />,
    );

    expect(markup).toContain("Current: Hold");
    expect(markup.match(/border-teal-400 bg-teal-400/g)).toHaveLength(3);
  });
});

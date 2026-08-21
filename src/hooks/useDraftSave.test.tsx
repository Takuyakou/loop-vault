// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useDraftSave } from "./useDraftSave";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
afterEach(() => host?.remove());

function Harness({ onCommit }: { onCommit: (scope: string, value: string) => boolean | "pending" }) {
  const [value] = useState("before");
  const field = useDraftSave({
    scopeKey: "idea-1",
    value,
    format: (entry: string) => entry,
    parse: (draft: string) => ({ ok: true as const, value: draft }),
    onCommit,
  });
  return (
    <div>
      <input value={field.draft} onChange={(event) => field.setDraft(event.target.value)} {...field.inputProps} />
      <output data-saved={field.saved ? "true" : "false"}>{field.saved ? "saved" : "not-saved"}</output>
    </div>
  );
}

describe("useDraftSave mutation outcomes", () => {
  it.each([false, "pending"] as const)(
    "does not advance its baseline or flash saved for %s atomic recovery outcome",
    async (outcome) => {
      host = document.createElement("div");
      document.body.append(host);
      const root = createRoot(host);
      const onCommit = vi.fn(() => outcome);
      await act(async () => root.render(<Harness onCommit={onCommit} />));
      const input = host.querySelector<HTMLInputElement>("input")!;
      await act(async () => {
        input.focus();
        const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
        valueSetter?.call(input, "after");
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.blur();
      });
      expect(onCommit).toHaveBeenCalledWith("idea-1", "after");
      expect(host.querySelector("output")?.getAttribute("data-saved")).toBe("false");
      await act(async () => { input.focus(); input.blur(); });
      expect(onCommit).toHaveBeenCalledTimes(2);
      await act(async () => root.unmount());
    },
  );
});

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Progression Advisor UI boundary", () => {
  it("does not import playback or preview controls", () => {
    const drawer = readFileSync(new URL("./ProgressionAdvisorDrawer.tsx", import.meta.url), "utf8");
    const card = readFileSync(new URL("./AdvisorSuggestionCard.tsx", import.meta.url), "utf8");

    expect(`${drawer}\n${card}`).not.toContain("playbackController");
    expect(`${drawer}\n${card}`).not.toContain("PlayToggle");
    expect(`${drawer}\n${card}`).not.toContain("onPreview");
  });
});

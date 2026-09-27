import { describe, expect, it } from "vitest";
import { createLiveMidiStore } from "./liveMidiStore";
import { createLiveMidiWindowSnapshot } from "./windowProtocol";

describe("createLiveMidiWindowSnapshot", () => {
  it("projects serializable display state without store actions or live note maps", () => {
    const store = createLiveMidiStore();
    const snapshot = createLiveMidiWindowSnapshot(store.getState());
    const serialized = JSON.parse(JSON.stringify(snapshot)) as Record<string, unknown>;

    expect(serialized).not.toHaveProperty("language");
    expect(serialized.status).toBe("idle");
    expect(serialized).not.toHaveProperty("activate");
    expect(serialized).not.toHaveProperty("notes");
    expect(serialized).not.toHaveProperty("preferences");
  });
});

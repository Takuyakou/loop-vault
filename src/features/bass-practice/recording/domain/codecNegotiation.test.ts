import { describe, expect, it } from "vitest";
import { DEFAULT_CODEC_PREFERENCE, negotiateCodec } from "./codecNegotiation";

describe("codec negotiation", () => {
  it("picks the first supported codec in preference order", () => {
    const choice = negotiateCodec((mime) => mime === "audio/webm");
    expect(choice?.mimeType).toBe("audio/webm");
    expect(choice?.consideredOrder).toEqual(DEFAULT_CODEC_PREFERENCE);
  });

  it("prefers Opus-in-WebM when everything is supported", () => {
    expect(negotiateCodec(() => true)?.mimeType).toBe("audio/webm;codecs=opus");
  });

  it("returns undefined when nothing is supported", () => {
    expect(negotiateCodec(() => false)).toBeUndefined();
  });

  it("treats a throwing probe as unsupported", () => {
    const choice = negotiateCodec((mime) => {
      if (mime === "audio/webm;codecs=opus") throw new Error("boom");
      return mime === "audio/webm";
    });
    expect(choice?.mimeType).toBe("audio/webm");
  });

  it("honours a custom preference and rejects an empty one", () => {
    expect(negotiateCodec(() => true, ["audio/mp4"])?.mimeType).toBe("audio/mp4");
    expect(() => negotiateCodec(() => true, [])).toThrow(RangeError);
  });
});

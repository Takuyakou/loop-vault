import { describe, expect, it } from "vitest";
import { KEY_HEIGHT_RATIO, keyboardKeyHeight, whiteKeysIn } from "./earKeyboardHeight";

describe("練習の鍵盤の高さ", () => {
  it("白鍵の数(C2〜C5 は 22 本)", () => {
    expect(whiteKeysIn(36, 72)).toBe(22);
    expect(whiteKeysIn(36, 36)).toBe(1);
    expect(whiteKeysIn(37, 37)).toBe(0);
    expect(whiteKeysIn(36, 47)).toBe(7);
  });

  it("白鍵の幅の約4.2倍。窓に余裕が無いときだけ低くする。下限は今までの値(広い窓 112、狭い窓 92)", () => {
    expect(KEY_HEIGHT_RATIO).toBe(4.2);
    // 22 white keys over 1140 px: 51.8 px each
    expect(keyboardKeyHeight({ width: 1140, whiteKeys: 22, room: 400, narrowWindow: false })).toBe(218);
    // a tall, narrow window does not make the keys tall and thin: the height follows the width
    expect(keyboardKeyHeight({ width: 680, whiteKeys: 22, room: 900, narrowWindow: true })).toBe(130);
    // not enough room: lower, but not under the old height
    expect(keyboardKeyHeight({ width: 1140, whiteKeys: 22, room: 150, narrowWindow: false })).toBe(150);
    expect(keyboardKeyHeight({ width: 1140, whiteKeys: 22, room: 60, narrowWindow: false })).toBe(112);
    expect(keyboardKeyHeight({ width: 680, whiteKeys: 22, room: 60, narrowWindow: true })).toBe(92);
    // a keyboard so narrow that the ratio would give less than the old height
    expect(keyboardKeyHeight({ width: 300, whiteKeys: 22, room: 500, narrowWindow: false })).toBe(112);
  });
});

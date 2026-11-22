import { describe, expect, it } from "vitest";
import { resultMarks, wrongLines, wrongNoteName } from "./guidedMarks";

describe("P23-51 result marks and the wrong-answer lines (mock ⑤)", () => {
  it("Dm7 played with F♯: three hits, one wrong, F missing at the example's key", () => {
    const marks = resultMarks([62, 66, 69, 72], [62, 65, 69, 72]);
    expect([...marks.entries()].sort((a, b) => a[0] - b[0])).toEqual([[62, "hit"], [65, "miss"], [66, "wrong"], [69, "hit"], [72, "hit"]]);
    expect(wrongLines("Dm7", [62, 66, 69, 72], [62, 65, 69, 72])).toEqual({
      kind: "swap",
      line: "F の代わりに F♯ を弾きました。",
      sub: "Dm7 は D・F・A・C。点線の輪が足りない音です。",
    });
  });

  it("a missing third only, an extra note only", () => {
    expect(wrongLines("A", [57, 64], [57, 61, 64])).toEqual({ kind: "missing", line: "D♭ が足りません。", sub: "A は A・D♭・E。点線の輪が足りない音です。" });
    expect(wrongLines("C", [60, 62, 64, 67], [60, 64, 67])).toEqual({ kind: "extra", line: "D は C の音ではありません。", sub: "C は C・E・G。" });
  });

  it("the bass of an ear question", () => {
    expect(wrongLines("Fm", [56, 60, 65], [53, 56, 60], { bass: 5 })).toEqual({ kind: "bass", line: "一番低い音が A♭ です。F を一番下にします。", sub: "Fm は F・A♭・C。" });
    expect(wrongLines("Fm", [53, 56, 60], [53, 56, 60], { bass: 5 })).toBeUndefined();
  });

  it("P23-54: a slash chord with the wrong lowest note marks it wrong and the example's bass missing", () => {
    // C/E played as C (C3 at the bottom): every pitch class is a chord tone, but the bass is wrong.
    const marks = resultMarks([48, 60, 64, 67], [52, 60, 67], [0, 4], [0, 4, 7], 4);
    expect(marks.get(48)).toBe("wrong");
    expect(marks.get(52)).toBe("miss");
    expect(marks.get(64)).toBe("hit");
    expect(resultMarks([52, 60, 67], [52, 60, 67], [0, 4], [0, 4, 7], 4).get(52)).toBe("hit");
  });

  it("an optional fifth is neither missing nor marked", () => {
    expect(resultMarks([60, 64, 70, 61], [60, 64, 67, 70], [0, 4, 10]).get(67)).toBeUndefined();
    expect(wrongLines("C7", [60, 61, 70], [60, 64, 67, 70], { required: [0, 4, 10] })?.line).toBe("E の代わりに D♭ を弾きました。");
  });

  it("names a wrong note against the tone it replaced", () => {
    expect(wrongNoteName(6, [5])).toBe("F♯");
    expect(wrongNoteName(3, [4])).toBe("E♭");
    expect(wrongNoteName(1, [])).toBe("D♭");
  });
});

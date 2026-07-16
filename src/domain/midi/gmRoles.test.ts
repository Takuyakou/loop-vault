import { describe, expect, it } from "vitest";
import { gmProgramRole, isGmPercussionProgram } from "./gmRoles";

describe("GM role evidence", () => {
  it("maps explicit GM families with deliberately non-absolute confidence", () => {
    expect(gmProgramRole(33, true)).toEqual({ role: "bass", confidence: 0.95, explicit: true });
    expect(gmProgramRole(80, true)).toEqual({ role: "melody", confidence: 0.9, explicit: true });
    expect(gmProgramRole(88, true)).toEqual({ role: "pad", confidence: 0.88, explicit: true });
    expect(gmProgramRole(0, true)).toEqual({ role: "harmony", confidence: 0.65, explicit: true });
    expect(gmProgramRole(24, true)).toEqual({ role: "harmony", confidence: 0.7, explicit: true });
  });

  it("does not treat implicit default Program 0 as GM evidence", () => {
    expect(gmProgramRole(0, false)).toBeUndefined();
    expect(gmProgramRole(undefined, false)).toBeUndefined();
  });

  it("recognizes the GM percussive family independently of channel", () => {
    expect(gmProgramRole(112, true)).toEqual({ role: "percussion", confidence: 0.96, explicit: true });
    expect(isGmPercussionProgram(119)).toBe(true);
    expect(isGmPercussionProgram(120)).toBe(false);
  });
});

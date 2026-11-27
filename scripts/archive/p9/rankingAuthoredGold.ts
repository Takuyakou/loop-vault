/** Public authored P9.5 ranking scenarios. Truth is declared here, not generated from candidates. */
import { audibleSignature, harmonicTruthVersion, type HarmonicGold, type HarmonicIdentity } from "../p7/harmonicTruth";
import type { Tier2Gold } from "./tier2Scorer";
export interface RankingNote { pitch: number; onset: number; duration: number; track: number; velocity: number }
export interface RankingCase { id: string; split: "dev" | "validation"; category: string; source: RankingNote[]; gold: Tier2Gold; previousSource?: RankingNote[] }
export interface UnknownCase { id: string; split: "dev" | "validation"; category: string; source: RankingNote[] }
const n = (pitch: number, onset = 0, duration = 1, track = 0, velocity = 80): RankingNote =>
  ({ pitch, onset, duration, track, velocity });
const id = (root: number, quality: string, bass: number, factors: string[]): HarmonicIdentity =>
  ({ root, quality, bass, factors });
function authored(input: { name: string; split: "dev" | "validation"; category: string; label: string;
  notes: number[]; source?: RankingNote[]; identity: HarmonicIdentity; defining: number[];
  optional?: number[]; previousSource?: RankingNote[] }): RankingCase {
  const harmonic: HarmonicGold = { version: harmonicTruthVersion, id: input.name, category: input.category,
    primaryLabel: input.label, notes: input.notes, identities: [input.identity], audible: [audibleSignature(input.notes)] };
  return { id: input.name, split: input.split, category: input.category,
    source: input.source ?? input.notes.map((pitch) => n(pitch)), previousSource: input.previousSource,
    gold: { harmonic, definingPitchClasses: input.defining, optionalPitchClasses: input.optional ?? [],
      identityStatus: "RESOLVED", vocabularyStatus: "SUPPORTED" } };
}
const cmaj = id(0, "maj", 0, ["3", "5"]);
export const rankingCases: readonly RankingCase[] = [
  authored({ name: "major-block", split: "dev", category: "block", label: "C", notes: [48, 52, 55], identity: cmaj, defining: [4], optional: [7] }),
  authored({ name: "minor-block", split: "dev", category: "block", label: "Dm", notes: [50, 53, 57], identity: id(2,"min",2,["b3","5"]), defining: [5], optional: [9] }),
  authored({ name: "dominant-seventh", split: "dev", category: "seventh", label: "G7", notes: [43,47,50,53], identity: id(7,"dom7",7,["3","5","b7"]), defining: [11,5], optional: [2] }),
  authored({ name: "diminished-triad", split: "dev", category: "diminished", label: "Bdim", notes: [47,50,53], identity: id(11,"dim",11,["b3"]), defining: [2,5] }),
  authored({ name: "sus-four", split: "dev", category: "suspended", label: "Fsus4", notes: [41,46,48], identity: id(5,"sus4",5,["5","11"]), defining: [10] }),
  authored({ name: "add-nine", split: "dev", category: "extension", label: "Cadd9", notes: [48,52,55,62], identity: id(0,"add9",0,["3","5","9"]), defining: [4,2], optional: [7] }),
  authored({ name: "minor-seventh", split: "dev", category: "seventh", label: "Am7", notes: [45,48,52,55], identity: id(9,"min7",9,["b3","5","b7"]), defining: [0,7] }),
  authored({ name: "slash-bass", split: "dev", category: "inversion", label: "C/E", notes: [40,48,52,55], identity: id(0,"maj",4,["3","5"]), defining: [4], optional: [7] }),
  authored({ name: "rootless-ninth", split: "dev", category: "rootless", label: "G9/B", notes: [47,53,57], identity: id(7,"dom9",11,["no-root","3","no5","b7","9"]), defining: [11,5,9] }),
  authored({ name: "half-beat-passing", split: "dev", category: "short-passing", label: "Db", notes: [49,53,56], source: [n(49,0,0.5),n(53,0,0.5),n(56,0,0.5)], identity: id(1,"maj",1,["3","5"]), defining: [5], previousSource: [n(48), n(52), n(55)] }),
  authored({ name: "pedal-bass-shift", split: "dev", category: "pedal", label: "F/C", notes: [48,53,57,60], source: [n(48,-1,2),n(53,0,1),n(57,0,1),n(60,0,1)], identity: id(5,"maj",0,["3","5"]), defining: [9], previousSource: [n(48), n(52), n(55)] }),
  authored({ name: "staggered-arpeggio", split: "dev", category: "arpeggio", label: "Bm7", notes: [47,50,54,57], source: [n(47,0,1),n(50,0.15,0.85),n(54,0.3,0.7),n(57,0.45,0.55)], identity: id(11,"min7",11,["b3","5","b7"]), defining: [2,9] }),
  authored({ name: "ghost-bass", split: "dev", category: "ghost-bass", label: "C", notes: [48,52,55], source: [n(48),n(52),n(55),n(35,0.4,0.1,1,35)], identity: cmaj, defining: [4], optional: [7] }),
  authored({ name: "melody-passing", split: "dev", category: "non-chord-tone", label: "Dm", notes: [50,53,57], source: [n(50),n(53),n(57),n(64,0.5,0.1,1,70)], identity: id(2,"min",2,["b3","5"]), defining: [5], optional: [9] }),
  authored({ name: "validation-major", split: "validation", category: "block", label: "E", notes: [40,44,47], identity: id(4,"maj",4,["3","5"]), defining: [8], optional: [11] }),
  authored({ name: "validation-min7", split: "validation", category: "seventh", label: "Em7", notes: [40,43,47,50], identity: id(4,"min7",4,["b3","5","b7"]), defining: [7,2] }),
  authored({ name: "validation-inversion", split: "validation", category: "inversion", label: "Bb7/F", notes: [41,46,50,56], identity: id(10,"dom7",5,["3","5","b7"]), defining: [2,8] }),
  authored({ name: "validation-half-beat", split: "validation", category: "short-passing", label: "Cm", notes: [48,51,55], source: [n(48,0,0.5),n(51,0,0.5),n(55,0,0.5)], identity: id(0,"min",0,["b3","5"]), defining: [3], previousSource: [n(48), n(52), n(55)] }),
  authored({ name: "validation-sus", split: "validation", category: "suspended", label: "Dsus2/A", notes: [45,50,52,57], identity: id(2,"sus2",9,["5","9"]), defining: [4] }),
  authored({ name: "validation-altered", split: "validation", category: "altered", label: "G7b9", notes: [43,47,50,53,56], identity: id(7,"dom7",7,["3","5","b7","b9"]), defining: [11,5,8] }),
  authored({ name: "validation-ghost", split: "validation", category: "ghost-bass", label: "E", notes: [40,44,47], source: [n(40),n(44),n(47),n(35,0.2,0.08,1,30)], identity: id(4,"maj",4,["3","5"]), defining: [8], optional: [11] }),
];
export const unknownCases: readonly UnknownCase[] = [
  { id:"single-note",split:"dev",category:"insufficient-context",source:[n(48)] },
  { id:"bare-fifth",split:"dev",category:"insufficient-context",source:[n(48),n(55)] },
  { id:"chromatic-cluster",split:"dev",category:"cluster",source:[n(48),n(49),n(50),n(51)] },
  { id:"single-bass",split:"validation",category:"insufficient-context",source:[n(40)] },
  { id:"cluster-validation",split:"validation",category:"cluster",source:[n(60),n(61),n(62),n(63)] },
];

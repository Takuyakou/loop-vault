export interface VoicingSemanticSpecification {
  readonly id: `S${string}`;
  readonly input: string;
  readonly assertion: string;
  readonly representable: boolean;
  readonly deferredReason?: string;
}

/**
 * Audited semantic reference copied from the P5.33 research intake.
 * Runtime resolution must not import this corpus.
 */
export const VOICING_RULE_GOLDEN_CORPUS: readonly VoicingSemanticSpecification[] = Object.freeze([
  { id: "S01", input: "Eadd9/F#", assertion: "Slash bass covers 9; the upper triad completes the literal pitch classes.", representable: true },
  { id: "S02", input: "Eadd9/F#", assertion: "Literal coverage rejects automatic maj7 enrichment.", representable: true },
  { id: "S03", input: "Gmaj9/A compact", assertion: "Omit 5 explicitly and preserve the Gmaj9/A identity.", representable: true },
  { id: "S04", input: "Gmaj9/A full", assertion: "Cover the complete literal set without renaming the chord.", representable: true },
  { id: "S05", input: "Am11/B", assertion: "Classify B as 9 of the upper Am11 identity.", representable: true },
  { id: "S06", input: "C/E", assertion: "Keep E as the lowest played bass and do not add a lower C.", representable: true },
  { id: "S07", input: "C6/9 and C6/9/E", assertion: "Distinguish the 6/9 quality slash from a trailing slash bass.", representable: true },
  { id: "S08", input: "G7sus4", assertion: "Retain 4 and do not force 3.", representable: true },
  { id: "S09", input: "Bm7b5", assertion: "Retain the characteristic b5.", representable: true },
  { id: "S10", input: "Cdim7", assertion: "Retain the bb7 degree identity instead of treating it as major 6.", representable: true },
  { id: "S11", input: "C4 E4 G4 B4 / Drop2", assertion: "Move only the second-highest note down one octave.", representable: true },
  { id: "S12", input: "Drop2 + fixed Bass C", assertion: "Require an explicit external bass context.", representable: true },
  { id: "S13", input: "Source MIDI / Custom missing", assertion: "Fail closed without generated fallback or pitch repair.", representable: true },
  { id: "S14", input: "Bass+fifth for Eadd9/F#", assertion: "Reject unlisted C# in Literal coverage.", representable: true },
  { id: "S15", input: "Loop candidate sequence", assertion: "Rank with the final-to-first transition without scoring the player.", representable: true },
  { id: "S16", input: "Dm11 / So What D G C F A", assertion: "Do not claim full Dm11 coverage when 9 is absent.", representable: false, deferredReason: "The current chord vocabulary cannot preserve the proposed Dm7(add11) display identity." },
]);

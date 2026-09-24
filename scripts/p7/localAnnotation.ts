import { createHash } from "node:crypto";
import { parseMidi } from "midi-file";

export const localReviewVersion = "p7-local-source-review-v1" as const;
export interface ObservedNote {
  id: string;
  pitch: number;
  onsetTick: number;
  offsetTick: number;
  durationTick: number;
  track: number;
  channel: number;
  velocity: number;
}
export interface SourceFactBundle {
  schemaVersion: 1;
  reviewVersion: typeof localReviewVersion;
  anonymousId: string;
  sourceSha256: string;
  sourceBytes: number;
  format: number;
  ppq: number;
  endTick: number;
  tempoEvents: { tick: number; microsecondsPerBeat: number; track: number }[];
  meterEvents: { tick: number; numerator: number; denominator: number; track: number }[];
  controllerEvents: { tick: number; track: number; channel: number; controller: number; value: number }[];
  notes: ObservedNote[];
  onsetClusters: { tick: number; noteIds: string[] }[];
}
export type Decision = "unknown" | "yes" | "no";
export interface ReviewAnnotation {
  schemaVersion: 1;
  reviewVersion: typeof localReviewVersion;
  anonymousId: string;
  sourceSha256: string;
  status: "draft" | "reviewed";
  boundaryDecisions: { tick: number; harmonic: Decision; voicing: Decision; passingChord: Decision }[];
  noteDecisions: { noteId: string; role: "unknown" | "harmony" | "melody" | "bass" | "percussion" | "other"; event: "unknown" | "none" | "passing" | "neighbor" | "appoggiatura" | "restrike" | "arpeggio" | "residual" }[];
  harmonicSpans: { startTick: number; endTick: number; identity: string }[];
  voicingSpans: { startTick: number; endTick: number; targetNoteIds: string[] }[];
  comments: string;
}

export function extractSourceFacts(bytes: Uint8Array, anonymousId: string): SourceFactBundle {
  if (!/^local-[a-z0-9-]{4,40}$/.test(anonymousId)) throw new Error("Use an anonymous local ID.");
  const midi = parseMidi(bytes);
  if (midi.header.format === 2 || !midi.header.ticksPerBeat || midi.header.ticksPerBeat <= 0) {
    throw new Error("This review requires a shared PPQ timeline (SMF format 0 or 1).");
  }
  const ppq = midi.header.ticksPerBeat;
  const tempoEvents: SourceFactBundle["tempoEvents"] = [];
  const meterEvents: SourceFactBundle["meterEvents"] = [];
  const controllerEvents: SourceFactBundle["controllerEvents"] = [];
  const notes: ObservedNote[] = [];
  const active = new Map<string, Omit<ObservedNote, "id" | "offsetTick" | "durationTick">[]>();
  let endTick = 0;
  for (const [track, events] of midi.tracks.entries()) {
    let tick = 0;
    for (const event of events) {
      if (!Number.isSafeInteger(event.deltaTime) || event.deltaTime < 0) throw new Error("Invalid MIDI delta time.");
      tick += event.deltaTime;
      if (!Number.isSafeInteger(tick)) throw new Error("MIDI tick overflow.");
      if (event.type === "setTempo") tempoEvents.push({ tick, microsecondsPerBeat: event.microsecondsPerBeat, track });
      if (event.type === "timeSignature") meterEvents.push({ tick, numerator: event.numerator, denominator: event.denominator, track });
      if (event.type === "controller") controllerEvents.push({ tick, track, channel: event.channel, controller: event.controllerType, value: event.value });
      if (event.type === "noteOn" && event.velocity > 0) {
        const key = track + ":" + event.channel + ":" + event.noteNumber;
        const queue = active.get(key) ?? [];
        if (queue.length) throw new Error("Overlapping same-pitch note events have ambiguous onset/offset pairing.");
        queue.push({ pitch: event.noteNumber, onsetTick: tick, track, channel: event.channel, velocity: event.velocity });
        active.set(key, queue);
      } else if (event.type === "noteOff" || (event.type === "noteOn" && event.velocity === 0)) {
        const key = track + ":" + event.channel + ":" + event.noteNumber;
        const queue = active.get(key);
        const start = queue?.shift();
        if (!start) throw new Error("Unpaired note off; offset cannot be treated as observed truth.");
        if (tick <= start.onsetTick) throw new Error("Zero or negative MIDI note duration.");
        notes.push({ ...start, id: "", offsetTick: tick, durationTick: tick - start.onsetTick });
        if (queue?.length === 0) active.delete(key);
      }
    }
    endTick = Math.max(endTick, tick);
  }
  if (active.size) throw new Error("Unpaired note on; offset cannot be treated as observed truth.");
  notes.sort((a, b) => a.onsetTick - b.onsetTick || a.track - b.track || a.channel - b.channel || a.pitch - b.pitch || a.offsetTick - b.offsetTick);
  notes.forEach((note, index) => { note.id = "n" + String(index + 1).padStart(6, "0"); });
  const clusterMap = new Map<number, string[]>();
  for (const note of notes) clusterMap.set(note.onsetTick, [...(clusterMap.get(note.onsetTick) ?? []), note.id]);
  return {
    schemaVersion: 1, reviewVersion: localReviewVersion, anonymousId,
    sourceSha256: createHash("sha256").update(bytes).digest("hex"), sourceBytes: bytes.length,
    format: midi.header.format, ppq, endTick,
    tempoEvents: tempoEvents.sort((a, b) => a.tick - b.tick || a.track - b.track),
    meterEvents: meterEvents.sort((a, b) => a.tick - b.tick || a.track - b.track),
    controllerEvents: controllerEvents.sort((a, b) => a.tick - b.tick || a.track - b.track || a.channel - b.channel),
    notes, onsetClusters: [...clusterMap].map(([tick, noteIds]) => ({ tick, noteIds })),
  };
}

export function blankReview(facts: SourceFactBundle): ReviewAnnotation {
  return {
    schemaVersion: 1, reviewVersion: localReviewVersion, anonymousId: facts.anonymousId,
    sourceSha256: facts.sourceSha256, status: "draft",
    boundaryDecisions: facts.onsetClusters.filter((cluster) => cluster.tick > 0)
      .map((cluster) => ({ tick: cluster.tick, harmonic: "unknown", voicing: "unknown", passingChord: "unknown" })),
    noteDecisions: facts.notes.map((note) => ({ noteId: note.id, role: "unknown", event: "unknown" })),
    harmonicSpans: [], voicingSpans: [], comments: "",
  };
}

export function validateReview(facts: SourceFactBundle, review: ReviewAnnotation): string[] {
  const issues: string[] = [];
  if (review.schemaVersion !== 1 || review.reviewVersion !== localReviewVersion
    || review.anonymousId !== facts.anonymousId || review.sourceSha256 !== facts.sourceSha256) issues.push("source-mismatch");
  const noteIds = new Set(facts.notes.map((note) => note.id));
  const noteDecisions = new Set<string>();
  for (const note of review.noteDecisions ?? []) {
    if (!noteIds.has(note.noteId) || noteDecisions.has(note.noteId)) issues.push("note-id");
    noteDecisions.add(note.noteId);
    if (!["unknown", "harmony", "melody", "bass", "percussion", "other"].includes(note.role)
      || !["unknown", "none", "passing", "neighbor", "appoggiatura", "restrike", "arpeggio", "residual"].includes(note.event)) issues.push("note-decision");
  }
  if (noteDecisions.size !== noteIds.size) issues.push("note-coverage");
  const boundaries = new Set<number>();
  const requiredOnsets = new Set(facts.onsetClusters.filter((cluster) => cluster.tick > 0).map((cluster) => cluster.tick));
  for (const decision of review.boundaryDecisions ?? []) {
    if (!Number.isSafeInteger(decision.tick) || decision.tick <= 0 || decision.tick >= facts.endTick || boundaries.has(decision.tick)) issues.push("boundary-tick");
    boundaries.add(decision.tick);
    if (!["unknown", "yes", "no"].includes(decision.harmonic)
      || !["unknown", "yes", "no"].includes(decision.voicing)
      || !["unknown", "yes", "no"].includes(decision.passingChord)) issues.push("boundary-decision");
  }
  if ([...requiredOnsets].some((tick) => !boundaries.has(tick))) issues.push("boundary-coverage");
  const checkSpans = (spans: { startTick: number; endTick: number }[], name: string): void => {
    if (!spans.length) return;
    if (spans[0]?.startTick !== 0 || spans[spans.length - 1]?.endTick !== facts.endTick) issues.push(name + "-coverage");
    for (let index = 0; index < spans.length; index++) {
      const span = spans[index]!;
      if (!Number.isSafeInteger(span.startTick) || !Number.isSafeInteger(span.endTick)
        || span.endTick <= span.startTick || span.startTick < 0 || span.endTick > facts.endTick
        || (index > 0 && span.startTick !== spans[index - 1]?.endTick)) issues.push(name + "-continuity");
    }
  };
  checkSpans(review.harmonicSpans ?? [], "harmonic");
  checkSpans(review.voicingSpans ?? [], "voicing");
  for (const span of review.voicingSpans ?? []) {
    if (!span.targetNoteIds.length || new Set(span.targetNoteIds).size !== span.targetNoteIds.length
      || span.targetNoteIds.some((id) => !noteIds.has(id))) issues.push("voicing-target");
    if (span.targetNoteIds.some((id) => !facts.notes.some((note) => note.id === id && note.onsetTick < span.endTick && note.offsetTick > span.startTick))) issues.push("voicing-target-outside-span");
  }
  if (review.status === "reviewed") {
    if ((review.boundaryDecisions ?? []).some((decision) => decision.harmonic === "unknown" || decision.voicing === "unknown" || decision.passingChord === "unknown"
      || (decision.passingChord === "yes" && decision.harmonic !== "yes"))
      || (review.noteDecisions ?? []).some((note) => note.role === "unknown" || note.event === "unknown")
      || !review.harmonicSpans?.length || !review.voicingSpans?.length
      || review.harmonicSpans.some((span) => typeof span.identity !== "string" || !span.identity.trim())) issues.push("incomplete-review");
    const boundaryTicks = (field: "harmonic" | "voicing") => review.boundaryDecisions.filter((item) => item[field] === "yes").map((item) => item.tick).sort((a, b) => a - b);
    for (const [name, spans] of [["harmonic", review.harmonicSpans], ["voicing", review.voicingSpans]] as const) {
      if (JSON.stringify(spans.slice(1).map((span) => span.startTick)) !== JSON.stringify(boundaryTicks(name))) issues.push(name + "-boundary-mismatch");
    }
  }
  return [...new Set(issues)];
}

export function materializeReviewedGold(facts: SourceFactBundle, review: ReviewAnnotation) {
  const issues = validateReview(facts, review);
  if (review.status !== "reviewed" || issues.length) throw new Error("Independent review is incomplete: " + issues.join(","));
  const byId = new Map(facts.notes.map((note) => [note.id, note]));
  return {
    schemaVersion: 1, goldVersion: "p7-local-temporal-gold-v1",
    anonymousId: facts.anonymousId, sourceSha256: facts.sourceSha256, ppq: facts.ppq, endTick: facts.endTick,
    harmonicSpans: review.harmonicSpans,
    voicingSpans: review.voicingSpans.map((span) => ({
      ...span, targetMidi: [...new Set(span.targetNoteIds.map((id) => byId.get(id)!.pitch))].sort((a, b) => a - b),
    })),
    noteEvents: review.noteDecisions.filter((note) => note.event !== "none").map((note) => ({
      noteId: note.noteId, kind: note.event, onsetTick: byId.get(note.noteId)!.onsetTick, offsetTick: byId.get(note.noteId)!.offsetTick,
    })),
    noteRoles: review.noteDecisions.map((note) => ({ noteId: note.noteId, role: note.role })),
    passingChordBoundaryTicks: review.boundaryDecisions.filter((item) => item.passingChord === "yes").map((item) => item.tick),
  };
}

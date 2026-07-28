import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { cwd, stdout } from "node:process";
import { voiceChordForPreview } from "../src/domain/chordVoicing";
import { analyzeMidi, buildVoiceFeatureInputs, buildVoices, parseMidi, voiceId } from "../src/domain/midi";
import { normalizeNotes } from "../src/domain/midi/normalize";
import { beatsPerBar } from "../src/domain/midi/timing";
import { annotateVoiceRoles } from "../src/domain/midi/voiceRoles";
import type { TimedNote, Voice } from "../src/domain/midi/types";
import { extractAggregatedCandidate } from "../src/domain/voicing/extractAggregatedNoteSet";
import { extractVoicing } from "../src/domain/voicing";

interface ReviewSource {
  alias: "Endless" | "SURAN";
  path: string;
}

const sources: ReviewSource[] = [
  {
    alias: "Endless",
    path: ".local-evaluation/phase4.1.1/fixtures/endless.mid",
  },
  {
    alias: "SURAN",
    path: ".local-evaluation/phase4.1/fixtures/suran-remix.mid",
  },
];
const output = resolve(cwd(), ".local-evaluation/phase4.3/real-midi-review-pack.json");
const htmlOutput = resolve(cwd(), ".local-evaluation/phase4.3/real-midi-review-pack.html");
const reviews = [];
const sourceSummaries = [];

for (const source of sources) {
  const bytes = new Uint8Array(await readFile(resolve(cwd(), source.path)));
  const data = parseMidi(bytes);
  const analysis = analyzeMidi(bytes, { mode: "phase4-v1", fileName: `${source.alias}.mid` });
  const rawVoices = buildVoices(data);
  const features = buildVoiceFeatureInputs(rawVoices, normalizeNotes(data));
  const voices = annotateVoiceRoles(rawVoices, features);
  const meter = beatsPerBar(analysis.timeSignature);
  const selected = sampleEvenly(analysis.fullTimeline, 12);
  let usable = 0;
  let review = 0;
  let notFound = 0;

  selected.forEach((item, index) => {
    const startBeat = (item.bar - 1) * meter + item.beat - 1;
    const endBeat = startBeat + item.durationBeats;
    const input = {
      chord: item.chord,
      segment: { startBeat, endBeat },
      notes: data.notes,
      ticksPerBeat: data.ticksPerBeat,
      voices,
    };
    const sourceFaithful = extractVoicing(input);
    if (sourceFaithful.status === "usable") usable += 1;
    else if (sourceFaithful.status === "review") review += 1;
    else notFound += 1;
    const aggregate = extractAggregatedCandidate(input);
    const sourceNotes = sourceFaithful.snapshot?.midiNotes ?? [];
    const dojoNotes = dojoIntegratedNotes(sourceNotes, data.notes, voices, startBeat, data.ticksPerBeat);
    const generated = voiceChordForPreview(item.chord).notes;
    reviews.push({
      id: `${source.alias.toLowerCase()}-${String(index + 1).padStart(2, "0")}`,
      source: source.alias,
      sourceSegment: { startBeat, endBeat, bar: item.bar },
      detectedChord: item.chord.label,
      sourceFaithful: {
        midiNotes: sourceNotes,
        noteNames: sourceNotes.map(noteName),
        representation: sourceFaithful.snapshot?.representation ?? "none",
        status: sourceFaithful.status,
        reasons: sourceFaithful.reasons,
      },
      aggregateHarmony: {
        midiNotes: aggregate?.midiNotes ?? [],
        noteNames: (aggregate?.midiNotes ?? []).map(noteName),
      },
      dojoIntegrated: {
        midiNotes: dojoNotes,
        noteNames: dojoNotes.map(noteName),
      },
      generatedFallback: {
        midiNotes: generated,
        noteNames: generated.map(noteName),
      },
      keyboard: {
        minimumMidi: 36,
        maximumMidi: 96,
        sourceActive: sourceNotes,
        aggregateActive: aggregate?.midiNotes ?? [],
        dojoActive: dojoNotes,
      },
      audition: {
        A: "sourceFaithful",
        B: "aggregateHarmony",
        C: "dojoIntegrated",
        fallback: "generatedFallback",
      },
      reviewer: {
        preferred: null,
        sourceFaithfulAcceptable: null,
        aggregateAcceptable: null,
        dojoAcceptable: null,
        comments: "",
      },
    });
  });
  sourceSummaries.push({
    source: source.alias,
    totalBars: analysis.totalBars,
    timelineEvents: analysis.fullTimeline.length,
    reviewEvents: selected.length,
    sourceStatus: { usable, review, notFound },
  });
}

const pack = {
  schemaVersion: 1,
  analyzerMode: "phase4-v1",
  automatedBaseline: "complete",
  humanAuditoryReview: "pending",
  releaseBlocking: "before Phase 4.4 extractor behavior changes",
  privacy: {
    absolutePathsPersisted: false,
    midiBytesPersisted: false,
    promptOrResponsePersisted: false,
  },
  sources: sourceSummaries,
  reviewEventCount: reviews.length,
  reviews,
};

await mkdir(dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(pack, null, 2)}\n`, "utf8");
await writeFile(htmlOutput, reviewHtml(pack), "utf8");
stdout.write(`${JSON.stringify({
  automatedBaseline: pack.automatedBaseline,
  humanAuditoryReview: pack.humanAuditoryReview,
  sources: sourceSummaries,
  reviewEventCount: reviews.length,
  output: ".local-evaluation/phase4.3/real-midi-review-pack.json",
  html: ".local-evaluation/phase4.3/real-midi-review-pack.html",
}, null, 2)}\n`);

function sampleEvenly<T>(items: readonly T[], count: number): T[] {
  if (items.length <= count) return [...items];
  return Array.from({ length: count }, (_, index) => {
    const position = Math.round((index * (items.length - 1)) / (count - 1));
    return items[position]!;
  });
}

function dojoIntegratedNotes(
  sourceNotes: readonly number[],
  notes: readonly TimedNote[],
  voices: readonly Voice[],
  startBeat: number,
  ticksPerBeat: number,
): number[] {
  const roleByVoice = new Map(voices.map((voice) => [voice.id, voice.inferredRole]));
  const bassAtOnset = notes
    .filter((note) => note.channel !== undefined
      && roleByVoice.get(voiceId(note.trackIndex, note.channel)) === "bass")
    .filter((note) => {
      const noteStart = note.startTick / ticksPerBeat;
      const noteEnd = (note.startTick + note.durationTick) / ticksPerBeat;
      return noteStart <= startBeat && noteEnd > startBeat;
    })
    .map((note) => note.pitch)
    .sort((left, right) => left - right)[0];
  return [...new Set([
    ...(bassAtOnset === undefined ? [] : [bassAtOnset]),
    ...sourceNotes,
  ])].sort((left, right) => left - right);
}

function noteName(midi: number): string {
  const names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  return `${names[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
}

function reviewHtml(pack: typeof pack): string {
  const data = JSON.stringify(pack).replace(/</g, "\\u003c");
  return `<!doctype html>
<html lang="ja">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Loop Vault P4.3 Real MIDI Review</title>
<style>
  :root { color-scheme: dark; font-family: system-ui, sans-serif; background:#090d13; color:#edf5f4; }
  body { margin:0; padding:24px; }
  header { position:sticky; top:0; background:#090d13ee; padding:8px 0 16px; z-index:2; }
  h1 { font-size:22px; margin:0 0 6px; }
  #events { display:grid; gap:16px; }
  article { border:1px solid #33404c; border-radius:6px; padding:16px; background:#101721; }
  .meta,.notes { color:#a9bac7; font-size:13px; }
  .actions { display:flex; gap:8px; flex-wrap:wrap; margin:12px 0; }
  button { border:1px solid #496072; border-radius:4px; background:#15212d; color:#edf5f4; padding:8px 12px; cursor:pointer; }
  button:hover { border-color:#54dfce; }
  .keyboard { display:grid; grid-template-columns:repeat(61, minmax(5px,1fr)); height:72px; gap:1px; margin:10px 0; }
  .key { background:#eef1f1; border:1px solid #68727a; }
  .key.black { background:#151a1f; height:44px; z-index:1; }
  .key.active { background:#4ce0ce; }
  textarea { box-sizing:border-box; width:100%; min-height:60px; background:#0a1017; color:#edf5f4; border:1px solid #33404c; }
</style>
<header><h1>Phase 4.3 Real MIDI Review Pack</h1><div class="meta">A Source-faithful / B Aggregate / C Dojo-integrated / F Generated</div></header>
<main id="events"></main>
<script>
const pack=${data};
const root=document.querySelector('#events');
const black=new Set([1,3,6,8,10]);
let audio;
function play(notes){
  audio ||= new AudioContext();
  const now=audio.currentTime;
  notes.forEach((midi,index)=>{
    const oscillator=audio.createOscillator();
    const gain=audio.createGain();
    oscillator.type='sine';
    oscillator.frequency.value=440*Math.pow(2,(midi-69)/12);
    gain.gain.setValueAtTime(0.0001,now);
    gain.gain.exponentialRampToValueAtTime(0.08/Math.max(1,notes.length),now+0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001,now+1.1);
    oscillator.connect(gain).connect(audio.destination);
    oscillator.start(now+index*0.01); oscillator.stop(now+1.15);
  });
}
function keyboard(active){
  const set=new Set(active);
  return '<div class="keyboard">'+Array.from({length:61},(_,i)=>{
    const midi=36+i;
    return '<span class="key '+(black.has(midi%12)?'black ':'')+(set.has(midi)?'active':'')+'" title="'+midi+'"></span>';
  }).join('')+'</div>';
}
pack.reviews.forEach(review=>{
  const article=document.createElement('article');
  const sets={
    A:review.sourceFaithful.midiNotes,
    B:review.aggregateHarmony.midiNotes,
    C:review.dojoIntegrated.midiNotes,
    F:review.generatedFallback.midiNotes
  };
  article.innerHTML='<strong>'+review.id+' · '+review.detectedChord+'</strong>'
    +'<div class="meta">bar '+review.sourceSegment.bar+' / beats '+review.sourceSegment.startBeat+'-'+review.sourceSegment.endBeat+' / '+review.sourceFaithful.status+'</div>'
    +'<div class="actions">'+Object.entries(sets).map(([key,notes])=>'<button data-key="'+key+'">'+key+' 試聴</button>').join('')+'</div>'
    +'<div class="keyboard-host">'+keyboard(sets.A)+'</div>'
    +'<div class="notes">A '+review.sourceFaithful.noteNames.join(' · ')+'<br>B '+review.aggregateHarmony.noteNames.join(' · ')+'<br>C '+review.dojoIntegrated.noteNames.join(' · ')+'</div>'
    +'<textarea placeholder="reviewer comments"></textarea>';
  article.querySelectorAll('button').forEach(button=>button.addEventListener('click',()=>{
    const notes=sets[button.dataset.key];
    play(notes);
    article.querySelector('.keyboard-host').innerHTML=keyboard(notes);
  }));
  root.append(article);
});
</script>
</html>`;
}

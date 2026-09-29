import midiPackage from "@tonejs/midi";
const { Midi } = midiPackage;

export function encodeUsageCase(testCase) {
  const midi = new Midi();
  midi.header.setTempo(testCase.tempoBpm);
  midi.header.timeSignatures.push({ ticks: 0, timeSignature: testCase.meter, measures: 0 });
  const tracks = new Map();
  for (const note of testCase.notes) {
    if (!tracks.has(note.track)) {
      const track = midi.addTrack();
      track.name = "Public synthetic";
      tracks.set(note.track, track);
    }
    tracks.get(note.track).addNote({
      midi: note.pitch, ticks: Math.round(note.startTick * 480 / testCase.ppq),
      durationTicks: Math.max(1, Math.round(note.durationTick * 480 / testCase.ppq)), velocity: note.velocity / 127,
    });
  }
  return new Uint8Array(midi.toArray());
}

import { compareBassNotes, extractPlayedBass } from "./analysis";
self.onmessage = (event) => {try {const {pcm,sampleRate,target,bpm,settings,startOffsetMs}=event.data;const played=extractPlayedBass(pcm,sampleRate);self.postMessage({result:compareBassNotes(target,bpm,played,settings,startOffsetMs)});}catch(error){self.postMessage({error:error instanceof Error?error.message:"判定できませんでした"});}};

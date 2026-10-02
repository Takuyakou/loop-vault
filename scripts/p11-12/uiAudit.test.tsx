// @vitest-environment jsdom
// Audits the real View with synthetic snapshots. Audio side effects are replaced; ranker/resolver/UI are real.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { ProgressionVoicingPracticeView } from "../../src/views/ProgressionVoicingPracticeView";
import { PreviewSoundProvider } from "../../src/components/PreviewSoundProvider";
import { MetronomeProvider } from "../../src/components/MetronomeProvider";
import type { ProgressionVoicingTransportPort, ProgressionVoicingTransportStartOptions } from "../../src/practice/ProgressionVoicingTransport";
import type { ProgressionVoicingSelection } from "../../src/domain/progressionVoicingPractice";
import { loadFingeringPreferences, savePersonalFingering } from "../../src/voicingPractice/fingeringPreferences";
import { generateFingeringCandidates } from "../../src/domain/progressionFingering";
import { formatMidiNoteForDisplay } from "../../src/components/music-keyboard";
import { fixedFingerSlots } from "../../src/voicingPractice/nextMove";
import { project, syntheticSnapshots, emptyPreferences } from "./integration";
(globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
let root:Root|undefined;
afterEach(async()=>{await act(async()=>root?.unmount());root=undefined;document.body.replaceChildren();window.localStorage.clear();});
const observations:unknown[]=[];
function write(){mkdirSync(".local-evaluation/fingering-ranker-audit",{recursive:true});writeFileSync(".local-evaluation/fingering-ranker-audit/ui-observations.json",JSON.stringify(observations,null,2)+"\n");}
async function mount(selection:ProgressionVoicingSelection, snapshots=syntheticSnapshots()){const container=document.createElement("div");document.body.append(container);root=createRoot(container);
 const runtime:ProgressionVoicingTransportPort={supportsSeek:true,seek:()=>undefined,setLoopBounds:()=>true,start:vi.fn(async(options:ProgressionVoicingTransportStartOptions)=>{void options;}),updatePlan:()=>true,pause:()=>true,resume:async()=>true,restart:async()=>true,stop:()=>{},setBpm:()=>{},setMetronomeEnabled:()=>{},setReferenceSoundEnabled:()=>{},audition:async()=>{}};
 await act(async()=>root!.render(<MetronomeProvider><PreviewSoundProvider><ProgressionVoicingPracticeView snapshots={snapshots} initialSelection={selection} monitorMidi={false} transportFactory={()=>runtime} vaultProgressions={[]} onSelectProgression={()=>true} onEnterText={()=>{}} /></PreviewSoundProvider></MetronomeProvider>));
 return {container,snapshots};
}
function button(c:HTMLElement,label:string){const result=[...c.querySelectorAll<HTMLButtonElement>("button")].find(b=>b.textContent===label||b.getAttribute("aria-label")===label)??[...c.querySelectorAll<HTMLButtonElement>("button")].find(b=>b.textContent?.includes(label));if(!result)throw Error(`Missing control: ${label}`);return result;}
function observe(container:HTMLElement,model:ReturnType<typeof project>,event:number,tag:string){
 const frame=model.frames[event]!;const card:Record<string,string|null>={};
 for(const hand of ["left","right"]as const){const panel=container.querySelector(`[data-testid='voicing-loop-${hand}-hand']`);card[hand]=panel?.textContent??null;if(frame.hands[hand].length)expect(panel?.textContent).toContain(frame.cardLabels[hand]);}
 const keys=[...container.querySelectorAll<HTMLElement>("[data-midi-note] [data-finger-label]")].map(e=>({note:Number(e.closest("[data-midi-note]")!.getAttribute("data-midi-note")),label:e.getAttribute("data-finger-label")}));
 for(const [note,label]of Object.entries(frame.keyboardLabels))expect(keys.some(k=>k.note===Number(note)&&k.label===label)).toBe(true);
 const slots=[...container.querySelectorAll<HTMLElement>("[data-testid='voicing-loop-finger-slot']")].map(e=>({finger:e.dataset.finger,title:e.title,strength:e.dataset.strength}));
 for(const slot of fixedFingerSlots(model.moves[event]!.moves)){
  const id=`${slot.hand==="left"?"L":"R"}${slot.finger}`;const actual=slots.find(s=>s.finger===id)!;expect(actual).toBeDefined();
  if(!slot.moves.length)expect(actual.strength).toBe("EMPTY");
  for(const move of slot.moves){
   if(move.finger!==undefined)expect(actual.title).toContain(id);
   for(const pitch of [move.from,move.to])if(pitch!==undefined)expect(actual.title).toContain(formatMidiNoteForDisplay(pitch,"fl-studio","flat"));
  }
 }
 observations.push({tag,event,internal:frame.suggested,effective:frame.effective,card,keyboard:keys,nextMove:slots,expectedMoves:model.moves[event]!.moves});write();
}
it("measures actual card / keyboard / Next Move for normal, wrap, Source and shape switches",async()=>{
 const {container,snapshots}=await mount("basic-full");
 for(const [selection,label]of [["basic-full","自動生成"],["source-midi","元MIDI"],["custom","カスタム"],["saved","保存した音"]]as const){
  if(selection!=="basic-full")await act(async()=>button(container,label).click());
  const model=project(snapshots[selection]!,emptyPreferences,selection==="basic-full"?{lessonStudyCategory:"teacher"}:{});
  for(const event of [0,3]){await act(async()=>container.querySelectorAll<HTMLButtonElement>("[data-testid='voicing-loop-event']")[event]!.click());observe(container,model,event,selection);}
 }
 await act(async()=>button(container,"自動生成").click());
 const shape=container.querySelector<HTMLSelectElement>('[aria-label="既存の形"]')!;
 await act(async()=>{shape.value="basic-shell";shape.dispatchEvent(new Event("change",{bubbles:true}));});
 await act(async()=>container.querySelectorAll<HTMLButtonElement>("[data-testid='voicing-loop-event']")[0]!.click());
 observe(container,project(snapshots["basic-shell"]!,emptyPreferences,{detailedFallbackStudy:"teacher"}),0,"shape-basic-shell");
});
it("measures Range selection without changing effective fingering",async()=>{
 const {container,snapshots}=await mount("source-midi");const model=project(snapshots["source-midi"]!);
 const cards=()=>container.querySelectorAll<HTMLButtonElement>("[data-testid='voicing-loop-event']");
 const context=async(i:number,shift=false)=>act(async()=>{cards()[i]!.dispatchEvent(new MouseEvent("contextmenu",{bubbles:true,cancelable:true,shiftKey:shift}));});
 for(const [tag,a,b]of [["one-card",1,1],["middle",1,2],["reverse",2,1]]as const){
  await context(a,a===b);if(a!==b)await context(b);
  await act(async()=>cards()[1]!.click());observe(container,model,1,`range-${tag}`);
  expect(container.querySelector("[data-testid='voicing-loop-range-chip']")).not.toBeNull();
  await act(async()=>button(container,"区間解除").click());
 }
 observations.push({tag:"range-result",changed:0,total:3,scope:"same target event=1; actual View contextmenu; notes/ranking baseline kept"});write();
});
it("measures personal override in the actual View and next movement labels",async()=>{
 const snapshots=syntheticSnapshots();const before=project(snapshots["basic-full"]!,emptyPreferences,{lessonStudyCategory:"teacher"});const target=before.frames[1]!.effective.right!;
 const g=generateFingeringCandidates({hand:"right",midiPitches:target.pitches});if(g.status!=="supported")throw Error("fixture");const alternate=g.candidates.find(c=>c.fingers.join()!==target.fingers.join())!;
 savePersonalFingering(emptyPreferences,{hand:"right",pitches:target.pitches,fingers:alternate.fingers});
 const prefs=loadFingeringPreferences();const {container}=await mount("basic-full");const model=project(snapshots["basic-full"]!,prefs,{lessonStudyCategory:"teacher"});
 for(const event of [0,1,2,3]){await act(async()=>container.querySelectorAll<HTMLButtonElement>("[data-testid='voicing-loop-event']")[event]!.click());observe(container,model,event,"personal-active");}
});

it("observes the estimated Next Move fallback when the next hand has no notes",async()=>{
 const snapshots=syntheticSnapshots();const base=snapshots["source-midi"]!;
 snapshots["source-midi"]={...base,events:base.events.map((e,i)=>({...e,voicing:{kind:"source-midi",midiNotes:i===1?[50]:[48,55,59],bassNote:i===1?50:48}}))};
 const model=project(snapshots["source-midi"]!);const {container}=await mount("source-midi",snapshots);
 observe(container,model,0,"one-sided-unavailable-estimated");
 const current=model.frames[0]!.effective.right;
 const moves=model.moves[0]!.moves.filter(m=>m.hand==="right");
 observations.push({tag:"one-sided-result",current,next:model.frames[1]!.effective.right??null,moves,slots:fixedFingerSlots(moves),note:"Estimated labels are not formal effective finger IDs"});write();
});

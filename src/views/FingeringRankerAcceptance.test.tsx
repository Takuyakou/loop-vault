// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { ProgressionVoicingPracticeView } from "./ProgressionVoicingPracticeView";
import { PreviewSoundProvider } from "../components/PreviewSoundProvider";
import { MetronomeProvider } from "../components/MetronomeProvider";
import { FingeringRankerComparisonSettings } from "../voicingPractice/FingeringRankerComparisonSettings";
import { setFingeringRankerMode } from "../voicingPractice/fingeringRankerMode";
import { savePersonalFingering } from "../voicingPractice/fingeringPreferences";
import { generateFingeringCandidates } from "../domain/progressionFingering";
import { rankPracticeHandFingerings } from "../voicingPractice/rankPracticeFingerings";
import { assignPracticeHandsAcrossProgression } from "../voicingPractice/fingeringDisplay";
import { resolveProgressionPracticeVoicings } from "../domain/progressionVoicingPractice";
import { eRankerCostModel } from "../domain/eRankerFingering";
import type { ProgressionVoicingTransportPort } from "../practice/ProgressionVoicingTransport";
import { syntheticSnapshots } from "../../scripts/p11-12/integration";
(globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
let root:Root|undefined;
afterEach(async()=>{await act(async()=>root?.unmount());root=undefined;document.body.replaceChildren();window.localStorage.clear();setFingeringRankerMode("E1-T");});
async function mount(snapshots=syntheticSnapshots()) {
  const container=document.createElement("div");document.body.append(container);root=createRoot(container);
  const audition=vi.fn(async()=>{});
  const runtime:ProgressionVoicingTransportPort={supportsSeek:true,seek:()=>undefined,setLoopBounds:()=>true,start:async()=>{},updatePlan:()=>true,pause:()=>true,resume:async()=>true,restart:async()=>true,stop:()=>{},setBpm:()=>{},setMetronomeEnabled:()=>{},setReferenceSoundEnabled:()=>{},audition};
  await act(async()=>root!.render(<MetronomeProvider><PreviewSoundProvider><FingeringRankerComparisonSettings/><ProgressionVoicingPracticeView snapshots={snapshots} initialSelection="source-midi" monitorMidi={false} transportFactory={()=>runtime} onSelectProgression={()=>true} onEnterText={()=>{}}/></PreviewSoundProvider></MetronomeProvider>));
  return {container,snapshots,audition};
}
const handLabels=(c:HTMLElement)=>[...c.querySelectorAll("[data-testid='voicing-loop-left-hand'],[data-testid='voicing-loop-right-hand']")].map(n=>n.textContent);
it("normal candidate default reaches timing-aware Bass and CURRENT fallback without changing the source",async()=>{
  const snapshots=syntheticSnapshots(),base=snapshots["source-midi"]!;
  snapshots["source-midi"]={...base,lengthBeats:1,spans:base.spans.map((s,i)=>({...s,startBeat:i*0.25,durationBeats:0.25})),events:base.events.map((e,i)=>({...e,startBeat:i*0.25,durationBeats:0.25,voicing:{kind:"source-midi",midiNotes:[48+[0,2,4,5][i]!],bassNote:48+[0,2,4,5][i]!}}))};
  const before=JSON.stringify(snapshots),{container}=await mount(snapshots);
  await act(async()=>container.querySelectorAll<HTMLButtonElement>('[data-testid="voicing-loop-event"]')[1]!.click());
  expect(container.querySelector('[data-testid="voicing-loop-left-hand"]')!.textContent).toContain("L4");
  await act(async()=>setFingeringRankerMode("CURRENT"));
  expect(container.querySelector('[data-testid="voicing-loop-left-hand"]')!.textContent).toContain("L5");
  await act(async()=>setFingeringRankerMode("E1-T"));
  expect(container.querySelector('[data-testid="voicing-loop-left-hand"]')!.textContent).toContain("L4");
  expect(JSON.stringify(snapshots)).toBe(before);
});
it("developer toggle keeps Source notes and hand assignment; Range does not rerank",async()=>{
  const {container,snapshots}=await mount();const selector=container.querySelector<HTMLSelectElement>('[aria-label="運指方式"]')!;
  expect(selector.value).toBe("E1-T");
  const source=JSON.stringify(snapshots);const cards=()=>container.querySelectorAll<HTMLButtonElement>('[data-testid="voicing-loop-event"]');
  const currentNotes=[...container.querySelectorAll<HTMLElement>('[data-midi-note] [data-finger-label]')].map(n=>n.closest('[data-midi-note]')!.getAttribute('data-midi-note'));
  await act(async()=>{selector.value="CURRENT";selector.dispatchEvent(new Event("change",{bubbles:true}));});
  expect(selector.value).toBe("CURRENT");expect(JSON.stringify(snapshots)).toBe(source);
  expect([...container.querySelectorAll<HTMLElement>('[data-midi-note] [data-finger-label]')].map(n=>n.closest('[data-midi-note]')!.getAttribute('data-midi-note'))).toEqual(currentNotes);
  await act(async()=>setFingeringRankerMode("E1-T"));
  const labels=handLabels(container);
  await act(async()=>{cards()[1]!.dispatchEvent(new MouseEvent("contextmenu",{bubbles:true,cancelable:true}));});
  await act(async()=>{cards()[2]!.dispatchEvent(new MouseEvent("contextmenu",{bubbles:true,cancelable:true}));});
  expect(container.querySelector('[data-testid="voicing-loop-range-chip"]')).not.toBeNull();
  await act(async()=>cards()[0]!.click());
  expect(handLabels(container)).toEqual(labels);
  const snapshot=snapshots["source-midi"]!,plan=resolveProgressionPracticeVoicings(snapshot),hands=assignPracticeHandsAcrossProgression("source-midi",plan.events.map(e=>e.status==="SUPPORTED"?e.voicing:undefined));
  const before=JSON.stringify(hands);
  rankPracticeHandFingerings(snapshot,hands,"source-midi","left",undefined,{costModel:eRankerCostModel()});
  expect(JSON.stringify(hands)).toBe(before);
});
it("Saved survives switching rankers and personal persistence; partial movement preserves known IDs",async()=>{
  const snapshots=syntheticSnapshots();const snapshot=snapshots["source-midi"]!,plan=resolveProgressionPracticeVoicings(snapshot),hands=assignPracticeHandsAcrossProgression("source-midi",plan.events.map(e=>e.status==="SUPPORTED"?e.voicing:undefined));
  const pitches=hands[0]!.right;const candidates=generateFingeringCandidates({hand:"right",midiPitches:pitches});if(candidates.status!=="supported")throw Error("fixture");
  const chosen=candidates.candidates[candidates.candidates.length-1]!;
  savePersonalFingering({version:1,entries:[]},{hand:"right",pitches:candidates.pitches,fingers:chosen.fingers});
  const {container}=await mount();const expected=chosen.fingers.map(f=>`R${f}`).join(" · ");
  expect(container.querySelector('[data-testid="voicing-loop-right-hand"]')!.textContent).toContain(expected);
  await act(async()=>setFingeringRankerMode("E1-T"));
  expect(container.querySelector('[data-testid="voicing-loop-right-hand"]')!.textContent).toContain(expected);
  await act(async()=>setFingeringRankerMode("CURRENT"));
  expect(container.querySelector('[data-testid="voicing-loop-right-hand"]')!.textContent).toContain(expected);
  expect(container.querySelectorAll('[data-testid="voicing-loop-movement-certainty"]')).toHaveLength(2);
});

it("shows session-only markers when Saved changes adjacent Auto without reassigning hands",async()=>{
  setFingeringRankerMode("E1-T");const snapshots=syntheticSnapshots(),base=snapshots["source-midi"]!;
  snapshots["source-midi"]={...base,lengthBeats:1,spans:base.spans.map((s,i)=>({...s,startBeat:i*0.25,durationBeats:0.25})),events:base.events.map((e,i)=>({...e,startBeat:i*0.25,durationBeats:0.25,voicing:{kind:"source-midi",midiNotes:[48+[0,2,4,5][i]!],bassNote:48+[0,2,4,5][i]!}}))};
  const {container}=await mount(snapshots);const before=JSON.stringify(snapshots);
  const findButton=(text:string)=>[...document.querySelectorAll<HTMLButtonElement>("button")].find(b=>b.textContent===text)!;
  await act(async()=>findButton("運指を編集").click());
  const editor=document.querySelector('[data-testid="voicing-loop-fingering-editor"]')!;
  const field=editor.querySelector<HTMLSelectElement>("select")!;
  await act(async()=>{field.value=field.value==="1"?"5":"1";field.dispatchEvent(new Event("change",{bubbles:true}));});
  await act(async()=>findButton("保存").click());
  expect(container.querySelectorAll('[data-fingering-adjusted="true"]').length).toBeGreaterThan(0);
  expect(JSON.stringify(snapshots)).toBe(before);
  expect(window.localStorage.getItem("loop-vault:voicing-loop-fingering-preferences:v1")).not.toContain("前後に合わせて変化");
});

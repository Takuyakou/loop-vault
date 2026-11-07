// @vitest-environment jsdom
import {describe,it,expect,vi} from 'vitest';
import {createStore} from 'zustand/vanilla';
import {createLiveNoteState,reduceLiveNoteState} from '../../domain/liveMidi';
import type {LiveMidiStoreState} from '../../liveMidi/liveMidiStore';
import {startDojoPianoInput,hasDojoMidiInput} from './midiInput';
const make=()=>createStore<LiveMidiStoreState>(()=>({active:true,status:'connected',selected:{backendId:'synthetic',name:'synthetic',index:0},notes:createLiveNoteState()} as LiveMidiStoreState));
const fake=()=>({updateNotes:vi.fn(),stop:vi.fn(),dispose:vi.fn()});
function event(store:ReturnType<typeof make>,status:number,note:number,velocity=90,channel=0){store.setState(s=>({notes:reduceLiveNoteState(s.notes,{timestampMs:0,status,channel,data1:note,data2:velocity})}));}
describe('Dojo sampled piano lifetime',()=>{
 it('requires active input and an actual selected device',()=>{const s=make().getState();expect(hasDojoMidiInput(s)).toBe(true);expect(hasDojoMidiInput({...s,active:false})).toBe(false);expect(hasDojoMidiInput({...s,selected:undefined})).toBe(false);});
 it('deduplicates subscription updates, retains pedal and channel voices, then releases',async()=>{const s=make(),m=fake(),ready=vi.fn(),close=startDojoPianoInput(ready,s,async()=>m);await Promise.resolve();expect(ready).toHaveBeenCalledWith('ready');event(s,144,60);expect(m.updateNotes).toHaveBeenLastCalledWith([60]);s.setState({error:'synthetic'});expect(m.updateNotes).toHaveBeenCalledTimes(1);event(s,144,60,90,1);event(s,128,60,0,0);expect(m.updateNotes).toHaveBeenCalledTimes(1);event(s,176,64,127,1);event(s,128,60,0,1);expect(m.updateNotes).toHaveBeenCalledTimes(1);event(s,176,64,0,1);expect(m.updateNotes).toHaveBeenLastCalledWith([]);close();expect(m.dispose).toHaveBeenCalledTimes(1);event(s,144,62);expect(m.updateNotes).toHaveBeenCalledTimes(2);});
 it('immediately stops on disconnect or device replacement',async()=>{const s=make(),m=fake(),close=startDojoPianoInput(vi.fn(),s,async()=>m);await Promise.resolve();event(s,144,60);s.setState({status:'disconnected'});expect(m.stop).toHaveBeenCalled();s.setState({status:'connected',selected:{backendId:'second',name:'second',index:1}});expect(m.updateNotes).toHaveBeenCalledTimes(1);close();});
 it('disposes a late factory after exit without callbacks or a zombie subscription',async()=>{const s=make(),m=fake(),ready=vi.fn();let resolve!:(value:typeof m)=>void;const close=startDojoPianoInput(ready,s,()=>new Promise(r=>resolve=r));close();resolve(m);await Promise.resolve();event(s,144,60);expect(m.dispose).toHaveBeenCalledTimes(1);expect(m.updateNotes).not.toHaveBeenCalled();expect(ready).not.toHaveBeenCalled();});
 it('reports loading failure and suppresses held notes until a fresh release',async()=>{const s=make(),state=vi.fn();startDojoPianoInput(state,s,async()=>{throw Error('synthetic');});await Promise.resolve();expect(state).toHaveBeenCalledWith('error');event(s,144,60);const m=fake(),close=startDojoPianoInput(vi.fn(),s,async()=>m);await Promise.resolve();expect(m.updateNotes).not.toHaveBeenCalled();event(s,128,60,0);event(s,144,62);expect(m.updateNotes).toHaveBeenLastCalledWith([62]);close();});
 it('keeps a warm graph while muting preview input, resumes only fresh note-ons and never duplicates voices',async()=>{
  const s=make(),m=fake(),create=vi.fn(async()=>m),close=startDojoPianoInput(vi.fn(),s,create);await Promise.resolve();event(s,144,60);
  close.setMuted(true);expect(m.stop).toHaveBeenCalledTimes(1);event(s,144,64);expect(m.updateNotes).toHaveBeenCalledTimes(1);
  close.setMuted(false);expect(m.updateNotes).toHaveBeenCalledTimes(1);event(s,144,67);expect(m.updateNotes).toHaveBeenLastCalledWith([67]);
  event(s,128,60,0);event(s,128,64,0);event(s,176,64,127);event(s,128,67,0);expect(m.updateNotes).toHaveBeenLastCalledWith([67]);event(s,176,64,0);expect(m.updateNotes).toHaveBeenLastCalledWith([]);
  close.reset();event(s,144,69);expect(m.updateNotes).toHaveBeenLastCalledWith([69]);expect(create).toHaveBeenCalledOnce();expect(m.dispose).not.toHaveBeenCalled();close();expect(m.dispose).toHaveBeenCalledOnce();
 });
 it('sounds a new note immediately even when an old entry note is still held',async()=>{const s=make();event(s,144,60);const m=fake(),close=startDojoPianoInput(vi.fn(),s,async()=>m);await Promise.resolve();event(s,144,62);expect(m.updateNotes).toHaveBeenLastCalledWith([62]);event(s,128,60,0);expect(m.updateNotes).toHaveBeenCalledTimes(1);event(s,144,60);expect(m.updateNotes).toHaveBeenLastCalledWith([60,62]);close();});
 it('mirrors the notes handed to the fixture monitor (VL-13 A)',async()=>{
 const w=window as typeof window&{__dojoMonitorCount?:number;__dojoMonitorNotes?:number[]};
 w.__dojoMonitorCount=0;w.__dojoMonitorNotes=[];
 const s=make(),m=fake(),close=startDojoPianoInput(vi.fn(),s,async()=>m);await Promise.resolve();
 event(s,144,60);event(s,144,64);expect(w.__dojoMonitorNotes).toEqual([60,64]);
 event(s,128,60,0);expect(w.__dojoMonitorNotes).toEqual([64]);
 event(s,128,64,0);expect(w.__dojoMonitorNotes).toEqual([]);
 close();expect(w.__dojoMonitorNotes).toEqual([]);
 delete w.__dojoMonitorCount;delete w.__dojoMonitorNotes;
});
it.each(['reset','mute'] as const)('reattacks a fresh physical pitch after %s while its old pedal voice remains suppressed',async(kind)=>{
  const s=make(),m=fake(),create=vi.fn(async()=>m),close=startDojoPianoInput(vi.fn(),s,create);await Promise.resolve();event(s,144,60);event(s,176,64,127);event(s,128,60,0);
  if(kind==='mute'){close.setMuted(true);close.setMuted(false);}else close.reset();m.updateNotes.mockClear();s.setState({error:'synthetic'});expect(m.updateNotes).not.toHaveBeenCalled();
  event(s,144,60);expect(m.updateNotes).toHaveBeenCalledOnce();expect(m.updateNotes).toHaveBeenLastCalledWith([60]);event(s,128,60,0);expect(m.updateNotes).toHaveBeenCalledOnce();event(s,176,64,0);expect(m.updateNotes).toHaveBeenLastCalledWith([]);expect(create).toHaveBeenCalledOnce();close();
 });

});

import {describe,it,expect} from 'vitest';
import type {SongIdea,SavedProgressionBlock} from '../types';
import {collectVault,syncVault} from './collect';
import {emptyStore,parseDojoStore,type Task} from './store';
import {advance,skipTask,targetFor} from './session';
import {planToday} from './planner';

const at='2026-10-05T00:00:00.000Z';

/** One chord per bar, alternating C and G, PPQ 4/4. */
function block(bars:number):SavedProgressionBlock{
  const chords=[...Array(bars)].map((_,i)=>({
    eventId:`e${i}`,bar:i+1,beat:1,durationBeats:4,
    chord:{root:i%2===0?0:7,quality:'maj' as const,tensions:[],label:i%2===0?'C':'G'},
    confidence:1,alternatives:[],warnings:[],
  }));
  return {id:'12000000-0000-4000-8000-0000000000a1',summaryText:'C G cycle',memo:'long',tags:[],capturedAt:at,analyzerVersion:'synthetic',bpm:70,timeSignature:'4/4',chords};
}
const idea=(b:SavedProgressionBlock)=>({id:'12000000-0000-4000-8000-0000000000a2',title:'Long',key:'C major',bpm:70,progressionBlocks:[b]} as SongIdea);

/** A store with a single whole-progression task ready to practise. */
function prepared(bars:number){
  const collection=collectVault([idea(block(bars))],at);
  const store=syncVault(emptyStore(new Date(at)),collection,at);
  const p=collection.progressions[0]!;
  const task:Task={kind:'progression',key:p.key,roots:[0],review:false,seconds:120};
  store.today={date:'2026-10-05',tasks:[task],cursor:{taskIndex:0,stage:'see',keyIndex:0,chordIndex:0,answerSeen:false,hints:[],tempoResults:[]},finished:false,added:[],matched:0};
  return {collection,store,p,task};
}

describe('Chord Dojo long progression practice — whole (no split)',()=>{
  for(const bars of [8,12,16,24,32]){
    it(`keeps a ${bars}-bar progression as one unit with every chord in order`,()=>{
      const {collection,p,task,target}=(()=>{const r=prepared(bars);return {...r,target:targetFor(r.store,r.task,r.collection.progressions)};})();
      expect(collection.progressions).toHaveLength(1);
      expect(p.key).not.toContain(':section:');
      expect(p.chords).toHaveLength(bars);
      expect(target.chords).toHaveLength(bars);
      expect(target.chords.map(c=>c.chord.label)).toEqual([...Array(bars)].map((_,i)=>i%2===0?'C':'G'));
      expect(task.seconds).toBeGreaterThan(0);
    });

    it(`finishes a ${bars}-bar progression after one recall lap and never splits it`,()=>{
      const {collection,store}=prepared(bars);
      let next=store;
      next.today!.cursor.stage='recall';
      for(let i=0;i<bars;i++)next=advance(next,{ok:true,self:false,at},collection.progressions);
      expect(next.today!.finished).toBe(true);
      expect(next.progressions[collection.progressions[0]!.key]!.state).toBe('provisional');
      // restarting mid-lap does not finish early
      const mid=store;mid.today!.cursor.stage='recall';
      let partial=mid;
      for(let i=0;i<Math.floor(bars/2);i++)partial=advance(partial,{ok:true,self:false,at},collection.progressions);
      expect(partial.today!.finished).toBe(false);
      expect(partial.progressions[collection.progressions[0]!.key]?.state ?? 'new').toBe('new');
    });
  }

  it('keeps multiple chords inside one bar in order',()=>{
    const b=block(4);
    b.chords[0]!.durationBeats=2;b.chords[1]!.bar=1;b.chords[1]!.beat=3;
    const collection=collectVault([idea(b)],at);
    expect(collection.progressions).toHaveLength(1);
    expect(collection.progressions[0]!.chords).toHaveLength(4);
  });

  it('practises only a chosen bar range without promoting the whole progression',()=>{
    const {collection,store,p}=prepared(16);
    const task:Task={kind:'progression',key:p.key,roots:[0],review:false,seconds:120,range:{startBar:5,endBar:8}};
    store.today={date:'2026-10-05',tasks:[task],cursor:{taskIndex:0,stage:'recall',keyIndex:0,chordIndex:0,answerSeen:false,hints:[],tempoResults:[]},finished:false,added:[],matched:0};
    const t=targetFor(store,task,collection.progressions);
    expect(t.chords.map(c=>c.chord.label)).toEqual(['C','G','C','G']);
    let next=store;
    for(let i=0;i<4;i++)next=advance(next,{ok:true,self:false,at},collection.progressions);
    expect(next.today!.finished).toBe(true);
    expect(next.progressions[p.key]?.state ?? 'new').toBe('new');
  });

  it('does not demote the whole progression when a section drill fails or is skipped',()=>{
    const {collection,store,p}=prepared(16);
    const task:Task={kind:'progression',key:p.key,roots:[0],review:false,seconds:120,range:{startBar:5,endBar:8}};
    const base={...store,today:{date:'2026-10-05',tasks:[task],cursor:{taskIndex:0,stage:'recall' as const,keyIndex:0,chordIndex:0,answerSeen:false,hints:[],tempoResults:[]},finished:false,added:[],matched:0}};
    expect(advance(base,{ok:false,self:false,at},collection.progressions).progressions[p.key]?.state??'new').toBe('new');
    expect(skipTask(base,at).progressions[p.key]?.nextCheckAt).toBeUndefined();
  });

  it('round-trips a long-planned store through the schema',()=>{
    const {collection,store}=prepared(24);
    const planned=planToday(store,collection.progressions,new Date(at));
    store.today=planned;
    expect(parseDojoStore(JSON.stringify(store)).today!.tasks).toEqual(planned.tasks);
  });
});

import {it,expect} from 'vitest';
import {createHash} from 'node:crypto';
import {TARGETS,type MasterTarget,cellKey} from './model';
import data from './canonical-fingering.json' with {type:'json'};
import {master251CanonicalFingerings} from './canonicalFingerings';
import {masterTemplateFingers} from './canonicalTemplates';
import templates from './teaching-templates.json' with {type:'json'};
import {verifyMasterFingerings} from '../../../scripts/master251/verifyFingerings';
import {parseChordLabel} from '../chords';
import {rankPracticeHandFingerings} from '../../voicingPractice/rankPracticeFingerings';
import {E_RANKER_POLICY,eRankerCostModel} from '../eRankerFingering';
it('all48 teaching profiles combine both-hand Form pedagogy with separately preserved generic solver evidence',()=>{
 const before=JSON.stringify(TARGETS),hash=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
 expect(data.status).toBe('FIXED_TEACHING_PROFILE');expect(data.profileVersion).toBe(2);expect(data.context.policy).toEqual(E_RANKER_POLICY);
 expect(data.context).toMatchObject({bpm:80,beatsPerChord:2,restBeats:2,lengthBeats:8,cyclic:true,anchors:[],unresolved:[false,false,false]});
 expect(hash({context:data.context,chosen:data.cells})).toBe(data.fingerprint);
 expect(hash(TARGETS.map(t=>({cell:cellKey(t.form,t.key),chords:t.chords.map(c=>({notes:c.notes,referenceHands:c.referenceHands}))})))).toBe(data.notesSha256);
 expect(data.cells).toHaveLength(48);
 for(const t of TARGETS){
  const plans=master251CanonicalFingerings(t);expect(master251CanonicalFingerings(t)).toBe(plans);
  const hands=t.chords.map(c=>({left:c.referenceHands.lh,right:c.referenceHands.rh}));
  const snapshot={version:1 as const,fingerprint:'canonical',source:{kind:'vault' as const,reference:{ideaId:'synthetic',blockId:'synthetic'}},selection:'custom' as const,bpm:80,meter:{numerator:4 as const,denominator:4 as const},lengthBeats:8,events:t.chords.map((c,i)=>({id:String(i),startBeat:i*2,durationBeats:2,chord:parseChordLabel(c.symbol)!,voicing:{kind:'custom' as const,midiNotes:c.notes}})),spans:t.chords.map((_,i)=>({kind:'chord' as const,eventIndex:i,startBeat:i*2,durationBeats:2}))};
  for(const hand of ['left','right'] as const){const ranked=rankPracticeHandFingerings(snapshot,hands,'custom',hand,undefined,{costModel:eRankerCostModel()},data.context.unresolved,80);expect(ranked).toHaveLength(3);ranked.forEach((r,i)=>{if(r.status!=='supported')throw Error('Unsupported canonical hand');expect(plans[i].hands[hand]).toEqual(r.pitches);r.pitches.forEach((n,j)=>expect(plans[i].labels.get(n)).toContain((hand==='left'?'L':'R')+masterTemplateFingers(t.form,t.key,hand==='left'?'lh':'rh',i)[j]));});}
 }
 expect(JSON.stringify(TARGETS)).toBe(before);
});
it('a changed target cannot silently reuse an incompatible teaching profile',()=>{
 const t=TARGETS[0];const changed:MasterTarget={...t,chords:[{...t.chords[0],notes:[...t.chords[0].notes,90]},t.chords[1],t.chords[2]]};
 expect(()=>master251CanonicalFingerings(changed)).toThrow('Master fingering target mismatch');
 const changedHands:MasterTarget={...t,chords:[{...t.chords[0],referenceHands:{lh:[],rh:t.chords[0].notes}},t.chords[1],t.chords[2]]};
 expect(()=>master251CanonicalFingerings(changedHands)).toThrow('Master fingering target mismatch');
});

it('adopts one both-hand pattern per Form across all12 keys with numeric key IDs and no overrides',()=>{
 const expected={A:{lh:[[5],[1],[5]],rh:[[1,2,3,5],[1,2,3,5],[1,2,3,5]]},B:{lh:[[5,1],[5,2],[5,1]],rh:[[1,2,5],[1,2,5],[1,2,5]]},C:{lh:[[1],[5],[1]],rh:[[1,2,3,5],[1,2,3,5],[1,2,3,5]]},D:{lh:[[5,2],[5,1],[5,2]],rh:[[1,2,5],[1,2,5],[1,2,5]]}};
 expect(templates.defaultTemplates).toEqual(expected);expect(templates.perKeyOverrides).toEqual([]);
 expect(templates.overrideApproval).toBe('human-required');
 for(const t of TARGETS)for(let i=0;i<3;i++)for(const hand of ['lh','rh'] as const){
  const fingers=masterTemplateFingers(t.form,t.key,hand,i);
  expect(fingers).toEqual(expected[t.form][hand][i]);expect(fingers.length).toBe(t.chords[i].referenceHands[hand].length);
  expect(new Set(fingers).size).toBe(fingers.length);expect(fingers.every(f=>f>=1&&f<=5&&Number.isInteger(f))).toBe(true);
  expect(fingers.every((f,j)=>j===0||(hand==='lh'?fingers[j-1]>f:fingers[j-1]<f))).toBe(true);
 }
 expect(()=>masterTemplateFingers('A',12,'lh',0)).toThrow('pitch class');
 expect(()=>masterTemplateFingers('A',-1,'rh',0)).toThrow('pitch class');
 expect(()=>masterTemplateFingers('A',0,'lh',3)).toThrow('Invalid');
});
it('formal regeneration verifies both-hand templates, canonical hash and historical generic fingerprint',()=>{
 const result=verifyMasterFingerings();expect(result.cells).toEqual(data.cells);
 expect(result.genericFingerprint).toBe('a1538e67764619d5b3f7d8244636ad328fc1b2f9c1c20950c73a6db4c0a81883');
 expect(result.notesSha256).toBe('0a8244d5186f465e129dacfbeddc85b51979f6da84e1d11ea4fbcdf638ad78ed');
});

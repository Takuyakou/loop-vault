import {it,expect} from 'vitest';
import {dojoFingerings,showDojoFingers,showMasterFingers} from './fingering';
import {TARGETS} from '../../domain/master251/model';
import {parseChordLabel} from '../../domain/chords';
import {eRankerCostModel} from '../../domain/eRankerFingering';
import {p21ERankerCostModel} from '../../domain/p21SingleNoteFingering';
it('all144 exact canonical voicings use production ranker with correct register and source hands',()=>{for(const t of TARGETS){const original=JSON.stringify(t),chords=t.chords.map(c=>({chord:parseChordLabel(c.symbol)!,notes:c.notes,beats:2,referenceHands:c.referenceHands}));expect(chords.every(c=>c.chord)).toBe(true);const result=dojoFingerings(chords,{costModel:eRankerCostModel()});expect(result).toHaveLength(3);result.forEach((r,i)=>{expect([...r.labels.keys()].sort((a,b)=>a-b)).toEqual(t.chords[i].notes);for(const n of t.chords[i].referenceHands.lh)expect(r.labels.get(n)).toMatch(/^L[1-5]$/);for(const n of t.chords[i].referenceHands.rh)expect(r.labels.get(n)).toMatch(/^R[1-5]$/);});expect(JSON.stringify(t)).toBe(original);}});
it('normal answer adapts fixed notes without changing them and unavailable assignments never invent labels',()=>{const notes=[48,60,64,67],chord=parseChordLabel('C')!;const r=dojoFingerings([{chord,notes,beats:4}],{costModel:eRankerCostModel()})[0];expect([...r.labels.keys()].sort((a,b)=>a-b)).toEqual(notes);expect(notes).toEqual([48,60,64,67]);expect(dojoFingerings([])).toEqual([]);});
it('answer/Hint visibility matrix resets on Recall Tempo composition Ready and paused states',()=>{expect(showDojoFingers('see',true,false)).toBe(true);expect(showDojoFingers('memorize',true,false)).toBe(true);expect(showDojoFingers('recall',false,false)).toBe(false);expect(showDojoFingers('recall',true,false)).toBe(true);expect(showDojoFingers('tempo',true,false)).toBe(false);expect(showDojoFingers('composition',true,true)).toBe(false);expect(showMasterFingers(true,true,0)).toBe(true);expect(showMasterFingers(true,false,0)).toBe(false);expect(showMasterFingers(true,false,1)).toBe(true);expect(showMasterFingers(false,true,4)).toBe(false);});

it('P21: Chord Dojo one-note chords keep L5 L4 L3 L2 across the line',()=>{
 const chords=[['C',36],['D',38],['E',40],['F',41]].map(([label,note])=>({chord:parseChordLabel(String(label))!,notes:[Number(note)],beats:1}));
 const result=dojoFingerings(chords,{costModel:p21ERankerCostModel()});
 expect(result.map((entry)=>[...entry.labels.values()].join('/'))).toEqual(['L5','L4','L3','L2']);
});
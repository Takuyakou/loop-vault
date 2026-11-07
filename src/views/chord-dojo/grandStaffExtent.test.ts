import {describe,expect,it} from 'vitest';
import {JAZZ_PROGRESSIONS_ITEMS,jazzCardSnapshot,transposeJazzProgression} from '../../domain/chordDojo/jazzProgressions';
import {grandStaffExtent} from './GrandStaff';
import {heldStaffExtent} from './HeldCardParts';

const TONICS=Array.from({length:12},(_,t)=>t);
describe('the extent of the staff for a whole item',()=>{
 it('holds every card of every version and key (nothing of any card is outside it), and is the same for each of them',()=>{
  for(const item of JAZZ_PROGRESSIONS_ITEMS){
   const snaps=item.progressions.flatMap(id=>TONICS.flatMap(t=>{const p=transposeJazzProgression(id,t);return p.cards.map((_,i)=>jazzCardSnapshot(p,i));}));
   const all=heldStaffExtent(snaps,true);
   for(const s of snaps){const own=heldStaffExtent([s],true);expect(all.minY,item.no+s.targetId).toBeLessThanOrEqual(own.minY);expect(all.maxY).toBeGreaterThanOrEqual(own.maxY);}
   // an item is drawn over a range wider than one card needs (the low and the high ones)
   expect(all.maxY-all.minY).toBeGreaterThanOrEqual(heldStaffExtent([snaps[0]!],true).maxY-heldStaffExtent([snaps[0]!],true).minY);
  }
 });
 it('one card alone is the extent of its own notes, as the staff has always drawn it (the default is unchanged)',()=>{
  const p=transposeJazzProgression('jazz-progressions-001',0),s=jazzCardSnapshot(p,0);
  const own=grandStaffExtent([s]);
  expect(own.minY).toBeLessThanOrEqual(38);expect(own.maxY).toBeGreaterThanOrEqual(180);
  // a lower card widens it
  const low=jazzCardSnapshot(transposeJazzProgression('jazz-progressions-001',6),0);
  expect(grandStaffExtent([s,low]).maxY).toBeGreaterThanOrEqual(own.maxY);
 });
});

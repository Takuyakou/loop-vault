import {expect,type Page} from '@playwright/test';

/**
 * What the staff and the keyboard show for one chord of a Master target: the staff notes (in document order), and for every
 * note of each hand exactly one key that is visible, guided for that hand and carrying exactly one finger label of that hand.
 * The readings come from one page evaluation (a per-key locator check is about 20 round trips per chord, the sweeps over all
 * 144 targets made 8,000 of them); the checks are the ones a locator check makes: one match, a non-empty box and no
 * `visibility:hidden` (what `toBeVisible` means), the `data-guide-hand` value, the label text.
 */
export async function expectGuideKeys(page:Page,staffNotes:readonly number[],groups:readonly (readonly ['left'|'right',readonly number[]])[]){
  const read=await page.evaluate(groups=>({
    staff:[...document.querySelectorAll('[data-score-midi]')].map(e=>Number(e.getAttribute('data-score-midi'))),
    keys:groups.flatMap(([hand,notes])=>notes.map(note=>{
      const found=document.querySelectorAll(`[data-midi-note="${note}"]`),key=found[0],box=key?.getBoundingClientRect(),labels=key?.querySelectorAll('[data-finger-label]');
      return {hand,note,matches:found.length,visible:!!box&&box.width>0&&box.height>0&&getComputedStyle(key!).visibility!=='hidden',guideHand:key?.getAttribute('data-guide-hand')??null,labels:labels?.length??0,label:labels?.[0]?.textContent??''};
    })),
  }),groups.map(([hand,notes])=>[hand,[...notes]] as const));
  expect(read.staff).toEqual([...staffNotes]);
  for(const key of read.keys){
    const where=`${key.hand} hand key ${key.note}`;
    expect(key.matches,where).toBe(1);
    expect(key.visible,`${where} is visible`).toBe(true);
    expect(key.guideHand,where).toBe(key.hand);
    expect(key.labels,`${where} has one finger label`).toBe(1);
    expect(key.label,where).toContain(key.hand==='left'?'左':'右');
  }
}

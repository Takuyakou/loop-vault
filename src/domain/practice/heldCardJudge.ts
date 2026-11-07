/**
 * Judges one card whose answer is real notes. It is the "count the keys that are still held" kind of judging
 * (HeldChordSettler counts carried-over notes the same way) without an exact set and without a settle time:
 * the card passes when
 *  1. every expected note is held now, and
 *  2. every `struck` note was pressed after the card began (a note carried over from the previous card is not enough).
 * Notes outside the expected set are ignored. Only physical keys count; the sustain pedal never does.
 * It reads raw MIDI events, so a note-on that arrives twice without a note-off still needs only one note-off.
 */
export interface HeldCardVerdict{ok:boolean;/** expected notes that are not held. */missing:number[];/** struck notes not pressed since the card began. */notStruck:number[];}
export class HeldCardJudge{
 private readonly held=new Map<string,number>();
 private fresh=new Set<number>();
 noteOn(note:number,channel=0){this.held.set(`${channel}:${note}`,note);this.fresh.add(note);}
 noteOff(note:number,channel=0){this.held.delete(`${channel}:${note}`);}
 /** One raw MIDI event: note-on / note-off (a note-on with velocity 0 is a note-off). Controllers, the pedal included, are ignored. */
 event(status:number,channel:number,data1:number,data2:number){
  const kind=status&0xf0;
  if(kind===0x90&&data2>0)this.noteOn(data1,channel);
  else if(kind===0x80||kind===0x90)this.noteOff(data1,channel);
 }
 /** The next card begins: what was pressed before it no longer counts as "newly pressed". Held keys stay held. */
 startCard(){this.fresh=new Set();}
 /** The input went away (disconnect) or the screen was left: nothing is held any more. */
 reset(){this.held.clear();this.fresh=new Set();}
 heldNotes(){return [...new Set(this.held.values())].sort((a,b)=>a-b);}
 judge(expected:readonly number[],struck:readonly number[]):HeldCardVerdict{
  const held=new Set(this.held.values());
  const missing=expected.filter(n=>!held.has(n)),notStruck=struck.filter(n=>!this.fresh.has(n));
  return {ok:missing.length===0&&notStruck.length===0,missing,notStruck};
 }
}

/** Settles the CURRENT physical key set, including notes carried from a prior chord.
 * Sustain-only voices and MIDI channels are resolved by the shared live-note reducer.
 */
export class HeldChordSettler {
 private notes:number[]=[];private deadline?:number;private startedAt?:number;private firstExactOn?:number;private done=false;
 constructor(private readonly target:readonly number[],private readonly settleMs:number,private readonly partialTimeoutMs=1200){}
 observe(held:readonly number[],at:number,noteOn=false){if(this.done)return;const notes=[...new Set(held)].sort((a,b)=>a-b),changed=notes.join()!==this.notes.join();this.notes=notes;if(!changed)return;
  // A changed non-exact set invalidates the previous completion. Only the NoteOn
  // that forms an exact set may timestamp ii; NoteOff cleanup is not an attack.
  this.firstExactOn=noteOn&&this.exact()?at:undefined;
  this.startedAt??=at;if(!notes.length){this.deadline=undefined;this.startedAt=undefined;return;}
  this.deadline=notes.length>=this.target.length?at+this.settleMs:undefined;
 }
 private exact(){return this.notes.join()===this.target.join();}
 poll(at:number){if(this.done||this.startedAt===undefined)return;const due=this.deadline??this.startedAt+this.partialTimeoutMs;if(at<due)return;this.done=true;return {notes:[...this.notes],exact:this.exact(),completedOnMs:this.firstExactOn,settledAt:due};}
}

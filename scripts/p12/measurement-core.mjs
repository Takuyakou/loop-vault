// Browser-only measurement math. No device IDs, clock epochs or user paths are exported.
export const pcs=notes=>[...new Set(notes.map(n=>((n%12)+12)%12))].sort((a,b)=>a-b);
export function percentile(values,p){if(!values.length)return null;const s=[...values].sort((a,b)=>a-b),x=(s.length-1)*p,a=Math.floor(x);return s[a]+(s[Math.ceil(x)]-s[a])*(x-a);}
export function trialMetrics(onsets,promptAt){if(!onsets.length)return null;const ts=onsets.map(e=>e.at);return {spreadMs:Math.max(...ts)-Math.min(...ts),recallSec:(Math.max(...ts)-promptAt)/1000,noteOns:onsets.map(e=>({note:e.note,offsetMs:e.at-promptAt}))};}
export function summary(rows){const accepted=rows.filter(r=>r.ok&&!r.answerSeen);const metric=k=>({median:percentile(accepted.map(r=>r[k]),.5),p90:percentile(accepted.map(r=>r[k]),.9),max:accepted.length?Math.max(...accepted.map(r=>r[k])):null});return {completed:rows.length,valid:accepted.length,spreadMs:metric('spreadMs'),recallSec:metric('recallSec')};}

// One uninterrupted attack; rolling separated notes and reattacks are invalid.
export class ChordTrial {
 constructor(expected){this.expected=expected;this.held=new Map();this.onsets=[];this.invalid=false;this.completed=false;this.releasing=false;}
 event(channel,note,velocity,on,at){
  const key=channel+':'+note;
  if(on&&velocity>0){
   if(this.releasing||this.held.has(key)||this.onsets.some(e=>e.note===note))this.invalid=true;
   this.held.set(key,note);this.onsets.push({note,at});
   const current=pcs([...this.held.values()]);
   if(current.some(n=>!this.expected.includes(n)))this.invalid=true;
   if(JSON.stringify(current)===JSON.stringify(this.expected))this.completed=true;
  }else{
   if(this.held.has(key)){if(!this.completed)this.invalid=true;this.releasing=true;this.held.delete(key);}
  }
 }
 get ok(){return this.completed&&!this.invalid;}
}

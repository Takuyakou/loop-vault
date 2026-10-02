import { largeCases, namedCases, type Case } from "../p11-12/fixtures";

export function commonToneDevCases() {
  return [...largeCases().filter(c => Number(c.id.match(/-(\d+)-ioi/)?.[1]) < 6), ...namedCases()];
}
export function commonToneTimeProbes() {
  const named = namedCases(); const large = largeCases();
  return ["left","right"].flatMap(hand => [
    ...["common1","common2"].map(name => named.find(c => c.id === `${hand}-${name}`)!),
    ...["cluster","open","inversion"].map(shape => large.find(c => c.id === `${hand}-2-${shape}-0-ioi1`)!),
  ]);
}
export function commonToneRepresentatives(): Case[] {
  return [
    {id:"slow-bass",hand:"left",notes:[[48],[50],[52],[53]],bpm:120,ioiBeats:4,shape:"slow"},
    {id:"fast-bass",hand:"left",notes:[[48],[50],[52],[53]],bpm:120,ioiBeats:0.25,shape:"fast"},
    ...["chromatic","octave","upper-single-to-3","3-to-upper-single","repeat"].map(id=>namedCases().find(c=>c.id===`left-${id}`)!),
    {id:"inversion",hand:"right",notes:[[60,64,67],[64,67,72],[67,72,76]],bpm:120,ioiBeats:1,shape:"inversion",chords:Array.from({length:3},()=>({root:0,quality:"maj",tensions:[],label:"C"}))},
    {id:"loop-boundary",hand:"left",notes:[[43],[50],[48]],bpm:120,ioiBeats:1,shape:"wrap"},
  ];
}

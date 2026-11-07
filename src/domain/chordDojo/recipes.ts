import data from './recipeData.json';
import { chordPitchClasses } from '../chordVoicing';
import type { ChordQuality, ChordSymbol, Tension } from '../types';
export const QUALITIES = ['maj','min','maj7','maj9','sixNine','min7','min9','min6','dom7','dom9','dom13','dom7sus4','min7b5','dim7'] as const;
export type Quality = typeof QUALITIES[number];
/**
 * P12.4-02: chord kinds the standard progressions may use that are NOT part of the shape curriculum.
 * They are deliberately outside `QUALITIES` (that list decides what "型を覚える" asks), so adding them
 * changes nothing that is asked today.
 */
export const EXTRA_QUALITIES = ['aug','six','minMaj7'] as const;
export type BuiltinQuality = Quality | typeof EXTRA_QUALITIES[number];
export type Preset = 'basic' | 'skeleton' | 'upper-triad' | 'spread';
export type Bass = 'self' | 'external';
export const PRESETS: Record<Preset,string> = {basic:'基本',skeleton:'骨組み','upper-triad':'上に三和音',spread:'広げる'};
export const NAMES = ['C','D♭','D','E♭','E','F','F#','G','A♭','A','B♭','B'];
export const SUFFIX:Record<BuiltinQuality,string>={maj:'',min:'m',maj7:'maj7',maj9:'maj9',sixNine:'6/9',min7:'m7',min9:'m9',min6:'m6',dom7:'7',dom9:'9',dom13:'13',dom7sus4:'7sus4',min7b5:'m7♭5',dim7:'dim7',aug:'+',six:'6',minMaj7:'m(maj7)'};
export const pc=(n:number)=>((n%12)+12)%12;
const TENSION_LABEL=(t:Tension)=>t.replace('b','♭').replace('#','♯');
/** A chord symbol. `tensions` and `bass` (a pitch class) are for the standard progressions that need them (7♭9, slash chords). */
export function symbol(root:number,quality:ChordQuality,tensions:readonly Tension[]=[],bass?:number):ChordSymbol {
 const slash=bass!==undefined&&pc(bass)!==pc(root);
 return {root:pc(root),quality,tensions:[...tensions],...(slash?{bass:pc(bass)}:{}),label:NAMES[pc(root)]+(SUFFIX[quality as BuiltinQuality]??quality)+(tensions.length?`(${tensions.map(TENSION_LABEL).join(',')})`:'')+(slash?`/${NAMES[pc(bass)]}`:'')};
}
export function recipeNotes(root:number,quality:Quality,preset:Preset='basic',bass:Bass='self'):number[]|undefined{
 const r=data.find(r=>r.quality===quality&&r.preset===preset&&r.bass===bass);
 return r?.notes.length ? r.notes.map(n=>n+pc(root)) : undefined;
}
export function shapeKey(q:Quality,p:Preset='basic',b:Bass='self'):string{
 return `preset:${p==='spread'?'skeleton':p}|${p==='spread'?'open':'close'}|${b}|any:quality:${q}`;
}
export function composition(root:number,q:Quality){return chordPitchClasses(symbol(root,q));}
export const CURRICULUM:readonly {quality:Quality;preset:Preset;bass:Bass}[] = [
 ...(['maj','min','min7','dom7','maj7'] as Quality[]).map(quality=>({quality,preset:'basic' as const,bass:'self' as const})),
 ...(['min7','dom7','maj7'] as Quality[]).map(quality=>({quality,preset:'skeleton' as const,bass:'self' as const})),
 ...(['min9','dom9','maj9','sixNine','min6','dom13','dom7sus4','min7b5','dim7'] as Quality[]).map(quality=>({quality,preset:'basic' as const,bass:'self' as const})),
 ...(['upper-triad','spread'] as Preset[]).flatMap(preset=>QUALITIES.filter(q=>recipeNotes(0,q,preset)).map(quality=>({quality,preset,bass:'self' as const}))),
 ...(['basic','skeleton','upper-triad','spread'] as Preset[]).flatMap(preset=>QUALITIES.filter(q=>recipeNotes(0,q,preset,'external')).map(quality=>({quality,preset,bass:'external' as const}))),
];

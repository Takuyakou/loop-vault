import type {BuiltinProgression,PracticeKeys} from './builtins';

/**
 * P12.4-03: a long progression is not for the random-key endless practice (one lap is too long to repeat in
 * twelve keys). It is practised by choosing a key and playing it through once.
 * P12.5-01: Chord Dojo plays one chord at a time, so the length of a lap is its number of chords: 9 or more is long.
 */
export const LONG_CHORDS=9;
/** The keys of a `jazz6` progression: F B♭ E♭ A♭ C G, the circle of fourths the common jazz keys sit on. */
export const JAZZ6_KEYS:readonly number[]=[5,10,3,8,0,7];
export const ALL_KEYS:readonly number[]=[0,1,2,3,4,5,6,7,8,9,10,11];

/** Bars of 4/4 (every standard progression is 4/4). */
export const barsOf=(b:Pick<BuiltinProgression,'chords'>)=>b.chords.reduce((n,c)=>n+c.beats,0)/4;
export const isLong=(b:Pick<BuiltinProgression,'chords'>)=>b.chords.length>=LONG_CHORDS;
export const candidateKeys=(practiceKeys:PracticeKeys):readonly number[]=>practiceKeys==='jazz6'?JAZZ6_KEYS:ALL_KEYS;
/** A progression chooses its own key (instead of the list's single key) when it is long or limited to six keys. */
export const choosesOwnKey=(b:Pick<BuiltinProgression,'chords'|'practiceKeys'>)=>isLong(b)||b.practiceKeys==='jazz6';

/**
 * 「おまかせ」: a key that has no record yet. When every key has one, any key. The key just played is avoided
 * whenever there is another choice. `random` is a number in [0,1).
 */
export function pickKey(candidates:readonly number[],recorded:ReadonlySet<number>,previous:number|undefined,random:number):number{
 const fresh=candidates.filter(k=>!recorded.has(k));
 const pool=fresh.length?fresh:candidates;
 const others=pool.filter(k=>k!==previous);
 const from=others.length?others:pool;
 return from[Math.min(from.length-1,Math.floor(random*from.length))]!;
}

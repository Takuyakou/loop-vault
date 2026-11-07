import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
/** P12.3: the reference chords (25 progressions × 12 keys). The unit test pins `buildBuiltin` to this file, so E2E can read it directly. */
interface ReferenceKey {key:number;keyLabel:string;chords:{label:string;notes:number[];beats:number}[]}
interface Reference {title:string|null;name:string;fullDegrees:string[];keys:ReferenceKey[]}
const reference=JSON.parse(readFileSync(fileURLToPath(new URL('../../docs/phase12.3/contracts/P12.3-builtins-expected.json',import.meta.url)),'utf-8')) as {builtins:Record<string,Reference>};
export const builtinChords=(id:string,key:number)=>reference.builtins[id].keys[key].chords;
export const builtinDegrees=(id:string)=>reference.builtins[id].fullDegrees;
export const builtinKeyLabel=(id:string,key:number)=>reference.builtins[id].keys[key].keyLabel;

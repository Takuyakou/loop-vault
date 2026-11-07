import {buildSync} from 'esbuild';
import {mkdtempSync,unlinkSync,rmdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
import {createRequire} from 'node:module';
import type {DojoStore} from '../../src/domain/chordDojo/store';
type HomeState='theme'|'many'|'resume'|'finished'|'empty';
// Bundle the actual planner for Node's test worker, including its JSON modules.
// Product imports and dependencies stay unchanged; the temporary bundle is removed.
const directory=mkdtempSync(join(tmpdir(),'p12-dojo-home-')),bundle=join(directory,'fixture.cjs');
let make:(state:HomeState)=>DojoStore;
try{buildSync({entryPoints:[resolve('e2e/helpers/p12DojoHomeFixtures.ts')],bundle:true,platform:'node',format:'cjs',outfile:bundle});make=createRequire(import.meta.url)(bundle).homeFixture;}
finally{unlinkSync(bundle);rmdirSync(directory);}
export const homeFixture=(state:HomeState)=>make(state);

import {isTauri} from '@tauri-apps/api/core';
import {BrowserPracticeStorage,TauriPracticeStorage} from '../../features/bass-practice/infra/repository/practiceStorage';
import type {PracticeStorage} from '../../features/bass-practice/infra/repository/practiceRepository';
import {JAZZ_PROGRESSIONS_IDS} from './jazzProgressions';
import {LapRecordsRepository,createLapStore,emptyLapRecords,lapRecordsSchema,type LapRecords} from './lapRecords';
/**
 * Laps (完奏) of Jazz Progressions: a record file of their own (namespace `jazz-progressions`), progression id × tonic.
 * Nothing is written to the Dojo record or to the Original Practice record, and an older app never opens this file.
 */
const JAZZ_APP='loopvault-jazz-progressions';
export const jazzRecordsSchema=lapRecordsSchema(JAZZ_APP,JAZZ_PROGRESSIONS_IDS);
export type JazzRecords=LapRecords;
export const emptyJazzRecords=():JazzRecords=>emptyLapRecords(JAZZ_APP);
export class JazzRecordsRepository extends LapRecordsRepository{constructor(storage:PracticeStorage){super(storage,jazzRecordsSchema,JAZZ_APP);}}
let repository:JazzRecordsRepository|undefined;
export const runtimeJazzRepository=()=>repository??=new JazzRecordsRepository(isTauri()?new TauriPracticeStorage(undefined,'jazz-progressions'):new BrowserPracticeStorage(window.localStorage,'jazz-progressions'));
export const jazzLapStore=createLapStore(runtimeJazzRepository,emptyJazzRecords);

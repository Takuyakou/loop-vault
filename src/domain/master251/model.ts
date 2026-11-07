import {z} from 'zod';
import data from './canonical.json' with {type:'json'};
export const FORMS=['A','B','C','D'] as const;
export const KEY_NAMES=['C','Db','D','Eb','E','F','F#','G','Ab','A','Bb','B'] as const;
export type FormId=typeof FORMS[number];
export type PitchClass=0|1|2|3|4|5|6|7|8|9|10|11;
export type CellKey=`${FormId}:${PitchClass}`;
export interface ChordTarget {degree:'ii'|'V'|'I';symbol:string;notes:readonly number[];referenceHands:{lh:readonly number[];rh:readonly number[]};}
export type MasterRange='original'|'octave-down';
export interface MasterTarget {octaveOffset?:-12;form:FormId;key:PitchClass;bpm:80;beatsPerChord:2;restAfterProgressionBeats:2;chords:readonly [ChordTarget,ChordTarget,ChordTarget];}
export const TARGETS=data as unknown as readonly MasterTarget[];
export const cellKey=(form:FormId,key:number):CellKey=>`${form}:${((key%12)+12)%12 as PitchClass}`;
export const targetForCell=(id:CellKey)=>TARGETS.find(t=>cellKey(t.form,t.key)===id)!;
const pc=z.number().int().min(0).max(11),form=z.enum(FORMS),at=z.string().datetime();
const recent=z.object({at,ok:z.boolean(),recallSec:z.number().finite().nonnegative().optional(),bpm:z.number().min(40).max(80).optional(),usedHint:z.boolean()}).strict();
export const cellSchema=z.object({form,key:pc,status:z.enum(['new','learning','passed','master']),reviewDue:z.boolean().optional(),reviewFailedAt:at.optional(),qualifiedAt:at.optional(),attempts:z.number().int().nonnegative(),successes:z.number().int().nonnegative(),lastAt:at.optional(),lastSuccessAt:at.optional(),learnedAt:at.optional(),nextReviewAt:at.optional(),recent:z.array(recent).max(20),bestRecallSec:z.number().finite().nonnegative().optional(),currentBpm:z.number().min(40).max(80).optional()}).strict();
export const practiceSchema=z.object({version:z.literal(1),kind:z.enum(['learning','review','mixed']),form,scope:z.enum(['all',...FORMS]).optional(),learningStages:z.object({A:z.enum(['study','recall']),B:z.enum(['study','recall']),C:z.enum(['study','recall']),D:z.enum(['study','recall'])}).strict().optional(),learningPositions:z.object({A:z.number().int().min(0).max(12),B:z.number().int().min(0).max(12),C:z.number().int().min(0).max(12),D:z.number().int().min(0).max(12)}).strict()}).strict();
export type MasterPractice=z.infer<typeof practiceSchema>;
const session=z.object({cell:z.string().regex(/^[ABCD]:(?:[0-9]|1[01])$/),seed:z.number().int().nonnegative(),paused:z.boolean(),mode:z.enum(['learn','recall','tempo']),bpm:z.number().min(40).max(80).optional()}).strict();
export const progressSchema=z.object({version:z.literal(1),practice:practiceSchema.optional(),cells:z.record(cellSchema).refine(c=>Object.entries(c).every(([id,c])=>id===cellKey(c.form,c.key))),lastSessionAt:at.optional(),session:session.optional()}).strict();
export type MasterProgress=z.infer<typeof progressSchema>;
export const masterSchema=progressSchema.extend({selectedRange:z.enum(['original','octave-down']).optional(),octaveDown:progressSchema.optional()}).strict();
export type MasterCell=z.infer<typeof cellSchema>;
export type MasterStore=z.infer<typeof masterSchema>;
export type Attempt=z.infer<typeof recent>;
export function emptyMaster():MasterStore{return {version:1,cells:Object.fromEntries(TARGETS.map(t=>[cellKey(t.form,t.key),{form:t.form,key:t.key,status:'new',attempts:0,successes:0,recent:[]}]))};}
export function withCells(store?:MasterStore):MasterStore {const initial=emptyMaster();return store?{...store,cells:{...initial.cells,...store.cells}}:initial;}

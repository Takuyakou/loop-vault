import { isTauri, invoke } from "@tauri-apps/api/core";
import { BrowserPracticeStorage, TauriPracticeStorage } from "../infra/repository/practiceStorage";
import type { PracticeStorage } from "../infra/repository/practiceRepository";
import { emptyMidiBassLibrary, midiBassLibrarySchema, type MidiBassLibrary } from "./model";
export class MidiBassLibraryRepository {
  private revision?:number; private token?:string;  private queue=Promise.resolve();
  recoveryNotice?:string;
  constructor(private readonly storage:PracticeStorage) {}
  async load():Promise<MidiBassLibrary> {
    const raw=await this.storage.readCommitted();
    if(!raw){ if((await this.storage.listRecoveryArtifacts()).length)throw new Error("隔離されたライブラリがあります。自動的に空のライブラリへ置き換えません。"); this.revision=undefined;this.token=undefined;return emptyMidiBassLibrary(); }
    let parsed:unknown;try{parsed=JSON.parse(raw.contents);}catch{parsed=undefined;}
    if(parsed&&typeof parsed==="object"&&(("version" in parsed&&Number(parsed.version)>1)||("fileVersion" in parsed&&Number(parsed.fileVersion)>1)))throw new Error("新しい版のライブラリです。この版では変更しません。");
    const valid=midiBassLibrarySchema.safeParse(parsed);
    if(valid.success){this.revision=raw.revision;this.token=raw.token;return valid.data;}
    await this.storage.quarantineCommitted(timestamp(),raw.token);
    for(const backup of await this.storage.listBackups()) {
      const document=await this.storage.readBackup(backup.name);let value:unknown;try{value=JSON.parse(document.contents);}catch{continue;}
      const restored=midiBassLibrarySchema.safeParse(value);if(!restored.success)continue;
      this.recoveryNotice="ライブラリを別に保管し、検証済みバックアップを復元しました。";
      this.revision=undefined;this.token=undefined;return this.save({ ...restored.data, revision:1 });
    }
    throw new Error("ライブラリを検証できなかったため別に保管しました。検証済みバックアップがありません。");
  }
  save(file:MidiBassLibrary):Promise<MidiBassLibrary> {
    const operation=this.queue.then(async()=>{const next=midiBassLibrarySchema.parse({...file,revision:(this.revision??0)+1});const contents=JSON.stringify(next,null,2)+"\n";if(new TextEncoder().encode(contents).length>16*1024*1024)throw new Error("ライブラリの保存上限16MBを超えました。");await this.storage.commit(contents,timestamp(),this.revision,this.token);const stored=await this.storage.readCommitted();this.revision=next.revision;this.token=stored?.token;window.dispatchEvent(new Event("bass-midi-library-change"));return next;});this.queue=operation.then(()=>undefined,()=>undefined);return operation;
  }
}
function timestamp(){return new Date().toISOString().replace(/[-:]/g,"").replace("T","-").slice(0,15);}
export function createMidiBassStorage() { return isTauri()?new TauriPracticeStorage(invoke,"bass-midi-library"):new BrowserPracticeStorage(window.localStorage,"bass-midi-library"); }
export function createMidiBassLibraryRepository() { return new MidiBassLibraryRepository(createMidiBassStorage()); }

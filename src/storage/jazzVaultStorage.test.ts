import { describe, expect, it, vi } from "vitest";
import { createEmptyVault, JsonVaultRepository, DATA_PATH, BACKUP_DIR, VAULT_DIR, backupFileName, serializeVault, type VaultStorage } from "../domain/repository";
import { chordSymbolSchema, parseVaultFileJson } from "../domain/schema";
import { makeIdea } from "../domain/testFactory";
import type { VaultFile } from "../domain/types";
import { createVaultStore, errorText } from "../store/vaultStore";
import { MAX_EXTERNAL_VAULT_BYTES } from "../security/intakeBudgets";
import { JazzVaultRepository, JazzVaultStorage, JAZZ_VAULT_DATA_PATH, JAZZ_VAULT_DIR, JAZZ_VAULT_MIGRATION_COPY } from "./jazzVaultStorage";

class MemoryStorage implements VaultStorage {
  files = new Map<string,string>();
  dirs = new Set<string>();
  failRename = false;
  failCopy = false;
  async ensureDir(path:string){this.dirs.add(path);}
  async exists(path:string){return this.files.has(path)||this.dirs.has(path);}
  async readText(path:string){const value=this.files.get(path);if(value===undefined)throw Error("Missing synthetic file");return value;}
  async writeText(path:string,value:string){this.files.set(path,value);}
  async rename(from:string,to:string){if(this.failRename)throw Error("Injected rename failure");this.files.set(to,await this.readText(from));this.files.delete(from);}
  async copyFile(from:string,to:string){if(this.failCopy)throw Error("Injected copy failure");this.files.set(to,await this.readText(from));}
  async removeFile(path:string){this.files.delete(path);}
  async listFiles(path:string){return [...this.files.keys()].filter(key=>key.startsWith(path+"/")).map(key=>key.slice(path.length+1)).filter(key=>!key.includes("/"));}
}
/** Like the real files: removing what is not there fails (with a string, as the Tauri commands do), and a removal can be made to fail. */
class StrictStorage extends MemoryStorage {
  failRemove = false;
  removed: string[] = [];
  override async removeFile(path:string){
    this.removed.push(path);
    if(this.failRemove)throw "Injected remove failure";
    if(!this.files.has(path))throw `failed to get metadata of path: ${path} (os error 3)`;
    this.files.delete(path);
  }
}
const oldBackup = `${BACKUP_DIR}/data-20261011-1200.json`;
const realBackups = (storage:MemoryStorage) => [...storage.files.keys()].filter(k=>/\/backups\/data-\d{8}-\d{4}\.json$/.test(k)).sort();
const legacy = ():VaultFile=>({...createEmptyVault(),ideas:[makeIdea({title:"Synthetic legacy",progressionBlocks:[]})]});
const altered = ():VaultFile=>({...createEmptyVault(),ideas:[makeIdea({title:"Synthetic altered",progressionBlocks:[{
  id:"22222222-2222-4222-8222-222222222222",summaryText:"G7alt",tags:[],pinned:false,suppressedAutoTags:[],capturedAt:"2026-10-11T12:00:00Z",analyzerVersion:"text-progression-v1",chords:[{
    bar:1,beat:1,durationBeats:4,chord:{root:7,quality:"dom7",tensions:[],altered:true,label:"G7alt"},confidence:1,alternatives:[],warnings:[],
    voicingMemory:{practiceVoicingOverride:{schemaVersion:1,source:"manual",representation:"simultaneous-voicing",midiNotes:[43,65,70,71,75],bassNote:43,capturedForChordKey:"synthetic-alt",capturedForChordLabel:"G7alt",userVerified:true,extractorVersion:"text-style-v1:generated-close"}},
  }],
}]} )]});
const repository=(storage:MemoryStorage)=>new JazzVaultRepository(storage,{now:()=>new Date("2026-10-11T12:00:00Z")});

describe("TXT-JAZZ Vault compatibility boundary",()=>{
  it("retains legacy v1 oversized read-only recovery without weakening the write budget",async()=>{
    const storage=new MemoryStorage(),vault=legacy();vault.ideas[0].chordMemo="x".repeat(MAX_EXTERNAL_VAULT_BYTES);
    const raw=JSON.stringify({...vault,fileVersion:1});storage.files.set(DATA_PATH,raw);
    const repo=repository(storage),loaded=await repo.load();expect(loaded.sizeRecovery).toBe(true);expect(loaded.vault.ideas[0].chordMemo).toBe(vault.ideas[0].chordMemo);
    expect(storage.files.get(DATA_PATH)).toBe(raw);expect(storage.files.get(JAZZ_VAULT_MIGRATION_COPY)).toBe(raw);expect(storage.files.get(JAZZ_VAULT_DATA_PATH)).toBe(raw);
    await expect(repo.save(loaded.vault)).rejects.toMatchObject({kind:"vault-too-large"});expect(storage.files.get(JAZZ_VAULT_DATA_PATH)).toBe(raw);
    const reduced={...loaded.vault,ideas:loaded.vault.ideas.map(idea=>({...idea,chordMemo:"recovered within budget"}))};await repo.save(reduced);expect((await repo.load()).sizeRecovery).toBeUndefined();expect(storage.files.get(DATA_PATH)).toBe(raw);
  });
  it.each([1,2])("copies legacy v%s once without changing original or its backups",async version=>{
    const storage=new MemoryStorage();storage.dirs.add("loopvault");
    const raw=JSON.stringify({...legacy(),fileVersion:version});storage.files.set(DATA_PATH,raw);storage.files.set(oldBackup,raw);
    const result=await repository(storage).load();
    expect(result.quarantine).toEqual([]);expect(result.vault.ideas[0].title).toBe("Synthetic legacy");
    expect(storage.files.get(DATA_PATH)).toBe(raw);expect(storage.files.get(oldBackup)).toBe(raw);expect(storage.files.get(JAZZ_VAULT_MIGRATION_COPY)).toBe(raw);
    storage.files.set(DATA_PATH,serializeVault({...legacy(),ideas:[makeIdea({title:"Later old EXE change"})]}));
    expect((await repository(storage).load()).vault.ideas[0].title).toBe("Synthetic legacy");
    expect(storage.files.get(JAZZ_VAULT_MIGRATION_COPY)).toBe(raw);
  });
  it("persists altered symbols and exact registered notes through save reload export and import",async()=>{
    const storage=new MemoryStorage(),repo=repository(storage),vault=altered();
    await repo.load();await repo.save(vault);
    const raw=storage.files.get(JAZZ_VAULT_DATA_PATH)!;expect(JSON.parse(raw).fileVersion).toBe(3);
    expect((await repo.load()).vault).toEqual(vault);expect((await repo.load()).quarantine).toEqual([]);
    await repo.exportTo("synthetic-export.json");expect(JSON.parse(storage.files.get("synthetic-export.json")!).fileVersion).toBe(3);
    const reload=await repo.importFrom("synthetic-export.json",{mode:"replace"});expect(reload.vault).toEqual(vault);
    expect((await repository(storage).load()).vault).toEqual(vault);expect(storage.files.has(DATA_PATH)).toBe(false);
  });
  it("keeps ordinary exports byte-compatible v2 and distinguishes explicit tensions",async()=>{
    const vault=legacy();expect(JSON.parse(serializeVault(vault)).fileVersion).toBe(2);
    const explicit=altered();const symbol=explicit.ideas[0].progressionBlocks![0].chords[0].chord;delete symbol.altered;symbol.tensions=["b9","b13"];symbol.label="G7(b9,b13)";
    expect(JSON.parse(serializeVault(explicit)).fileVersion).toBe(2);expect(parseVaultFileJson(serializeVault(explicit))).toMatchObject({ok:true,quarantine:[]});
  });
  it("preserves new data when an old repository saves or restores its separate namespace",async()=>{
    const storage=new MemoryStorage(),oldRaw=serializeVault(legacy());storage.dirs.add("loopvault");storage.files.set(DATA_PATH,oldRaw);storage.files.set(oldBackup,oldRaw);
    const repo=repository(storage);await repo.load();await repo.save(altered());const before=storage.files.get(JAZZ_VAULT_DATA_PATH);
    const oldRepo=new JsonVaultRepository(storage);await oldRepo.save(legacy());await oldRepo.restore("data-20261011-1200.json");
    expect(storage.files.get(JAZZ_VAULT_DATA_PATH)).toBe(before);expect(storage.files.get(JAZZ_VAULT_MIGRATION_COPY)).toBe(oldRaw);
  });
  it.each(["{damaged",JSON.stringify({...legacy(),fileVersion:99}),JSON.stringify({...legacy(),ideas:[{...makeIdea(),unknownFutureField:true}]}),JSON.stringify({...altered(),fileVersion:2})])("refuses unsafe legacy migration without rewriting bytes",async raw=>{
    const storage=new MemoryStorage();storage.files.set(DATA_PATH,raw);storage.files.set(oldBackup,"retained backup");
    await expect(repository(storage).load()).rejects.toMatchObject({kind:"migration-recovery"});
    expect(storage.files.get(DATA_PATH)).toBe(raw);expect(storage.files.get(oldBackup)).toBe("retained backup");expect(storage.files.has(JAZZ_VAULT_DATA_PATH)).toBe(false);
  });
  it.each(["data.json.tmp","legacy-import.json","data.corrupt-20261011-120000.json","backups/data-20261011-1200.json"])("refuses an incomplete new namespace with %s",async artifact=>{
    const storage=new MemoryStorage();storage.dirs.add(JAZZ_VAULT_DIR);storage.dirs.add(`${JAZZ_VAULT_DIR}/backups`);storage.files.set(DATA_PATH,serializeVault(legacy()));storage.files.set(`${JAZZ_VAULT_DIR}/${artifact}`,"retained artifact");
    await expect(repository(storage).load()).rejects.toMatchObject({kind:"migration-recovery"});expect(storage.files.has(JAZZ_VAULT_DATA_PATH)).toBe(false);expect(storage.files.get(`${JAZZ_VAULT_DIR}/${artifact}`)).toBe("retained artifact");
  });
  it.each(["{damaged",JSON.stringify({...legacy(),fileVersion:99})])("does not fall back to legacy when new committed data is invalid",async raw=>{
    const storage=new MemoryStorage();storage.dirs.add(JAZZ_VAULT_DIR);storage.files.set(DATA_PATH,serializeVault(legacy()));storage.files.set(JAZZ_VAULT_DATA_PATH,raw);
    await expect(repository(storage).load()).rejects.toBeDefined();expect(storage.files.get(DATA_PATH)).toBe(serializeVault(legacy()));
    // Malformed JSON follows existing quarantine recovery, but never imports legacy on restart.
    if(raw==="{damaged")await expect(repository(storage).load()).rejects.toMatchObject({kind:"migration-recovery"});
    else expect(storage.files.get(JAZZ_VAULT_DATA_PATH)).toBe(raw);
  });
  it("preserves the permanent migration copy and blocks a partial-write retry",async()=>{
    const storage=new MemoryStorage(),raw=serializeVault(legacy());storage.dirs.add("loopvault");storage.files.set(DATA_PATH,raw);storage.files.set(oldBackup,raw);storage.failRename=true;
    await expect(repository(storage).load()).rejects.toThrow("Injected rename failure");expect(storage.files.get(DATA_PATH)).toBe(raw);expect(storage.files.get(oldBackup)).toBe(raw);expect(storage.files.get(JAZZ_VAULT_MIGRATION_COPY)).toBe(raw);
    storage.failRename=false;await expect(repository(storage).load()).rejects.toMatchObject({kind:"migration-recovery"});
    // A deliberate repair can promote the intact temporary copy; no original bytes are discarded.
    await storage.rename(`${JAZZ_VAULT_DATA_PATH}.tmp`,JAZZ_VAULT_DATA_PATH);expect((await repository(storage).load()).vault).toEqual(legacy());
  });
  it("rejects invalid altered structures and never writes an invalid Vault",async()=>{
    const chord=altered().ideas[0].progressionBlocks![0].chords[0].chord;
    for(const invalid of [{...chord,altered:false},{...chord,quality:"maj7"},{...chord,tensions:["b9"]},{...chord,omissions:["5"]}])expect(chordSymbolSchema.safeParse(invalid).success).toBe(false);
    const storage=new MemoryStorage(),repo=repository(storage);await repo.load();const before=storage.files.get(JAZZ_VAULT_DATA_PATH);const vault=altered();vault.ideas[0].progressionBlocks![0].chords[0].chord.tensions=["b9"];
    await expect(repo.save(vault)).rejects.toBeDefined();expect(storage.files.get(JAZZ_VAULT_DATA_PATH)).toBe(before);
  });
  it("blocks empty reinitialization on the same repository and store after corrupt quarantine",async()=>{
    const storage=new MemoryStorage();storage.dirs.add(JAZZ_VAULT_DIR);storage.files.set(JAZZ_VAULT_DATA_PATH,"{damaged");
    const repo=repository(storage),store=createVaultStore({repository:repo,debounceMs:100000});
    await store.getState().initialize();expect(store.getState().loadStatus).toBe("recovery");
    await store.getState().initialize();expect(store.getState().loadStatus).toBe("recovery");
    expect(store.getState().createIdeaFromDraft({title:"Must not save"})).toBeUndefined();await store.getState().flush();
    expect(storage.files.has(JAZZ_VAULT_DATA_PATH)).toBe(false);expect([...storage.files.values()]).toContain("{damaged");
    storage.files.set("synthetic-valid.json",serializeVault(legacy()));
    expect(await store.getState().importVault("synthetic-valid.json","replace")).toBe(true);
    expect(store.getState().loadStatus).toBe("ready");expect((await repo.load()).vault).toEqual(legacy());expect([...storage.files.values()]).toContain("{damaged");
  });
  it("offers the permanent legacy copy for explicit startup recovery after interrupted migration",async()=>{
    const storage=new MemoryStorage(),raw=serializeVault(legacy());storage.files.set(DATA_PATH,raw);storage.failRename=true;
    await expect(repository(storage).load()).rejects.toThrow("Injected rename failure");storage.failRename=false;
    const repo=repository(storage),store=createVaultStore({repository:repo,debounceMs:100000});await store.getState().initialize();
    expect(store.getState().loadStatus).toBe("recovery");expect(store.getState().recovery?.backups.map(b=>b.name)).toContain("legacy-import.json");
    await store.getState().restoreBackup("legacy-import.json");expect(store.getState().loadStatus).toBe("ready");
    expect((await repo.load()).vault).toEqual(legacy());expect(storage.files.get(DATA_PATH)).toBe(raw);expect(storage.files.get(JAZZ_VAULT_MIGRATION_COPY)).toBe(raw);
  });
  it.each(["replace","restore"] as const)("refuses %s if preserving the current bytes fails",async action=>{
    const storage=new MemoryStorage();storage.dirs.add(JAZZ_VAULT_DIR);const raw=serializeVault(altered());storage.files.set(JAZZ_VAULT_DATA_PATH,raw);storage.files.set(`${JAZZ_VAULT_DIR}/backups/data-20261011-1200.json`,serializeVault(legacy()));storage.files.set("synthetic-valid.json",serializeVault(legacy()));storage.failCopy=true;
    const repo=repository(storage);
    await expect(action==="replace"?repo.importFrom("synthetic-valid.json",{mode:"replace"}):repo.restore("data-20261011-1200.json")).rejects.toThrow("Injected copy failure");
    expect(storage.files.get(JAZZ_VAULT_DATA_PATH)).toBe(raw);expect(storage.files.has(`${JAZZ_VAULT_DATA_PATH}.tmp`)).toBe(false);
  });
  it("refuses merge during incomplete recovery instead of treating the current Vault as empty",async()=>{
    const storage=new MemoryStorage();storage.dirs.add(JAZZ_VAULT_DIR);storage.files.set(JAZZ_VAULT_MIGRATION_COPY,serializeVault(legacy()));storage.files.set("synthetic-valid.json",serializeVault(altered()));
    const repo=repository(storage);await expect(repo.importFrom("synthetic-valid.json",{mode:"merge"})).rejects.toMatchObject({kind:"migration-recovery"});expect(storage.files.has(JAZZ_VAULT_DATA_PATH)).toBe(false);expect(storage.files.get(JAZZ_VAULT_MIGRATION_COPY)).toBe(serializeVault(legacy()));
  });

  describe("rotating the startup backups (an Oct 23 launch failed when the 20th backup was made)",()=>{
    const seed=(storage:StrictStorage,backups:number)=>{
      const raw=serializeVault(legacy());
      storage.dirs.add(JAZZ_VAULT_DIR);storage.files.set(JAZZ_VAULT_DATA_PATH,raw);storage.files.set(JAZZ_VAULT_MIGRATION_COPY,raw);
      for(let i=0;i<backups;i+=1){const day=new Date(Date.UTC(2026,8,1+i));const name=`data-${day.toISOString().slice(0,10).replace(/-/g,"")}-0900.json`;storage.files.set(`${JAZZ_VAULT_DIR}/backups/${name}`,raw);}
      return raw;
    };
    it.each([18,19,20,25])("loads with %s backups and legacy-import.json: legacy-import.json stays and only the real backups are kept to 20",async count=>{
      const storage=new StrictStorage(),raw=seed(storage,count);
      const result=await repository(storage).load();
      expect(result.vault.ideas[0].title).toBe("Synthetic legacy");
      expect(storage.files.get(JAZZ_VAULT_MIGRATION_COPY)).toBe(raw);
      expect(realBackups(storage)).toHaveLength(Math.min(20,count+1));
      expect(storage.removed.every(path=>/\/backups\/data-\d{8}-\d{4}\.json$/.test(path))).toBe(true);
      // the oldest are the ones that went; the newest (this launch's) is kept
      expect(storage.files.has(`${JAZZ_VAULT_DIR}/backups/${backupFileName(new Date("2026-10-11T12:00:00Z"))}`)).toBe(true);
      if(count>=20)expect(storage.files.has(`${JAZZ_VAULT_DIR}/backups/data-20260901-0900.json`)).toBe(false);
      // again and again: still loads, still 20
      for(let n=0;n<3;n+=1)await repository(storage).load();
      expect(realBackups(storage).length).toBeLessThanOrEqual(20);expect(storage.files.get(JAZZ_VAULT_MIGRATION_COPY)).toBe(raw);
    });
    it("points legacy-import.json at the place the restore reads it from (no doubled folder), and restores from it as before",async()=>{
      const storage=new StrictStorage(),raw=seed(storage,3);
      const repo=repository(storage),list=await repo.listBackups(),legacyEntry=list.find(b=>b.name==="legacy-import.json")!;
      expect(legacyEntry.path).toBe(`${VAULT_DIR}/legacy-import.json`);expect(legacyEntry.path).not.toContain("txt-jazz-v3/txt-jazz-v3");
      expect(await new JazzVaultStorage(storage).readText(legacyEntry.path)).toBe(raw);
      expect(await new JazzVaultStorage(storage).exists(legacyEntry.path)).toBe(true);
      expect(list.filter(b=>b.name!=="legacy-import.json")).toHaveLength(3);
      storage.files.set(JAZZ_VAULT_DATA_PATH,serializeVault({...legacy(),ideas:[makeIdea({title:"Changed later"})]}));
      const restored=await repo.restore("legacy-import.json");
      expect(restored.vault.ideas[0].title).toBe("Synthetic legacy");expect(storage.files.get(JAZZ_VAULT_MIGRATION_COPY)).toBe(raw);
    });
    it("loads even when removing the old backups fails, and says so in the console",async()=>{
      const storage=new StrictStorage(),raw=seed(storage,25);storage.failRemove=true;
      const warn=vi.spyOn(console,"warn").mockImplementation(()=>undefined);
      try{
        const result=await repository(storage).load();
        expect(result.vault.ideas[0].title).toBe("Synthetic legacy");expect(storage.files.get(JAZZ_VAULT_MIGRATION_COPY)).toBe(raw);
        expect(warn).toHaveBeenCalledWith(expect.stringContaining("backup rotation failed"),"Injected remove failure");
        expect(storage.removed.length).toBeGreaterThan(1); // every removal was tried, not only the first
      }finally{warn.mockRestore();}
    });
    it("shows the text of a failure that is a string, on the startup error screen",async()=>{
      const repo={load:async()=>{throw "failed to get metadata of path: somewhere (os error 3)";}} as never;
      const store=createVaultStore({repository:repo,debounceMs:100000});await store.getState().initialize();
      expect(store.getState().loadStatus).toBe("error");expect(store.getState().error).toBe("failed to get metadata of path: somewhere (os error 3)");
      expect(errorText(new Error("an error"),"x")).toBe("an error");expect(errorText(42,"fallback")).toBe("fallback");expect(errorText("  ","fallback")).toBe("fallback");
    });
  });
});

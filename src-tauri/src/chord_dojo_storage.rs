use serde::Serialize;
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::{
    fs::{self, File, OpenOptions},
    io::{Read, Write},
    path::{Path, PathBuf},
    sync::Mutex,
};
use tauri::{AppHandle, Manager, State};

const PRACTICE_DIR: &str = "loopvault";
const THEME_DIR: &str = "theme-lessons-txt-jazz-v4";
const PRACTICE_FILE: &str = "chord-dojo-v1.json";
const PRACTICE_TEMP: &str = "chord-dojo-v1.json.tmp";
const ROLLBACK_MARKER: &str = "chord-dojo-v1.rollback";
const ROLLBACK_MARKER_TEMP: &str = "chord-dojo-v1.rollback.tmp";
const PROCESS_LOCK: &str = "chord-dojo-v1.lock";
const BACKUP_DIR: &str = "chord-dojo-backups";
const MAX_BACKUPS: usize = 20;
const MAX_CORRUPT_FILES: usize = 20;
const MAX_PRACTICE_BYTES: u64 = 16 * 1024 * 1024;

#[derive(Default)]
pub struct ChordDojoStorageState(Mutex<()>);

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChordDojoStoredDocument {
    contents: String,
    revision: u64,
    token: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChordDojoBackupMetadata {
    name: String,
    revision: u64,
    token: String,
}


/// One-time read-only import. Legacy files and backups are never moved or rewritten.
#[tauri::command]
pub fn read_legacy_chord_dojo_file(app: AppHandle, state: State<'_, ChordDojoStorageState>) -> Result<Option<ChordDojoStoredDocument>, String> {
 let _guard=state.0.lock().map_err(|_|storage_error("lock"))?;
 let app_data=app.path().app_data_dir().map_err(|_|storage_error("resolve AppData"))?;
 let paths=paths_from_root(app_data.join(PRACTICE_DIR));
 if !paths.root.exists(){return Ok(None);}
 let _process_lock=acquire_cross_process_lock(&paths.lock)?;
 let document=read_raw_document_if_present(&paths.data)?;
 if document.is_none() && (!list_recovery_artifacts(&paths)?.is_empty() || !list_valid_backups(&paths)?.is_empty()) {return Err(storage_error("legacy recovery required"));}
 if paths.marker.exists(){return Err(storage_error("legacy interrupted write requires recovery"));}
 Ok(document)
}

#[tauri::command]
pub fn load_chord_dojo_file(
    app: AppHandle,
    state: State<'_, ChordDojoStorageState>,
) -> Result<Option<ChordDojoStoredDocument>, String> {
    let _guard = state.0.lock().map_err(|_| storage_error("lock"))?;
    let paths = chord_dojo_paths(&app)?;
    fs::create_dir_all(&paths.root).map_err(|_| storage_error("create directory"))?;
    let _process_lock = acquire_cross_process_lock(&paths.lock)?;
    refuse_incomplete_jazz_namespace(&paths)?;
    recover_interrupted_replace(&paths)?;
    read_raw_document_if_present(&paths.data)
}

#[tauri::command]
pub fn save_chord_dojo_file(
    app: AppHandle,
    state: State<'_, ChordDojoStorageState>,
    contents: String,
    timestamp_token: String,
    expected_revision: Option<u64>,
    expected_token: Option<String>,
) -> Result<u64, String> {
    validate_timestamp_token(&timestamp_token)?;
    let _guard = state.0.lock().map_err(|_| storage_error("lock"))?;
    let paths = chord_dojo_paths(&app)?;
    save_document_with_token(
        &paths,
        &contents,
        &timestamp_token,
        expected_revision,
        expected_token.as_deref(),
    )
}

#[tauri::command]
pub fn quarantine_chord_dojo_file(
    app: AppHandle,
    state: State<'_, ChordDojoStorageState>,
    timestamp_token: String,
    expected_token: String,
) -> Result<String, String> {
    validate_timestamp_token(&timestamp_token)?;
    let _guard = state.0.lock().map_err(|_| storage_error("lock"))?;
    let paths = chord_dojo_paths(&app)?;
    quarantine_document(&paths, &timestamp_token, &expected_token)
}

#[tauri::command]
pub fn list_chord_dojo_recovery_artifacts(
    app: AppHandle,
    state: State<'_, ChordDojoStorageState>,
) -> Result<Vec<String>, String> {
    let _guard = state.0.lock().map_err(|_| storage_error("lock"))?;
    let paths = chord_dojo_paths(&app)?;
    fs::create_dir_all(&paths.root).map_err(|_| storage_error("create directory"))?;
    let _process_lock = acquire_cross_process_lock(&paths.lock)?;
    list_recovery_artifacts(&paths)
}

fn quarantine_document(
    paths: &ChordDojoPaths,
    timestamp_token: &str,
    expected_token: &str,
) -> Result<String, String> {
    fs::create_dir_all(&paths.root).map_err(|_| storage_error("create directory"))?;
    let _process_lock = acquire_cross_process_lock(&paths.lock)?;
    recover_interrupted_replace(&paths)?;
    if !paths.data.exists() {
        return Err(storage_error("quarantine missing file"));
    }
    let current = read_raw_document_if_present(&paths.data)?
        .ok_or_else(|| storage_error("quarantine missing file"))?;
    if current.token != expected_token {
        return Err(storage_error("quarantine stale content token"));
    }
    rotate_named_files(&paths.root, is_corrupt_name, MAX_CORRUPT_FILES - 1)?;
    let base = format!("chord-dojo-v1.corrupt-{timestamp_token}");
    let destination = unique_json_path(&paths.root, &base)?;
    link_then_remove(&paths.data, &destination).map_err(|_| storage_error("quarantine"))?;
    sync_directory(&paths.root);
    relative_chord_dojo_name(&destination)
}

fn list_recovery_artifacts(paths: &ChordDojoPaths) -> Result<Vec<String>, String> {
    if !paths.root.exists() {
        return Ok(Vec::new());
    }
    let mut artifacts = Vec::new();
    for entry in fs::read_dir(&paths.root).map_err(|_| storage_error("list recovery artifacts"))? {
        let entry = entry.map_err(|_| storage_error("list recovery artifacts"))?;
        let file_type = entry
            .file_type()
            .map_err(|_| storage_error("list recovery artifacts"))?;
        let Some(name) = entry.file_name().to_str().map(str::to_owned) else {
            continue;
        };
        if file_type.is_file() && is_corrupt_name(&name) {
            artifacts.push(format!("{PRACTICE_DIR}/{THEME_DIR}/{name}"));
        }
    }
    artifacts.sort_unstable_by(|left, right| right.cmp(left));
    Ok(artifacts)
}

#[tauri::command]
pub fn list_chord_dojo_backups(
    app: AppHandle,
    state: State<'_, ChordDojoStorageState>,
) -> Result<Vec<ChordDojoBackupMetadata>, String> {
    let _guard = state.0.lock().map_err(|_| storage_error("lock"))?;
    let paths = chord_dojo_paths(&app)?;
    list_valid_backups(&paths)
}

#[tauri::command]
pub fn read_chord_dojo_backup(
    app: AppHandle,
    state: State<'_, ChordDojoStorageState>,
    name: String,
) -> Result<ChordDojoStoredDocument, String> {
    let _guard = state.0.lock().map_err(|_| storage_error("lock"))?;
    if !is_backup_name(&name) {
        return Err(storage_error("validate backup name"));
    }
    let paths = chord_dojo_paths(&app)?;
    read_document(&paths.backups.join(name)).map_err(|_| storage_error("validate backup"))
}

#[tauri::command]
pub fn restore_chord_dojo_backup(
    app: AppHandle,
    state: State<'_, ChordDojoStorageState>,
    name: String,
    backup_token: String,
    expected_revision: Option<u64>,
    expected_token: Option<String>,
) -> Result<ChordDojoStoredDocument, String> {
    let _guard = state.0.lock().map_err(|_| storage_error("lock"))?;
    let paths = chord_dojo_paths(&app)?;
    fs::create_dir_all(&paths.root).map_err(|_| storage_error("create directory"))?;
    let _process_lock = acquire_cross_process_lock(&paths.lock)?;
    recover_interrupted_replace(&paths)?;
    if !is_backup_name(&name) {
        return Err(storage_error("validate backup name"));
    }
    let backup_path = paths.backups.join(&name);
    let backup = read_document(&backup_path).map_err(|_| storage_error("validate backup"))?;
    if backup.token != backup_token {
        return Err(storage_error("restore changed backup token"));
    }
    let next_revision = expected_revision.map_or(1, |revision| revision.saturating_add(1));
    let restored_contents = with_current_version_and_revision(&backup.contents, next_revision)?;
    let timestamp_token = backup_timestamp_token(&name)?;
    let revision = save_document_unlocked(
        &paths,
        &restored_contents,
        timestamp_token,
        expected_revision,
        expected_token.as_deref(),
    )?;
    let token = content_token(&restored_contents);
    Ok(ChordDojoStoredDocument {
        contents: restored_contents,
        revision,
        token,
    })
}

#[derive(Clone)]
struct ChordDojoPaths {
    root: PathBuf,
    data: PathBuf,
    temp: PathBuf,
    marker: PathBuf,
    marker_temp: PathBuf,
    lock: PathBuf,
    backups: PathBuf,
}

fn chord_dojo_paths(app: &AppHandle) -> Result<ChordDojoPaths, String> {
    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|_| storage_error("resolve AppData"))?;
    Ok(theme_paths_from_root(app_data.join(PRACTICE_DIR)))
}

fn theme_paths_from_root(root: PathBuf) -> ChordDojoPaths { paths_from_root(root.join(THEME_DIR)) }

fn refuse_incomplete_jazz_namespace(paths: &ChordDojoPaths) -> Result<(), String> {
    if paths.data.exists() { return Ok(()); }
    // Existing same-namespace recovery may restore a fully validated backup.
    if !list_valid_backups(paths)?.is_empty() { return Ok(()); }
    let has_backups = paths.backups.exists()
        && fs::read_dir(&paths.backups).map_err(|_| storage_error("inspect jazz backups"))?.next().is_some();
    if paths.temp.exists() || paths.marker.exists() || paths.marker_temp.exists()
        || has_backups || !list_recovery_artifacts(paths)?.is_empty() {
        return Err(storage_error("jazz namespace recovery required; original files retained"));
    }
    Ok(())
}

/// Read the previous theme candidate without running its rollback recovery.
/// A committed v4 plus a leftover v3 marker must be copied before any old reader can roll it back.
#[tauri::command]
pub fn read_previous_theme_chord_dojo_file(app: AppHandle, state: State<'_, ChordDojoStorageState>) -> Result<Option<ChordDojoStoredDocument>, String> {
    let _guard=state.0.lock().map_err(|_|storage_error("lock"))?;
    let app_data=app.path().app_data_dir().map_err(|_|storage_error("resolve AppData"))?;
    read_previous_theme_from_root(&app_data.join(PRACTICE_DIR))
}

fn read_previous_theme_from_root(root: &Path) -> Result<Option<ChordDojoStoredDocument>, String> {
    // Read committed bytes before older rollback recovery. Never write to either old namespace.
    for namespace in ["theme-lessons-ranges-v4", "theme-lessons-v4", "theme-lessons"] {
        let paths=paths_from_root(root.join(namespace));
        if !paths.root.exists() { continue; }
        let _process_lock=acquire_cross_process_lock(&paths.lock)?;
        let document=read_raw_document_if_present(&paths.data)?;
        if let Some(ref raw)=document {
            validate_document(&raw.contents)?;
            // Frontend validates the full store before importing once to the range namespace.
            return Ok(document);
        }
        let has_backups=paths.backups.exists() && fs::read_dir(&paths.backups).map_err(|_|storage_error("inspect previous theme backups"))?.next().is_some();
        if paths.marker.exists() || paths.marker_temp.exists() || paths.temp.exists() || has_backups || !list_recovery_artifacts(&paths)?.is_empty() {
            return Err(storage_error("previous theme recovery required; original files retained"));
        }
    }
    Ok(None)
}

fn paths_from_root(root: PathBuf) -> ChordDojoPaths {
    ChordDojoPaths {
        data: root.join(PRACTICE_FILE),
        temp: root.join(PRACTICE_TEMP),
        marker: root.join(ROLLBACK_MARKER),
        marker_temp: root.join(ROLLBACK_MARKER_TEMP),
        lock: root.join(PROCESS_LOCK),
        backups: root.join(BACKUP_DIR),
        root,
    }
}

fn save_document_with_token(
    paths: &ChordDojoPaths,
    contents: &str,
    timestamp_token: &str,
    expected_revision: Option<u64>,
    expected_token: Option<&str>,
) -> Result<u64, String> {
    fs::create_dir_all(&paths.root).map_err(|_| storage_error("create directory"))?;
    let _process_lock = acquire_cross_process_lock(&paths.lock)?;
    save_document_unlocked(
        paths,
        contents,
        timestamp_token,
        expected_revision,
        expected_token,
    )
}

#[cfg(test)]
fn save_document(
    paths: &ChordDojoPaths,
    contents: &str,
    timestamp_token: &str,
    expected_revision: Option<u64>,
) -> Result<u64, String> {
    let expected_token = read_raw_document_if_present(&paths.data)?.map(|document| document.token);
    save_document_with_token(
        paths,
        contents,
        timestamp_token,
        expected_revision,
        expected_token.as_deref(),
    )
}

fn save_document_unlocked(
    paths: &ChordDojoPaths,
    contents: &str,
    timestamp_token: &str,
    expected_revision: Option<u64>,
    expected_token: Option<&str>,
) -> Result<u64, String> {
    save_document_unlocked_with_fault(
        paths,
        contents,
        timestamp_token,
        expected_revision,
        expected_token,
        SaveFault::None,
    )
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum SaveFault {
    None,
    #[cfg(test)]
    TempWrite,
    #[cfg(test)]
    BackupCreate,
    #[cfg(test)]
    AtomicReplace,
    #[cfg(test)]
    PostCommitCleanup,
}

fn save_document_unlocked_with_fault(
    paths: &ChordDojoPaths,
    contents: &str,
    timestamp_token: &str,
    expected_revision: Option<u64>,
    expected_token: Option<&str>,
    fault: SaveFault,
) -> Result<u64, String> {
    #[cfg(not(test))]
    let _ = fault;
    validate_timestamp_token(timestamp_token)?;
    fs::create_dir_all(&paths.root).map_err(|_| storage_error("create directory"))?;
    fs::create_dir_all(&paths.backups).map_err(|_| storage_error("create backup directory"))?;
    recover_interrupted_replace(paths)?;

    let current = read_raw_document_if_present(&paths.data)?;
    let current_revision = current.as_ref().map(|document| document.revision);
    let current_token = current.as_ref().map(|document| document.token.as_str());
    if current_revision != expected_revision || current_token != expected_token {
        return Err(storage_error("save stale revision"));
    }
    let next_revision =
        expected_revision.map_or(1, |revision| revision.checked_add(1).unwrap_or(u64::MAX));
    if next_revision == u64::MAX && expected_revision == Some(u64::MAX) {
        return Err(storage_error("advance revision"));
    }
    let document_revision = validate_document(contents)?;
    if document_revision != next_revision {
        return Err(storage_error("validate next revision"));
    }

    remove_file_if_present(&paths.temp)?;
    #[cfg(test)]
    if fault == SaveFault::TempWrite {
        return Err(storage_error("injected temporary write"));
    }
    write_new_and_flush(&paths.temp, contents.as_bytes())?;

    let mut created_backup_name: Option<String> = None;
    let transaction = (|| -> Result<(), String> {
        let backup_name = if let Some(current) = &current {
            rotate_named_files(&paths.backups, is_backup_name, MAX_BACKUPS - 1)?;
            #[cfg(test)]
            if fault == SaveFault::BackupCreate {
                return Err(storage_error("injected backup create"));
            }
            Some(create_backup(
                paths,
                timestamp_token,
                current.contents.as_bytes(),
            )?)
        } else {
            None
        };
        created_backup_name = backup_name.clone();
        if let Some(name) = backup_name.as_deref() {
            write_marker(paths, name)?;
        }
        #[cfg(test)]
        if fault == SaveFault::AtomicReplace {
            return Err(storage_error("injected atomic replace"));
        }
        atomic_replace(&paths.temp, &paths.data)?;
        sync_directory(&paths.root);
        #[cfg(test)]
        if fault == SaveFault::PostCommitCleanup {
            return Ok(());
        }
        best_effort_post_commit_cleanup(paths);
        Ok(())
    })();

    if transaction.is_err() {
        let _ = remove_file_if_present(&paths.temp);
        let _ = remove_file_if_present(&paths.marker);
        let _ = remove_file_if_present(&paths.marker_temp);
        if let Some(name) = created_backup_name {
            let _ = remove_file_if_present(&paths.backups.join(name));
        }
    }
    transaction?;
    Ok(next_revision)
}

fn best_effort_post_commit_cleanup(paths: &ChordDojoPaths) {
    if remove_file_if_present(&paths.marker).is_err()
        || remove_file_if_present(&paths.marker_temp).is_err()
    {
        eprintln!("ChordDojo storage post-commit cleanup was deferred until the next load.");
    }
}

#[cfg(test)]
fn save_document_with_fault(
    paths: &ChordDojoPaths,
    contents: &str,
    timestamp_token: &str,
    expected_revision: Option<u64>,
    fault: SaveFault,
) -> Result<u64, String> {
    fs::create_dir_all(&paths.root).map_err(|_| storage_error("create directory"))?;
    let _process_lock = acquire_cross_process_lock(&paths.lock)?;
    let expected_token = read_raw_document_if_present(&paths.data)?.map(|document| document.token);
    save_document_unlocked_with_fault(
        paths,
        contents,
        timestamp_token,
        expected_revision,
        expected_token.as_deref(),
        fault,
    )
}

fn recover_interrupted_replace(paths: &ChordDojoPaths) -> Result<(), String> {
    // Refuse future data before touching markers, temporary files, or backups.
    if let Some(raw)=read_raw_document_if_present(&paths.data)? {
        if serde_json::from_str::<Value>(&raw.contents).ok().and_then(|v|v.get("fileVersion").and_then(Value::as_u64)).is_some_and(|v|v>4) {
            return Err(storage_error("unsupported newer fileVersion; files retained"));
        }
    }
    remove_file_if_present(&paths.marker_temp)?;
    if paths.marker.exists() {
        let marker = read_bounded_utf8(&paths.marker, 512)?;
        let backup_name = marker.trim();
        if !is_backup_name(backup_name) {
            return Err(storage_error("validate rollback marker"));
        }
        let committed_valid =
            read_document_if_present(&paths.data).is_ok_and(|value| value.is_some());
        if !committed_valid {
            let backup = read_document(&paths.backups.join(backup_name))?;
            remove_file_if_present(&paths.temp)?;
            write_new_and_flush(&paths.temp, backup.contents.as_bytes())?;
            atomic_replace(&paths.temp, &paths.data)?;
            sync_directory(&paths.root);
        }
        remove_file_if_present(&paths.marker)?;
    }
    remove_file_if_present(&paths.temp)?;
    cleanup_backup_temps(&paths.backups)?;
    Ok(())
}

fn create_backup(
    paths: &ChordDojoPaths,
    timestamp_token: &str,
    contents: &[u8],
) -> Result<String, String> {
    let destination = unique_json_path(&paths.backups, &format!("chord_dojo-{timestamp_token}"))?;
    let name = destination
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or_else(|| storage_error("backup name"))?
        .to_string();
    let temp = paths.backups.join(format!(".{name}.tmp"));
    remove_file_if_present(&temp)?;
    let result = (|| -> Result<(), String> {
        write_new_and_flush(&temp, contents)?;
        atomic_rename_no_replace(&temp, &destination)?;
        sync_directory(&paths.backups);
        Ok(())
    })();
    if result.is_err() {
        let _ = remove_file_if_present(&temp);
    }
    result?;
    Ok(name)
}

fn write_marker(paths: &ChordDojoPaths, backup_name: &str) -> Result<(), String> {
    remove_file_if_present(&paths.marker_temp)?;
    write_new_and_flush(&paths.marker_temp, format!("{backup_name}\n").as_bytes())?;
    atomic_replace(&paths.marker_temp, &paths.marker)?;
    sync_directory(&paths.root);
    Ok(())
}

fn list_valid_backups(paths: &ChordDojoPaths) -> Result<Vec<ChordDojoBackupMetadata>, String> {
    if !paths.backups.exists() {
        return Ok(Vec::new());
    }
    let mut names = fs::read_dir(&paths.backups)
        .map_err(|_| storage_error("list backups"))?
        .filter_map(Result::ok)
        .filter(|entry| {
            entry
                .file_type()
                .map(|kind| kind.is_file())
                .unwrap_or(false)
        })
        .filter_map(|entry| entry.file_name().into_string().ok())
        .filter(|name| is_backup_name(name))
        .collect::<Vec<_>>();
    names.sort_by(|left, right| right.cmp(left));
    let mut result = Vec::new();
    for name in names {
        if let Ok(document) = read_document(&paths.backups.join(&name)) {
            result.push(ChordDojoBackupMetadata {
                name,
                revision: document.revision,
                token: document.token,
            });
        }
    }
    Ok(result)
}

fn read_document_if_present(path: &Path) -> Result<Option<ChordDojoStoredDocument>, String> {
    if !path.exists() {
        return Ok(None);
    }
    read_document(path).map(Some)
}

fn read_raw_document_if_present(path: &Path) -> Result<Option<ChordDojoStoredDocument>, String> {
    if !path.exists() {
        return Ok(None);
    }
    let contents = read_bounded_utf8(path, MAX_PRACTICE_BYTES)?;
    let revision = validate_document(&contents).unwrap_or(0);
    let token = content_token(&contents);
    Ok(Some(ChordDojoStoredDocument {
        contents,
        revision,
        token,
    }))
}

fn read_document(path: &Path) -> Result<ChordDojoStoredDocument, String> {
    let contents = read_bounded_utf8(path, MAX_PRACTICE_BYTES)?;
    let revision = validate_document(&contents)?;
    let token = content_token(&contents);
    Ok(ChordDojoStoredDocument {
        contents,
        revision,
        token,
    })
}

fn content_token(contents: &str) -> String {
    format!("sha256-{:x}", Sha256::digest(contents.as_bytes()))
}

fn read_bounded_utf8(path: &Path, maximum: u64) -> Result<String, String> {
    let metadata = fs::metadata(path).map_err(|_| storage_error("inspect file"))?;
    if !metadata.is_file() || metadata.len() > maximum {
        return Err(storage_error("validate file size"));
    }
    let mut bytes = Vec::with_capacity(metadata.len() as usize);
    File::open(path)
        .and_then(|file| file.take(maximum + 1).read_to_end(&mut bytes))
        .map_err(|_| storage_error("read"))?;
    if bytes.len() as u64 > maximum {
        return Err(storage_error("validate file size"));
    }
    String::from_utf8(bytes).map_err(|_| storage_error("validate UTF-8"))
}

fn validate_document(contents: &str) -> Result<u64, String> {
    if contents.len() as u64 > MAX_PRACTICE_BYTES {
        return Err(storage_error("validate document size"));
    }
    let value: Value =
        serde_json::from_str(contents).map_err(|_| storage_error("validate JSON"))?;
    let object = value
        .as_object()
        .ok_or_else(|| storage_error("validate JSON envelope"))?;
    if object.get("app").and_then(Value::as_str) != Some("loopvault-chord-dojo") {
        return Err(storage_error("validate app marker"));
    }
    if !matches!(
        object.get("fileVersion").and_then(Value::as_u64),
        Some(1 | 2 | 3 | 4)
    ) {
        return Err(storage_error("validate fileVersion"));
    }
    object
        .get("revision")
        .and_then(Value::as_u64)
        .ok_or_else(|| storage_error("validate revision"))
}

fn with_current_version_and_revision(contents: &str, revision: u64) -> Result<String, String> {
    let mut value: Value =
        serde_json::from_str(contents).map_err(|_| storage_error("parse backup"))?;
    let object = value
        .as_object_mut()
        .ok_or_else(|| storage_error("validate backup envelope"))?;
    object.insert("fileVersion".to_string(), Value::from(4));
    object.insert("revision".to_string(), Value::from(revision));
    let mut serialized = serde_json::to_string_pretty(&value)
        .map_err(|_| storage_error("serialize restored backup"))?;
    serialized.push('\n');
    Ok(serialized)
}

fn write_new_and_flush(path: &Path, contents: &[u8]) -> Result<(), String> {
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(path)
        .map_err(|_| storage_error("open temporary file"))?;
    file.write_all(contents)
        .map_err(|_| storage_error("write temporary file"))?;
    file.flush()
        .map_err(|_| storage_error("flush temporary file"))?;
    file.sync_all()
        .map_err(|_| storage_error("sync temporary file"))?;
    Ok(())
}

fn unique_json_path(directory: &Path, base: &str) -> Result<PathBuf, String> {
    let prefix = format!("{base}-");
    let highest = fs::read_dir(directory)
        .map_err(|_| storage_error("list artifact sequence"))?
        .filter_map(Result::ok)
        .filter_map(|entry| entry.file_name().into_string().ok())
        .filter_map(|name| {
            name.strip_prefix(&prefix)
                .and_then(|rest| rest.strip_suffix(".json"))
                .filter(|sequence| {
                    sequence.len() == 6 && sequence.bytes().all(|byte| byte.is_ascii_digit())
                })
                .and_then(|sequence| sequence.parse::<u32>().ok())
        })
        .max();
    let sequence = highest.map_or(0, |value| value.saturating_add(1));
    if sequence > 999_999 {
        return Err(storage_error("artifact sequence exhausted"));
    }
    Ok(directory.join(format!("{base}-{sequence:06}.json")))
}

fn rotate_named_files(
    directory: &Path,
    predicate: fn(&str) -> bool,
    maximum: usize,
) -> Result<(), String> {
    if !directory.exists() {
        return Ok(());
    }
    let mut files = fs::read_dir(directory)
        .map_err(|_| storage_error("list retained files"))?
        .filter_map(Result::ok)
        .filter(|entry| {
            entry
                .file_type()
                .map(|kind| kind.is_file())
                .unwrap_or(false)
        })
        .filter(|entry| predicate(&entry.file_name().to_string_lossy()))
        .collect::<Vec<_>>();
    files.sort_by_key(|entry| std::cmp::Reverse(entry.file_name()));
    for entry in files.into_iter().skip(maximum) {
        fs::remove_file(entry.path()).map_err(|_| storage_error("rotate retained files"))?;
    }
    Ok(())
}

fn cleanup_backup_temps(directory: &Path) -> Result<(), String> {
    if !directory.exists() {
        return Ok(());
    }
    for entry in fs::read_dir(directory).map_err(|_| storage_error("list backup temps"))? {
        let entry = entry.map_err(|_| storage_error("inspect backup temp"))?;
        let name = entry.file_name().to_string_lossy().to_string();
        if entry
            .file_type()
            .map(|kind| kind.is_file())
            .unwrap_or(false)
            && name.starts_with(".chord_dojo-")
            && name.ends_with(".json.tmp")
        {
            fs::remove_file(entry.path()).map_err(|_| storage_error("remove backup temp"))?;
        }
    }
    Ok(())
}

fn is_backup_name(name: &str) -> bool {
    is_timestamped_json_name(name, "chord_dojo-")
}

fn is_corrupt_name(name: &str) -> bool {
    is_timestamped_json_name(name, "chord-dojo-v1.corrupt-")
}

fn is_timestamped_json_name(name: &str, prefix: &str) -> bool {
    let Some(rest) = name.strip_prefix(prefix) else {
        return false;
    };
    let Some(rest) = rest.strip_suffix(".json") else {
        return false;
    };
    let bytes = rest.as_bytes();
    if bytes.len() != 22 || bytes[15] != b'-' {
        return false;
    }
    bytes[..15]
        .iter()
        .enumerate()
        .all(|(index, byte)| (index == 8 && *byte == b'-') || (index != 8 && byte.is_ascii_digit()))
        && bytes[16..].iter().all(u8::is_ascii_digit)
}

fn validate_timestamp_token(value: &str) -> Result<(), String> {
    let bytes = value.as_bytes();
    if bytes.len() == 15
        && bytes[8] == b'-'
        && bytes
            .iter()
            .enumerate()
            .all(|(index, byte)| index == 8 || byte.is_ascii_digit())
    {
        Ok(())
    } else {
        Err(storage_error("invalid timestamp"))
    }
}

fn backup_timestamp_token(name: &str) -> Result<&str, String> {
    if !is_backup_name(name) {
        return Err(storage_error("validate backup name"));
    }
    Ok(&name["chord_dojo-".len().."chord_dojo-".len() + 15])
}

fn relative_chord_dojo_name(path: &Path) -> Result<String, String> {
    path.file_name()
        .and_then(|name| name.to_str())
        .map(|name| format!("{PRACTICE_DIR}/{THEME_DIR}/{name}"))
        .ok_or_else(|| storage_error("artifact name"))
}

fn remove_file_if_present(path: &Path) -> Result<(), String> {
    match fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(_) => Err(storage_error("remove stale artifact")),
    }
}

fn link_then_remove(source: &Path, destination: &Path) -> std::io::Result<()> {
    fs::hard_link(source, destination)?;
    if let Err(error) = fs::remove_file(source) {
        let _ = fs::remove_file(destination);
        return Err(error);
    }
    Ok(())
}

fn atomic_rename_no_replace(from: &Path, to: &Path) -> Result<(), String> {
    fs::hard_link(from, to).map_err(|_| storage_error("finalize no-overwrite artifact"))?;
    fs::remove_file(from).map_err(|_| storage_error("remove artifact temporary file"))?;
    Ok(())
}

#[cfg(windows)]
struct CrossProcessLock {
    _file: File,
}

#[cfg(windows)]
fn acquire_cross_process_lock(path: &Path) -> Result<CrossProcessLock, String> {
    use std::os::windows::fs::OpenOptionsExt;
    OpenOptions::new()
        .read(true)
        .write(true)
        .create(true)
        .share_mode(0)
        .open(path)
        .map(|file| CrossProcessLock { _file: file })
        .map_err(|_| storage_error("acquire exclusive process lock"))
}

#[cfg(not(windows))]
struct CrossProcessLock {
    file: Option<File>,
    path: PathBuf,
}

#[cfg(not(windows))]
impl Drop for CrossProcessLock {
    fn drop(&mut self) {
        self.file.take();
        let _ = fs::remove_file(&self.path);
    }
}

#[cfg(not(windows))]
fn acquire_cross_process_lock(path: &Path) -> Result<CrossProcessLock, String> {
    fn create(path: &Path) -> std::io::Result<File> {
        OpenOptions::new().write(true).create_new(true).open(path)
    }
    match create(path) {
        Ok(file) => Ok(CrossProcessLock {
            file: Some(file),
            path: path.to_path_buf(),
        }),
        Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {
            let stale = fs::metadata(path)
                .and_then(|metadata| metadata.modified())
                .ok()
                .and_then(|modified| modified.elapsed().ok())
                .is_some_and(|age| age > std::time::Duration::from_secs(30));
            if !stale {
                return Err(storage_error("acquire exclusive process lock"));
            }
            fs::remove_file(path).map_err(|_| storage_error("recover stale process lock"))?;
            create(path)
                .map(|file| CrossProcessLock {
                    file: Some(file),
                    path: path.to_path_buf(),
                })
                .map_err(|_| storage_error("acquire exclusive process lock"))
        }
        Err(_) => Err(storage_error("acquire exclusive process lock")),
    }
}

#[cfg(windows)]
fn atomic_replace(from: &Path, to: &Path) -> Result<(), String> {
    use std::os::windows::ffi::OsStrExt;
    use windows::core::PCWSTR;
    use windows::Win32::Storage::FileSystem::{
        MoveFileExW, MOVEFILE_REPLACE_EXISTING, MOVEFILE_WRITE_THROUGH,
    };

    let mut from_wide: Vec<u16> = from.as_os_str().encode_wide().collect();
    from_wide.push(0);
    let mut to_wide: Vec<u16> = to.as_os_str().encode_wide().collect();
    to_wide.push(0);
    unsafe {
        MoveFileExW(
            PCWSTR(from_wide.as_ptr()),
            PCWSTR(to_wide.as_ptr()),
            MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH,
        )
        .map_err(|_| storage_error("atomic replace"))
    }
}

#[cfg(not(windows))]
fn atomic_replace(from: &Path, to: &Path) -> Result<(), String> {
    fs::rename(from, to).map_err(|_| storage_error("atomic replace"))
}

fn sync_directory(path: &Path) {
    if let Ok(directory) = File::open(path) {
        let _ = directory.sync_all();
    }
}

fn storage_error(operation: &str) -> String {
    format!("ChordDojo storage could not {operation}.")
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{Arc, Barrier};
    use std::time::{SystemTime, UNIX_EPOCH};

    fn test_paths(label: &str) -> ChordDojoPaths {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root = std::env::temp_dir().join(format!(
            "loop-vault-chord_dojo-storage-{label}-{}-{unique}",
            std::process::id()
        ));
        fs::create_dir_all(&root).unwrap();
        paths_from_root(root)
    }

    fn document(revision: u64, marker: &str) -> String {
        format!(
            "{{\"app\":\"loopvault-chord-dojo\",\"fileVersion\":1,\"revision\":{revision},\"marker\":\"{marker}\"}}\n"
        )
    }

    fn cleanup(paths: &ChordDojoPaths) {
        let _ = fs::remove_dir_all(&paths.root);
    }

    #[test]
    fn accepts_only_safe_timestamp_and_artifact_names() {
        assert!(validate_timestamp_token("20260802-123456").is_ok());
        assert!(validate_timestamp_token("../../private").is_err());
        assert!(validate_timestamp_token("C:\\Users\\name").is_err());
        assert!(is_backup_name("chord_dojo-20260802-123456-000000.json"));
        assert!(!is_backup_name("chord_dojo-../../private.json"));
        assert!(is_corrupt_name(
            "chord-dojo-v1.corrupt-20260802-123456-000000.json"
        ));
    }

    #[test]
    fn lists_only_relative_fixed_recovery_artifact_names() {
        let paths = test_paths("recovery-artifacts");
        let valid = "chord-dojo-v1.corrupt-20260802-123456-000000.json";
        write_new_and_flush(&paths.root.join(valid), b"retained").unwrap();
        write_new_and_flush(
            &paths
                .root
                .join("chord-dojo-v1.corrupt-20260802-123456-000001.json.tmp"),
            b"partial",
        )
        .unwrap();
        write_new_and_flush(&paths.root.join("private-name.json"), b"private").unwrap();
        fs::create_dir(
            paths
                .root
                .join("chord-dojo-v1.corrupt-20260802-123456-000002.json"),
        )
        .unwrap();

        assert_eq!(
            list_recovery_artifacts(&paths).unwrap(),
            vec![format!("{PRACTICE_DIR}/{THEME_DIR}/{valid}")]
        );
        cleanup(&paths);
    }

    #[test]
    fn validates_bounded_utf8_envelope_and_revision() {
        assert_eq!(validate_document(&document(7, "ok")).unwrap(), 7);
        assert!(validate_document("{broken").is_err());
        assert!(validate_document("{\"app\":\"vault\",\"fileVersion\":1,\"revision\":1}").is_err());
        assert_eq!(
            validate_document(r#"{"app":"loopvault-chord-dojo","fileVersion":2,"revision":1}"#)
                .unwrap(),
            1
        );
        assert!(validate_document(
            "{\"app\":\"loopvault-chord-dojo\",\"fileVersion\":5,\"revision\":1}"
        )
        .is_err());
    }

    // Frozen test-only model of the public release-v1 reader contract.
    fn validate_with_release_v1_reader(contents: &str) -> Result<(), String> {
        let value: Value = serde_json::from_str(contents).map_err(|_| "release-v1 JSON")?;
        let object = value.as_object().ok_or("release-v1 envelope")?;
        if object.get("app").and_then(Value::as_str) != Some("loopvault-chord-dojo")
            || object.get("fileVersion").and_then(Value::as_u64) != Some(1)
        {
            return Err("release-v1 fileVersion".to_string());
        }
        Ok(())
    }

    #[test]
    fn frozen_release_v1_reader_rejects_v2_without_mutation() {
        let v2 = r#"{"app":"loopvault-chord-dojo","fileVersion":2,"revision":1}"#.to_string() + "\n";
        let unchanged = v2.clone();
        assert!(validate_with_release_v1_reader(&v2).is_err());
        assert_eq!(v2, unchanged);
        assert!(validate_with_release_v1_reader(&document(1, "v1")).is_ok());
    }
    #[test]
    fn cas_rejects_stale_save_and_preserves_committed_document() {
        let paths = test_paths("cas");
        assert_eq!(
            save_document(&paths, &document(1, "one"), "20260802-123456", None).unwrap(),
            1
        );
        assert!(save_document(&paths, &document(2, "stale"), "20260802-123457", None).is_err());
        assert_eq!(
            read_document(&paths.data).unwrap().contents,
            document(1, "one")
        );
        cleanup(&paths);
    }

    #[test]
    fn stale_quarantine_token_cannot_remove_a_new_valid_commit() {
        let paths = test_paths("quarantine-cas");
        write_new_and_flush(&paths.data, b"{broken").unwrap();
        let stale = read_raw_document_if_present(&paths.data).unwrap().unwrap();
        assert_eq!(stale.revision, 0);
        save_document_with_token(
            &paths,
            &document(1, "new-valid"),
            "20260802-123456",
            Some(0),
            Some(&stale.token),
        )
        .unwrap();

        assert!(quarantine_document(&paths, "20260802-123457", &stale.token).is_err());
        assert_eq!(
            read_document(&paths.data).unwrap().contents,
            document(1, "new-valid")
        );
        cleanup(&paths);
    }

    #[test]
    fn precommit_failures_preserve_canonical_and_remove_partial_artifacts() {
        for fault in [
            SaveFault::TempWrite,
            SaveFault::BackupCreate,
            SaveFault::AtomicReplace,
        ] {
            let paths = test_paths("precommit-fault");
            save_document(&paths, &document(1, "last-good"), "20260802-123456", None).unwrap();
            assert!(save_document_with_fault(
                &paths,
                &document(2, "new"),
                "20260802-123457",
                Some(1),
                fault,
            )
            .is_err());
            assert_eq!(
                read_document(&paths.data).unwrap().contents,
                document(1, "last-good")
            );
            assert!(!paths.temp.exists());
            assert!(!paths.marker.exists());
            assert!(!paths.marker_temp.exists());
            assert!(list_valid_backups(&paths).unwrap().is_empty());
            cleanup(&paths);
        }
    }

    #[test]
    fn postcommit_cleanup_failure_returns_success_and_next_load_cleans_marker() {
        let paths = test_paths("postcommit-cleanup");
        save_document(&paths, &document(1, "last-good"), "20260802-123456", None).unwrap();
        assert_eq!(
            save_document_with_fault(
                &paths,
                &document(2, "committed"),
                "20260802-123457",
                Some(1),
                SaveFault::PostCommitCleanup,
            )
            .unwrap(),
            2
        );
        assert_eq!(
            read_document(&paths.data).unwrap().contents,
            document(2, "committed")
        );
        assert!(paths.marker.exists());

        recover_interrupted_replace(&paths).unwrap();
        assert_eq!(read_document(&paths.data).unwrap().revision, 2);
        assert!(!paths.marker.exists());
        assert!(!paths.temp.exists());
        cleanup(&paths);
    }

    #[test]
    fn independent_instances_with_the_same_expected_revision_allow_exactly_one_commit() {
        let paths = test_paths("cross-process-cas");
        save_document(&paths, &document(1, "initial"), "20260802-123456", None).unwrap();
        let expected_token = Arc::new(read_document(&paths.data).unwrap().token);
        let barrier = Arc::new(Barrier::new(2));
        let handles = ["left", "right"].map(|marker| {
            let instance_paths = paths.clone();
            let instance_barrier = Arc::clone(&barrier);
            let instance_token = Arc::clone(&expected_token);
            std::thread::spawn(move || {
                instance_barrier.wait();
                save_document_with_token(
                    &instance_paths,
                    &document(2, marker),
                    "20260802-123457",
                    Some(1),
                    Some(instance_token.as_str()),
                )
            })
        });
        let results = handles.map(|handle| handle.join().unwrap());
        assert_eq!(results.iter().filter(|result| result.is_ok()).count(), 1);
        assert_eq!(results.iter().filter(|result| result.is_err()).count(), 1);
        assert_eq!(read_document(&paths.data).unwrap().revision, 2);
        cleanup(&paths);
    }

    #[test]
    fn same_second_backups_are_unique_valid_and_bounded() {
        let paths = test_paths("backups");
        save_document(&paths, &document(1, "0"), "20260802-123456", None).unwrap();
        for revision in 2..=24 {
            save_document(
                &paths,
                &document(revision, &revision.to_string()),
                "20260802-123456",
                Some(revision - 1),
            )
            .unwrap();
        }
        let backups = list_valid_backups(&paths).unwrap();
        assert_eq!(backups.len(), MAX_BACKUPS);
        assert_eq!(backups[0].name, "chord_dojo-20260802-123456-000022.json");
        assert_eq!(backups[0].revision, 23);
        cleanup(&paths);
    }

    #[test]
    fn rollback_marker_recovers_missing_canonical_file() {
        let paths = test_paths("rollback");
        save_document(&paths, &document(1, "last-good"), "20260802-123456", None).unwrap();
        save_document(&paths, &document(2, "new"), "20260802-123457", Some(1)).unwrap();
        let backup_name = list_valid_backups(&paths).unwrap()[0].name.clone();
        write_marker(&paths, &backup_name).unwrap();
        fs::remove_file(&paths.data).unwrap();
        fs::write(&paths.temp, b"partial").unwrap();

        recover_interrupted_replace(&paths).unwrap();

        assert_eq!(read_document(&paths.data).unwrap().revision, 1);
        assert!(!paths.marker.exists());
        assert!(!paths.temp.exists());
        cleanup(&paths);
    }

    #[test]
    fn selected_valid_backup_restores_as_next_revision() {
        let paths = test_paths("restore");
        save_document(&paths, &document(1, "one"), "20260802-123456", None).unwrap();
        save_document(&paths, &document(2, "two"), "20260802-123457", Some(1)).unwrap();
        let backup = list_valid_backups(&paths).unwrap().remove(0);
        let selected = read_document(&paths.backups.join(&backup.name)).unwrap();
        let restored = with_current_version_and_revision(&selected.contents, 3).unwrap();
        assert_eq!(
            save_document(
                &paths,
                &restored,
                backup_timestamp_token(&backup.name).unwrap(),
                Some(2)
            )
            .unwrap(),
            3
        );
        let persisted = read_document(&paths.data).unwrap();
        let value: Value = serde_json::from_str(&persisted.contents).unwrap();
        assert_eq!(value.get("fileVersion").and_then(Value::as_u64), Some(4));
        assert_eq!(value.get("revision").and_then(Value::as_u64), Some(3));
        assert_eq!(value.get("marker").and_then(Value::as_str), Some("one"));
        cleanup(&paths);
    }
    #[test]
    fn theme_namespace_preserves_legacy_bytes_and_backups() {
        let legacy=test_paths("theme-isolation");
        save_document(&legacy,&document(1,"legacy"),"20260802-123456",None).unwrap();
        let before=fs::read(&legacy.data).unwrap();
        let theme=theme_paths_from_root(legacy.root.clone());
        assert_ne!(theme.data,legacy.data);
        save_document(&theme,&with_current_version_and_revision(&document(1,"theme"),1).unwrap(),"20260802-123456",None).unwrap();
        save_document(&legacy,&document(2,"old-exe"),"20260802-123457",Some(1)).unwrap();
        assert!(read_document(&theme.data).unwrap().contents.contains("theme"));
        assert_eq!(fs::read(legacy.backups.join(list_valid_backups(&legacy).unwrap()[0].name.clone())).unwrap(),before);
        cleanup(&legacy);
    }

    #[test]
    fn previous_theme_import_preserves_v3_v4_bytes_markers_and_backups() {
        for version in [3,4] {
            let base=test_paths("previous-theme-import");
            let previous=paths_from_root(base.root.join("theme-lessons"));
            fs::create_dir_all(&previous.backups).unwrap();
            let original=format!("{{\"app\":\"loopvault-chord-dojo\",\"fileVersion\":{version},\"revision\":2,\"marker\":\"retained-history\"}}\n");
            fs::write(&previous.data,&original).unwrap();
            let name="chord_dojo-20261005-000001-000000.json";
            fs::write(previous.backups.join(name),document(1,"retained-backup")).unwrap();
            fs::write(&previous.marker,format!("{name}\n")).unwrap();
            let imported=read_previous_theme_from_root(&base.root).unwrap().unwrap();
            assert_eq!(imported.contents,original);
            assert_eq!(fs::read_to_string(&previous.data).unwrap(),original);
            assert_eq!(fs::read_to_string(&previous.marker).unwrap(),format!("{name}\n"));
            assert_eq!(fs::read_to_string(previous.backups.join(name)).unwrap(),document(1,"retained-backup"));
            let current=theme_paths_from_root(base.root.clone());
            save_document(&current,&with_current_version_and_revision(&imported.contents,1).unwrap(),"20261005-000002",None).unwrap();
            assert_eq!(fs::read_to_string(&previous.data).unwrap(),original);
            assert!(read_document(&current.data).unwrap().contents.contains("retained-history"));
            cleanup(&base);
        }
    }

    #[test]
    fn previous_theme_incomplete_damaged_or_future_import_never_initializes_blank() {
        let base=test_paths("previous-theme-invalid");
        let previous=paths_from_root(base.root.join("theme-lessons"));
        assert!(read_previous_theme_from_root(&base.root).unwrap().is_none());
        fs::create_dir_all(&previous.backups).unwrap();
        let backup=previous.backups.join("chord_dojo-20261005-000001-000000.json");
        fs::write(&backup,"damaged backup").unwrap();
        assert!(read_previous_theme_from_root(&base.root).is_err());
        for bytes in ["{broken",r#"{"app":"loopvault-chord-dojo","fileVersion":5,"revision":2}"#] {
            fs::write(&previous.data,bytes).unwrap();
            assert!(read_previous_theme_from_root(&base.root).is_err());
            assert_eq!(fs::read_to_string(&previous.data).unwrap(),bytes);
            assert_eq!(fs::read_to_string(&backup).unwrap(),"damaged backup");
        }
        assert!(!theme_paths_from_root(base.root.clone()).data.exists());
        cleanup(&base);
    }

    // Frozen recovery decision of source 776b656a: version 4 is invalid before frontend guards.
    fn previous_v3_recovery(paths:&ChordDojoPaths) {
        let old_valid=|contents:&str|serde_json::from_str::<Value>(contents).ok().is_some_and(|v|v.get("app").and_then(Value::as_str)==Some("loopvault-chord-dojo") && v.get("fileVersion").and_then(Value::as_u64).is_some_and(|version|(1..=3).contains(&version)));
        if paths.marker.exists() {
            let name=fs::read_to_string(&paths.marker).unwrap();
            if !fs::read_to_string(&paths.data).ok().is_some_and(|bytes|old_valid(&bytes)) {
                let backup=fs::read_to_string(paths.backups.join(name.trim())).unwrap();
                assert!(old_valid(&backup));
                fs::write(&paths.temp,backup).unwrap();
                atomic_replace(&paths.temp,&paths.data).unwrap();
            }
            fs::remove_file(&paths.marker).unwrap();
        }
    }

    #[test]
    fn old_v3_rollback_cannot_touch_isolated_v4_data_marker_or_backup() {
        let base=test_paths("v3-recovery-isolation");
        let previous=paths_from_root(base.root.join("theme-lessons"));
        fs::create_dir_all(&previous.backups).unwrap();
        let old=document(1,"old-v3").replace("\"fileVersion\":1","\"fileVersion\":3");
        let committed=document(2,"new-v4-progress").replace("\"fileVersion\":1","\"fileVersion\":4");
        let name="chord_dojo-20261005-000001-000000.json";
        fs::write(&previous.data,&committed).unwrap();
        fs::write(previous.backups.join(name),&old).unwrap();
        fs::write(&previous.marker,format!("{name}\n")).unwrap();
        let imported=read_previous_theme_from_root(&base.root).unwrap().unwrap();
        let current=theme_paths_from_root(base.root.clone());
        assert_eq!(current.root,base.root.join(THEME_DIR));
        save_document(&current,&with_current_version_and_revision(&imported.contents,1).unwrap(),"20261005-000002",None).unwrap();
        save_document_with_fault(&current,&with_current_version_and_revision(&committed,2).unwrap(),"20261005-000003",Some(1),SaveFault::PostCommitCleanup).unwrap();
        let new_data=fs::read(&current.data).unwrap();let new_marker=fs::read(&current.marker).unwrap();
        let new_backup=current.backups.join(list_valid_backups(&current).unwrap()[0].name.clone());let backup_bytes=fs::read(&new_backup).unwrap();
        previous_v3_recovery(&previous);
        assert_eq!(fs::read_to_string(&previous.data).unwrap(),old); // old historical scope may still roll back
        assert_eq!(fs::read(&current.data).unwrap(),new_data);
        assert_eq!(fs::read(&current.marker).unwrap(),new_marker);
        assert_eq!(fs::read(&new_backup).unwrap(),backup_bytes);
        recover_interrupted_replace(&current).unwrap();
        assert_eq!(fs::read(&current.data).unwrap(),new_data);
        cleanup(&base);
    }

    #[test]
    fn future_committed_version_with_marker_is_refused_before_any_cleanup() {
        let paths=test_paths("future-marker");
        fs::create_dir_all(&paths.backups).unwrap();
        let future=r#"{"app":"loopvault-chord-dojo","fileVersion":5,"revision":2}"#;
        fs::write(&paths.data,future).unwrap();
        let name="chord_dojo-20261005-000001-000000.json";
        fs::write(paths.backups.join(name),document(1,"backup")).unwrap();
        fs::write(&paths.marker,format!("{name}\n")).unwrap();
        fs::write(&paths.marker_temp,"retained marker temp").unwrap();fs::write(&paths.temp,"retained data temp").unwrap();
        assert!(recover_interrupted_replace(&paths).is_err());
        assert_eq!(fs::read_to_string(&paths.data).unwrap(),future);
        assert_eq!(fs::read_to_string(&paths.marker).unwrap(),format!("{name}\n"));
        assert_eq!(fs::read_to_string(&paths.marker_temp).unwrap(),"retained marker temp");
        assert_eq!(fs::read_to_string(&paths.temp).unwrap(),"retained data temp");
        assert_eq!(fs::read_to_string(paths.backups.join(name)).unwrap(),document(1,"backup"));
        cleanup(&paths);
    }

    #[test]
    fn range_namespace_imports_v4_read_only_and_isolates_old_rollback() {
        let base=test_paths("range-v4-import-isolation");
        let old=paths_from_root(base.root.join("theme-lessons-v4"));
        fs::create_dir_all(&old.backups).unwrap();
        let original=document(2,"original-master-history").replace("\"fileVersion\":1","\"fileVersion\":4");
        let backup=document(1,"old-backup").replace("\"fileVersion\":1","\"fileVersion\":4");
        let name="chord_dojo-20261006-000001-000000.json";
        fs::write(&old.data,&original).unwrap();fs::write(old.backups.join(name),&backup).unwrap();fs::write(&old.marker,format!("{name}\n")).unwrap();
        let imported=read_previous_theme_from_root(&base.root).unwrap().unwrap();
        assert_eq!(imported.contents,original);assert_eq!(fs::read_to_string(&old.data).unwrap(),original);assert_eq!(fs::read_to_string(&old.marker).unwrap(),format!("{name}\n"));
        let current=theme_paths_from_root(base.root.clone());
        assert_eq!(current.root,base.root.join("theme-lessons-txt-jazz-v4"));
        save_document(&current,&with_current_version_and_revision(&imported.contents,1).unwrap(),"20261006-000002",None).unwrap();
        let mut new:Value=serde_json::from_str(&with_current_version_and_revision(&original,2).unwrap()).unwrap();
        new["master251"]=serde_json::json!({"version":1,"selectedRange":"octave-down","cells":{},"octaveDown":{"version":1,"cells":{}}});
        save_document_with_fault(&current,&serde_json::to_string(&new).unwrap(),"20261006-000003",Some(1),SaveFault::PostCommitCleanup).unwrap();
        let new_data=fs::read(&current.data).unwrap();let new_marker=fs::read(&current.marker).unwrap();let new_backup=current.backups.join(list_valid_backups(&current).unwrap()[0].name.clone());let new_backup_bytes=fs::read(&new_backup).unwrap();
        recover_interrupted_replace(&old).unwrap();
        assert_eq!(fs::read_to_string(&old.data).unwrap(),original);
        // An old frontend may restore its backup after rejecting unknown range fields.
        save_document(&old,&with_current_version_and_revision(&backup,3).unwrap(),"20261006-000004",Some(2)).unwrap();
        assert!(fs::read_to_string(&old.data).unwrap().contains("old-backup"));
        assert_eq!(fs::read(&current.data).unwrap(),new_data);assert_eq!(fs::read(&current.marker).unwrap(),new_marker);assert_eq!(fs::read(&new_backup).unwrap(),new_backup_bytes);
        cleanup(&base);
    }

    #[test]
    fn range_import_v4_requires_valid_committed_bytes_before_older_theme() {
        let base=test_paths("range-v4-invalid");let old=paths_from_root(base.root.join("theme-lessons-v4"));let earlier=paths_from_root(base.root.join("theme-lessons"));
        fs::create_dir_all(&old.backups).unwrap();fs::create_dir_all(&earlier.root).unwrap();fs::write(&earlier.data,document(1,"older")).unwrap();fs::write(&old.temp,"interrupted").unwrap();
        assert!(read_previous_theme_from_root(&base.root).is_err());
        for bytes in ["{broken",r#"{"app":"loopvault-chord-dojo","fileVersion":5,"revision":2}"#] {fs::write(&old.data,bytes).unwrap();assert!(read_previous_theme_from_root(&base.root).is_err());assert_eq!(fs::read_to_string(&old.data).unwrap(),bytes);}
        assert!(!theme_paths_from_root(base.root.clone()).data.exists());cleanup(&base);
    }

    #[test]
    fn jazz_namespace_imports_range_bytes_read_only_and_survives_old_save_and_rollback() {
        let base=test_paths("jazz-range-isolation");
        let old=paths_from_root(base.root.join("theme-lessons-ranges-v4"));
        let earlier=paths_from_root(base.root.join("theme-lessons-v4"));
        fs::create_dir_all(&old.backups).unwrap();fs::create_dir_all(&earlier.root).unwrap();
        let original=with_current_version_and_revision(&document(1,"range-original"),2).unwrap();
        let backup=with_current_version_and_revision(&document(1,"range-backup"),1).unwrap();
        let name="chord_dojo-20261011-120000-000000.json";
        fs::write(&old.data,&original).unwrap();fs::write(old.backups.join(name),&backup).unwrap();
        fs::write(&old.marker,format!("{name}\n")).unwrap();fs::write(&old.temp,"retained old interrupted bytes").unwrap();
        fs::write(&earlier.data,document(1,"earlier must not win")).unwrap();
        let imported=read_previous_theme_from_root(&base.root).unwrap().unwrap();
        assert_eq!(imported.contents,original);
        assert_eq!(fs::read_to_string(&old.data).unwrap(),original);
        assert_eq!(fs::read_to_string(&old.temp).unwrap(),"retained old interrupted bytes");
        assert_eq!(fs::read_to_string(&old.marker).unwrap(),format!("{name}\n"));
        assert_eq!(fs::read_to_string(old.backups.join(name)).unwrap(),backup);
        let current=theme_paths_from_root(base.root.clone());
        assert_ne!(current.root,old.root);
        save_document(&current,&with_current_version_and_revision(&imported.contents,1).unwrap(),"20261011-120001",None).unwrap();
        let mut jazz:Value=serde_json::from_str(&with_current_version_and_revision(&original,2).unwrap()).unwrap();
        jazz["syntheticChord"]=serde_json::json!({"root":7,"quality":"dom7","tensions":[],"altered":true,"label":"G7alt"});
        save_document(&current,&serde_json::to_string(&jazz).unwrap(),"20261011-120002",Some(1)).unwrap();
        let current_bytes=fs::read(&current.data).unwrap();
        let new_backup=current.backups.join(list_valid_backups(&current).unwrap()[0].name.clone());
        let new_backup_bytes=fs::read(&new_backup).unwrap();
        recover_interrupted_replace(&old).unwrap();
        save_document(&old,&with_current_version_and_revision(&backup,3).unwrap(),"20261011-120003",Some(2)).unwrap();
        assert_eq!(fs::read(&current.data).unwrap(),current_bytes);
        assert_eq!(fs::read(&new_backup).unwrap(),new_backup_bytes);
        assert_eq!(read_previous_theme_from_root(&base.root).unwrap().unwrap().contents,fs::read_to_string(&old.data).unwrap());
        cleanup(&base);
    }

    #[test]
    fn jazz_incomplete_namespace_refuses_empty_fallback_and_preserves_artifacts() {
        let base=test_paths("jazz-incomplete");let current=theme_paths_from_root(base.root.clone());
        fs::create_dir_all(&current.backups).unwrap();
        fs::write(&current.temp,"retained interrupted new bytes").unwrap();
        assert!(refuse_incomplete_jazz_namespace(&current).is_err());
        assert_eq!(fs::read_to_string(&current.temp).unwrap(),"retained interrupted new bytes");
        assert!(!current.data.exists());
        fs::write(current.backups.join("chord_dojo-20261011-120000-000000.json"),"invalid backup bytes").unwrap();
        assert!(refuse_incomplete_jazz_namespace(&current).is_err());
        fs::write(current.backups.join("chord_dojo-20261011-120001-000000.json"),with_current_version_and_revision(&document(1,"validated new backup"),1).unwrap()).unwrap();
        assert!(refuse_incomplete_jazz_namespace(&current).is_ok());
        assert_eq!(fs::read_to_string(&current.temp).unwrap(),"retained interrupted new bytes");
        cleanup(&base);
    }

    #[test]
    fn jazz_import_refuses_invalid_or_future_range_before_earlier_theme() {
        let base=test_paths("jazz-range-invalid");let old=paths_from_root(base.root.join("theme-lessons-ranges-v4"));let earlier=paths_from_root(base.root.join("theme-lessons-v4"));
        fs::create_dir_all(&old.backups).unwrap();fs::create_dir_all(&earlier.root).unwrap();
        fs::write(&earlier.data,document(1,"earlier valid data")).unwrap();fs::write(&old.temp,"retained interrupted old bytes").unwrap();
        assert!(read_previous_theme_from_root(&base.root).is_err());
        for raw in ["{damaged",r#"{"app":"loopvault-chord-dojo","fileVersion":99,"revision":1}"#] {
            fs::write(&old.data,raw).unwrap();assert!(read_previous_theme_from_root(&base.root).is_err());assert_eq!(fs::read_to_string(&old.data).unwrap(),raw);
        }
        assert_eq!(fs::read_to_string(&old.temp).unwrap(),"retained interrupted old bytes");
        assert!(!theme_paths_from_root(base.root.clone()).data.exists());cleanup(&base);
    }

}

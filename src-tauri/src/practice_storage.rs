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
const PRACTICE_FILE: &str = "practice-v1.json";
const PRACTICE_TEMP: &str = "practice-v1.json.tmp";
const ROLLBACK_MARKER: &str = "practice-v1.rollback";
const ROLLBACK_MARKER_TEMP: &str = "practice-v1.rollback.tmp";
const PROCESS_LOCK: &str = "practice-v1.lock";
const BACKUP_DIR: &str = "practice-backups";
const MAX_BACKUPS: usize = 20;
const MAX_CORRUPT_FILES: usize = 20;
const MAX_PRACTICE_BYTES: u64 = 16 * 1024 * 1024;

#[derive(Default)]
pub struct PracticeStorageState(Mutex<()>);

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PracticeStoredDocument {
    contents: String,
    revision: u64,
    token: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PracticeBackupMetadata {
    name: String,
    revision: u64,
    token: String,
}

#[tauri::command]
pub fn load_practice_file(
    app: AppHandle,
    state: State<'_, PracticeStorageState>,
) -> Result<Option<PracticeStoredDocument>, String> {
    let _guard = state.0.lock().map_err(|_| storage_error("lock"))?;
    let paths = practice_paths(&app)?;
    fs::create_dir_all(&paths.root).map_err(|_| storage_error("create directory"))?;
    let _process_lock = acquire_cross_process_lock(&paths.lock)?;
    recover_interrupted_replace(&paths)?;
    read_raw_document_if_present(&paths.data)
}

#[tauri::command]
pub fn save_practice_file(
    app: AppHandle,
    state: State<'_, PracticeStorageState>,
    contents: String,
    timestamp_token: String,
    expected_revision: Option<u64>,
    expected_token: Option<String>,
) -> Result<u64, String> {
    validate_timestamp_token(&timestamp_token)?;
    let _guard = state.0.lock().map_err(|_| storage_error("lock"))?;
    let paths = practice_paths(&app)?;
    save_document_with_token(
        &paths,
        &contents,
        &timestamp_token,
        expected_revision,
        expected_token.as_deref(),
    )
}

#[tauri::command]
pub fn quarantine_practice_file(
    app: AppHandle,
    state: State<'_, PracticeStorageState>,
    timestamp_token: String,
    expected_token: String,
) -> Result<String, String> {
    validate_timestamp_token(&timestamp_token)?;
    let _guard = state.0.lock().map_err(|_| storage_error("lock"))?;
    let paths = practice_paths(&app)?;
    quarantine_document(&paths, &timestamp_token, &expected_token)
}

#[tauri::command]
pub fn list_practice_recovery_artifacts(
    app: AppHandle,
    state: State<'_, PracticeStorageState>,
) -> Result<Vec<String>, String> {
    let _guard = state.0.lock().map_err(|_| storage_error("lock"))?;
    let paths = practice_paths(&app)?;
    fs::create_dir_all(&paths.root).map_err(|_| storage_error("create directory"))?;
    let _process_lock = acquire_cross_process_lock(&paths.lock)?;
    list_recovery_artifacts(&paths)
}

fn quarantine_document(
    paths: &PracticePaths,
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
    let base = format!("practice-v1.corrupt-{timestamp_token}");
    let destination = unique_json_path(&paths.root, &base)?;
    link_then_remove(&paths.data, &destination).map_err(|_| storage_error("quarantine"))?;
    sync_directory(&paths.root);
    relative_practice_name(&destination)
}

fn list_recovery_artifacts(paths: &PracticePaths) -> Result<Vec<String>, String> {
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
            artifacts.push(format!("{PRACTICE_DIR}/{name}"));
        }
    }
    artifacts.sort_unstable_by(|left, right| right.cmp(left));
    Ok(artifacts)
}

#[tauri::command]
pub fn list_practice_backups(
    app: AppHandle,
    state: State<'_, PracticeStorageState>,
) -> Result<Vec<PracticeBackupMetadata>, String> {
    let _guard = state.0.lock().map_err(|_| storage_error("lock"))?;
    let paths = practice_paths(&app)?;
    list_valid_backups(&paths)
}

#[tauri::command]
pub fn read_practice_backup(
    app: AppHandle,
    state: State<'_, PracticeStorageState>,
    name: String,
) -> Result<PracticeStoredDocument, String> {
    let _guard = state.0.lock().map_err(|_| storage_error("lock"))?;
    if !is_backup_name(&name) {
        return Err(storage_error("validate backup name"));
    }
    let paths = practice_paths(&app)?;
    read_document(&paths.backups.join(name)).map_err(|_| storage_error("validate backup"))
}

#[tauri::command]
pub fn restore_practice_backup(
    app: AppHandle,
    state: State<'_, PracticeStorageState>,
    name: String,
    backup_token: String,
    expected_revision: Option<u64>,
    expected_token: Option<String>,
) -> Result<PracticeStoredDocument, String> {
    let _guard = state.0.lock().map_err(|_| storage_error("lock"))?;
    let paths = practice_paths(&app)?;
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
    let restored_contents = with_revision(&backup.contents, next_revision)?;
    let timestamp_token = backup_timestamp_token(&name)?;
    let revision = save_document_unlocked(
        &paths,
        &restored_contents,
        timestamp_token,
        expected_revision,
        expected_token.as_deref(),
    )?;
    let token = content_token(&restored_contents);
    Ok(PracticeStoredDocument {
        contents: restored_contents,
        revision,
        token,
    })
}

#[derive(Clone)]
struct PracticePaths {
    root: PathBuf,
    data: PathBuf,
    temp: PathBuf,
    marker: PathBuf,
    marker_temp: PathBuf,
    lock: PathBuf,
    backups: PathBuf,
}

fn practice_paths(app: &AppHandle) -> Result<PracticePaths, String> {
    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|_| storage_error("resolve AppData"))?;
    Ok(paths_from_root(app_data.join(PRACTICE_DIR)))
}

fn paths_from_root(root: PathBuf) -> PracticePaths {
    PracticePaths {
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
    paths: &PracticePaths,
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
    paths: &PracticePaths,
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
    paths: &PracticePaths,
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
    paths: &PracticePaths,
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

fn best_effort_post_commit_cleanup(paths: &PracticePaths) {
    if remove_file_if_present(&paths.marker).is_err()
        || remove_file_if_present(&paths.marker_temp).is_err()
    {
        eprintln!("Practice storage post-commit cleanup was deferred until the next load.");
    }
}

#[cfg(test)]
fn save_document_with_fault(
    paths: &PracticePaths,
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

fn recover_interrupted_replace(paths: &PracticePaths) -> Result<(), String> {
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
    paths: &PracticePaths,
    timestamp_token: &str,
    contents: &[u8],
) -> Result<String, String> {
    let destination = unique_json_path(&paths.backups, &format!("practice-{timestamp_token}"))?;
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

fn write_marker(paths: &PracticePaths, backup_name: &str) -> Result<(), String> {
    remove_file_if_present(&paths.marker_temp)?;
    write_new_and_flush(&paths.marker_temp, format!("{backup_name}\n").as_bytes())?;
    atomic_replace(&paths.marker_temp, &paths.marker)?;
    sync_directory(&paths.root);
    Ok(())
}

fn list_valid_backups(paths: &PracticePaths) -> Result<Vec<PracticeBackupMetadata>, String> {
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
            result.push(PracticeBackupMetadata {
                name,
                revision: document.revision,
                token: document.token,
            });
        }
    }
    Ok(result)
}

fn read_document_if_present(path: &Path) -> Result<Option<PracticeStoredDocument>, String> {
    if !path.exists() {
        return Ok(None);
    }
    read_document(path).map(Some)
}

fn read_raw_document_if_present(path: &Path) -> Result<Option<PracticeStoredDocument>, String> {
    if !path.exists() {
        return Ok(None);
    }
    let contents = read_bounded_utf8(path, MAX_PRACTICE_BYTES)?;
    let revision = validate_document(&contents).unwrap_or(0);
    let token = content_token(&contents);
    Ok(Some(PracticeStoredDocument {
        contents,
        revision,
        token,
    }))
}

fn read_document(path: &Path) -> Result<PracticeStoredDocument, String> {
    let contents = read_bounded_utf8(path, MAX_PRACTICE_BYTES)?;
    let revision = validate_document(&contents)?;
    let token = content_token(&contents);
    Ok(PracticeStoredDocument {
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
    if object.get("app").and_then(Value::as_str) != Some("loopvault-practice") {
        return Err(storage_error("validate app marker"));
    }
    if object.get("fileVersion").and_then(Value::as_u64) != Some(1) {
        return Err(storage_error("validate fileVersion"));
    }
    object
        .get("revision")
        .and_then(Value::as_u64)
        .ok_or_else(|| storage_error("validate revision"))
}

fn with_revision(contents: &str, revision: u64) -> Result<String, String> {
    let mut value: Value =
        serde_json::from_str(contents).map_err(|_| storage_error("parse backup"))?;
    value
        .as_object_mut()
        .ok_or_else(|| storage_error("validate backup envelope"))?
        .insert("revision".to_string(), Value::from(revision));
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
            && name.starts_with(".practice-")
            && name.ends_with(".json.tmp")
        {
            fs::remove_file(entry.path()).map_err(|_| storage_error("remove backup temp"))?;
        }
    }
    Ok(())
}

fn is_backup_name(name: &str) -> bool {
    is_timestamped_json_name(name, "practice-")
}

fn is_corrupt_name(name: &str) -> bool {
    is_timestamped_json_name(name, "practice-v1.corrupt-")
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
    Ok(&name["practice-".len().."practice-".len() + 15])
}

fn relative_practice_name(path: &Path) -> Result<String, String> {
    path.file_name()
        .and_then(|name| name.to_str())
        .map(|name| format!("{PRACTICE_DIR}/{name}"))
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
    format!("Practice storage could not {operation}.")
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{Arc, Barrier};
    use std::time::{SystemTime, UNIX_EPOCH};

    fn test_paths(label: &str) -> PracticePaths {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root = std::env::temp_dir().join(format!(
            "loop-vault-practice-storage-{label}-{}-{unique}",
            std::process::id()
        ));
        fs::create_dir_all(&root).unwrap();
        paths_from_root(root)
    }

    fn document(revision: u64, marker: &str) -> String {
        format!(
            "{{\"app\":\"loopvault-practice\",\"fileVersion\":1,\"revision\":{revision},\"marker\":\"{marker}\"}}\n"
        )
    }

    fn cleanup(paths: &PracticePaths) {
        let _ = fs::remove_dir_all(&paths.root);
    }

    #[test]
    fn accepts_only_safe_timestamp_and_artifact_names() {
        assert!(validate_timestamp_token("20260802-123456").is_ok());
        assert!(validate_timestamp_token("../../private").is_err());
        assert!(validate_timestamp_token("C:\\Users\\name").is_err());
        assert!(is_backup_name("practice-20260802-123456-000000.json"));
        assert!(!is_backup_name("practice-../../private.json"));
        assert!(is_corrupt_name(
            "practice-v1.corrupt-20260802-123456-000000.json"
        ));
    }

    #[test]
    fn lists_only_relative_fixed_recovery_artifact_names() {
        let paths = test_paths("recovery-artifacts");
        let valid = "practice-v1.corrupt-20260802-123456-000000.json";
        write_new_and_flush(&paths.root.join(valid), b"retained").unwrap();
        write_new_and_flush(
            &paths
                .root
                .join("practice-v1.corrupt-20260802-123456-000001.json.tmp"),
            b"partial",
        )
        .unwrap();
        write_new_and_flush(&paths.root.join("private-name.json"), b"private").unwrap();
        fs::create_dir(
            paths
                .root
                .join("practice-v1.corrupt-20260802-123456-000002.json"),
        )
        .unwrap();

        assert_eq!(
            list_recovery_artifacts(&paths).unwrap(),
            vec![format!("{PRACTICE_DIR}/{valid}")]
        );
        cleanup(&paths);
    }

    #[test]
    fn validates_bounded_utf8_envelope_and_revision() {
        assert_eq!(validate_document(&document(7, "ok")).unwrap(), 7);
        assert!(validate_document("{broken").is_err());
        assert!(validate_document("{\"app\":\"vault\",\"fileVersion\":1,\"revision\":1}").is_err());
        assert!(validate_document(
            "{\"app\":\"loopvault-practice\",\"fileVersion\":2,\"revision\":1}"
        )
        .is_err());
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
        assert_eq!(backups[0].name, "practice-20260802-123456-000022.json");
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
        let restored = with_revision(&selected.contents, 3).unwrap();
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
        assert!(read_document(&paths.data)
            .unwrap()
            .contents
            .contains("\"marker\": \"one\""));
        cleanup(&paths);
    }
}

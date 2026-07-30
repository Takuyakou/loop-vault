use serde::Serialize;
use sha2::{Digest, Sha256};
use std::{
    collections::HashMap,
    fs::{self, File, OpenOptions},
    io::{Read, Write},
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicU64, Ordering},
        Mutex,
    },
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tauri::Manager;

const MIDI_EXPORT_CACHE_DIR: &str = "midi-export";
const MIDI_EXPORT_TTL: Duration = Duration::from_secs(24 * 60 * 60);

#[derive(Default)]
pub struct MidiExportState {
    artifacts: Mutex<HashMap<String, PreparedMidiArtifact>>,
    next_id: AtomicU64,
}

#[derive(Clone)]
struct PreparedMidiArtifact {
    drag_token: String,
    file_name: String,
    temp_path: PathBuf,
    bytes_length: usize,
    prepared_at: u64,
    expires_at: u64,
    content_hash: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedMidiFileDto {
    bytes_length: usize,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PreparedMidiArtifactDto {
    drag_token: String,
    file_name: String,
    temp_path: String,
    bytes_length: usize,
    prepared_at: u64,
    expires_at: u64,
    content_hash: String,
    reused: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CleanupMidiExportsDto {
    removed: usize,
    skipped: usize,
}

#[tauri::command]
pub fn save_progression_midi(
    file_path: String,
    bytes: Vec<u8>,
) -> Result<SavedMidiFileDto, String> {
    validate_midi_bytes(&bytes)?;
    let path = normalized_save_path(PathBuf::from(file_path))?;
    atomic_write(&path, &bytes)?;
    Ok(SavedMidiFileDto {
        bytes_length: bytes.len(),
    })
}

#[tauri::command]
pub fn prepare_progression_midi_drag(
    app: tauri::AppHandle,
    state: tauri::State<'_, MidiExportState>,
    file_name: String,
    bytes: Vec<u8>,
) -> Result<PreparedMidiArtifactDto, String> {
    validate_midi_bytes(&bytes)?;
    let cache_dir = midi_export_cache_dir(&app)?;
    fs::create_dir_all(&cache_dir).map_err(safe_io_error)?;
    let content_hash = sha256_hex(&bytes);
    let temp_path = cache_dir.join(format!("{content_hash}.mid"));
    let reused = reusable_cache_file(&temp_path, &bytes);
    if !reused {
        atomic_write(&temp_path, &bytes)?;
    }

    let prepared_at = unix_seconds();
    let expires_at = prepared_at + MIDI_EXPORT_TTL.as_secs();
    let drag_token = format!(
        "progression-midi-{}-{}",
        prepared_at,
        state.next_id.fetch_add(1, Ordering::Relaxed)
    );
    let artifact = PreparedMidiArtifact {
        drag_token: drag_token.clone(),
        file_name: sanitize_midi_file_name(&file_name),
        temp_path,
        bytes_length: bytes.len(),
        prepared_at,
        expires_at,
        content_hash,
    };
    let dto = artifact.to_dto(reused);
    state
        .artifacts
        .lock()
        .map_err(|_| "MIDI export cache is unavailable.".to_string())?
        .insert(drag_token, artifact);
    Ok(dto)
}

#[tauri::command]
pub fn cleanup_stale_progression_midi_exports(
    app: tauri::AppHandle,
) -> Result<CleanupMidiExportsDto, String> {
    let cache_dir = midi_export_cache_dir(&app)?;
    Ok(cleanup_stale_files(&cache_dir, SystemTime::now()))
}

pub fn startup_cleanup(app: &tauri::AppHandle) {
    if let Ok(cache_dir) = midi_export_cache_dir(app) {
        let _ = cleanup_stale_files(&cache_dir, SystemTime::now());
    }
}

fn midi_export_cache_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_cache_dir()
        .map(|path| path.join(MIDI_EXPORT_CACHE_DIR))
        .map_err(|_| "MIDI export cache is unavailable.".to_string())
}

fn validate_midi_bytes(bytes: &[u8]) -> Result<(), String> {
    if bytes.len() < 14 || &bytes[0..4] != b"MThd" {
        return Err("Generated MIDI data is invalid.".to_string());
    }
    Ok(())
}

fn normalized_save_path(mut path: PathBuf) -> Result<PathBuf, String> {
    if path.file_name().is_none() {
        return Err("The selected MIDI file name is invalid.".to_string());
    }
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .map(str::to_ascii_lowercase);
    match extension.as_deref() {
        Some("mid" | "midi") => {}
        Some(_) | None => {
            let file_name = path
                .file_name()
                .and_then(|value| value.to_str())
                .ok_or_else(|| "The selected MIDI file name is invalid.".to_string())?;
            path.set_file_name(format!("{file_name}.mid"));
        }
    }
    Ok(path)
}

fn atomic_write(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or_else(|| "The selected MIDI destination is invalid.".to_string())?;
    if !parent.exists() {
        return Err("The selected MIDI destination does not exist.".to_string());
    }
    let file_name = path
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or_else(|| "The selected MIDI file name is invalid.".to_string())?;
    let temp_path = parent.join(format!(
        ".{file_name}.{}.{}.tmp",
        std::process::id(),
        unix_nanos()
    ));
    let write_result = (|| -> Result<(), String> {
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temp_path)
            .map_err(safe_io_error)?;
        file.write_all(bytes).map_err(safe_io_error)?;
        file.sync_all().map_err(safe_io_error)?;
        atomic_replace(&temp_path, path)?;
        if let Ok(directory) = File::open(parent) {
            let _ = directory.sync_all();
        }
        Ok(())
    })();
    if write_result.is_err() {
        let _ = fs::remove_file(&temp_path);
    }
    write_result
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
        .map_err(|_| "The MIDI file could not be finalized.".to_string())
    }
}

#[cfg(not(windows))]
fn atomic_replace(from: &Path, to: &Path) -> Result<(), String> {
    fs::rename(from, to).map_err(safe_io_error)
}

fn reusable_cache_file(path: &Path, bytes: &[u8]) -> bool {
    let metadata = match fs::symlink_metadata(path) {
        Ok(metadata) if metadata.is_file() && !metadata.file_type().is_symlink() => metadata,
        _ => return false,
    };
    if metadata.len() != bytes.len() as u64 || metadata.len() == 0 {
        return false;
    }
    let mut existing = Vec::with_capacity(bytes.len());
    File::open(path)
        .and_then(|mut file| file.read_to_end(&mut existing))
        .is_ok()
        && existing == bytes
}

fn cleanup_stale_files(cache_dir: &Path, now: SystemTime) -> CleanupMidiExportsDto {
    let mut result = CleanupMidiExportsDto {
        removed: 0,
        skipped: 0,
    };
    let entries = match fs::read_dir(cache_dir) {
        Ok(entries) => entries,
        Err(_) => return result,
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let metadata = match fs::symlink_metadata(&path) {
            Ok(metadata) => metadata,
            Err(_) => {
                result.skipped += 1;
                continue;
            }
        };
        if !metadata.is_file() || metadata.file_type().is_symlink() {
            result.skipped += 1;
            continue;
        }
        let extension = path.extension().and_then(|value| value.to_str());
        if !matches!(extension, Some("mid" | "tmp")) {
            result.skipped += 1;
            continue;
        }
        let modified = metadata.modified().unwrap_or(UNIX_EPOCH);
        let stale = now
            .duration_since(modified)
            .map(|age| age >= MIDI_EXPORT_TTL)
            .unwrap_or(false);
        if stale && fs::remove_file(&path).is_ok() {
            result.removed += 1;
        } else {
            result.skipped += 1;
        }
    }
    result
}

fn sanitize_midi_file_name(value: &str) -> String {
    let mut safe: String = value
        .chars()
        .map(|character| match character {
            'a'..='z' | 'A'..='Z' | '0'..='9' | '-' | '_' | '.' => character,
            _ => '-',
        })
        .take(100)
        .collect();
    safe = safe.trim_end_matches(['.', ' ', '-']).to_string();
    if safe.is_empty() || is_windows_reserved_name(&safe) {
        safe = "loop-vault-progression".to_string();
    }
    if !safe.to_ascii_lowercase().ends_with(".mid") && !safe.to_ascii_lowercase().ends_with(".midi")
    {
        safe.push_str(".mid");
    }
    safe
}

fn is_windows_reserved_name(value: &str) -> bool {
    let stem = value
        .split('.')
        .next()
        .unwrap_or_default()
        .to_ascii_uppercase();
    matches!(stem.as_str(), "CON" | "PRN" | "AUX" | "NUL")
        || (stem.len() == 4
            && matches!(&stem[0..3], "COM" | "LPT")
            && matches!(
                &stem[3..4],
                "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9"
            ))
}

fn sha256_hex(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

fn safe_io_error(_error: std::io::Error) -> String {
    "The MIDI file could not be written.".to_string()
}

fn unix_seconds() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or_default()
}

fn unix_nanos() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or_default()
}

impl PreparedMidiArtifact {
    fn to_dto(&self, reused: bool) -> PreparedMidiArtifactDto {
        PreparedMidiArtifactDto {
            drag_token: self.drag_token.clone(),
            file_name: self.file_name.clone(),
            temp_path: self.temp_path.to_string_lossy().into_owned(),
            bytes_length: self.bytes_length,
            prepared_at: self.prepared_at,
            expires_at: self.expires_at,
            content_hash: self.content_hash.clone(),
            reused,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const MIDI_BYTES: &[u8] = b"MThd\0\0\0\x06\0\x01\0\x01\x01\xe0MTrk";

    #[test]
    fn sanitizes_midi_file_names() {
        assert_eq!(
            sanitize_midi_file_name("progression.mid"),
            "progression.mid"
        );
        assert_eq!(
            sanitize_midi_file_name("my: progression"),
            "my--progression.mid"
        );
        assert_eq!(sanitize_midi_file_name("CON"), "loop-vault-progression.mid");
    }

    #[test]
    fn atomic_write_replaces_complete_content_and_leaves_no_partial_file() {
        let directory = test_directory("atomic");
        fs::create_dir_all(&directory).unwrap();
        let path = directory.join("clip.mid");
        fs::write(&path, b"old").unwrap();

        atomic_write(&path, MIDI_BYTES).unwrap();

        assert_eq!(fs::read(&path).unwrap(), MIDI_BYTES);
        assert_eq!(fs::read_dir(&directory).unwrap().count(), 1);
        let _ = fs::remove_dir_all(directory);
    }

    #[test]
    fn cache_reuse_requires_exact_nonzero_regular_file() {
        let directory = test_directory("reuse");
        fs::create_dir_all(&directory).unwrap();
        let path = directory.join("clip.mid");
        fs::write(&path, MIDI_BYTES).unwrap();
        assert!(reusable_cache_file(&path, MIDI_BYTES));
        assert!(!reusable_cache_file(&path, b"different"));
        fs::write(&path, []).unwrap();
        assert!(!reusable_cache_file(&path, &[]));
        let _ = fs::remove_dir_all(directory);
    }

    #[test]
    fn cleanup_only_removes_stale_mid_and_tmp_files_inside_cache_directory() {
        let directory = test_directory("cleanup");
        fs::create_dir_all(&directory).unwrap();
        let stale_mid = directory.join("stale.mid");
        let keep_json = directory.join("keep.json");
        fs::write(&stale_mid, MIDI_BYTES).unwrap();
        fs::write(&keep_json, b"keep").unwrap();

        let result = cleanup_stale_files(
            &directory,
            SystemTime::now() + MIDI_EXPORT_TTL + Duration::from_secs(1),
        );

        assert_eq!(result.removed, 1);
        assert!(!stale_mid.exists());
        assert!(keep_json.exists());
        let _ = fs::remove_dir_all(directory);
    }

    #[test]
    fn rejects_zero_byte_and_non_midi_payloads() {
        assert!(validate_midi_bytes(&[]).is_err());
        assert!(validate_midi_bytes(b"not-midi-bytes").is_err());
        assert!(validate_midi_bytes(MIDI_BYTES).is_ok());
    }

    fn test_directory(label: &str) -> PathBuf {
        std::env::temp_dir().join(format!(
            "loop-vault-p514-{label}-{}-{}",
            std::process::id(),
            unix_nanos()
        ))
    }
}

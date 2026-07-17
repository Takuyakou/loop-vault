use tauri::{AppHandle, State};

use super::{device_service, types::LiveMidiDevice, LiveMidiState};

#[tauri::command]
pub fn list_live_midi_inputs() -> Result<Vec<LiveMidiDevice>, String> {
    device_service::list_devices()
}

#[tauri::command]
pub fn open_live_midi_input(
    app: AppHandle,
    state: State<'_, LiveMidiState>,
    device: LiveMidiDevice,
) -> Result<String, String> {
    state.open(app, device)
}

#[tauri::command]
pub fn close_live_midi_input(state: State<'_, LiveMidiState>) -> Result<(), String> {
    state.close();
    Ok(())
}

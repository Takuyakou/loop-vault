mod live_midi;
pub mod llm;
mod midi_export;

#[tauri::command]
fn exit_app(app: tauri::AppHandle) {
    app.exit(0);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(live_midi::LiveMidiState::default())
        .manage(midi_export::MidiExportState::default())
        .manage(llm::LlmState::default())
        .setup(|app| {
            midi_export::startup_cleanup(app.handle());
            Ok(())
        })
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            exit_app,
            midi_export::cleanup_stale_progression_midi_exports,
            midi_export::prepare_progression_midi_drag,
            midi_export::save_progression_midi,
            live_midi::commands::list_live_midi_inputs,
            live_midi::commands::open_live_midi_input,
            live_midi::commands::close_live_midi_input,
            llm::commands::cancel_advisor_request,
            llm::commands::list_local_llm_models,
            llm::commands::test_local_llm_connection,
            llm::commands::suggest_progression,
            llm::commands::test_openai_llm_connection,
            llm::keychain::openai_api_key_status,
            llm::keychain::set_openai_api_key,
            llm::keychain::delete_openai_api_key,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Loop Vault");
}

use super::LlmState;
use tauri::State;

#[tauri::command]
pub fn cancel_advisor_request(request_id: String, state: State<'_, LlmState>) -> bool {
    state.cancel_request(&request_id)
}

use super::{
    errors::LlmError,
    local_provider::{list_models, LocalLlmModel, LocalLlmSettings},
    types::{LlmProviderId, ProviderHealth},
    LlmState,
};
use tauri::State;

#[tauri::command]
pub fn cancel_advisor_request(request_id: String, state: State<'_, LlmState>) -> bool {
    state.cancel_request(&request_id)
}

#[tauri::command]
pub async fn list_local_llm_models(
    base_url: String,
    timeout_seconds: u64,
    state: State<'_, LlmState>,
) -> Result<Vec<LocalLlmModel>, LlmError> {
    list_models(&state.client, &base_url, timeout_seconds).await
}

#[tauri::command]
pub async fn test_local_llm_connection(
    settings: LocalLlmSettings,
    state: State<'_, LlmState>,
) -> Result<ProviderHealth, LlmError> {
    let models = list_models(&state.client, &settings.base_url, settings.timeout_seconds).await?;
    if !settings.model.is_empty() && !models.iter().any(|model| model.name == settings.model) {
        return Err(LlmError::ModelUnavailable);
    }

    Ok(ProviderHealth {
        provider: LlmProviderId::Local,
        available: true,
        model: (!settings.model.is_empty()).then_some(settings.model),
        message: Some(format!("{} local model(s) available", models.len())),
    })
}

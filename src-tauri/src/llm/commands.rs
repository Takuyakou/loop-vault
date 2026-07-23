use super::{
    errors::LlmError,
    local_provider::{list_models, LocalLlmModel, LocalLlmSettings},
    provider::LlmProvider,
    types::{AdvisorExecutionResult, AdvisorRequest, LlmProviderId, ProviderHealth},
    LlmState,
};
use std::time::Instant;
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

#[tauri::command]
pub async fn suggest_progression(
    request_id: String,
    request: AdvisorRequest,
    provider: LlmProviderId,
    local_settings: LocalLlmSettings,
    openai_model: String,
    state: State<'_, LlmState>,
) -> Result<AdvisorExecutionResult, LlmError> {
    let cancellation = state.begin_request(request_id.clone());
    let started = Instant::now();
    let model = match provider {
        LlmProviderId::Local => local_settings.model.clone(),
        LlmProviderId::Openai => openai_model.clone(),
    };
    let result = match provider {
        LlmProviderId::Local => {
            let local =
                super::local_provider::LocalLlmProvider::new(state.client.clone(), local_settings);
            local.suggest_progression(request, cancellation).await
        }
        LlmProviderId::Openai => match super::keychain::read_openai_api_key() {
            Ok(api_key) => {
                let openai = super::openai_provider::OpenAiProvider::new(
                    state.client.clone(),
                    openai_model,
                    api_key,
                    local_settings.timeout_seconds,
                );
                openai.suggest_progression(request, cancellation).await
            }
            Err(error) => Err(error),
        },
    };
    state.finish_request(&request_id);
    let provider_result = result?;

    Ok(AdvisorExecutionResult {
        response: provider_result.response,
        provider,
        model,
        latency_ms: started.elapsed().as_millis().min(u128::from(u64::MAX)) as u64,
        retry_count: provider_result.retry_count,
        usage: provider_result.usage,
    })
}

#[tauri::command]
pub async fn test_openai_llm_connection(
    model: String,
    state: State<'_, LlmState>,
) -> Result<ProviderHealth, LlmError> {
    let api_key = super::keychain::read_openai_api_key()?;
    let provider =
        super::openai_provider::OpenAiProvider::new(state.client.clone(), model, api_key, 30);
    provider.test_connection().await
}

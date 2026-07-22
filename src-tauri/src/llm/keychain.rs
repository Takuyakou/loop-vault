use super::errors::LlmError;
use serde::Serialize;

const SERVICE: &str = "com.takuyakou.loopvault";
const OPENAI_ACCOUNT: &str = "openai-api-key";

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApiKeyStatus {
    pub registered: bool,
}

fn entry() -> Result<keyring::Entry, LlmError> {
    keyring::Entry::new(SERVICE, OPENAI_ACCOUNT).map_err(|_| LlmError::SecretStoreUnavailable)
}

pub(crate) fn read_openai_api_key() -> Result<String, LlmError> {
    entry()?.get_password().map_err(|error| match error {
        keyring::Error::NoEntry => LlmError::ApiKeyMissing,
        _ => LlmError::SecretStoreUnavailable,
    })
}

#[tauri::command]
pub async fn openai_api_key_status() -> Result<ApiKeyStatus, LlmError> {
    tauri::async_runtime::spawn_blocking(|| match read_openai_api_key() {
        Ok(_) => Ok(ApiKeyStatus { registered: true }),
        Err(LlmError::ApiKeyMissing) => Ok(ApiKeyStatus { registered: false }),
        Err(error) => Err(error),
    })
    .await
    .map_err(|_| LlmError::SecretStoreUnavailable)?
}

#[tauri::command]
pub async fn set_openai_api_key(api_key: String) -> Result<ApiKeyStatus, LlmError> {
    let trimmed = api_key.trim().to_owned();
    if trimmed.len() < 16 || !trimmed.starts_with("sk-") {
        return Err(LlmError::AuthenticationFailed);
    }

    tauri::async_runtime::spawn_blocking(move || {
        entry()?
            .set_password(&trimmed)
            .map_err(|_| LlmError::SecretStoreUnavailable)?;
        Ok(ApiKeyStatus { registered: true })
    })
    .await
    .map_err(|_| LlmError::SecretStoreUnavailable)?
}

#[tauri::command]
pub async fn delete_openai_api_key() -> Result<ApiKeyStatus, LlmError> {
    tauri::async_runtime::spawn_blocking(|| match entry()?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(ApiKeyStatus { registered: false }),
        Err(_) => Err(LlmError::SecretStoreUnavailable),
    })
    .await
    .map_err(|_| LlmError::SecretStoreUnavailable)?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn status_payload_never_contains_the_key() {
        let json = serde_json::to_value(ApiKeyStatus { registered: true }).unwrap();

        assert_eq!(json, serde_json::json!({ "registered": true }));
        assert!(json.get("apiKey").is_none());
    }
}

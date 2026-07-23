use super::errors::LlmError;
use reqwest::Url;
use serde::{Deserialize, Serialize};
use std::time::Duration;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct LocalLlmSettings {
    pub base_url: String,
    pub model: String,
    pub timeout_seconds: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalLlmModel {
    pub name: String,
}

#[derive(Debug, Deserialize)]
struct OllamaTagsResponse {
    models: Vec<OllamaModel>,
}

#[derive(Debug, Deserialize)]
struct OllamaModel {
    name: String,
}

pub fn normalize_local_base_url(value: &str) -> Result<Url, LlmError> {
    let mut url = Url::parse(value.trim()).map_err(|_| LlmError::ProviderNotConfigured)?;
    let local_host = matches!(url.host_str(), Some("localhost" | "127.0.0.1" | "::1"));
    if !local_host || !matches!(url.scheme(), "http" | "https") {
        return Err(LlmError::ProviderNotConfigured);
    }
    url.set_path("/");
    url.set_query(None);
    url.set_fragment(None);
    Ok(url)
}

pub async fn list_models(
    client: &reqwest::Client,
    base_url: &str,
    timeout_seconds: u64,
) -> Result<Vec<LocalLlmModel>, LlmError> {
    let endpoint = normalize_local_base_url(base_url)?
        .join("api/tags")
        .map_err(|_| LlmError::ProviderNotConfigured)?;
    let response = client
        .get(endpoint)
        .timeout(Duration::from_secs(timeout_seconds.clamp(1, 120)))
        .send()
        .await
        .map_err(map_local_transport_error)?;

    if !response.status().is_success() {
        return Err(if response.status().is_server_error() {
            LlmError::Provider5xx
        } else {
            LlmError::LocalServerUnavailable
        });
    }

    let payload = response
        .json::<OllamaTagsResponse>()
        .await
        .map_err(|_| LlmError::InvalidStructuredOutput)?;
    let mut models = payload
        .models
        .into_iter()
        .map(|model| LocalLlmModel { name: model.name })
        .collect::<Vec<_>>();
    models.sort_by(|left, right| left.name.cmp(&right.name));
    models.dedup_by(|left, right| left.name == right.name);
    Ok(models)
}

fn map_local_transport_error(error: reqwest::Error) -> LlmError {
    if error.is_timeout() {
        LlmError::Timeout
    } else if error.is_connect() {
        LlmError::LocalServerUnavailable
    } else {
        LlmError::Network
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_only_loopback_local_provider_urls() {
        assert!(normalize_local_base_url("http://127.0.0.1:11434").is_ok());
        assert!(normalize_local_base_url("http://localhost:11434/path?secret=1").is_ok());
        assert_eq!(
            normalize_local_base_url("https://example.com").unwrap_err(),
            LlmError::ProviderNotConfigured
        );
    }
}

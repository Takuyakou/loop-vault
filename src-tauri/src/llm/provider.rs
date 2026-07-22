use super::{
    errors::LlmError,
    types::{AdvisorRequest, ProviderHealth, ProviderResult},
};
use async_trait::async_trait;
use tokio_util::sync::CancellationToken;

#[async_trait]
pub trait LlmProvider: Send + Sync {
    async fn suggest_progression(
        &self,
        request: AdvisorRequest,
        cancellation: CancellationToken,
    ) -> Result<ProviderResult, LlmError>;

    async fn test_connection(&self) -> Result<ProviderHealth, LlmError>;
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::llm::types::{
        AdvisorOutputContract, AdvisorProgression, AdvisorStrategy, LlmProviderId,
    };

    struct MockProvider;

    #[async_trait]
    impl LlmProvider for MockProvider {
        async fn suggest_progression(
            &self,
            _request: AdvisorRequest,
            cancellation: CancellationToken,
        ) -> Result<ProviderResult, LlmError> {
            cancellation.cancelled().await;
            Err(LlmError::Cancelled)
        }

        async fn test_connection(&self) -> Result<ProviderHealth, LlmError> {
            Ok(ProviderHealth {
                provider: LlmProviderId::Local,
                available: true,
                model: Some("mock".to_owned()),
                message: None,
            })
        }
    }

    fn request() -> AdvisorRequest {
        AdvisorRequest {
            schema_version: 1,
            progression: AdvisorProgression {
                title: None,
                key: None,
                mode: None,
                bpm: None,
                bars: 1,
                time_signature: "4/4".to_owned(),
                events: vec![],
                roman_numerals: None,
                manual_tag_ids: vec![],
                derived_tag_ids: vec![],
                origin: None,
            },
            instruction: None,
            output: AdvisorOutputContract {
                proposal_count: 3,
                bars_per_proposal: 8,
                strategies: [
                    AdvisorStrategy::CloseDevelopment,
                    AdvisorStrategy::Contrast,
                    AdvisorStrategy::Experimental,
                ],
            },
            context: None,
        }
    }

    #[tokio::test]
    async fn mock_provider_observes_cancellation() {
        let provider = MockProvider;
        let cancellation = CancellationToken::new();
        cancellation.cancel();

        assert_eq!(
            provider.suggest_progression(request(), cancellation).await,
            Err(LlmError::Cancelled)
        );
    }

    #[tokio::test]
    async fn mock_provider_exposes_health_without_secrets() {
        let health = MockProvider.test_connection().await.unwrap();

        assert!(health.available);
        assert_eq!(health.model.as_deref(), Some("mock"));
    }
}

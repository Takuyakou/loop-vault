use super::errors::LlmError;
use std::{future::Future, time::Duration};
use tokio_util::sync::CancellationToken;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct RetryPolicy {
    pub max_retries: u8,
    pub initial_delay: Duration,
    pub max_delay: Duration,
}

impl RetryPolicy {
    pub const fn local() -> Self {
        Self {
            max_retries: 1,
            initial_delay: Duration::from_millis(250),
            max_delay: Duration::from_secs(1),
        }
    }

    pub const fn openai() -> Self {
        Self {
            max_retries: 2,
            initial_delay: Duration::from_millis(500),
            max_delay: Duration::from_secs(4),
        }
    }
}

pub async fn with_timeout_and_cancellation<T, F>(
    timeout: Duration,
    cancellation: CancellationToken,
    future: F,
) -> Result<T, LlmError>
where
    F: Future<Output = Result<T, LlmError>>,
{
    if cancellation.is_cancelled() {
        return Err(LlmError::Cancelled);
    }

    tokio::select! {
        _ = cancellation.cancelled() => Err(LlmError::Cancelled),
        result = tokio::time::timeout(timeout, future) => result.map_err(|_| LlmError::Timeout)?,
    }
}

pub async fn with_retry<T, Operation, OperationFuture, ShouldRetry>(
    policy: RetryPolicy,
    cancellation: CancellationToken,
    mut operation: Operation,
    should_retry: ShouldRetry,
) -> Result<(T, u8), LlmError>
where
    Operation: FnMut(u8) -> OperationFuture,
    OperationFuture: Future<Output = Result<T, LlmError>>,
    ShouldRetry: Fn(LlmError) -> bool,
{
    let mut retries = 0;
    loop {
        if cancellation.is_cancelled() {
            return Err(LlmError::Cancelled);
        }

        match operation(retries).await {
            Ok(value) => return Ok((value, retries)),
            Err(error) if retries < policy.max_retries && should_retry(error) => {
                let delay = policy
                    .initial_delay
                    .saturating_mul(1u32 << retries)
                    .min(policy.max_delay);
                retries += 1;
                tokio::select! {
                    _ = cancellation.cancelled() => return Err(LlmError::Cancelled),
                    _ = tokio::time::sleep(delay) => {}
                }
            }
            Err(error) => return Err(error),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{
        atomic::{AtomicU8, Ordering},
        Arc,
    };

    #[tokio::test]
    async fn retries_only_up_to_the_policy_limit() {
        let calls = Arc::new(AtomicU8::new(0));
        let observed = calls.clone();
        let result = with_retry(
            RetryPolicy {
                max_retries: 2,
                initial_delay: Duration::ZERO,
                max_delay: Duration::ZERO,
            },
            CancellationToken::new(),
            move |_| {
                observed.fetch_add(1, Ordering::SeqCst);
                async { Err::<(), _>(LlmError::Provider5xx) }
            },
            |error| error == LlmError::Provider5xx,
        )
        .await;

        assert_eq!(result, Err(LlmError::Provider5xx));
        assert_eq!(calls.load(Ordering::SeqCst), 3);
    }

    #[tokio::test]
    async fn does_not_retry_non_retryable_errors() {
        let calls = Arc::new(AtomicU8::new(0));
        let observed = calls.clone();
        let result = with_retry(
            RetryPolicy::openai(),
            CancellationToken::new(),
            move |_| {
                observed.fetch_add(1, Ordering::SeqCst);
                async { Err::<(), _>(LlmError::AuthenticationFailed) }
            },
            |error| error == LlmError::Provider5xx,
        )
        .await;

        assert_eq!(result, Err(LlmError::AuthenticationFailed));
        assert_eq!(calls.load(Ordering::SeqCst), 1);
    }

    #[tokio::test]
    async fn timeout_and_cancellation_are_distinct() {
        let timeout_result = with_timeout_and_cancellation(
            Duration::from_millis(1),
            CancellationToken::new(),
            async {
                tokio::time::sleep(Duration::from_millis(20)).await;
                Ok::<_, LlmError>(())
            },
        )
        .await;
        assert_eq!(timeout_result, Err(LlmError::Timeout));

        let cancellation = CancellationToken::new();
        cancellation.cancel();
        let cancelled_result =
            with_timeout_and_cancellation(Duration::from_secs(1), cancellation, async {
                Ok::<_, LlmError>(())
            })
            .await;
        assert_eq!(cancelled_result, Err(LlmError::Cancelled));
    }
}

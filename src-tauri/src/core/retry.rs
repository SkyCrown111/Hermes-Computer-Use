//! Retry Mechanism
//!
//! Automatic retry logic for transient failures.

use crate::core::errors::{HermesError, Result};
use std::time::Duration;

/// Retry policy configuration
#[derive(Debug, Clone)]
pub struct RetryPolicy {
    /// Maximum number of retry attempts
    pub max_retries: u32,
    /// Initial delay between retries
    pub initial_delay: Duration,
    /// Maximum delay between retries
    pub max_delay: Duration,
    /// Multiplier for exponential backoff
    pub backoff_multiplier: f64,
}

impl RetryPolicy {
    /// Create a new retry policy with default values
    pub fn new() -> Self {
        Self {
            max_retries: 3,
            initial_delay: Duration::from_millis(100),
            max_delay: Duration::from_secs(10),
            backoff_multiplier: 2.0,
        }
    }

    /// Create a retry policy with custom max retries
    pub fn with_max_retries(mut self, max_retries: u32) -> Self {
        self.max_retries = max_retries;
        self
    }

    /// Create a retry policy with custom initial delay
    pub fn with_initial_delay(mut self, delay: Duration) -> Self {
        self.initial_delay = delay;
        self
    }

    /// Create a retry policy with custom max delay
    pub fn with_max_delay(mut self, delay: Duration) -> Self {
        self.max_delay = delay;
        self
    }

    /// Create a retry policy with custom backoff multiplier
    pub fn with_backoff_multiplier(mut self, multiplier: f64) -> Self {
        self.backoff_multiplier = multiplier;
        self
    }

    /// Calculate delay for a given attempt using exponential backoff
    fn calculate_delay(&self, attempt: u32) -> Duration {
        let delay_ms = self.initial_delay.as_millis() as f64
            * self.backoff_multiplier.powi(attempt as i32);
        
        let delay = Duration::from_millis(delay_ms as u64);
        
        // Cap at max_delay
        if delay > self.max_delay {
            self.max_delay
        } else {
            delay
        }
    }
}

impl Default for RetryPolicy {
    fn default() -> Self {
        Self::new()
    }
}

/// Retry an async operation with exponential backoff
pub async fn retry_async<F, Fut, T>(
    policy: &RetryPolicy,
    operation: F,
) -> Result<T>
where
    F: Fn() -> Fut,
    Fut: std::future::Future<Output = Result<T>>,
{
    let mut last_error = None;
    
    for attempt in 0..=policy.max_retries {
        match operation().await {
            Ok(result) => {
                if attempt > 0 {
                    println!("[Retry] Operation succeeded after {} attempts", attempt);
                }
                return Ok(result);
            }
            Err(err) => {
                last_error = Some(err.clone());
                
                // Don't retry on the last attempt
                if attempt < policy.max_retries {
                    let delay = policy.calculate_delay(attempt);
                    println!(
                        "[Retry] Attempt {} failed: {}. Retrying in {:?}...",
                        attempt + 1,
                        err.message(),
                        delay
                    );
                    tokio::time::sleep(delay).await;
                } else {
                    println!(
                        "[Retry] All {} attempts failed. Giving up.",
                        policy.max_retries + 1
                    );
                }
            }
        }
    }
    
    // Return the last error
    Err(last_error.unwrap())
}

/// Retry an async operation with a custom retry condition
pub async fn retry_async_if<F, Fut, T, P>(
    policy: &RetryPolicy,
    operation: F,
    should_retry: P,
) -> Result<T>
where
    F: Fn() -> Fut,
    Fut: std::future::Future<Output = Result<T>>,
    P: Fn(&HermesError) -> bool,
{
    let mut last_error = None;
    
    for attempt in 0..=policy.max_retries {
        match operation().await {
            Ok(result) => {
                if attempt > 0 {
                    println!("[Retry] Operation succeeded after {} attempts", attempt);
                }
                return Ok(result);
            }
            Err(err) => {
                // Check if we should retry this error
                if !should_retry(&err) {
                    println!("[Retry] Error is not retryable: {}", err.message());
                    return Err(err);
                }
                
                last_error = Some(err.clone());
                
                // Don't retry on the last attempt
                if attempt < policy.max_retries {
                    let delay = policy.calculate_delay(attempt);
                    println!(
                        "[Retry] Attempt {} failed: {}. Retrying in {:?}...",
                        attempt + 1,
                        err.message(),
                        delay
                    );
                    tokio::time::sleep(delay).await;
                } else {
                    println!(
                        "[Retry] All {} attempts failed. Giving up.",
                        policy.max_retries + 1
                    );
                }
            }
        }
    }
    
    // Return the last error
    Err(last_error.unwrap())
}

/// Check if an error is retryable (network, timeout, transient errors)
pub fn is_retryable_error(error: &HermesError) -> bool {
    matches!(
        error,
        HermesError::NetworkError { .. }
            | HermesError::TimeoutError { .. }
            | HermesError::DatabaseError { .. }
            | HermesError::LockError { .. }
    )
}

/// Retry metrics for monitoring
#[derive(Debug, Clone, Default)]
pub struct RetryMetrics {
    pub total_attempts: u64,
    pub successful_retries: u64,
    pub failed_retries: u64,
    pub total_delay_ms: u64,
}

impl RetryMetrics {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn record_attempt(&mut self) {
        self.total_attempts += 1;
    }

    pub fn record_success(&mut self) {
        self.successful_retries += 1;
    }

    pub fn record_failure(&mut self) {
        self.failed_retries += 1;
    }

    pub fn record_delay(&mut self, delay: Duration) {
        self.total_delay_ms += delay.as_millis() as u64;
    }

    pub fn success_rate(&self) -> f64 {
        if self.total_attempts == 0 {
            0.0
        } else {
            self.successful_retries as f64 / self.total_attempts as f64
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_retry_policy_delay_calculation() {
        let policy = RetryPolicy::new()
            .with_initial_delay(Duration::from_millis(100))
            .with_backoff_multiplier(2.0);

        assert_eq!(policy.calculate_delay(0), Duration::from_millis(100));
        assert_eq!(policy.calculate_delay(1), Duration::from_millis(200));
        assert_eq!(policy.calculate_delay(2), Duration::from_millis(400));
        assert_eq!(policy.calculate_delay(3), Duration::from_millis(800));
    }

    #[test]
    fn test_retry_policy_max_delay() {
        let policy = RetryPolicy::new()
            .with_initial_delay(Duration::from_millis(100))
            .with_max_delay(Duration::from_millis(500))
            .with_backoff_multiplier(2.0);

        assert_eq!(policy.calculate_delay(0), Duration::from_millis(100));
        assert_eq!(policy.calculate_delay(1), Duration::from_millis(200));
        assert_eq!(policy.calculate_delay(2), Duration::from_millis(400));
        assert_eq!(policy.calculate_delay(3), Duration::from_millis(500)); // Capped
        assert_eq!(policy.calculate_delay(4), Duration::from_millis(500)); // Capped
    }
}

//! Performance Cache
//!
//! Caching system for system metrics to avoid repeated calculations.

use serde_json::Value;
use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::RwLock;

/// Cache entry with expiration
struct CacheEntry {
    data: Value,
    expires_at: Instant,
}

/// Performance cache for system metrics
pub struct PerformanceCache {
    cache: Arc<RwLock<HashMap<String, CacheEntry>>>,
    default_ttl: Duration,
}

impl PerformanceCache {
    /// Create a new performance cache
    pub fn new(default_ttl: Duration) -> Self {
        Self {
            cache: Arc::new(RwLock::new(HashMap::new())),
            default_ttl,
        }
    }

    /// Get cached value if not expired
    pub async fn get(&self, key: &str) -> Option<Value> {
        let now = Instant::now();
        let mut expired = false;
        let result = {
            let cache = self.cache.read().await;
            if let Some(entry) = cache.get(key) {
                if now < entry.expires_at {
                    println!("[PerformanceCache] Cache HIT: {}", key);
                    Some(entry.data.clone())
                } else {
                    println!("[PerformanceCache] Cache EXPIRED: {}", key);
                    expired = true;
                    None
                }
            } else {
                println!("[PerformanceCache] Cache MISS: {}", key);
                None
            }
        };

        if expired {
            let mut cache = self.cache.write().await;
            if matches!(cache.get(key), Some(entry) if now >= entry.expires_at) {
                cache.remove(key);
            }
        }

        if let Some(value) = result {
            return Some(value);
        }

        None
    }

    /// Set cache with TTL
    pub async fn set(&self, key: &str, value: Value, ttl: Option<Duration>) {
        Self::cleanup_expired_internal(&self.cache).await;
        let ttl = ttl.unwrap_or(self.default_ttl);
        let expires_at = Instant::now() + ttl;
        
        let entry = CacheEntry {
            data: value,
            expires_at,
        };
        
        let mut cache = self.cache.write().await;
        cache.insert(key.to_string(), entry);
        
        println!("[PerformanceCache] Cache SET: {} (TTL: {:?})", key, ttl);
    }

    /// Invalidate specific cache entry
    pub async fn invalidate(&self, key: &str) {
        let mut cache = self.cache.write().await;
        cache.remove(key);
        println!("[PerformanceCache] Cache INVALIDATE: {}", key);
    }

    /// Clear all cache
    pub async fn clear(&self) {
        let mut cache = self.cache.write().await;
        cache.clear();
        println!("[PerformanceCache] Cache CLEARED");
    }

    /// Remove expired entries
    pub async fn cleanup_expired(&self) {
        Self::cleanup_expired_internal(&self.cache).await;
    }

    /// Internal cleanup function
    async fn cleanup_expired_internal(cache: &Arc<RwLock<HashMap<String, CacheEntry>>>) {
        let mut cache = cache.write().await;
        let now = Instant::now();
        let before_count = cache.len();
        
        cache.retain(|_, entry| entry.expires_at > now);
        
        let after_count = cache.len();
        let removed = before_count - after_count;
        
        if removed > 0 {
            println!("[PerformanceCache] Cleanup: removed {} expired entries", removed);
        }
    }

    /// Get cached value or compute if missing/expired
    pub async fn get_or_compute<F, Fut>(
        &self,
        key: &str,
        ttl: Option<Duration>,
        compute_fn: F,
    ) -> Result<Value, String>
    where
        F: FnOnce() -> Fut,
        Fut: std::future::Future<Output = Result<Value, String>>,
    {
        // Check cache first
        if let Some(cached) = self.get(key).await {
            return Ok(cached);
        }

        // Cache miss - compute value
        println!("[PerformanceCache] Computing value for: {}", key);
        let value = compute_fn().await?;

        // Store in cache
        self.set(key, value.clone(), ttl).await;

        Ok(value)
    }

    /// Get cache statistics
    pub async fn get_stats(&self) -> CacheStats {
        let cache = self.cache.read().await;
        let now = Instant::now();
        
        let total_entries = cache.len();
        let expired_entries = cache.values().filter(|e| e.expires_at <= now).count();
        let valid_entries = total_entries - expired_entries;
        
        CacheStats {
            total_entries,
            valid_entries,
            expired_entries,
        }
    }
}

/// Cache statistics
#[derive(Debug, Clone, serde::Serialize)]
pub struct CacheStats {
    pub total_entries: usize,
    pub valid_entries: usize,
    pub expired_entries: usize,
}

impl Default for PerformanceCache {
    fn default() -> Self {
        Self::new(Duration::from_secs(10))
    }
}

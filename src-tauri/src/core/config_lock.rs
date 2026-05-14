//! Config Lock
//!
//! Configuration file lock management module.

use fs2::FileExt;
use std::fs::{File, OpenOptions};
use std::path::{Path, PathBuf};
use std::time::Duration;

/// Configuration lock manager
pub struct ConfigLock {
    config_path: PathBuf,
    backup_dir: PathBuf,
    lock_timeout: Duration,
}

/// Configuration lock guard
pub struct ConfigLockGuard {
    file: File,
    _config_path: PathBuf,
    _backup_path: Option<PathBuf>,
}

impl ConfigLock {
    pub fn new(config_path: PathBuf) -> Self {
        let backup_dir = config_path.parent().unwrap().join("backups");
        Self {
            config_path,
            backup_dir,
            lock_timeout: Duration::from_secs(10),
        }
    }

    /// Acquire configuration lock
    pub async fn acquire(&self) -> Result<ConfigLockGuard, String> {
        // Open config file
        let file = OpenOptions::new()
            .read(true)
            .write(true)
            .create(true)
            .open(&self.config_path)
            .map_err(|e| format!("Failed to open config file: {}", e))?;

        // Try to acquire file lock with timeout
        let lock_result = tokio::time::timeout(self.lock_timeout, async {
            tokio::task::spawn_blocking(move || {
                file.lock_exclusive()?;
                Ok::<File, std::io::Error>(file)
            })
            .await
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?
        })
        .await;

        let file = match lock_result {
            Ok(Ok(f)) => f,
            Ok(Err(e)) => return Err(format!("Failed to acquire lock: {}", e)),
            Err(_) => return Err("Lock timeout".to_string()),
        };

        // Create backup
        let backup_path = self.create_backup().await?;

        Ok(ConfigLockGuard {
            file,
            _config_path: self.config_path.clone(),
            _backup_path: Some(backup_path),
        })
    }

    /// Create configuration backup
    async fn create_backup(&self) -> Result<PathBuf, String> {
        tokio::fs::create_dir_all(&self.backup_dir)
            .await
            .map_err(|e| format!("Failed to create backup dir: {}", e))?;

        let timestamp = chrono::Utc::now().format("%Y%m%d_%H%M%S");
        let backup_path = self.backup_dir.join(format!("config_{}.yaml", timestamp));

        tokio::fs::copy(&self.config_path, &backup_path)
            .await
            .map_err(|e| format!("Failed to create backup: {}", e))?;

        Ok(backup_path)
    }

    /// Restore from backup
    pub async fn restore_from_backup(&self, backup_path: &Path) -> Result<(), String> {
        tokio::fs::copy(backup_path, &self.config_path)
            .await
            .map_err(|e| format!("Failed to restore backup: {}", e))?;
        Ok(())
    }

    /// Validate YAML format
    pub async fn validate_yaml(&self, content: &str) -> Result<(), String> {
        serde_yaml::from_str::<serde_yaml::Value>(content)
            .map_err(|e| format!("Invalid YAML: {}", e))?;
        Ok(())
    }

    /// Read configuration
    pub async fn read_config(&self) -> Result<serde_yaml::Value, String> {
        let content = tokio::fs::read_to_string(&self.config_path)
            .await
            .map_err(|e| format!("Failed to read config: {}", e))?;

        serde_yaml::from_str(&content)
            .map_err(|e| format!("Failed to parse config: {}", e))
    }

    /// Write configuration
    pub async fn write_config(
        &self,
        _guard: &mut ConfigLockGuard,
        config: &serde_yaml::Value,
    ) -> Result<(), String> {
        // Serialize to YAML
        let content = serde_yaml::to_string(config)
            .map_err(|e| format!("Failed to serialize config: {}", e))?;

        // Validate format
        self.validate_yaml(&content).await?;

        // Write to file
        tokio::fs::write(&self.config_path, content)
            .await
            .map_err(|e| format!("Failed to write config: {}", e))?;

        Ok(())
    }
}

impl Drop for ConfigLockGuard {
    fn drop(&mut self) {
        // Release file lock
        let _ = self.file.unlock();
    }
}

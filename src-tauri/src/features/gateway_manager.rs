//! Gateway Manager
//!
//! Manages Platform Gateway lifecycle.

use crate::core::{HermesCli, EventBus};
use crate::core::event_bus::Event;
use std::sync::Arc;

/// Gateway Manager
pub struct GatewayManager {
    hermes_cli: Arc<HermesCli>,
    event_bus: Arc<EventBus>,
}

impl GatewayManager {
    pub fn new(hermes_cli: Arc<HermesCli>, event_bus: Arc<EventBus>) -> Self {
        Self {
            hermes_cli,
            event_bus,
        }
    }

    /// Start Gateway
    pub async fn start_gateway(&self) -> Result<(), String> {
        println!("[GatewayManager] Starting Gateway...");

        self.hermes_cli.start_gateway().await?;

        self.event_bus.publish(Event::GatewayStarted);

        println!("[GatewayManager] Gateway started");
        Ok(())
    }

    /// Stop Gateway
    pub async fn stop_gateway(&self) -> Result<(), String> {
        println!("[GatewayManager] Stopping Gateway...");

        self.hermes_cli.stop_gateway().await?;

        self.event_bus.publish(Event::GatewayStopped);

        println!("[GatewayManager] Gateway stopped");
        Ok(())
    }

    /// Restart Gateway
    pub async fn restart_gateway(&self) -> Result<(), String> {
        println!("[GatewayManager] Restarting Gateway...");

        self.stop_gateway().await?;
        tokio::time::sleep(std::time::Duration::from_secs(2)).await;
        self.start_gateway().await?;

        println!("[GatewayManager] Gateway restarted");
        Ok(())
    }
}

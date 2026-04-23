//! Hermes Computer Use - Tauri Backend
//!
//! This module provides the main entry point for the Tauri application
//! and registers all commands for interacting with Hermes Agent data.

// Import commands module
mod commands;

// Import Manager trait for webview window access
use tauri::Manager;

// Re-export commands for handler registration
use commands::{
    // Config commands
    load_config, save_config, get_data_dir, check_data_dir_exists,
    // Session commands
    list_sessions, get_session, delete_session, get_sessions_path, update_session_title,
    // Skill commands
    list_skills, get_skill, get_skill_detail, get_skill_categories, save_skill, delete_skill, toggle_skill, get_skills_path,
    // Cron job commands
    list_cron_jobs, get_cron_job, save_cron_job, delete_cron_job, toggle_cron_job, get_cron_path, trigger_cron_job, get_cron_outputs,
    // System commands
    get_system_status, get_usage_analytics, health_check,
    // Platform commands
    get_platforms, get_platform_status, enable_platform, disable_platform, test_platform_connection, reconnect_platform, update_platform_config,
    // Memory commands
    get_memories, save_memory, get_memories_path,
    // Chat commands
    check_hermes_health, send_chat_message, stream_chat_message, start_hermes_gateway, restart_hermes_gateway, stream_chat_with_progress, stream_chat_realtime, respond_approval,
    // Monitor commands
    get_logs, get_log_stats, get_gateway_status, get_performance_metrics, get_log_components, clear_logs,
    // Files commands
    list_directory, read_file, write_file, create_directory, delete_file, move_file, copy_file, file_exists, get_file_tree,
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            // Auto-start Hermes Gateway on app launch
            println!("[HermesApp] Auto-starting Gateway...");
            let handle = app.handle().clone();

            // Run in background to not block startup
            std::thread::spawn(move || {
                std::thread::sleep(std::time::Duration::from_secs(2));
                match crate::commands::start_hermes_gateway() {
                    Ok(msg) => println!("[HermesApp] {}", msg),
                    Err(e) => eprintln!("[HermesApp] Failed to start gateway: {}", e),
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Config commands
            load_config,
            save_config,
            get_data_dir,
            check_data_dir_exists,
            // Session commands
            list_sessions,
            get_session,
            delete_session,
            get_sessions_path,
            update_session_title,
            // Skill commands
            list_skills,
            get_skill,
            get_skill_detail,
            get_skill_categories,
            save_skill,
            delete_skill,
            toggle_skill,
            get_skills_path,
            // Cron job commands
            list_cron_jobs,
            get_cron_job,
            save_cron_job,
            delete_cron_job,
            toggle_cron_job,
            get_cron_path,
            trigger_cron_job,
            get_cron_outputs,
            // System commands
            get_system_status,
            get_usage_analytics,
            health_check,
            // Platform commands
            get_platforms,
            get_platform_status,
            enable_platform,
            disable_platform,
            test_platform_connection,
            reconnect_platform,
            update_platform_config,
            // Memory commands
            get_memories,
            save_memory,
            get_memories_path,
            // Chat commands
            check_hermes_health,
            send_chat_message,
            stream_chat_message,
            start_hermes_gateway,
            restart_hermes_gateway,
            stream_chat_with_progress,
            stream_chat_realtime,
            respond_approval,
            // Monitor commands
            get_logs,
            get_log_stats,
            get_gateway_status,
            get_performance_metrics,
            get_log_components,
            clear_logs,
            // Files commands
            list_directory,
            read_file,
            write_file,
            create_directory,
            delete_file,
            move_file,
            copy_file,
            file_exists,
            get_file_tree,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

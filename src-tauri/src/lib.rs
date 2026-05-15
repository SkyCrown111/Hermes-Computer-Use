//! Hermes Computer Use - Tauri Backend
//!
//! This module provides the main entry point for the Tauri application
//! and registers all commands for interacting with Hermes Agent data.

// Import core modules
mod core;
mod features;
mod commands;
mod hermes_adapter;

use std::sync::Arc;

// Import Manager trait for webview window access
use tauri::menu::{MenuBuilder, MenuItemBuilder};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::Manager;
use commands::utils::needs_wsl;

// Re-export commands for handler registration
use commands::{
    abort_chat,
    add_kanban_comment,
    add_kanban_link,
    add_mcp_server,
    append_memory,
    check_data_dir_exists,
    check_hermes_health,
    check_wechat_qrcode_status,
    cleanup_database_messages,
    count_sessions,
    clear_logs,
    copy_file,
    create_checkpoint,
    create_directory,
    create_kanban_board,
    create_hermes_profile,
    create_kanban_task,
    create_skill,
    delete_checkpoint,
    delete_cron_job,
    delete_file,
    delete_kanban_task,
    delete_hermes_profile,
    delete_memory_section,
    delete_session,
    delete_skill,
    disable_platform,
    enable_platform,
    execute_skill,
    export_config,
    export_logs,
    export_session,
    file_exists,
    search_files,
    get_checkpoint_info,
    get_config_raw,
    get_config_section,
    get_cron_job,
    get_cron_outputs,
    get_cron_path,
    get_data_dir,
    get_file_tree,
    get_gateway_status,
    get_kanban_board,
    get_current_kanban_board,
    get_kanban_stats,
    get_kanban_task,
    get_kanban_tenants,
    get_log_components,
    get_log_stats,
    get_logs,
    get_mcp_logs,
    get_mcp_resources,
    get_mcp_server,
    get_mcp_stats,
    get_mcp_tools,
    get_memories,
    get_memories_path,
    get_performance_metrics,
    get_platform_status,
    get_platforms,
    get_platform_chats,
    get_platform_messages,
    get_session,
    get_hermes_profile_soul,
    get_sessions_path,
    get_skill,
    get_skill_categories,
    get_skill_detail,
    get_skills_path,
    get_readiness_status,
    get_system_status,
    get_usage_analytics,
    get_wechat_qrcode,
    health_check,
    list_checkpoints,
    list_kanban_boards,
    list_cron_jobs,
    list_directory,
    list_mcp_servers,
    list_hermes_profiles,
    list_sessions,
    list_skills,
    load_config,
    mark_platform_chat_read,
    move_file,
    move_kanban_task,
    pause_cron_job,
    read_file,
    read_file_binary,
    reconnect_platform,
    reload_gateway_config,
    remove_kanban_link,
    remove_mcp_server,
    respond_approval,
    respond_clarify,
    respond_secret,
    restart_hermes_gateway,
    rename_hermes_profile,
    restore_checkpoint,
    resume_cron_job,
    save_config,
    save_cron_job,
    save_memory,
    save_skill,
    show_hermes_profile,
    set_kanban_board_archived,
    start_log_stream,
    stop_log_stream,
    test_skill,
    update_skill,
    get_skill_execution_history,
    get_skill_execution_history_v2,
    search_memories,
    search_sessions,
    send_chat_message,
    send_platform_message,
    start_hermes_gateway,
    open_hermes_profile_shell,
    run_hermes_profile_setup,
    start_mcp_server,
    stop_mcp_server,
    stream_chat_message,
    stream_chat_realtime,
    stream_chat_with_progress,
    switch_kanban_board,
    test_mcp_connection,
    test_platform_connection,
    toggle_cron_job,
    toggle_skill,
    trigger_cron_job,
    update_config_raw,
    update_config_section,
    update_hermes_profile_soul,
    update_kanban_board,
    update_kanban_task,
    update_mcp_server,
    update_platform_config,
    use_hermes_profile,
    update_session_title,
    write_file,
    write_file_binary,
    // Tools
    list_available_tools,
    get_tool_schema,
    invoke_tool,
    list_toolsets,
    // Chat interrupt
    interrupt_session,
    // Checkpoint V2 commands
    create_checkpoint_v2,
    list_checkpoints_v2,
    get_checkpoint_info_v2,
    restore_checkpoint_v2,
    delete_checkpoint_v2,
};
use hermes_adapter::{
    check_hermes_capabilities, get_hermes_environment, get_hermes_paths, get_hermes_runtime,
    resolve_environment,
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            let hermes_environment = resolve_environment().ok();
            let config_lock_path = if needs_wsl() {
                std::path::PathBuf::from(shellexpand::tilde("~/.hermes/config.yaml").to_string())
            } else {
                hermes_environment
                    .as_ref()
                    .map(|env| std::path::PathBuf::from(&env.paths.config_yaml))
                    .unwrap_or_else(|| std::path::PathBuf::from(shellexpand::tilde("~/.hermes/config.yaml").to_string()))
            };
            let checkpoints_path = if needs_wsl() {
                std::path::PathBuf::from(shellexpand::tilde("~/.hermes/checkpoints").to_string())
            } else {
                hermes_environment
                    .as_ref()
                    .map(|env| std::path::PathBuf::from(&env.paths.checkpoints_dir))
                    .unwrap_or_else(|| std::path::PathBuf::from(shellexpand::tilde("~/.hermes/checkpoints").to_string()))
            };

            // Initialize core modules
            let event_bus = Arc::new(core::EventBus::new(app.handle().clone()));
            let process_manager = Arc::new(core::ProcessManager::new(event_bus.clone()));
            let hermes_cli = Arc::new(core::HermesCli::new());
            let config_lock = Arc::new(core::ConfigLock::new(config_lock_path));
            
            // Initialize performance cache (default TTL: 10 seconds)
            let performance_cache = Arc::new(core::PerformanceCache::new(
                std::time::Duration::from_secs(10)
            ));

            // Initialize feature modules
            let mcp_manager = Arc::new(features::McpServerManager::new(
                process_manager.clone(),
                hermes_cli.clone(),
                config_lock.clone(),
                event_bus.clone(),
            ));

            let gateway_manager = Arc::new(features::GatewayManager::new(
                hermes_cli.clone(),
                event_bus.clone(),
            ));

            // Initialize checkpoint manager
            let checkpoint_manager = Arc::new(features::CheckpointManager::new(
                checkpoints_path,
                event_bus.clone(),
            ));

            // Initialize skill executor
            let skill_executor = Arc::new(features::SkillExecutor::new(
                hermes_cli.clone(),
                event_bus.clone(),
            ));

            // Initialize log stream manager
            let log_stream_manager = Arc::new(features::LogStreamManager::new(
                event_bus.clone(),
            ));

            // Store managers in app state
            app.manage(mcp_manager);
            app.manage(gateway_manager);
            app.manage(checkpoint_manager);
            app.manage(skill_executor);
            app.manage(log_stream_manager);
            app.manage(process_manager);
            app.manage(hermes_cli);
            app.manage(config_lock);
            app.manage(event_bus);
            app.manage(performance_cache);

            // Auto-start Hermes Gateway on app launch
            println!("[HermesApp] Auto-starting Gateway...");
            // Run in background to not block startup
            let gateway_mgr = app.state::<Arc<features::GatewayManager>>();
            let gateway_mgr_clone = gateway_mgr.inner().clone();
            tauri::async_runtime::spawn(async move {
                tokio::time::sleep(std::time::Duration::from_secs(2)).await;
                match gateway_mgr_clone.start_gateway().await {
                    Ok(_) => println!("[HermesApp] Gateway started successfully"),
                    Err(e) => eprintln!("[HermesApp] Failed to start gateway: {}", e),
                }
            });

            // Configure system tray
            let show_item = MenuItemBuilder::with_id("show", "Show Window").build(app)?;
            let quit_item = MenuItemBuilder::with_id("quit", "Quit").build(app)?;

            let menu = MenuBuilder::new(app)
                .item(&show_item)
                .separator()
                .item(&quit_item)
                .build()?;

            let tray_icon = app.default_window_icon().cloned();

            let mut tray_builder = TrayIconBuilder::new()
                .menu(&menu)
                .tooltip("Hermes Computer Use");

            if let Some(icon) = tray_icon {
                tray_builder = tray_builder.icon(icon);
            }

            tray_builder
                .on_menu_event(|app_handle, event| match event.id.as_ref() {
                    "show" => {
                        if let Some(window) = app_handle.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    "quit" => {
                        app_handle.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        if let Some(window) = tray.app_handle().get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                })
                .build(app)?;

            // Minimize to tray on close instead of quitting
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_decorations(false);
                let handle = app.handle().clone();
                window.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                        if let Some(w) = handle.get_webview_window("main") {
                            let _ = w.hide();
                        }
                        api.prevent_close();
                    }
                });
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            load_config,
            save_config,
            list_hermes_profiles,
            create_hermes_profile,
            use_hermes_profile,
            delete_hermes_profile,
            rename_hermes_profile,
            show_hermes_profile,
            get_hermes_profile_soul,
            update_hermes_profile_soul,
            open_hermes_profile_shell,
            run_hermes_profile_setup,
            get_data_dir,
            check_data_dir_exists,
            get_config_raw,
            update_config_raw,
            get_config_section,
            update_config_section,
            export_config,
            get_hermes_environment,
            get_hermes_paths,
            get_hermes_runtime,
            check_hermes_capabilities,
            list_sessions,
            get_session,
            delete_session,
            get_sessions_path,
            count_sessions,
            update_session_title,
            search_sessions,
            export_session,
            list_checkpoints,
            create_checkpoint,
            get_checkpoint_info,
            restore_checkpoint,
            delete_checkpoint,
            cleanup_database_messages,
            list_skills,
            get_skill,
            get_skill_detail,
            get_skill_categories,
            save_skill,
            update_skill,
            create_skill,
            delete_skill,
            toggle_skill,
            get_skills_path,
            get_skill_execution_history,
            execute_skill,
            test_skill,
            get_skill_execution_history_v2,
            list_cron_jobs,
            get_cron_job,
            save_cron_job,
            delete_cron_job,
            toggle_cron_job,
            pause_cron_job,
            resume_cron_job,
            get_cron_path,
            trigger_cron_job,
            get_cron_outputs,
            get_readiness_status,
            get_system_status,
            get_usage_analytics,
            health_check,
            get_platforms,
            get_platform_status,
            enable_platform,
            disable_platform,
            test_platform_connection,
            reconnect_platform,
            update_platform_config,
            get_wechat_qrcode,
            check_wechat_qrcode_status,
            get_platform_chats,
            send_platform_message,
            get_platform_messages,
            mark_platform_chat_read,
            get_memories,
            save_memory,
            get_memories_path,
            search_memories,
            delete_memory_section,
            append_memory,
            check_hermes_health,
            send_chat_message,
            stream_chat_message,
            start_hermes_gateway,
            restart_hermes_gateway,
            stream_chat_with_progress,
            stream_chat_realtime,
            respond_approval,
            respond_clarify,
            respond_secret,
            abort_chat,
            get_logs,
            get_log_stats,
            get_gateway_status,
            get_performance_metrics,
            get_log_components,
            clear_logs,
            reload_gateway_config,
            start_log_stream,
            stop_log_stream,
            export_logs,
            list_directory,
            read_file,
            write_file,
            create_directory,
            delete_file,
            move_file,
            copy_file,
            file_exists,
            search_files,
            get_file_tree,
            read_file_binary,
            write_file_binary,
            list_mcp_servers,
            get_mcp_server,
            add_mcp_server,
            remove_mcp_server,
            start_mcp_server,
            stop_mcp_server,
            test_mcp_connection,
            get_mcp_tools,
            get_mcp_resources,
            get_mcp_logs,
            get_mcp_stats,
            update_mcp_server,
            // Tools
            list_available_tools,
            get_tool_schema,
            invoke_tool,
            list_toolsets,
            // Kanban
            get_kanban_board,
            list_kanban_boards,
            get_current_kanban_board,
            switch_kanban_board,
            create_kanban_board,
            update_kanban_board,
            set_kanban_board_archived,
            get_kanban_task,
            get_kanban_stats,
            get_kanban_tenants,
            create_kanban_task,
            update_kanban_task,
            delete_kanban_task,
            move_kanban_task,
            add_kanban_comment,
            add_kanban_link,
            remove_kanban_link,
            // Chat interrupt
            interrupt_session,
            // Checkpoint V2 commands
            create_checkpoint_v2,
            list_checkpoints_v2,
            get_checkpoint_info_v2,
            restore_checkpoint_v2,
            delete_checkpoint_v2,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

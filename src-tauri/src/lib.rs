//! Hermes Computer Use - Tauri Backend
//!
//! This module provides the main entry point for the Tauri application
//! and registers all commands for interacting with Hermes Agent data.

// Import commands module
mod commands;

// Import Manager trait for webview window access
use tauri::menu::{MenuBuilder, MenuItemBuilder};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::Manager;

// Re-export commands for handler registration
use commands::{
    abort_chat,
    add_mcp_server,
    append_memory,
    check_data_dir_exists,
    check_hermes_health,
    check_wechat_qrcode_status,
    cleanup_database_messages,
    clear_logs,
    copy_file,
    create_checkpoint,
    create_directory,
    create_skill,
    delete_checkpoint,
    delete_cron_job,
    delete_file,
    delete_memory_section,
    delete_session,
    delete_skill,
    disable_platform,
    enable_platform,
    export_config,
    export_session,
    file_exists,
    get_checkpoint_info,
    get_config_raw,
    get_config_section,
    get_cron_job,
    get_cron_outputs,
    get_cron_path,
    get_data_dir,
    get_file_tree,
    get_gateway_status,
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
    get_sessions_path,
    get_skill,
    get_skill_categories,
    get_skill_detail,
    get_skills_path,
    get_system_status,
    get_usage_analytics,
    get_wechat_qrcode,
    health_check,
    list_checkpoints,
    list_cron_jobs,
    list_directory,
    list_mcp_servers,
    list_sessions,
    list_skills,
    load_config,
    mark_platform_chat_read,
    move_file,
    pause_cron_job,
    read_file,
    read_file_binary,
    reconnect_platform,
    reload_gateway_config,
    remove_mcp_server,
    respond_approval,
    respond_clarify,
    respond_secret,
    restart_hermes_gateway,
    restore_checkpoint,
    resume_cron_job,
    save_config,
    save_cron_job,
    save_memory,
    save_skill,
    search_memories,
    search_sessions,
    send_chat_message,
    send_platform_message,
    start_hermes_gateway,
    start_mcp_server,
    stop_mcp_server,
    stream_chat_message,
    stream_chat_realtime,
    stream_chat_with_progress,
    test_mcp_connection,
    test_platform_connection,
    toggle_cron_job,
    toggle_skill,
    trigger_cron_job,
    update_config_raw,
    update_config_section,
    update_mcp_server,
    update_platform_config,
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
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            // Auto-start Hermes Gateway on app launch
            println!("[HermesApp] Auto-starting Gateway...");
            // Run in background to not block startup
            std::thread::spawn(|| {
                std::thread::sleep(std::time::Duration::from_secs(2));
                match crate::commands::start_hermes_gateway() {
                    Ok(msg) => println!("[HermesApp] {}", msg),
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
            get_data_dir,
            check_data_dir_exists,
            get_config_raw,
            update_config_raw,
            get_config_section,
            update_config_section,
            export_config,
            list_sessions,
            get_session,
            delete_session,
            get_sessions_path,
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
            create_skill,
            delete_skill,
            toggle_skill,
            get_skills_path,
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
            list_directory,
            read_file,
            write_file,
            create_directory,
            delete_file,
            move_file,
            copy_file,
            file_exists,
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
            // Chat interrupt
            interrupt_session,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

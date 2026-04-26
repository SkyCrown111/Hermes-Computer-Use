//! Cron Job Commands
//!
//! Commands for managing Hermes Agent cron jobs.
//! Reads from ~/.hermes/cron/jobs.json in WSL.

use base64::{Engine as _, engine::general_purpose::STANDARD};
use serde::{Deserialize, Serialize};
use super::utils::create_command;

/// Schedule type - matches frontend Schedule interface
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Schedule {
    pub kind: String,
    pub minutes: Option<u64>,
    pub display: String,
}

/// Repeat config - matches frontend RepeatConfig
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RepeatConfig {
    pub times: Option<u64>,
    pub completed: u64,
}

/// Cron job metadata - matches frontend CronJob type exactly
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CronJob {
    pub id: String,
    pub name: String,
    pub prompt: String,
    pub schedule: Schedule,
    pub enabled: bool,
    #[serde(rename = "deliver")]
    pub deliver: Option<String>,
    pub skills: Vec<String>,
    pub created_at: String,
    pub last_run_at: Option<String>,
    pub next_run_at: Option<String>,
    pub run_count: u64,
    pub repeat: Option<RepeatConfig>,
}

/// Read jobs.json from WSL
fn read_jobs_json() -> Result<serde_json::Value, String> {
    let script = "cat ~/.hermes/cron/jobs.json 2>/dev/null || echo '{\"jobs\": []}'";

    let output = create_command("wsl")
        .args(["bash", "-c", script])
        .output()
        .map_err(|e| format!("Failed to read jobs.json: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    serde_json::from_str(&stdout)
        .map_err(|e| format!("Failed to parse jobs.json: {}", e))
}

/// Write jobs.json to WSL using base64 encoding for safe shell transport
fn write_jobs_json(data: &serde_json::Value) -> Result<(), String> {
    let json_str = serde_json::to_string_pretty(data)
        .map_err(|e| format!("Failed to serialize jobs data: {}", e))?;
    let encoded = STANDARD.encode(json_str);

    let cmd = format!("mkdir -p ~/.hermes/cron && echo '{}' | base64 -d > ~/.hermes/cron/jobs.json", encoded);

    let output = create_command("wsl")
        .args(["-e", "bash", "-c", &cmd])
        .output()
        .map_err(|e| format!("Failed to write jobs.json: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Failed to write jobs.json: {}", stderr));
    }
    Ok(())
}
#[tauri::command]
pub fn list_cron_jobs() -> Result<Vec<CronJob>, String> {
    println!("[Cron] Listing cron jobs...");

    let data = read_jobs_json()?;

    let jobs_array = data.get("jobs")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();

    let cron_jobs: Vec<CronJob> = jobs_array.iter().filter_map(|job| {
        let id = job.get("id").and_then(|v| v.as_str())?.to_string();

        let name = job.get("name").and_then(|v| v.as_str()).unwrap_or("Unnamed").to_string();

        let prompt = job.get("prompt").and_then(|v| v.as_str()).unwrap_or("").to_string();

        let enabled = job.get("enabled").and_then(|v| v.as_bool()).unwrap_or(true);

        // Parse schedule
        let schedule_obj = job.get("schedule");
        let schedule = if let Some(s) = schedule_obj {
            let kind = s.get("kind").and_then(|v| v.as_str()).unwrap_or("cron").to_string();
            let display = s.get("display").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let minutes = if kind == "interval" {
                s.get("minutes").and_then(|v| v.as_u64())
                    .or_else(|| s.get("expr").and_then(|e| e.as_str()).and_then(|e| e.parse().ok()))
            } else {
                None
            };
            Schedule { kind, minutes, display }
        } else {
            Schedule { kind: "cron".to_string(), minutes: None, display: "".to_string() }
        };

        // Parse repeat config
        let repeat = job.get("repeat").map(|r| RepeatConfig {
            times: r.get("times").and_then(|v| v.as_u64()),
            completed: r.get("completed").and_then(|v| v.as_u64()).unwrap_or(0),
        });

        // Parse skills array
        let skills = job.get("skills")
            .and_then(|v| v.as_array())
            .map(|arr| arr.iter().filter_map(|s| s.as_str().map(|s| s.to_string())).collect())
            .unwrap_or_default();

        // Run count from repeat.completed or default to 0
        let run_count = repeat.as_ref().map(|r| r.completed).unwrap_or(0);

        Some(CronJob {
            id,
            name,
            prompt,
            schedule,
            enabled,
            deliver: job.get("deliver").and_then(|v| v.as_str()).map(|s| s.to_string()),
            skills,
            created_at: job.get("created_at").and_then(|v| v.as_str()).unwrap_or("").to_string(),
            last_run_at: job.get("last_run_at").and_then(|v| v.as_str()).map(|s| s.to_string()),
            next_run_at: job.get("next_run_at").and_then(|v| v.as_str()).map(|s| s.to_string()),
            run_count,
            repeat,
        })
    }).collect();

    println!("[Cron] Found {} jobs from WSL", cron_jobs.len());
    Ok(cron_jobs)
}

/// Get a cron job by ID
#[tauri::command]
pub fn get_cron_job(id: String) -> Result<CronJob, String> {
    let data = read_jobs_json()?;

    let jobs = data.get("jobs")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();

    for job in jobs {
        if job.get("id").and_then(|v| v.as_str()) == Some(&id) {
            let name = job.get("name").and_then(|v| v.as_str()).unwrap_or("Unnamed").to_string();
            let prompt = job.get("prompt").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let enabled = job.get("enabled").and_then(|v| v.as_bool()).unwrap_or(true);

            let schedule_obj = job.get("schedule");
            let schedule = if let Some(s) = schedule_obj {
                let kind = s.get("kind").and_then(|v| v.as_str()).unwrap_or("cron").to_string();
                let display = s.get("display").and_then(|v| v.as_str()).unwrap_or("").to_string();
                let minutes = if kind == "interval" {
                    s.get("minutes").and_then(|v| v.as_u64())
                } else {
                    None
                };
                Schedule { kind, minutes, display }
            } else {
                Schedule { kind: "cron".to_string(), minutes: None, display: "".to_string() }
            };

            let repeat = job.get("repeat").map(|r| RepeatConfig {
                times: r.get("times").and_then(|v| v.as_u64()),
                completed: r.get("completed").and_then(|v| v.as_u64()).unwrap_or(0),
            });

            let skills = job.get("skills")
                .and_then(|v| v.as_array())
                .map(|arr| arr.iter().filter_map(|s| s.as_str().map(|s| s.to_string())).collect())
                .unwrap_or_default();

            let run_count = repeat.as_ref().map(|r| r.completed).unwrap_or(0);

            return Ok(CronJob {
                id,
                name,
                prompt,
                schedule,
                enabled,
                deliver: job.get("deliver").and_then(|v| v.as_str()).map(|s| s.to_string()),
                skills,
                created_at: job.get("created_at").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                last_run_at: job.get("last_run_at").and_then(|v| v.as_str()).map(|s| s.to_string()),
                next_run_at: job.get("next_run_at").and_then(|v| v.as_str()).map(|s| s.to_string()),
                run_count,
                repeat,
            });
        }
    }

    Err(format!("Job not found: {}", id))
}

/// Delete a cron job
#[tauri::command]
pub fn delete_cron_job(id: String) -> Result<(), String> {
    println!("[Cron] Deleting job: {}", id);

    let mut data = read_jobs_json()?;
    if let Some(jobs) = data.get_mut("jobs").and_then(|v| v.as_array_mut()) {
        let len_before = jobs.len();
        jobs.retain(|job| job.get("id").and_then(|v| v.as_str()) != Some(&id));
        if jobs.len() == len_before {
            return Err(format!("Job not found: {}", id));
        }
    }
    write_jobs_json(&data)?;
    println!("[Cron] Deleted job: {}", id);
    Ok(())
}

/// Save (create or update) a cron job
#[tauri::command]
pub fn save_cron_job(job: CronJob) -> Result<(), String> {
    println!("[Cron] Saving job: {}", job.id);

    let mut data = read_jobs_json()?;
    let new_job = serde_json::json!(job);

    if let Some(jobs) = data.get_mut("jobs").and_then(|v| v.as_array_mut()) {
        let mut found = false;
        for existing in jobs.iter_mut() {
            if existing.get("id").and_then(|v| v.as_str()) == Some(&job.id) {
                *existing = new_job.clone();
                found = true;
                break;
            }
        }
        if !found {
            jobs.push(new_job.clone());
        }
    }
    write_jobs_json(&data)?;
    println!("[Cron] Saved job: {}", job.id);
    Ok(())
}

/// Toggle a cron job's enabled state
#[tauri::command]
pub fn toggle_cron_job(id: String, enabled: bool) -> Result<(), String> {
    println!("[Cron] Toggling job {} to enabled={}", id, enabled);

    let mut data = read_jobs_json()?;
    if let Some(jobs) = data.get_mut("jobs").and_then(|v| v.as_array_mut()) {
        let mut found = false;
        for job in jobs.iter_mut() {
            if job.get("id").and_then(|v| v.as_str()) == Some(&id) {
                job["enabled"] = serde_json::Value::Bool(enabled);
                found = true;
                break;
            }
        }
        if !found {
            return Err(format!("Job not found: {}", id));
        }
    }
    write_jobs_json(&data)?;
    println!("[Cron] Toggled job {} to {}", id, enabled);
    Ok(())
}

/// Get cron directory path
#[tauri::command]
pub fn get_cron_path() -> Result<String, String> {
    Ok("~/.hermes/cron".to_string())
}

/// Trigger a cron job manually
#[tauri::command]
pub fn trigger_cron_job(id: String) -> Result<(), String> {
    println!("[Cron] Triggering job: {}", id);

    // Validate job_id
    if id.is_empty() || id.chars().any(|c| !c.is_alphanumeric() && c != '-' && c != '_') {
        return Err(format!("Invalid id: {}", id));
    }

    // Use Hermes CLI to trigger the job
    let output = create_command("wsl")
        .args(["-e", "bash", "-c",
            &format!("~/.hermes/hermes-agent/venv/bin/python -m hermes_cli.main cron run {}", id)])
        .output()
        .map_err(|e| format!("Failed to trigger job: {}", e))?;
    
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        // If CLI doesn't support trigger, return success anyway (job will run on schedule)
        println!("[Cron] Trigger command output: {}", stderr);
    }
    
    Ok(())
}

/// Cron job output entry
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CronJobOutput {
    pub id: String,
    pub job_id: String,
    pub status: String,
    pub output: String,
    pub started_at: String,
    pub finished_at: Option<String>,
    pub duration_ms: Option<u64>,
}

/// Get cron job execution outputs
#[tauri::command]
pub fn get_cron_outputs(job_id: String, limit: Option<usize>) -> Result<Vec<CronJobOutput>, String> {
    println!("[Cron] Getting outputs for job: {} (limit: {:?})", job_id, limit);

    // Validate job_id to prevent path traversal and shell injection
    if job_id.is_empty()
        || job_id.contains('/')
        || job_id.contains('\\')
        || job_id.contains('.')
        || job_id.chars().any(|c| !c.is_alphanumeric() && c != '-' && c != '_')
    {
        return Err(format!("Invalid job_id: {}", job_id));
    }

    // Read outputs from the job's output directory
    let script = format!(
        "ls -t ~/.hermes/cron/outputs/{}/*.json 2>/dev/null | head -n {} | xargs -I {{}} cat {{}}",
        job_id,
        limit.unwrap_or(10)
    );
    
    let output = create_command("wsl")
        .args(["bash", "-c", &script])
        .output()
        .map_err(|e| format!("Failed to read outputs: {}", e))?;
    
    let stdout = String::from_utf8_lossy(&output.stdout);
    
    // Parse each JSON line
    let outputs: Vec<CronJobOutput> = stdout
        .lines()
        .filter(|line| !line.is_empty())
        .filter_map(|line| {
            serde_json::from_str::<serde_json::Value>(line).ok().and_then(|v| {
                Some(CronJobOutput {
                    id: v.get("id").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                    job_id: v.get("job_id").and_then(|v| v.as_str()).unwrap_or(&job_id).to_string(),
                    status: v.get("status").and_then(|v| v.as_str()).unwrap_or("unknown").to_string(),
                    output: v.get("output").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                    started_at: v.get("started_at").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                    finished_at: v.get("finished_at").and_then(|v| v.as_str()).map(|s| s.to_string()),
                    duration_ms: v.get("duration_ms").and_then(|v| v.as_u64()),
                })
            })
        })
        .collect();
    
    println!("[Cron] Found {} outputs", outputs.len());
    Ok(outputs)
}

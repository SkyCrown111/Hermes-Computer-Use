//! Skills Commands
//!
//! Commands for managing Hermes Agent skills.
//! Reads skill metadata from SKILL.md files in WSL.

use super::utils::create_command;
use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde::{Deserialize, Serialize};

/// Skill metadata - matches frontend Skill type exactly
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Skill {
    pub name: String,
    pub description: Option<String>,
    pub version: Option<String>,
    pub author: Option<String>,
    pub category: Option<String>,
    pub path: Option<String>,
    pub enabled: bool,
    pub tags: Option<Vec<String>>,
}

/// Skill category
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkillCategory {
    pub name: String,
    pub description: Option<String>,
    pub skill_count: usize,
}

/// Parameters for creating a new skill
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateSkillParams {
    pub name: String,
    pub category: String,
    pub description: String,
    pub content: String,
    pub metadata: Option<SkillMetadata>,
}

/// Skill metadata
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkillMetadata {
    pub version: Option<String>,
    pub author: Option<String>,
    pub tags: Option<Vec<String>>,
}

/// Validate skill name/category to prevent path traversal and shell injection
fn validate_skill_identifier(name: &str) -> Result<String, String> {
    if name.is_empty() {
        return Err("Name cannot be empty".to_string());
    }
    if name.contains('/') || name.contains('\\') || name.contains("..") {
        return Err(format!("Invalid characters in name: {}", name));
    }
    // Only allow alphanumeric, dash, underscore, and space
    if !name
        .chars()
        .all(|c| c.is_alphanumeric() || c == '-' || c == '_' || c == ' ')
    {
        return Err(format!("Invalid characters in name: {}", name));
    }
    Ok(name.to_string())
}

/// List all skills - reads real data from WSL using Python
/// Merges with persisted enabled states from skill_states.json
#[tauri::command]
pub fn list_skills(category: Option<String>) -> Result<Vec<Skill>, String> {
    let category_filter = category.clone();
    println!("[Skills] Listing skills...");

    let script = r#"
import os
import re
import json

def parse_frontmatter(content):
    """Parse YAML frontmatter from SKILL.md content"""
    metadata = {}

    # Find frontmatter between ---
    match = re.match(r'^---\s*\n(.*?)\n---', content, re.DOTALL)
    if match:
        frontmatter = match.group(1)
        for line in frontmatter.split('\n'):
            line = line.strip()
            if ':' in line:
                key, value = line.split(':', 1)
                key = key.strip()
                value = value.strip()

                # Handle arrays like tags: [tag1, tag2]
                if value.startswith('[') and value.endswith(']'):
                    items = [item.strip().strip("\"'") for item in value[1:-1].split(',')]
                    metadata[key] = [item for item in items if item]
                else:
                    metadata[key] = value

    return metadata

skills_dir = os.path.expanduser("~/.hermes/skills")
states_file = os.path.expanduser("~/.hermes/skill_states.json")

# Load persisted enabled states
enabled_states = {}
if os.path.exists(states_file):
    try:
        with open(states_file, 'r') as f:
            enabled_states = json.load(f)
    except:
        pass

skills = []

for category in sorted(os.listdir(skills_dir)):
    cat_path = os.path.join(skills_dir, category)
    if not os.path.isdir(cat_path):
        continue

    for item in os.listdir(cat_path):
        skill_path = os.path.join(cat_path, item)
        skill_file = os.path.join(skill_path, "SKILL.md")

        if not os.path.isfile(skill_file):
            continue

        try:
            with open(skill_file, 'r', encoding='utf-8') as f:
                content = f.read()

            metadata = parse_frontmatter(content)
            skill_name = metadata.get("name", item)

            # Use persisted enabled state, default to True
            enabled = enabled_states.get(skill_name, True)

            skill = {
                "name": skill_name,
                "description": metadata.get("description"),
                "version": metadata.get("version"),
                "author": metadata.get("author"),
                "category": category,
                "path": f"{category}/{item}",
                "enabled": enabled,
                "tags": metadata.get("tags", [])
            }
            skills.append(skill)
        except Exception as e:
            # Skip files that can't be read
            pass

print(json.dumps(skills))
"#;

    if let Ok(output) = create_command("wsl")
        .args(["python3", "-c", script])
        .output()
    {
        if output.status.success() {
            let stdout = String::from_utf8_lossy(&output.stdout);

            if let Ok(skills_json) = serde_json::from_str::<Vec<serde_json::Value>>(&stdout) {
                let skills: Vec<Skill> = skills_json
                    .iter()
                    .map(|s| Skill {
                        name: s
                            .get("name")
                            .and_then(|v| v.as_str())
                            .unwrap_or("")
                            .to_string(),
                        description: s
                            .get("description")
                            .and_then(|v| v.as_str())
                            .map(|s| s.to_string()),
                        version: s
                            .get("version")
                            .and_then(|v| v.as_str())
                            .map(|s| s.to_string()),
                        author: s
                            .get("author")
                            .and_then(|v| v.as_str())
                            .map(|s| s.to_string()),
                        category: s
                            .get("category")
                            .and_then(|v| v.as_str())
                            .map(|s| s.to_string()),
                        path: s
                            .get("path")
                            .and_then(|v| v.as_str())
                            .map(|s| s.to_string()),
                        enabled: s.get("enabled").and_then(|v| v.as_bool()).unwrap_or(true),
                        tags: s.get("tags").and_then(|v| v.as_array()).map(|arr| {
                            arr.iter()
                                .filter_map(|t| t.as_str().map(|s| s.to_string()))
                                .collect()
                        }),
                    })
                    .collect();

                // Filter by category if provided
                let filtered_skills: Vec<Skill> = if let Some(ref cat) = category_filter {
                    skills
                        .into_iter()
                        .filter(|s| s.category.as_ref().map(|c| c == cat).unwrap_or(false))
                        .collect()
                } else {
                    skills
                };

                println!("[Skills] Found {} skills from WSL", filtered_skills.len());
                return Ok(filtered_skills);
            }
        }
    }

    println!("[Skills] No skills found");
    Ok(vec![])
}

/// Get a skill by name
#[tauri::command]
pub fn get_skill(name: String) -> Result<Skill, String> {
    Ok(Skill {
        name,
        description: None,
        version: None,
        author: None,
        category: None,
        path: None,
        enabled: true,
        tags: None,
    })
}

/// Get skill detail by category and name
#[tauri::command]
pub fn get_skill_detail(category: String, name: String) -> Result<serde_json::Value, String> {
    // Validate identifiers to prevent path traversal
    let _ = validate_skill_identifier(&category)?;
    let _ = validate_skill_identifier(&name)?;

    let script = format!(
        r#"
import os
import re
import json

skill_file = os.path.expanduser("~/.hermes/skills/{}/{}/SKILL.md")

if not os.path.isfile(skill_file):
    print(json.dumps({{"error": "Not found"}}))
    exit()

with open(skill_file, 'r', encoding='utf-8') as f:
    content = f.read()

# Parse frontmatter
metadata = {{}}
match = re.match(r'^---\s*\n(.*?)\n---', content, re.DOTALL)
if match:
    frontmatter = match.group(1)
    for line in frontmatter.split('\n'):
        line = line.strip()
        if ':' in line:
            key, value = line.split(':', 1)
            key = key.strip()
            value = value.strip()
            if value.startswith('[') and value.endswith(']'):
                items = [item.strip().strip("\"'") for item in value[1:-1].split(',')]
                metadata[key] = [item for item in items if item]
            else:
                metadata[key] = value

result = {{
    "name": metadata.get("name", "{}"),
    "category": "{}",
    "path": "{}/{}",
    "content": content,
    "metadata": {{
        "name": metadata.get("name", "{}"),
        "description": metadata.get("description", ""),
        "version": metadata.get("version", "1.0.0"),
        "author": metadata.get("author", "Unknown"),
        "metadata": {{
            "hermes": {{
                "tags": metadata.get("tags", [])
            }}
        }}
    }}
}}

print(json.dumps(result))
"#,
        category, name, category, name, category, name, name
    );

    if let Ok(output) = create_command("wsl")
        .args(["python3", "-c", &script])
        .output()
    {
        if output.status.success() {
            let stdout = String::from_utf8_lossy(&output.stdout);
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(&stdout) {
                return Ok(json);
            }
        }
    }

    Ok(serde_json::json!({
        "name": name,
        "category": category,
        "path": format!("{}/{}", category, name),
        "content": "",
        "metadata": {
            "name": name,
            "description": "",
            "version": "1.0.0",
            "author": "Unknown"
        }
    }))
}

/// Get skill categories
#[tauri::command]
pub fn get_skill_categories() -> Result<Vec<SkillCategory>, String> {
    println!("[Skills] Getting categories...");

    // Use JSON output to avoid pipe character issues
    let script = r#"
import os
import json

skills_dir = os.path.expanduser("~/.hermes/skills")
categories = []

for name in sorted(os.listdir(skills_dir)):
    cat_dir = os.path.join(skills_dir, name)
    if not os.path.isdir(cat_dir):
        continue

    # Count SKILL.md files
    count = 0
    for root, dirs, files in os.walk(cat_dir):
        if "SKILL.md" in files:
            count += 1

    # Read description
    desc_file = os.path.join(cat_dir, "DESCRIPTION.md")
    desc = ""
    if os.path.exists(desc_file):
        with open(desc_file, 'r') as f:
            for line in f:
                if line.startswith("description:"):
                    desc = line.split(":", 1)[1].strip()
                    break

    categories.append({"name": name, "count": count, "desc": desc})

print(json.dumps(categories))
"#;

    let output = create_command("wsl")
        .args(["python3", "-c", script])
        .output();

    match output {
        Ok(output) => {
            println!("[Skills] Command status: {}", output.status.success());
            if output.status.success() {
                let stdout = String::from_utf8_lossy(&output.stdout);
                println!("[Skills] stdout length: {}", stdout.len());

                if let Ok(cats) = serde_json::from_str::<Vec<serde_json::Value>>(&stdout) {
                    let categories: Vec<SkillCategory> = cats
                        .iter()
                        .map(|c| SkillCategory {
                            name: c
                                .get("name")
                                .and_then(|v| v.as_str())
                                .unwrap_or("")
                                .to_string(),
                            description: c
                                .get("desc")
                                .and_then(|v| v.as_str())
                                .map(|s| s.to_string())
                                .filter(|s| !s.is_empty()),
                            skill_count: c.get("count").and_then(|v| v.as_u64()).unwrap_or(0)
                                as usize,
                        })
                        .collect();

                    println!("[Skills] Found {} categories", categories.len());
                    return Ok(categories);
                } else {
                    println!("[Skills] Failed to parse JSON");
                }
            } else {
                let stderr = String::from_utf8_lossy(&output.stderr);
                println!("[Skills] stderr: {}", stderr);
            }
        }
        Err(e) => {
            println!("[Skills] Command failed: {}", e);
        }
    }

    println!("[Skills] Returning empty categories");
    Ok(vec![])
}

/// Save a skill
#[tauri::command]
pub fn save_skill(_skill: Skill) -> Result<(), String> {
    Ok(())
}

/// Create a new skill with content - uses base64 encoding for safe shell transport
#[tauri::command]
pub fn create_skill(params: CreateSkillParams) -> Result<(), String> {
    println!(
        "[Skills] Creating skill: {} in category {}",
        params.name, params.category
    );

    // Validate identifiers to prevent path traversal
    let valid_category = validate_skill_identifier(&params.category)?;
    let valid_name = validate_skill_identifier(&params.name)?;

    let version = params
        .metadata
        .as_ref()
        .and_then(|m| m.version.clone())
        .unwrap_or_else(|| "1.0.0".to_string());
    let author = params
        .metadata
        .as_ref()
        .and_then(|m| m.author.clone())
        .unwrap_or_else(|| "User".to_string());
    let tags = params
        .metadata
        .as_ref()
        .and_then(|m| m.tags.clone())
        .unwrap_or_default();

    // Build the SKILL.md content
    let tags_line = if tags.is_empty() {
        String::new()
    } else {
        format!(
            "tags: [{}]",
            tags.iter()
                .map(|t| format!("\"{}\"", t))
                .collect::<Vec<_>>()
                .join(", ")
        )
    };

    let skill_content = format!(
        r#"---
name: "{}"
description: "{}"
version: "{}"
author: "{}"
{}

{}
"#,
        params.name.replace("\"", "\\\""),
        params.description.replace("\"", "\\\"").replace("\n", " "),
        version,
        author,
        tags_line,
        params.content
    );

    // Encode content as base64 for safe shell transport
    let encoded = STANDARD.encode(&skill_content);

    let script = format!(
        r#"
import os
import base64
import json

skill_dir = os.path.expanduser("~/.hermes/skills/{}/{}")
os.makedirs(skill_dir, exist_ok=True)

skill_file = os.path.join(skill_dir, "SKILL.md")

# Decode base64 content
content = base64.b64decode("{}").decode('utf-8')

with open(skill_file, 'w', encoding='utf-8') as f:
    f.write(content)

print(json.dumps({{"success": True, "path": skill_file}}))
"#,
        valid_category, valid_name, encoded
    );

    if let Ok(output) = create_command("wsl")
        .args(["python3", "-c", &script])
        .output()
    {
        if output.status.success() {
            let stdout = String::from_utf8_lossy(&output.stdout);
            println!("[Skills] Create skill output: {}", stdout);
            return Ok(());
        } else {
            let stderr = String::from_utf8_lossy(&output.stderr);
            println!("[Skills] Create skill error: {}", stderr);
            return Err(format!("Failed to create skill: {}", stderr));
        }
    }

    Err("Failed to execute WSL command".to_string())
}

/// Delete a skill
#[tauri::command]
pub fn delete_skill(category: String, name: String) -> Result<(), String> {
    println!("[Skills] Deleting skill: {}/{}", category, name);

    // Validate identifiers to prevent path traversal
    let valid_category = validate_skill_identifier(&category)?;
    let valid_name = validate_skill_identifier(&name)?;

    let script = format!(
        r#"
import os
import shutil

skill_dir = os.path.expanduser("~/.hermes/skills/{}/{}")

if os.path.exists(skill_dir):
    shutil.rmtree(skill_dir)
    print("deleted")
else:
    print("not_found")
"#,
        valid_category, valid_name
    );

    if let Ok(output) = create_command("wsl")
        .args(["python3", "-c", &script])
        .output()
    {
        if output.status.success() {
            let stdout = String::from_utf8_lossy(&output.stdout);
            println!("[Skills] Delete output: {}", stdout);
            return Ok(());
        } else {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!("Failed to delete skill: {}", stderr));
        }
    }

    Err("Failed to execute WSL command".to_string())
}

/// Toggle skill enabled status
/// Persists the enabled state in a separate state file
#[tauri::command]
pub fn toggle_skill(name: String, enabled: bool) -> Result<(), String> {
    println!("[Skills] Toggling skill '{}' to enabled={}", name, enabled);

    // Validate skill name
    let _ = validate_skill_identifier(&name)?;

    // Use base64 encoding for safe shell transport
    let name_b64 = STANDARD.encode(&name);

    let script = format!(
        r#"
import os
import json
import base64

states_file = os.path.expanduser("~/.hermes/skill_states.json")
name = base64.b64decode("{}").decode('utf-8')
enabled = {}

# Read existing states
states = {{}}
if os.path.exists(states_file):
    try:
        with open(states_file, 'r') as f:
            states = json.load(f)
    except:
        pass

# Update state
states[name] = enabled

# Write back
os.makedirs(os.path.dirname(states_file), exist_ok=True)
with open(states_file, 'w') as f:
    json.dump(states, f, indent=2)

print("success")
"#,
        name_b64,
        enabled
    );

    if let Ok(output) = create_command("wsl")
        .args(["python3", "-c", &script])
        .output()
    {
        if output.status.success() {
            let stdout = String::from_utf8_lossy(&output.stdout);
            println!("[Skills] Toggle output: {}", stdout);
            return Ok(());
        } else {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!("Failed to toggle skill: {}", stderr));
        }
    }

    Err("Failed to execute WSL command".to_string())
}

/// Get skills directory path
#[tauri::command]
pub fn get_skills_path() -> Result<String, String> {
    Ok("~/.hermes/skills".to_string())
}

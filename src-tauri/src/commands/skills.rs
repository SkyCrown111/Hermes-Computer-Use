//! Skills Commands
//!
//! Commands for managing Hermes Agent skills.
//! Reads skill metadata from SKILL.md files in WSL.

use serde::{Deserialize, Serialize};
use std::process::Command;
use super::utils::create_command;

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

/// List all skills - reads real data from WSL using Python
#[tauri::command]
pub fn list_skills() -> Result<Vec<Skill>, String> {
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
                    items = [item.strip().strip('"\'') for item in value[1:-1].split(',')]
                    metadata[key] = [item for item in items if item]
                else:
                    metadata[key] = value

    return metadata

skills_dir = os.path.expanduser("~/.hermes/skills")
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

            skill = {
                "name": metadata.get("name", item),
                "description": metadata.get("description"),
                "version": metadata.get("version"),
                "author": metadata.get("author"),
                "category": category,
                "path": f"{category}/{item}",
                "enabled": True,
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
                let skills: Vec<Skill> = skills_json.iter().map(|s| Skill {
                    name: s.get("name").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                    description: s.get("description").and_then(|v| v.as_str()).map(|s| s.to_string()),
                    version: s.get("version").and_then(|v| v.as_str()).map(|s| s.to_string()),
                    author: s.get("author").and_then(|v| v.as_str()).map(|s| s.to_string()),
                    category: s.get("category").and_then(|v| v.as_str()).map(|s| s.to_string()),
                    path: s.get("path").and_then(|v| v.as_str()).map(|s| s.to_string()),
                    enabled: true,
                    tags: s.get("tags").and_then(|v| v.as_array()).map(|arr| {
                        arr.iter().filter_map(|t| t.as_str().map(|s| s.to_string())).collect()
                    }),
                }).collect();

                println!("[Skills] Found {} skills from WSL", skills.len());
                return Ok(skills);
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
                items = [item.strip().strip('"\'') for item in value[1:-1].split(',')]
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
                    let categories: Vec<SkillCategory> = cats.iter().map(|c| SkillCategory {
                        name: c.get("name").and_then(|v| v.as_str()).unwrap_or("").to_string(),
                        description: c.get("desc").and_then(|v| v.as_str()).map(|s| s.to_string()).filter(|s| !s.is_empty()),
                        skill_count: c.get("count").and_then(|v| v.as_u64()).unwrap_or(0) as usize,
                    }).collect();

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

/// Delete a skill
#[tauri::command]
pub fn delete_skill(_name: String) -> Result<(), String> {
    Ok(())
}

/// Toggle skill enabled status
#[tauri::command]
pub fn toggle_skill(_name: String, _enabled: bool) -> Result<(), String> {
    Ok(())
}

/// Get skills directory path
#[tauri::command]
pub fn get_skills_path() -> Result<String, String> {
    Ok("~/.hermes/skills".to_string())
}

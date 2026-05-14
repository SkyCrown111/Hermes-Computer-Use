//! Kanban Commands
//!
//! Console-facing Kanban commands backed by Hermes Agent's official
//! `hermes_cli.kanban_db` implementation.

use super::utils::run_python_script;

use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KanbanTask {
    pub id: String,
    pub title: String,
    pub description: String,
    pub status: String,
    pub priority: String,
    pub tenant: String,
    pub assignee: Option<String>,
    pub parent_id: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub due_date: Option<String>,
    pub completed_at: Option<String>,
    pub comments_count: i64,
    pub links_count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KanbanComment {
    pub id: String,
    pub task_id: String,
    pub author: String,
    pub content: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KanbanEvent {
    pub id: String,
    pub task_id: String,
    pub actor: String,
    pub action: String,
    pub detail: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KanbanLink {
    pub id: String,
    pub parent_id: String,
    pub child_id: String,
    pub relation: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KanbanTaskDetail {
    #[serde(flatten)]
    pub task: KanbanTask,
    pub comments: Vec<KanbanComment>,
    pub events: Vec<KanbanEvent>,
    pub parent_links: Vec<KanbanLink>,
    pub child_links: Vec<KanbanLink>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KanbanStats {
    pub total: i64,
    pub triage: i64,
    pub todo: i64,
    pub ready: i64,
    pub running: i64,
    pub blocked: i64,
    pub done: i64,
    pub archived: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KanbanBoardInfo {
    pub slug: String,
    pub name: String,
    pub description: String,
    pub icon: String,
    pub color: String,
    pub archived: bool,
    pub is_current: bool,
}

fn validate_status(status: &str) -> Result<(), String> {
    match status {
        "triage" | "todo" | "ready" | "running" | "blocked" | "done" | "archived" => Ok(()),
        _ => Err(format!("Invalid kanban status: {}", status)),
    }
}

fn validate_priority(priority: &str) -> Result<(), String> {
    match priority {
        "low" | "medium" | "high" | "critical" => Ok(()),
        _ => Err(format!("Invalid kanban priority: {}", priority)),
    }
}

fn build_official_kanban_script(payload_b64: &str, body: &str) -> String {
    let indented_body = body
        .lines()
        .map(|line| {
            if line.is_empty() {
                "    ".to_string()
            } else {
                format!("    {}", line)
            }
        })
        .collect::<Vec<_>>()
        .join("\n");
    let template = r#"
import base64, json, sys
from pathlib import Path
import datetime as dt

root = Path.home() / '.hermes' / 'hermes-agent'
if not root.exists():
    raise RuntimeError('Hermes Agent is not installed at ~/.hermes/hermes-agent')
sys.path.insert(0, str(root))

from hermes_cli import kanban_db as kb

def iso(ts):
    if ts is None:
        return None
    return dt.datetime.fromtimestamp(int(ts), tz=dt.timezone.utc).isoformat()

def priority_label(value):
    try:
        number = int(value or 0)
    except Exception:
        number = 0
    if number >= 4:
        return 'critical'
    if number >= 3:
        return 'high'
    if number >= 1:
        return 'medium'
    return 'low'

def priority_value(label):
    mapping = {
        'low': 0,
        'medium': 1,
        'high': 3,
        'critical': 4,
    }
    return mapping.get(str(label or 'medium').strip().lower(), 1)

payload = json.loads(base64.b64decode('__PAYLOAD_B64__').decode('utf-8'))
conn = kb.connect()

def comment_count(task_id):
    row = conn.execute(
        'SELECT COUNT(*) AS count FROM task_comments WHERE task_id = ?',
        (task_id,),
    ).fetchone()
    return int(row['count'] or 0)

def link_count(task_id):
    return len(kb.parent_ids(conn, task_id)) + len(kb.child_ids(conn, task_id))

def latest_activity_ts(task):
    candidates = [
        task.created_at or 0,
        task.started_at or 0,
        task.completed_at or 0,
        task.last_heartbeat_at or 0,
    ]
    for table_name in ('task_comments', 'task_events'):
        row = conn.execute(
            f'SELECT MAX(created_at) AS ts FROM {table_name} WHERE task_id = ?',
            (task.id,),
        ).fetchone()
        if row and row['ts']:
            candidates.append(int(row['ts']))
    return max(candidates) if candidates else 0

def task_to_dict(task):
    parents = kb.parent_ids(conn, task.id)
    return {
        'id': task.id,
        'title': task.title or '',
        'description': task.body or '',
        'status': task.status,
        'priority': priority_label(task.priority),
        'tenant': task.tenant or '',
        'assignee': task.assignee,
        'parent_id': parents[0] if parents else None,
        'created_at': iso(task.created_at) or '',
        'updated_at': iso(latest_activity_ts(task)) or iso(task.created_at) or '',
        'due_date': None,
        'completed_at': iso(task.completed_at),
        'comments_count': comment_count(task.id),
        'links_count': link_count(task.id),
    }

def set_task_status(task_id, status):
    if status == 'running':
        raise ValueError('running status is managed by Hermes Agent dispatcher claims and cannot be set manually')
    if status == 'done':
        return kb.complete_task(conn, task_id, result='Completed from Hermes Console')
    if status == 'blocked':
        return kb.block_task(conn, task_id, reason='Blocked from Hermes Console')
    if status == 'archived':
        return kb.archive_task(conn, task_id)
    if status == 'ready':
        task = kb.get_task(conn, task_id)
        if task is None:
            return False
        if task.status == 'blocked':
            return kb.unblock_task(conn, task_id)
        if task.status == 'triage':
            kb.specify_triage_task(conn, task_id, author='hermes-console')
        kb.recompute_ready(conn)
        refreshed = kb.get_task(conn, task_id)
        return refreshed is not None and refreshed.status in ('ready', 'todo')
    if status == 'todo':
        with kb.write_txn(conn):
            cur = conn.execute(
                """
                UPDATE tasks
                   SET status = 'todo',
                       claim_lock = NULL,
                       claim_expires = NULL,
                       worker_pid = NULL,
                       current_run_id = NULL
                 WHERE id = ?
                   AND status NOT IN ('done', 'archived', 'running')
                """,
                (task_id,),
            )
        return cur.rowcount == 1
    if status == 'triage':
        with kb.write_txn(conn):
            cur = conn.execute(
                """
                UPDATE tasks
                   SET status = 'triage',
                       claim_lock = NULL,
                       claim_expires = NULL,
                       worker_pid = NULL,
                       current_run_id = NULL
                 WHERE id = ?
                   AND status NOT IN ('done', 'archived', 'running')
                """,
                (task_id,),
            )
        return cur.rowcount == 1
    raise ValueError(f'unsupported kanban status: {status}')

try:
__BODY__
finally:
    conn.close()
"#;

    template
        .replace("__PAYLOAD_B64__", payload_b64)
        .replace("__BODY__", &indented_body)
}

fn run_official_kanban(payload: &serde_json::Value, body: &str) -> Result<serde_json::Value, String> {
    let payload_json = serde_json::to_string(payload)
        .map_err(|e| format!("Failed to serialize kanban payload: {}", e))?;
    let payload_b64 = STANDARD.encode(payload_json);
    let script = build_official_kanban_script(&payload_b64, body);
    let output = run_python_script(&script)?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Hermes Kanban command failed: {}", stderr));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let trimmed = stdout.trim();
    if trimmed.is_empty() {
        return Ok(serde_json::json!(null));
    }

    serde_json::from_str(trimmed)
        .map_err(|e| format!("Failed to parse Hermes Kanban response: {}", e))
}

#[tauri::command(rename_all = "snake_case")]
pub fn get_kanban_board(
    tenant: Option<String>,
    show_archived: Option<bool>,
) -> Result<serde_json::Value, String> {
    println!("[Kanban] Getting board (tenant: {:?}, show_archived: {:?})", tenant, show_archived);

    let payload = serde_json::json!({
        "tenant": tenant,
        "show_archived": show_archived.unwrap_or(false),
    });
    let result = run_official_kanban(
        &payload,
        r#"
tenant = payload.get('tenant') or None
show_archived = bool(payload.get('show_archived', False))
statuses = ['triage', 'todo', 'ready', 'running', 'blocked', 'done', 'archived']
board = {status: [] for status in statuses}
tasks = kb.list_tasks(conn, tenant=tenant, include_archived=show_archived)
for task in tasks:
    board.setdefault(task.status, []).append(task_to_dict(task))
result = board
print(json.dumps(result))
"#,
    )?;

    println!("[Kanban] Board loaded");
    Ok(result)
}

#[tauri::command(rename_all = "snake_case")]
pub fn list_kanban_boards(include_archived: Option<bool>) -> Result<Vec<KanbanBoardInfo>, String> {
    let result = run_official_kanban(
        &serde_json::json!({ "include_archived": include_archived.unwrap_or(false) }),
        r#"
include_archived = bool(payload.get('include_archived', False))
current = kb.get_current_board()
boards = []
for board in kb.list_boards(include_archived=include_archived):
    boards.append({
        'slug': board.get('slug', ''),
        'name': board.get('name') or board.get('slug') or '',
        'description': board.get('description') or '',
        'icon': board.get('icon') or '',
        'color': board.get('color') or '',
        'archived': bool(board.get('archived', False)),
        'is_current': board.get('slug') == current,
    })
print(json.dumps(boards))
"#,
    )?;

    serde_json::from_value(result).map_err(|e| format!("Failed to decode boards: {}", e))
}

#[tauri::command(rename_all = "snake_case")]
pub fn get_current_kanban_board() -> Result<String, String> {
    let result = run_official_kanban(
        &serde_json::json!({}),
        r#"
print(json.dumps({'slug': kb.get_current_board()}))
"#,
    )?;

    result
        .get("slug")
        .and_then(|value| value.as_str())
        .map(String::from)
        .ok_or_else(|| "Failed to resolve current kanban board".to_string())
}

#[tauri::command(rename_all = "snake_case")]
pub fn switch_kanban_board(slug: String) -> Result<serde_json::Value, String> {
    run_official_kanban(
        &serde_json::json!({ "slug": slug }),
        r#"
slug = str(payload.get('slug') or '').strip()
if not slug:
    raise ValueError('board slug is required')
if not kb.board_exists(slug):
    raise ValueError(f'Board not found: {slug}')
kb.set_current_board(slug)
print(json.dumps({'ok': True, 'slug': kb.get_current_board()}))
"#,
    )
}

#[tauri::command(rename_all = "snake_case")]
pub fn create_kanban_board(
    slug: String,
    name: Option<String>,
    description: Option<String>,
    icon: Option<String>,
    color: Option<String>,
) -> Result<serde_json::Value, String> {
    run_official_kanban(
        &serde_json::json!({
            "slug": slug,
            "name": name,
            "description": description,
            "icon": icon,
            "color": color,
        }),
        r#"
slug = str(payload.get('slug') or '').strip()
if not slug:
    raise ValueError('board slug is required')
meta = kb.create_board(
    slug,
    name=payload.get('name'),
    description=payload.get('description'),
    icon=payload.get('icon'),
    color=payload.get('color'),
)
kb.set_current_board(meta.get('slug') or slug)
print(json.dumps({'ok': True, 'board': meta, 'slug': meta.get('slug') or slug}))
"#,
    )
}

#[tauri::command(rename_all = "snake_case")]
pub fn update_kanban_board(
    slug: String,
    name: Option<String>,
    description: Option<String>,
    icon: Option<String>,
    color: Option<String>,
) -> Result<serde_json::Value, String> {
    run_official_kanban(
        &serde_json::json!({
            "slug": slug,
            "name": name,
            "description": description,
            "icon": icon,
            "color": color,
        }),
        r#"
slug = str(payload.get('slug') or '').strip()
if not slug:
    raise ValueError('board slug is required')
if not kb.board_exists(slug):
    raise ValueError(f'Board not found: {slug}')
meta = kb.write_board_metadata(
    slug,
    name=payload.get('name'),
    description=payload.get('description'),
    icon=payload.get('icon'),
    color=payload.get('color'),
)
print(json.dumps({'ok': True, 'board': meta, 'slug': slug}))
"#,
    )
}

#[tauri::command(rename_all = "snake_case")]
pub fn set_kanban_board_archived(
    slug: String,
    archived: bool,
) -> Result<serde_json::Value, String> {
    run_official_kanban(
        &serde_json::json!({
            "slug": slug,
            "archived": archived,
        }),
        r#"
slug = str(payload.get('slug') or '').strip()
archived = bool(payload.get('archived', False))
if not slug:
    raise ValueError('board slug is required')
if slug == 'default' and archived:
    raise ValueError('default board cannot be archived')
if not kb.board_exists(slug):
    raise ValueError(f'Board not found: {slug}')
meta = kb.write_board_metadata(slug, archived=archived)
current = kb.get_current_board()
if archived and current == slug:
    kb.set_current_board('default')
    current = 'default'
print(json.dumps({'ok': True, 'slug': slug, 'current_board': current, 'board': meta}))
"#,
    )
}

#[tauri::command(rename_all = "snake_case")]
pub fn get_kanban_task(task_id: String) -> Result<KanbanTaskDetail, String> {
    println!("[Kanban] Getting task: {}", task_id);

    let result = run_official_kanban(
        &serde_json::json!({ "task_id": task_id }),
        r#"
task_id = payload['task_id']
task = kb.get_task(conn, task_id)
if task is None:
    raise ValueError(f'Task not found: {task_id}')

comments = [
    {
        'id': str(comment.id),
        'task_id': comment.task_id,
        'author': comment.author,
        'content': comment.body,
        'created_at': iso(comment.created_at) or '',
    }
    for comment in kb.list_comments(conn, task_id)
]

events = []
for event in kb.list_events(conn, task_id):
    payload_detail = None
    if event.payload:
        payload_detail = json.dumps(event.payload, ensure_ascii=False)
    actor = 'system'
    if event.payload and isinstance(event.payload, dict):
        actor = str(event.payload.get('author') or event.payload.get('actor') or 'system')
    events.append({
        'id': str(event.id),
        'task_id': event.task_id,
        'actor': actor,
        'action': event.kind,
        'detail': payload_detail,
        'created_at': iso(event.created_at) or '',
    })

parent_links = [
    {
        'id': f'{parent_id}::{task_id}',
        'parent_id': parent_id,
        'child_id': task_id,
        'relation': 'depends_on',
    }
    for parent_id in kb.parent_ids(conn, task_id)
]
child_links = [
    {
        'id': f'{task_id}::{child_id}',
        'parent_id': task_id,
        'child_id': child_id,
        'relation': 'depends_on',
    }
    for child_id in kb.child_ids(conn, task_id)
]

task_data = task_to_dict(task)
task_data.update({
    'comments': comments,
    'events': events,
    'parent_links': parent_links,
    'child_links': child_links,
})
result = task_data
print(json.dumps(result))
"#,
    )?;

    serde_json::from_value(result).map_err(|e| format!("Failed to decode task detail: {}", e))
}

#[tauri::command(rename_all = "snake_case")]
pub fn get_kanban_stats(
    tenant: Option<String>,
    show_archived: Option<bool>,
) -> Result<KanbanStats, String> {
    println!(
        "[Kanban] Getting stats (tenant: {:?}, show_archived: {:?})",
        tenant, show_archived
    );

    let result = run_official_kanban(
        &serde_json::json!({
            "tenant": tenant,
            "show_archived": show_archived.unwrap_or(false),
        }),
        r#"
tenant = payload.get('tenant') or None
show_archived = bool(payload.get('show_archived', False))
stats = {
    'total': 0,
    'triage': 0,
    'todo': 0,
    'ready': 0,
    'running': 0,
    'blocked': 0,
    'done': 0,
    'archived': 0,
}
for task in kb.list_tasks(conn, tenant=tenant, include_archived=show_archived):
    if task.status not in stats:
        continue
    stats['total'] += 1
    stats[task.status] += 1
result = stats
print(json.dumps(result))
"#,
    )?;

    serde_json::from_value(result).map_err(|e| format!("Failed to decode stats: {}", e))
}

#[tauri::command(rename_all = "snake_case")]
pub fn get_kanban_tenants(show_archived: Option<bool>) -> Result<Vec<String>, String> {
    let result = run_official_kanban(
        &serde_json::json!({ "show_archived": show_archived.unwrap_or(false) }),
        r#"
show_archived = bool(payload.get('show_archived', False))
query = "SELECT DISTINCT tenant FROM tasks WHERE tenant IS NOT NULL AND tenant != ''"
if not show_archived:
    query += " AND status != 'archived'"
query += " ORDER BY tenant ASC"
rows = conn.execute(query).fetchall()
result = [row['tenant'] for row in rows]
print(json.dumps(result))
"#,
    )?;

    serde_json::from_value(result).map_err(|e| format!("Failed to decode tenants: {}", e))
}

#[tauri::command(rename_all = "snake_case")]
pub fn create_kanban_task(
    title: String,
    description: Option<String>,
    status: Option<String>,
    priority: Option<String>,
    tenant: Option<String>,
    assignee: Option<String>,
    parent_id: Option<String>,
    due_date: Option<String>,
) -> Result<serde_json::Value, String> {
    println!("[Kanban] Creating task: {}", title);

    let resolved_status = status.unwrap_or_else(|| "ready".to_string());
    validate_status(&resolved_status)?;
    if let Some(ref priority_value) = priority {
        validate_priority(priority_value)?;
    }

    run_official_kanban(
        &serde_json::json!({
            "title": title,
            "description": description,
            "status": resolved_status,
            "priority": priority.unwrap_or_else(|| "medium".to_string()),
            "tenant": tenant,
            "assignee": assignee,
            "parent_id": parent_id,
            "due_date": due_date,
        }),
        r#"
task_id = kb.create_task(
    conn,
    title=payload['title'],
    body=payload.get('description'),
    assignee=payload.get('assignee') or None,
    tenant=payload.get('tenant') or None,
    priority=priority_value(payload.get('priority')),
    parents=[payload['parent_id']] if payload.get('parent_id') else (),
    triage=(payload.get('status') == 'triage'),
)
target_status = payload.get('status')
if target_status and target_status not in ('triage', 'todo', 'ready'):
    set_task_status(task_id, target_status)
elif target_status == 'todo':
    set_task_status(task_id, 'todo')
result = {'ok': True, 'id': task_id}
print(json.dumps(result))
"#,
    )
}

#[tauri::command(rename_all = "snake_case")]
pub fn update_kanban_task(
    task_id: String,
    title: Option<String>,
    description: Option<String>,
    status: Option<String>,
    priority: Option<String>,
    tenant: Option<String>,
    assignee: Option<String>,
    parent_id: Option<String>,
    due_date: Option<String>,
) -> Result<serde_json::Value, String> {
    println!("[Kanban] Updating task: {}", task_id);

    if let Some(ref value) = status {
        validate_status(value)?;
    }
    if let Some(ref value) = priority {
        validate_priority(value)?;
    }

    run_official_kanban(
        &serde_json::json!({
            "task_id": task_id,
            "title": title,
            "description": description,
            "status": status,
            "priority": priority,
            "tenant": tenant,
            "assignee": assignee,
            "parent_id": parent_id,
            "due_date": due_date,
        }),
        r#"
task_id = payload['task_id']
task = kb.get_task(conn, task_id)
if task is None:
    raise ValueError(f'unknown task {task_id}')

set_parts = []
set_params = []
if payload.get('title') is not None:
    title = str(payload.get('title')).strip()
    if not title:
        raise ValueError('title cannot be blank')
    set_parts.append('title = ?')
    set_params.append(title)
if 'description' in payload and payload.get('description') is not None:
    set_parts.append('body = ?')
    set_params.append(payload.get('description') or '')
if payload.get('priority') is not None:
    set_parts.append('priority = ?')
    set_params.append(priority_value(payload.get('priority')))
if 'tenant' in payload and payload.get('tenant') is not None:
    set_parts.append('tenant = ?')
    set_params.append(payload.get('tenant') or None)
if set_parts:
    with kb.write_txn(conn):
        conn.execute(
            f"UPDATE tasks SET {', '.join(set_parts)} WHERE id = ?",
            tuple(set_params + [task_id]),
        )

if 'assignee' in payload:
    kb.assign_task(conn, task_id, payload.get('assignee') or None)

if payload.get('status') is not None:
    set_task_status(task_id, payload.get('status'))

if 'parent_id' in payload:
    desired_parent = payload.get('parent_id') or None
    existing_parents = list(kb.parent_ids(conn, task_id))
    for existing_parent in existing_parents:
        if existing_parent != desired_parent:
            kb.unlink_tasks(conn, existing_parent, task_id)
    if desired_parent and desired_parent not in existing_parents:
        kb.link_tasks(conn, desired_parent, task_id)

result = {'ok': True}
print(json.dumps(result))
"#,
    )
}

#[tauri::command(rename_all = "snake_case")]
pub fn delete_kanban_task(task_id: String) -> Result<serde_json::Value, String> {
    println!("[Kanban] Archiving task: {}", task_id);

    run_official_kanban(
        &serde_json::json!({ "task_id": task_id }),
        r#"
task_id = payload['task_id']
ok = kb.archive_task(conn, task_id)
if not ok:
    raise ValueError(f'Unable to archive task {task_id}')
result = {'ok': True}
print(json.dumps(result))
"#,
    )
}

#[tauri::command(rename_all = "snake_case")]
pub fn move_kanban_task(task_id: String, status: String) -> Result<serde_json::Value, String> {
    println!("[Kanban] Moving task {} to {}", task_id, status);
    validate_status(&status)?;

    run_official_kanban(
        &serde_json::json!({ "task_id": task_id, "status": status }),
        r#"
task_id = payload['task_id']
status = payload['status']
if not set_task_status(task_id, status):
    raise ValueError(f'Unable to move task {task_id} to {status}')
result = {'ok': True}
print(json.dumps(result))
"#,
    )
}

#[tauri::command(rename_all = "snake_case")]
pub fn add_kanban_comment(
    task_id: String,
    content: String,
    author: Option<String>,
) -> Result<serde_json::Value, String> {
    println!("[Kanban] Adding comment to task {}", task_id);

    run_official_kanban(
        &serde_json::json!({
            "task_id": task_id,
            "content": content,
            "author": author.unwrap_or_else(|| "Hermes Console".to_string()),
        }),
        r#"
kb.add_comment(conn, payload['task_id'], payload['author'], payload['content'])
result = {'ok': True}
print(json.dumps(result))
"#,
    )
}

#[tauri::command(rename_all = "snake_case")]
pub fn add_kanban_link(
    parent_id: String,
    child_id: String,
    relation: Option<String>,
) -> Result<serde_json::Value, String> {
    println!("[Kanban] Adding link: {} -> {}", parent_id, child_id);

    run_official_kanban(
        &serde_json::json!({
            "parent_id": parent_id,
            "child_id": child_id,
            "relation": relation.unwrap_or_else(|| "depends_on".to_string()),
        }),
        r#"
relation = payload.get('relation') or 'depends_on'
if relation != 'depends_on':
    raise ValueError('Hermes Agent kanban currently supports depends_on links only')
kb.link_tasks(conn, payload['parent_id'], payload['child_id'])
result = {'ok': True}
print(json.dumps(result))
"#,
    )
}

#[tauri::command(rename_all = "snake_case")]
pub fn remove_kanban_link(link_id: String) -> Result<serde_json::Value, String> {
    println!("[Kanban] Removing link: {}", link_id);

    run_official_kanban(
        &serde_json::json!({ "link_id": link_id }),
        r#"
link_id = payload['link_id']
if '::' not in link_id:
    raise ValueError(f'Unsupported link id: {link_id}')
parent_id, child_id = link_id.split('::', 1)
kb.unlink_tasks(conn, parent_id, child_id)
result = {'ok': True}
print(json.dumps(result))
"#,
    )
}

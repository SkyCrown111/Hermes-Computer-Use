#!/usr/bin/env python3
"""
Deep cleanup of Hermes message database.
Removes tool output dumps, JSON artifacts, file content, malformed links.
Preserves actual conversation content (user messages, AI responses).
"""
import sqlite3, re, os, json

def is_file_dump_json(content):
    """Check if content is a complete file dump JSON object."""
    stripped = content.strip()
    if stripped.startswith('{') and '"total_lines"' in stripped and '"content"' in stripped:
        return True
    if stripped.startswith('{') and '"file_size"' in stripped:
        return True
    if stripped.startswith('{') and '"bytes_written"' in stripped:
        return True
    if stripped.startswith('{') and '"is_binary"' in stripped:
        return True
    if stripped.startswith('{') and '"_warning"' in stripped:
        return True
    if stripped.startswith('{') and '"files_modified"' in stripped:
        return True
    if stripped.startswith('{') and '"lint"' in stripped and '"status"' in stripped:
        return True
    return False

def is_pure_tool_output(content):
    """Check if the entire content is just tool output (no real conversation)."""
    stripped = content.strip()
    if not stripped:
        return True
    # Pure JSON tool output
    if stripped.startswith('{') and stripped.endswith('}'):
        try:
            data = json.loads(stripped)
            if isinstance(data, dict):
                tool_keys = {'success', 'output', 'bytes_written', 'total_count',
                             'total_lines', 'file_size', 'is_binary', 'is_image',
                             'files_modified', 'lint', '_warning', 'dirs_created',
                             'exit_code', 'error', 'session_id', 'pid', 'content'}
                if any(k in data for k in tool_keys):
                    return True
        except:
            pass
    return False

def clean_message_content(content):
    """Clean a single message's content, removing tool output artifacts."""
    if not content:
        return content

    # If the entire content is a tool output JSON, empty it
    if is_pure_tool_output(content):
        return ''

    result = content

    # Remove malformed Markdown links [xxx](http://xxx)
    result = re.sub(r'\[[a-zA-Z_][\w.]*\]\(https?://[\w.]+\)', '', result)

    # Remove npm errors
    result = re.sub(r'^npm error.*$', '', result, flags=re.MULTILINE)
    result = re.sub(r'^npm\s+error.*$', '', result, flags=re.MULTILINE)

    # Remove file listings
    result = re.sub(r'^-rwxrwxrwx.*$', '', result, flags=re.MULTILINE)
    result = re.sub(r'^drwxrwxrwx.*$', '', result, flags=re.MULTILINE)
    result = re.sub(r'^total\s+\d+.*$', '', result, flags=re.MULTILINE)

    # Remove tool messages
    result = re.sub(r'^Tool result:.*$', '', result, flags=re.MULTILINE)
    result = re.sub(r'^Running tool:.*$', '', result, flags=re.MULTILINE)

    # Remove file content dumps - lines with "  N|" prefix (file line numbers)
    result = re.sub(r'^\s*\d+\|.*$', '', result, flags=re.MULTILINE)

    # Remove JSON tool output objects (may be embedded in content)
    result = re.sub(r'\{"success":\s*(true|false)[^}]*\}', '', result)
    result = re.sub(r'\{"output":\s*"[^"]*"[^}]*\}', '', result)
    result = re.sub(r'\{"bytes_written":\s*\d+[^}]*\}', '', result)
    result = re.sub(r'\{"total_count":\s*\d+[^}]*\}', '', result)
    result = re.sub(r'\{"total_lines":\s*\d+[^}]*\}', '', result)
    result = re.sub(r'\{"content":\s*"[^"]*"[\s\S]*?"total_lines"[\s\S]*?\}', '', result)
    result = re.sub(r'\{"content":\s*"[^"]*"[\s\S]*?"file_size"[\s\S]*?\}', '', result)
    result = re.sub(r'\{"content":\s*"[^"]*"[\s\S]*?"is_binary"[\s\S]*?\}', '', result)
    result = re.sub(r'\{"content":\s*"[^"]*"[\s\S]*?"_warning"[\s\S]*?\}', '', result)
    result = re.sub(r'\{"session_id":\s*"[^"]*"[\s\S]*?"pid"[\s\S]*?\}', '', result)

    # Remove JSON fragments
    result = re.sub(r'^:\s*\d+,\s*"error".*$', '', result, flags=re.MULTILINE)
    result = re.sub(r'^\s*\{"success":.*$', '', result, flags=re.MULTILINE)
    result = re.sub(r'^\s*\{"output":.*$', '', result, flags=re.MULTILINE)
    result = re.sub(r'^\s*\{"bytes_written":.*$', '', result, flags=re.MULTILINE)
    result = re.sub(r'^\s*\{"total_count".*$', '', result, flags=re.MULTILINE)
    result = re.sub(r'^\s*\{"total_lines".*$', '', result, flags=re.MULTILINE)
    result = re.sub(r'^\s*\{"file_size".*$', '', result, flags=re.MULTILINE)
    result = re.sub(r'^\s*\{"content":.*"total_lines".*$', '', result, flags=re.MULTILINE)
    result = re.sub(r'^\s*\{"content":.*"file_size".*$', '', result, flags=re.MULTILINE)
    result = re.sub(r'^\s*\{"content":.*"_warning".*$', '', result, flags=re.MULTILINE)
    result = re.sub(r'^\s*\{"content":.*"is_binary".*$', '', result, flags=re.MULTILINE)
    result = re.sub(r'^\s*\{"content":.*"is_image".*$', '', result, flags=re.MULTILINE)
    result = re.sub(r'^\s*\{"session_id":.*"pid".*$', '', result, flags=re.MULTILINE)
    result = re.sub(r'^\s*,\s*\{"name":.*$', '', result, flags=re.MULTILINE)
    result = re.sub(r'^\s*,\s*\{"session_id":.*$', '', result, flags=re.MULTILINE)

    # Remove JSON metadata lines
    result = re.sub(r'^\s*"total_lines":\s*\d+.*$', '', result, flags=re.MULTILINE)
    result = re.sub(r'^\s*"file_size":\s*\d+.*$', '', result, flags=re.MULTILINE)
    result = re.sub(r'^\s*"truncated":\s*(true|false).*$', '', result, flags=re.MULTILINE)
    result = re.sub(r'^\s*"hint":\s*"[^"]*".*$', '', result, flags=re.MULTILINE)
    result = re.sub(r'^\s*"is_binary":\s*(true|false).*$', '', result, flags=re.MULTILINE)
    result = re.sub(r'^\s*"is_image":\s*(true|false).*$', '', result, flags=re.MULTILINE)
    result = re.sub(r'^\s*"files_modified":\s*\[.*$', '', result, flags=re.MULTILINE)
    result = re.sub(r'^\s*"lint":\s*\{.*$', '', result, flags=re.MULTILINE)
    result = re.sub(r'^\s*"_warning":\s*"[^"]*".*$', '', result, flags=re.MULTILINE)

    # Remove lines with just JSON field values
    result = re.sub(r'^\s*"error":\s*(null|"[^"]*")\s*\}\s*$', '', result, flags=re.MULTILINE)

    # Remove CONTEXT COMPACTION markers
    result = re.sub(r'^\[CONTEXT COMPACTION.*$', '', result, flags=re.MULTILINE)

    # Remove DEBUG lines
    result = re.sub(r'^DEBUG:.*$', '', result, flags=re.MULTILINE)

    # Remove [patch] lines
    result = re.sub(r'^\[patch\].*$', '', result, flags=re.MULTILINE)

    # Clean up whitespace
    result = re.sub(r'\n{3,}', '\n\n', result)
    result = result.strip()

    return result

def main():
    db_path = os.path.expanduser('~/.hermes/state.db')
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    cursor.execute('SELECT id, content, role FROM messages')
    messages = cursor.fetchall()

    updated = 0
    emptied = 0
    chars = 0

    for msg_id, content, role in messages:
        if not content:
            continue
        original = content
        cleaned = clean_message_content(original)
        if cleaned != original:
            chars += len(original) - len(cleaned)
            updated += 1
            if not cleaned:
                emptied += 1
            cursor.execute('UPDATE messages SET content = ? WHERE id = ?', (cleaned, msg_id))

    conn.commit()
    conn.close()

    print(f'Updated {updated} messages, emptied {emptied}, removed {chars} chars')

if __name__ == '__main__':
    main()

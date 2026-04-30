#!/usr/bin/env python3
import sqlite3, os, json

db_path = os.path.expanduser('~/.hermes/state.db')
conn = sqlite3.connect(db_path)
conn.row_factory = sqlite3.Row
cursor = conn.cursor()

# Find messages that have tool-like content in the content field
# (JSON objects, file dumps, etc.)
cursor.execute("""
    SELECT id, role, content FROM messages
    WHERE role != 'user' AND role != 'assistant' AND role != 'system'
    ORDER BY id DESC LIMIT 30
""")
print("=== Non-standard role messages (last 30) ===")
for row in cursor.fetchall():
    role_preview = row['role'][:80].replace('\n', '\\n')
    content_preview = (row['content'] or '')[:80].replace('\n', '\\n')
    print(f"  ID={row['id']} role=[{role_preview}] content=[{content_preview}]")
print()

# Find assistant messages with JSON-like content
cursor.execute("""
    SELECT id, content FROM messages
    WHERE role = 'assistant'
    AND (content LIKE '%{"output":%'
         OR content LIKE '%{"bytes_written":%'
         OR content LIKE '%{"success":%'
         OR content LIKE '%total_lines%'
         OR content LIKE '%files_modified%')
    ORDER BY id DESC LIMIT 10
""")
print("=== Assistant messages with JSON content (last 10) ===")
for row in cursor.fetchall():
    content_preview = (row['content'] or '')[:200].replace('\n', '\\n')
    print(f"  ID={row['id']} content=[{content_preview}]")
print()

# Find tool messages with actual content
cursor.execute("""
    SELECT id, content, tool_name FROM messages
    WHERE role = 'tool'
    AND content IS NOT NULL
    AND content != ''
    ORDER BY id DESC LIMIT 10
""")
print("=== Tool messages with content (last 10) ===")
for row in cursor.fetchall():
    content_preview = (row['content'] or '')[:200].replace('\n', '\\n')
    print(f"  ID={row['id']} tool={row['tool_name']} content=[{content_preview}]")
print()

# Summary of what needs cleaning
cursor.execute("SELECT COUNT(*) FROM messages WHERE role = 'tool'")
tool_count = cursor.fetchone()[0]

cursor.execute("""
    SELECT COUNT(*) FROM messages
    WHERE role NOT IN ('user', 'assistant', 'system', 'tool', 'session_meta')
""")
corrupted_role_count = cursor.fetchone()[0]

cursor.execute("""
    SELECT COUNT(*) FROM messages
    WHERE content LIKE '%{"output":%'
       OR content LIKE '%{"bytes_written":%'
       OR content LIKE '%{"success":%'
""")
json_content_count = cursor.fetchone()[0]

cursor.execute("""
    SELECT COUNT(*) FROM messages
    WHERE content LIKE '%files_modified%'
       OR content LIKE '%total_lines%'
       OR content LIKE '%_warning%'
""")
file_dump_count = cursor.fetchone()[0]

print("=== Summary ===")
print(f"  Tool messages: {tool_count}")
print(f"  Corrupted role: {corrupted_role_count}")
print(f"  JSON in content: {json_content_count}")
print(f"  File dumps in content: {file_dump_count}")

conn.close()

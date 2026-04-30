#!/usr/bin/env python3
import sqlite3, os

db_path = os.path.expanduser('~/.hermes/state.db')
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

# 1. Count by role
cursor.execute("SELECT role, COUNT(*) FROM messages GROUP BY role")
print("=== Messages by role ===")
for row in cursor.fetchall():
    print(f"  {row[0]}: {row[1]}")

# 2. Show sample tool messages
print("\n=== Sample tool messages ===")
cursor.execute("SELECT id, role, content, tool_name FROM messages WHERE role = 'tool' LIMIT 5")
for row in cursor.fetchall():
    content = (row[2] or '')[:200]
    print(f"  ID={row[0]} tool_name={row[3]}")
    print(f"  Content: {content}")
    print("  ---")

# 3. Show assistant messages that look like file dumps (contain | at line start)
print("\n=== Assistant messages with file content dumps ===")
cursor.execute("""
    SELECT id, content FROM messages
    WHERE role = 'assistant'
    AND content LIKE '%|%'
    AND content NOT LIKE '%```%'
    ORDER BY id DESC LIMIT 10
""")
for row in cursor.fetchall():
    content = row[1] or ''
    # Check if it contains line-number patterns
    lines = content.split('\n')
    pipe_lines = [l for l in lines[:20] if '|' in l and l.strip()[:1].isdigit()]
    if pipe_lines:
        print(f"  ID={row[0]}: {pipe_lines[:3]}")
        print("  ---")

# 4. Show last 20 messages content previews
print("\n=== Last 20 messages ===")
cursor.execute("SELECT id, role, content FROM messages ORDER BY id DESC LIMIT 20")
for row in cursor.fetchall():
    content = (row[1] or '')[:100].replace('\n', ' ')
    print(f"  ID={row[0]} role={row[2]}: {content}")

conn.close()

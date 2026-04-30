#!/usr/bin/env python3
import sqlite3, os, re

db_path = os.path.expanduser('~/.hermes/state.db')
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

# Find messages with actual garbage patterns
cursor.execute("""
    SELECT id, content FROM messages
    WHERE content LIKE '%{"bytes_written":%'
       OR content LIKE '%{"output":%'
       OR content LIKE '%{"total_count":%'
       OR content LIKE '%: 0, "error":%'
       OR content LIKE '%: 1, "error":%'
    LIMIT 20
""")
messages = cursor.fetchall()

print(f"Found {len(messages)} messages with actual garbage\n")

for msg_id, content in messages:
    if not content:
        continue
    preview = content[:400]
    print(f"=== Message ID: {msg_id} ===")
    print(preview)
    print("\n" + "="*50 + "\n")

conn.close()

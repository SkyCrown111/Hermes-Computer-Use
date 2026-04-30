#!/usr/bin/env python3
import sqlite3, os

db_path = os.path.expanduser('~/.hermes/state.db')
conn = sqlite3.connect(db_path)
conn.row_factory = sqlite3.Row
cursor = conn.cursor()

# Check if title column exists and has data
cursor.execute("SELECT id, title FROM sessions WHERE title IS NOT NULL AND title != '' LIMIT 20")
rows = cursor.fetchall()
print(f"Sessions with non-empty title: {len(rows)}")
for row in rows:
    print(f"  {row['id']}: {row['title']}")

# Check total sessions
cursor.execute("SELECT COUNT(*) FROM sessions")
total = cursor.fetchone()[0]
print(f"\nTotal sessions: {total}")

# Check sessions with NULL title
cursor.execute("SELECT COUNT(*) FROM sessions WHERE title IS NULL OR title = ''")
null_count = cursor.fetchone()[0]
print(f"Sessions with NULL/empty title: {null_count}")

conn.close()
